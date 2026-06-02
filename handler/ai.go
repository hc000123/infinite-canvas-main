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
			proxyArkVideoGetByConfig(w, r.Context(), localBaseURL, localAPIKey, path)
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
				baseURL := strings.TrimRight(volcengineBaseURL, "/")
				request, reqErr := http.NewRequest(http.MethodPost, baseURL+"/contents/generations/tasks", bytes.NewReader(arkBody))
				if reqErr != nil {
					Fail(w, "AI 接口请求失败")
					return
				}
				request.Header.Set("Authorization", "Bearer "+volcengineAPIKey)
				request.Header.Set("Content-Type", "application/json")
				copyArkVideoTaskResponse(w, request, nil)
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
	credits *= readAIRequestCount(body, contentType)
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
		upstreamBody, upstreamContentType, err = service.BuildArkVideoCreateRequest(body, contentType)
		if err != nil {
			log.Printf("AI proxy build ark video request failed: model=%s err=%v", modelName, err)
			Fail(w, err.Error())
			return
		}
	}
	aiTask, err := service.CreateAITask(service.CreateAITaskInput{
		UserID:      user.ID,
		TaskType:    service.AITaskTypeForPath(path),
		Provider:    channel.Name,
		Protocol:    channel.Protocol,
		Model:       modelName,
		Path:        path,
		Credits:     credits,
		RequestBody: upstreamBody,
		ContentType: upstreamContentType,
	})
	if err != nil {
		log.Printf("AI proxy create task failed: user=%s model=%s path=%s err=%v", user.ID, modelName, path, err)
		Fail(w, "AI 接口请求失败")
		return
	}
	request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, upstreamPath), bytes.NewReader(upstreamBody))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", service.BuildModelChannelURL(channel, upstreamPath), err)
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
		})
		return
	}
	copyAIResponse(w, request, refundAndFailTask, func(_ int, payload []byte, responseContentType string) {
		if err := service.MarkAITaskSucceeded(aiTask.ID, payload, responseContentType); err != nil {
			log.Printf("AI proxy mark task succeeded failed: task=%s err=%v", aiTask.ID, err)
		}
	})
}

func proxyArkVideoGetRequest(w http.ResponseWriter, ctx context.Context, channel model.ModelChannel, path string) {
	proxyArkVideoGetByConfig(w, ctx, channel.BaseURL, channel.APIKey, path)
}

func proxyArkVideoGetByConfig(w http.ResponseWriter, ctx context.Context, baseURL string, apiKey string, path string) {
	taskID, contentRequest := parseVideoTaskPath(path)
	if taskID == "" {
		Fail(w, "缺少视频任务 ID")
		return
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/contents/generations/tasks/"+url.PathEscape(taskID), nil)
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("Ark video task query failed: url=%s err=%v", request.URL.String(), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video task query upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, strings.TrimSpace(string(body)))
		Fail(w, upstreamErrorMessage(body, "AI 接口请求失败"))
		return
	}
	normalized, err := service.NormalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", strings.TrimSpace(string(body)), err)
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
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("Ark video task request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure("AI 接口请求失败", nil)
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video task upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, strings.TrimSpace(string(body)))
		message := upstreamErrorMessage(body, "AI 接口请求失败")
		if onFailure != nil {
			onFailure(message, body)
		}
		Fail(w, message)
		return
	}
	normalized, err := service.NormalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", strings.TrimSpace(string(body)), err)
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
		log.Printf("Ark video content rejected: url=%s err=%v", videoURL, err)
		Fail(w, "视频下载地址无效")
		return false
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, videoURL, nil)
	if err != nil {
		Fail(w, "视频下载地址无效")
		return false
	}
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return validateProxyDownloadURL(ctx, req.URL.String())
		},
	}
	response, err := client.Do(request)
	if err != nil {
		log.Printf("Ark video content download failed: url=%s err=%v", videoURL, err)
		Fail(w, "视频下载失败")
		return false
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video content upstream error: url=%s status=%d", videoURL, response.StatusCode)
		Fail(w, "视频下载失败")
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
	_, _ = io.Copy(w, response.Body)
	return true
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

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func(string, []byte), onSuccess ...func(int, []byte, string)) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure("AI 接口请求失败", nil)
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, strings.TrimSpace(string(payload)))
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
	body, err := io.ReadAll(r.Body)
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
	return count
}

var errMissingModel = &aiError{"缺少模型名称"}

type aiError struct {
	message string
}

func (err *aiError) Error() string {
	return err.message
}
