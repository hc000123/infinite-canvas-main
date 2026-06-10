package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

const (
	maxAIRequestBodyBytes = 100 * 1024 * 1024
	maxAIRequestCount     = 15
	maxVideoDownloadBytes = 1024 * 1024 * 1024
)

func AIImagesGenerations(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/generations")
}

func AIImagesEdits(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/images/edits")
}

func AIChatCompletions(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/chat/completions")
}

func AIVideos(w http.ResponseWriter, r *http.Request) {
	proxyAIRequest(w, r, "/videos")
}

func AIVideo(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id)
}

func AIVideoContent(w http.ResponseWriter, r *http.Request, id string) {
	proxyAIGetRequest(w, r, "/videos/"+id+"/content")
}

func AIProxyVideoDownload(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		VideoURL string `json:"video_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.VideoURL == "" {
		Fail(w, "缺少 video_url 参数")
		return
	}
	proxyArkVideoContent(w, r.Context(), payload.VideoURL)
}

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
	localAPIKey := r.Header.Get("X-Volcengine-Api-Key")
	localBaseURL := r.Header.Get("X-Volcengine-Base-Url")
	if localAPIKey != "" && localBaseURL != "" && strings.HasPrefix(path, "/videos/") {
		allowCustomChannel, err := service.IsCustomChannelAllowed()
		if err != nil {
			log.Printf("AI proxy read custom channel setting failed: err=%v", err)
			Fail(w, "AI 接口请求失败")
			return
		}
		if allowCustomChannel {
			proxyArkVideoGetByCustomConfig(w, r.Context(), localBaseURL, localAPIKey, path)
			return
		}
	}
	if strings.TrimSpace(modelName) == "" {
		modelName = "grok-imagine-video"
	}
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	if service.IsVolcengineArkProtocol(channel.Protocol) && strings.HasPrefix(path, "/videos/") {
		proxyArkVideoGetRequest(w, r.Context(), channel, path)
		return
	}
	request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, path), nil)
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	copyAIResponse(w, request, nil)
}

func proxyAIRequest(w http.ResponseWriter, r *http.Request, path string) {
	body, contentType, modelName, err := readAIRequest(r)
	if err != nil {
		log.Printf("AI proxy request read failed: %v", err)
		Fail(w, "AI 接口请求失败")
		return
	}
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	isArkLocalVideo := path == "/videos"
	if isArkLocalVideo {
		allowCustomChannel, settingErr := service.IsCustomChannelAllowed()
		if settingErr != nil {
			log.Printf("AI proxy read custom channel setting failed: err=%v", settingErr)
			Fail(w, "AI 接口请求失败")
			return
		}
		if allowCustomChannel {
			volcengineAPIKey, volcengineBaseURL, seedancePayload, err := service.ReadArkLocalVideoConfig(body, contentType)
			if err == nil && volcengineAPIKey != "" {
				arkBody, _ := json.Marshal(seedancePayload)
				baseURL, validateErr := validateCustomAIBaseURL(r.Context(), volcengineBaseURL)
				if validateErr != nil {
					log.Printf("AI proxy rejected custom Ark base URL: url=%s err=%v", safeLogURL(volcengineBaseURL), validateErr)
					Fail(w, "AI 接口请求失败")
					return
				}
				request, reqErr := http.NewRequest(http.MethodPost, baseURL+"/contents/generations/tasks", bytes.NewReader(arkBody))
				if reqErr != nil {
					Fail(w, "AI 接口请求失败")
					return
				}
				request.Header.Set("Authorization", "Bearer "+volcengineAPIKey)
				request.Header.Set("Content-Type", "application/json")
				copyArkVideoTaskResponseWithClient(w, request, newPublicNetworkHTTPClient(r.Context(), service.AIVideoTaskTimeout, func(req *http.Request, via []*http.Request) error {
					if len(via) >= 5 {
						return http.ErrUseLastResponse
					}
					_, err := validateCustomAIBaseURL(r.Context(), req.URL.String())
					return err
				}), nil)
				return
			}
		}
	}
	credits, err := service.ModelCost(modelName)
	if err != nil {
		log.Printf("AI proxy read model cost failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	credits, err = multiplyAICredits(credits, readAIRequestCount(body, contentType))
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	channel, err := service.SelectModelChannel(modelName)
	if err != nil {
		log.Printf("AI proxy select channel failed: model=%s err=%v", modelName, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	upstreamPath := path
	upstreamBody := body
	upstreamContentType := contentType
	isArkVideoTask := service.IsVolcengineArkProtocol(channel.Protocol) && path == "/videos"
	if isArkVideoTask {
		upstreamPath = "/contents/generations/tasks"
		upstreamBody, upstreamContentType, err = service.BuildArkVideoCreateRequestForModel(body, contentType, service.ModelChannelEndpointForModel(channel, modelName))
		if err != nil {
			log.Printf("AI proxy build ark video request failed: model=%s err=%v", modelName, err)
			Fail(w, err.Error())
			return
		}
	}
	aiTask, err := service.CreateAITask(service.CreateAITaskInput{
		UserID:        user.ID,
		TaskType:      service.AITaskTypeForPath(path),
		Provider:      channel.Name,
		Protocol:      channel.Protocol,
		Model:         modelName,
		Path:          path,
		Credits:       credits,
		RequestBody:   upstreamBody,
		ContentType:   upstreamContentType,
		FrontendTrace: r.Header.Get("X-Infinite-Canvas-Trace"),
	})
	if err != nil {
		log.Printf("AI proxy create task failed: user=%s model=%s path=%s err=%v", user.ID, modelName, path, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, upstreamPath), bytes.NewReader(upstreamBody))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", safeLogURL(service.BuildModelChannelURL(channel, upstreamPath)), err)
		_ = service.MarkAITaskFailed(aiTask.ID, "AI 接口请求失败", nil, "")
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if upstreamContentType != "" {
		request.Header.Set("Content-Type", upstreamContentType)
	}
	if err := service.ConsumeUserCreditsForTask(user.ID, modelName, credits, path, aiTask.ID); err != nil {
		_ = service.MarkAITaskFailed(aiTask.ID, err.Error(), nil, "")
		FailError(w, err)
		return
	}
	consumeLogID := ""
	if log, ok, err := service.LatestAITaskConsumeCreditLog(aiTask.ID); err == nil && ok {
		consumeLogID = log.ID
	}
	refundAndFailTask := func(message string, payload []byte) {
		_ = service.MarkAITaskFailed(aiTask.ID, message, payload, "application/json")
		if err := service.RefundUserCreditsForTask(user.ID, modelName, credits, path, aiTask.ID); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	}
	if isArkVideoTask {
		copyArkVideoTaskResponse(w, request, refundAndFailTask, func(_ int, _ []byte, normalized []byte) {
			if err := service.MarkAITaskArkCreated(aiTask.ID, normalized); err != nil {
				log.Printf("AI proxy mark ark task created failed: task=%s err=%v", aiTask.ID, err)
			}
			writeAITaskHeaders(w, aiTask, consumeLogID, arkTaskIDFromNormalized(normalized), string(model.AITaskStatusQueued))
		})
		return
	}
	copyAIResponse(w, request, refundAndFailTask, func(_ int, payload []byte, responseContentType string) {
		if err := service.MarkAITaskSucceeded(aiTask.ID, payload, responseContentType); err != nil {
			log.Printf("AI proxy mark task succeeded failed: task=%s err=%v", aiTask.ID, err)
		}
		writeAITaskHeaders(w, aiTask, consumeLogID, "", string(model.AITaskStatusSucceeded))
	})
}

func UserAITask(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.GetUserAITaskDetail(id, user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func UserAITaskFrontendArtifact(w http.ResponseWriter, r *http.Request, id string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var artifact model.AITaskFrontendArtifact
	_ = json.NewDecoder(r.Body).Decode(&artifact)
	result, err := service.RecordUserAITaskFrontendArtifact(id, user.ID, artifact)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func proxyArkVideoGetRequest(w http.ResponseWriter, ctx context.Context, channel model.ModelChannel, path string) {
	proxyArkVideoGetByConfig(w, ctx, channel.BaseURL, channel.APIKey, path)
}

func proxyArkVideoGetByConfig(w http.ResponseWriter, ctx context.Context, baseURL string, apiKey string, path string) {
	proxyArkVideoGetByConfigWithClient(w, ctx, strings.TrimRight(baseURL, "/"), apiKey, path, &http.Client{Timeout: service.AIVideoTaskTimeout})
}

func proxyArkVideoGetByCustomConfig(w http.ResponseWriter, ctx context.Context, baseURL string, apiKey string, path string) {
	validBaseURL, err := validateCustomAIBaseURL(ctx, baseURL)
	if err != nil {
		log.Printf("Ark video custom task query rejected: url=%s err=%v", safeLogURL(baseURL), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	proxyArkVideoGetByConfigWithClient(w, ctx, validBaseURL, apiKey, path, newPublicNetworkHTTPClient(ctx, service.AIVideoTaskTimeout, func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		_, err := validateCustomAIBaseURL(ctx, req.URL.String())
		return err
	}))
}

func proxyArkVideoGetByConfigWithClient(w http.ResponseWriter, ctx context.Context, baseURL string, apiKey string, path string, client *http.Client) {
	taskID, contentRequest := parseVideoTaskPath(path)
	if taskID == "" {
		Fail(w, "缺少视频任务 ID")
		return
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/contents/generations/tasks/"+url.PathEscape(taskID), nil)
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := doAIHTTPRequest(client, request)
	if err != nil {
		log.Printf("Ark video task query failed: url=%s err=%v", safeLogRequestURL(request), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video task query upstream error: url=%s status=%d body=%s", safeLogRequestURL(request), response.StatusCode, safeLogPayload(body, "application/json"))
		Fail(w, upstreamErrorMessage(body, "AI 接口请求失败"))
		return
	}
	normalized, err := service.NormalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", safeLogPayload(body, "application/json"), err)
		if !contentRequest {
			Fail(w, "AI 接口请求失败")
			return
		}
	} else if err := service.SyncArkVideoAITaskStatus(taskID, normalized); err != nil {
		log.Printf("Ark video task sync ai task failed: task=%s err=%v", taskID, err)
	}
	if contentRequest {
		videoURL := service.ArkTaskVideoURL(body)
		if videoURL == "" {
			Fail(w, "视频任务尚未返回可下载地址")
			return
		}
		if proxyArkVideoContent(w, ctx, videoURL) {
			if err := service.MarkArkVideoAITaskContentFetched(taskID); err != nil {
				log.Printf("Ark video task mark content fetched failed: task=%s err=%v", taskID, err)
			}
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(normalized)
}

func copyArkVideoTaskResponse(w http.ResponseWriter, request *http.Request, onFailure func(string, []byte), onSuccess ...func(int, []byte, []byte)) {
	copyArkVideoTaskResponseWithClient(w, request, &http.Client{Timeout: service.AIVideoTaskTimeout}, onFailure, onSuccess...)
}

func copyArkVideoTaskResponseWithClient(w http.ResponseWriter, request *http.Request, client *http.Client, onFailure func(string, []byte), onSuccess ...func(int, []byte, []byte)) {
	response, err := doAIHTTPRequest(client, request)
	if err != nil {
		log.Printf("Ark video task request failed: url=%s err=%v", safeLogRequestURL(request), err)
		if onFailure != nil {
			onFailure("AI 接口请求失败", nil)
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video task upstream error: url=%s status=%d body=%s", safeLogRequestURL(request), response.StatusCode, safeLogPayload(body, "application/json"))
		message := upstreamErrorMessage(body, "AI 接口请求失败")
		if onFailure != nil {
			onFailure(message, body)
		}
		Fail(w, message)
		return
	}
	normalized, err := service.NormalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", safeLogPayload(body, "application/json"), err)
		if onFailure != nil {
			onFailure("AI 接口请求失败", body)
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	if len(onSuccess) > 0 && onSuccess[0] != nil {
		onSuccess[0](response.StatusCode, body, normalized)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(normalized)
}

func parseVideoTaskPath(path string) (string, bool) {
	taskPath := strings.TrimPrefix(path, "/videos/")
	if taskPath == path {
		return "", false
	}
	if strings.HasSuffix(taskPath, "/content") {
		return strings.Trim(strings.TrimSuffix(taskPath, "/content"), "/"), true
	}
	return strings.Trim(taskPath, "/"), false
}

func proxyArkVideoContent(w http.ResponseWriter, ctx context.Context, videoURL string) bool {
	if err := validateProxyDownloadURL(ctx, videoURL); err != nil {
		log.Printf("Ark video content rejected: url=%s err=%v", safeLogURL(videoURL), err)
		Fail(w, "视频下载地址无效")
		return false
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, videoURL, nil)
	if err != nil {
		Fail(w, "视频下载地址无效")
		return false
	}
	client := newPublicNetworkHTTPClient(ctx, service.AIVideoContentTimeout,
		func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return validateProxyDownloadURL(ctx, req.URL.String())
		},
	)
	response, err := doVideoContentRequestWithRetry(client, request)
	if err != nil {
		log.Printf("Ark video content download failed: url=%s err=%v", safeLogURL(videoURL), err)
		Fail(w, "视频下载失败：服务器无法访问火山返回的视频地址")
		return false
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video content upstream error: url=%s status=%d", safeLogURL(videoURL), response.StatusCode)
		Fail(w, fmt.Sprintf("视频下载失败：火山视频地址返回 %d", response.StatusCode))
		return false
	}
	if err := validateProxyVideoContentResponse(response); err != nil {
		log.Printf("Ark video content rejected upstream response: url=%s err=%v", safeLogURL(videoURL), err)
		Fail(w, fmt.Sprintf("视频下载失败：%s", videoContentRejectMessage(err)))
		return false
	}
	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	written, _ := io.Copy(w, io.LimitReader(response.Body, maxVideoDownloadBytes+1))
	if written > maxVideoDownloadBytes {
		log.Printf("Ark video content exceeded download limit: url=%s", safeLogURL(videoURL))
		return false
	}
	return true
}

func doVideoContentRequestWithRetry(client *http.Client, request *http.Request) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-request.Context().Done():
				return nil, request.Context().Err()
			case <-time.After(time.Duration(attempt) * 800 * time.Millisecond):
			}
		}
		response, err := client.Do(request.Clone(request.Context()))
		if err == nil {
			return response, nil
		}
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		lastErr = err
	}
	return nil, lastErr
}

func validateProxyVideoContentResponse(response *http.Response) error {
	if response.ContentLength > maxVideoDownloadBytes {
		return errors.New("video content is too large")
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0]))
	if contentType != "" && !strings.HasPrefix(contentType, "video/") && contentType != "application/octet-stream" {
		return errors.New("video content type is not allowed")
	}
	return nil
}

func videoContentRejectMessage(err error) string {
	switch err.Error() {
	case "video content is too large":
		return "视频文件超过 200 MB"
	case "video content type is not allowed":
		return "返回内容不是视频文件"
	default:
		return "返回内容不可用"
	}
}

func validateProxyDownloadURL(ctx context.Context, rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return errors.New("unsupported video url scheme")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return errors.New("missing video url host")
	}
	return validatePublicURLHost(ctx, host)
}

func validateCustomAIBaseURL(ctx context.Context, rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "https" {
		return "", errors.New("custom base url must use https")
	}
	if parsed.User != nil {
		return "", errors.New("custom base url must not include user info")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return "", errors.New("missing custom base url host")
	}
	if err := validatePublicURLHost(ctx, host); err != nil {
		return "", err
	}
	parsed.Fragment = ""
	parsed.RawQuery = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func validatePublicURLHost(ctx context.Context, host string) error {
	if ip := net.ParseIP(host); ip != nil {
		return validatePublicProxyIP(ip)
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil {
		return err
	}
	if len(addresses) == 0 {
		return errors.New("video url host has no address")
	}
	for _, address := range addresses {
		if err := validatePublicProxyIP(address.IP); err != nil {
			return err
		}
	}
	return nil
}

func validatePublicProxyIP(ip net.IP) error {
	if ip == nil || ip.IsUnspecified() || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return errors.New("video url host is not public")
	}
	return nil
}

func newPublicNetworkHTTPClient(ctx context.Context, timeout time.Duration, checkRedirect func(*http.Request, []*http.Request) error) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	dialer := &net.Dialer{}
	transport.DialContext = func(dialCtx context.Context, network string, address string) (net.Conn, error) {
		conn, err := dialer.DialContext(dialCtx, network, address)
		if err != nil {
			return nil, err
		}
		if err := validateConnectionPublicIP(conn); err != nil {
			_ = conn.Close()
			return nil, err
		}
		return conn, nil
	}
	return &http.Client{
		Timeout:       timeout,
		Transport:     transport,
		CheckRedirect: checkRedirect,
	}
}

func validateConnectionPublicIP(conn net.Conn) error {
	addr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		return errors.New("unsupported remote address")
	}
	return validatePublicProxyIP(addr.IP)
}

func doAIHTTPRequest(client *http.Client, request *http.Request) (*http.Response, error) {
	if client != nil {
		return client.Do(request)
	}
	return service.DoAIHTTPRequest(request)
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func(string, []byte), onSuccess ...func(int, []byte, string)) {
	response, err := service.DoAIHTTPRequest(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", safeLogRequestURL(request), err)
		if onFailure != nil {
			onFailure("AI 接口请求失败", nil)
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI upstream error: url=%s status=%d body=%s", safeLogRequestURL(request), response.StatusCode, safeLogPayload(payload, response.Header.Get("Content-Type")))
		message := upstreamErrorMessage(payload, "AI 接口请求失败")
		if onFailure != nil {
			onFailure(message, payload)
		}
		Fail(w, message)
		return
	}

	payload, _ := io.ReadAll(response.Body)
	if len(onSuccess) > 0 && onSuccess[0] != nil {
		onSuccess[0](response.StatusCode, payload, response.Header.Get("Content-Type"))
	}
	for key, values := range response.Header {
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(payload)
}

func writeAITaskHeaders(w http.ResponseWriter, task model.AITask, creditLogID string, upstreamTaskID string, status string) {
	w.Header().Set("X-AI-Task-ID", task.ID)
	w.Header().Set("X-AI-Task-Status", status)
	w.Header().Set("X-AI-Task-Credits", fmt.Sprint(task.Credits))
	if creditLogID != "" {
		w.Header().Set("X-AI-Credit-Log-ID", creditLogID)
	}
	if upstreamTaskID != "" {
		w.Header().Set("X-AI-Upstream-Task-ID", upstreamTaskID)
	}
}

func arkTaskIDFromNormalized(body []byte) string {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	if id, ok := payload["id"].(string); ok {
		return id
	}
	return ""
}

func safeLogRequestURL(request *http.Request) string {
	if request == nil || request.URL == nil {
		return ""
	}
	return safeLogURL(request.URL.String())
}

func safeLogURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "[invalid-url]"
	}
	if parsed.User != nil {
		parsed.User = url.User("[redacted]")
	}
	if parsed.RawQuery != "" {
		parsed.RawQuery = "redacted=1"
	}
	parsed.Fragment = ""
	return parsed.String()
}

func safeLogPayload(body []byte, contentType string) string {
	text := strings.TrimSpace(service.SanitizeAIJSON(body, contentType))
	if text == "" {
		return ""
	}
	if len([]rune(text)) > 1000 {
		return string([]rune(text)[:1000]) + "...[truncated]"
	}
	return text
}

func upstreamErrorMessage(body []byte, fallback string) string {
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		message := strings.TrimSpace(string(body))
		if message == "" || len([]rune(message)) > 300 {
			return fallback
		}
		return message
	}

	code, message := upstreamErrorParts(payload)
	code = strings.TrimSpace(code)
	message = strings.TrimSpace(message)
	if code == "InputImageSensitiveContentDetected.PrivacyInformation" {
		return "输入图片疑似包含真人或隐私信息，火山 Ark 已拒绝本次生成。请更换参考图，或先完成素材加白后再试。（" + code + "）"
	}
	if code != "" && message != "" {
		return code + "：" + message
	}
	if message != "" {
		return message
	}
	if code != "" {
		return code
	}
	return fallback
}

func upstreamErrorParts(value any) (string, string) {
	payload, ok := value.(map[string]any)
	if !ok {
		return "", ""
	}
	code := ""
	message := ""
	if nested, ok := payload["error"].(map[string]any); ok {
		code = readUpstreamString(nested, "code", "type")
		message = readUpstreamString(nested, "message", "msg")
	} else if text, ok := payload["error"].(string); ok {
		message = text
	}
	if code == "" {
		code = readUpstreamString(payload, "code")
	}
	if message == "" {
		message = readUpstreamString(payload, "message", "msg")
	}
	return code, message
}

func readUpstreamString(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok || value == nil {
			continue
		}
		if text, ok := value.(string); ok {
			return text
		}
		return fmt.Sprint(value)
	}
	return ""
}

func readAIRequest(r *http.Request) ([]byte, string, string, error) {
	contentType := r.Header.Get("Content-Type")
	body, err := readLimitedAIRequestBody(r.Body, maxAIRequestBodyBytes)
	if err != nil {
		return nil, "", "", err
	}
	modelName := ""
	if strings.HasPrefix(contentType, "multipart/form-data") {
		modelName = readMultipartModel(body, contentType)
	} else {
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.Unmarshal(body, &payload)
		modelName = payload.Model
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", "", errMissingModel
	}
	return body, contentType, modelName, nil
}

func readMultipartModel(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return ""
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(32 << 20)
	if err != nil {
		return ""
	}
	defer form.RemoveAll()
	if values := form.Value["model"]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func readAIRequestCount(body []byte, contentType string) int {
	count := 1
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return count
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return count
		}
		defer form.RemoveAll()
		if values := form.Value["n"]; len(values) > 0 {
			_, _ = fmt.Sscan(values[0], &count)
		}
	} else {
		var payload struct {
			N int `json:"n"`
		}
		_ = json.Unmarshal(body, &payload)
		count = payload.N
	}
	if count < 1 {
		return 1
	}
	if count > maxAIRequestCount {
		return maxAIRequestCount
	}
	return count
}

var errMissingModel = &aiError{"缺少模型名称"}

func readLimitedAIRequestBody(body io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, &aiError{"AI 请求体过大"}
	}
	return data, nil
}

func multiplyAICredits(credits int, count int) (int, error) {
	if credits <= 0 || count <= 1 {
		return credits, nil
	}
	maxInt := int(^uint(0) >> 1)
	if credits > maxInt/count {
		return 0, &aiError{"AI 请求扣费数量过大"}
	}
	return credits * count, nil
}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
