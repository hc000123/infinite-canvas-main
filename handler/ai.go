package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

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

func proxyAIGetRequest(w http.ResponseWriter, r *http.Request, path string) {
	modelName := r.URL.Query().Get("model")
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
		proxyArkVideoGetRequest(w, channel, path)
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
		upstreamBody, upstreamContentType, err = buildArkVideoCreateRequest(body, contentType)
		if err != nil {
			log.Printf("AI proxy build ark video request failed: model=%s err=%v", modelName, err)
			Fail(w, err.Error())
			return
		}
	}
	request, err := http.NewRequest(http.MethodPost, service.BuildModelChannelURL(channel, upstreamPath), bytes.NewReader(upstreamBody))
	if err != nil {
		log.Printf("AI proxy build request failed: url=%s err=%v", service.BuildModelChannelURL(channel, upstreamPath), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	if upstreamContentType != "" {
		request.Header.Set("Content-Type", upstreamContentType)
	}
	if err := service.ConsumeUserCredits(user.ID, modelName, credits, path); err != nil {
		FailError(w, err)
		return
	}
	if isArkVideoTask {
		copyArkVideoTaskResponse(w, request, func() {
			if err := service.RefundUserCredits(user.ID, modelName, credits, path); err != nil {
				log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
			}
		})
		return
	}
	copyAIResponse(w, request, func() {
		if err := service.RefundUserCredits(user.ID, modelName, credits, path); err != nil {
			log.Printf("AI proxy refund credits failed: user=%s model=%s credits=%d err=%v", user.ID, modelName, credits, err)
		}
	})
}

func proxyArkVideoGetRequest(w http.ResponseWriter, channel model.ModelChannel, path string) {
	taskID, contentRequest := parseVideoTaskPath(path)
	if taskID == "" {
		Fail(w, "缺少视频任务 ID")
		return
	}
	request, err := http.NewRequest(http.MethodGet, service.BuildModelChannelURL(channel, "/contents/generations/tasks/"+url.PathEscape(taskID)), nil)
	if err != nil {
		Fail(w, "AI 接口请求失败")
		return
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
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
		Fail(w, "AI 接口请求失败")
		return
	}
	if contentRequest {
		videoURL := arkTaskVideoURL(body)
		if videoURL == "" {
			Fail(w, "视频任务尚未返回可下载地址")
			return
		}
		proxyArkVideoContent(w, videoURL)
		return
	}
	normalized, err := normalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", strings.TrimSpace(string(body)), err)
		Fail(w, "AI 接口请求失败")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(normalized)
}

func copyArkVideoTaskResponse(w http.ResponseWriter, request *http.Request, onFailure func()) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("Ark video task request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video task upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, strings.TrimSpace(string(body)))
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	normalized, err := normalizeArkVideoTaskResponse(body)
	if err != nil {
		log.Printf("Ark video task normalize failed: body=%s err=%v", strings.TrimSpace(string(body)), err)
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(normalized)
}

func buildArkVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	modelName := ""
	prompt := ""
	seconds := ""
	size := ""
	resolution := ""
	generateAudio := ""
	watermark := ""
	seed := ""
	content := []any{}
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return nil, "", err
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return nil, "", err
		}
		defer form.RemoveAll()
		modelName = firstFormValue(form.Value, "model")
		prompt = firstFormValue(form.Value, "prompt")
		seconds = firstFormValue(form.Value, "duration")
		if seconds == "" {
			seconds = firstFormValue(form.Value, "seconds")
		}
		size = firstFormValue(form.Value, "ratio")
		if size == "" {
			size = firstFormValue(form.Value, "size")
		}
		resolution = firstFormValue(form.Value, "resolution")
		if resolution == "" {
			resolution = firstFormValue(form.Value, "resolution_name")
		}
		generateAudio = firstFormValue(form.Value, "generate_audio")
		watermark = firstFormValue(form.Value, "watermark")
		seed = firstFormValue(form.Value, "seed")
		for _, header := range form.File["input_reference[]"] {
			dataURL, err := multipartFileDataURL(header)
			if err != nil {
				return nil, "", err
			}
			content = append(content, arkImageContent(dataURL))
		}
	} else {
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, "", err
		}
		modelName = stringMapValue(payload, "model")
		prompt = stringMapValue(payload, "prompt")
		seconds = stringMapValue(payload, "duration", "seconds")
		size = stringMapValue(payload, "ratio", "size")
		resolution = stringMapValue(payload, "resolution", "resolution_name")
		generateAudio = stringMapValue(payload, "generate_audio")
		watermark = stringMapValue(payload, "watermark")
		seed = stringMapValue(payload, "seed")
		if rawContent, ok := payload["content"].([]any); ok {
			content = rawContent
		}
	}
	if strings.TrimSpace(prompt) != "" {
		content = append([]any{map[string]any{"type": "text", "text": prompt}}, content...)
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, "", errors.New("缺少模型名称")
	}
	if len(content) == 0 {
		return nil, "", errors.New("缺少视频提示词")
	}
	payload := map[string]any{
		"model":   modelName,
		"content": content,
	}
	if duration := normalizeArkVideoDuration(seconds); duration > 0 {
		payload["duration"] = duration
	}
	if ratio := normalizeArkVideoRatio(size); ratio != "" {
		payload["ratio"] = ratio
	}
	if normalizedResolution := normalizeArkVideoResolution(resolution); normalizedResolution != "" {
		payload["resolution"] = normalizedResolution
	}
	if value, ok := parseOptionalBool(generateAudio); ok {
		payload["generate_audio"] = value
	}
	if value, ok := parseOptionalBool(watermark); ok {
		payload["watermark"] = value
	}
	if value, ok := parseOptionalInt(seed); ok {
		payload["seed"] = value
	}
	nextBody, _ := json.Marshal(payload)
	return nextBody, "application/json", nil
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

func proxyArkVideoContent(w http.ResponseWriter, videoURL string) {
	request, err := http.NewRequest(http.MethodGet, videoURL, nil)
	if err != nil {
		Fail(w, "视频下载地址无效")
		return
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("Ark video content download failed: url=%s err=%v", videoURL, err)
		Fail(w, "视频下载失败")
		return
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("Ark video content upstream error: url=%s status=%d", videoURL, response.StatusCode)
		Fail(w, "视频下载失败")
		return
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
}

func normalizeArkVideoTaskResponse(body []byte) ([]byte, error) {
	task, err := readArkTaskObject(body)
	if err != nil {
		return nil, err
	}
	id := stringMapValue(task, "id", "task_id")
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	status := normalizeArkTaskStatus(stringMapValue(task, "status"))
	payload := map[string]any{
		"id":         id,
		"status":     status,
		"raw_status": stringMapValue(task, "status"),
	}
	copyArkTaskStringFields(payload, task, "model", "resolution", "ratio", "service_tier")
	copyArkTaskNumberFields(payload, task, "created_at", "updated_at", "execution_expires_after", "seed", "duration", "framespersecond", "priority")
	copyArkTaskBoolFields(payload, task, "generate_audio", "watermark", "draft")
	if expiresAfter, ok := numberMapValue(task, "execution_expires_after"); ok {
		if updatedAt, ok := numberMapValue(task, "updated_at"); ok && updatedAt > 0 {
			payload["video_url_expires_at"] = updatedAt + expiresAfter
		} else if createdAt, ok := numberMapValue(task, "created_at"); ok && createdAt > 0 {
			payload["video_url_expires_at"] = createdAt + expiresAfter
		}
	}
	if videoURL := arkVideoURLFromTask(task); videoURL != "" {
		payload["video_url"] = videoURL
		payload["content"] = map[string]string{"video_url": videoURL}
	}
	if errorDetails := arkTaskErrorDetails(task); len(errorDetails) > 0 {
		payload["error"] = errorDetails
	}
	return json.Marshal(payload)
}

func arkTaskVideoURL(body []byte) string {
	task, err := readArkTaskObject(body)
	if err != nil {
		return ""
	}
	return arkVideoURLFromTask(task)
}

func readArkTaskObject(body []byte) (map[string]any, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	for _, key := range []string{"data", "task", "result"} {
		if value, ok := payload[key].(map[string]any); ok {
			return value, nil
		}
	}
	return payload, nil
}

func arkVideoURLFromTask(task map[string]any) string {
	if value := stringMapValue(task, "video_url", "url"); value != "" {
		return value
	}
	for _, key := range []string{"content", "output", "result"} {
		if value := nestedStringMapValue(task, key, "video_url"); value != "" {
			return value
		}
		if items, ok := task[key].([]any); ok {
			for _, item := range items {
				if object, ok := item.(map[string]any); ok {
					if value := stringMapValue(object, "video_url", "url"); value != "" {
						return value
					}
				}
			}
		}
	}
	return ""
}

func arkTaskErrorDetails(task map[string]any) map[string]string {
	message := stringMapValue(task, "message", "msg", "error_message", "fail_reason", "error")
	code := stringMapValue(task, "code", "error_code")
	if details, ok := task["error"].(map[string]any); ok {
		if message == "" {
			message = stringMapValue(details, "message", "msg")
		}
		if code == "" {
			code = stringMapValue(details, "code", "error_code")
		}
	}
	if message == "" && code != "" {
		message = code
	}
	if message == "" {
		return nil
	}
	result := map[string]string{"message": message}
	if code != "" {
		result["code"] = code
	}
	return result
}

func normalizeArkTaskStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "succeeded", "success", "completed":
		return "completed"
	case "queued", "pending", "created":
		return "queued"
	case "running", "processing", "in_progress":
		return "running"
	case "cancelled", "canceled":
		return "cancelled"
	case "failed", "error", "expired":
		return "failed"
	default:
		return "queued"
	}
}

func firstFormValue(values map[string][]string, key string) string {
	if items := values[key]; len(items) > 0 {
		return items[0]
	}
	return ""
}

func multipartFileDataURL(header *multipart.FileHeader) (string, error) {
	file, err := header.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()
	body, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(body)
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}

func arkImageContent(imageURL string) map[string]any {
	return map[string]any{
		"type": "image_url",
		"image_url": map[string]string{
			"url": imageURL,
		},
	}
}

func normalizeArkVideoDuration(value string) int {
	var seconds int
	_, _ = fmt.Sscan(value, &seconds)
	if seconds <= 0 {
		return 5
	}
	if seconds <= 5 {
		return 5
	}
	if seconds <= 10 {
		return 10
	}
	return 15
}

func normalizeArkVideoRatio(value string) string {
	trimmed := strings.TrimSpace(value)
	switch trimmed {
	case "16:9", "9:16", "1:1", "4:3", "3:4", "adaptive":
		return trimmed
	case "auto":
		return "adaptive"
	case "1280x720", "1792x1024":
		return "16:9"
	case "720x1280", "1024x1792":
		return "9:16"
	case "1024x1024":
		return "1:1"
	}
	var width, height int
	if _, err := fmt.Sscanf(trimmed, "%dx%d", &width, &height); err != nil || width <= 0 || height <= 0 {
		return ""
	}
	if width == height {
		return "1:1"
	}
	if width*9 == height*16 {
		return "16:9"
	}
	if width*3 == height*4 {
		return "4:3"
	}
	if width < height {
		if width*16 == height*9 {
			return "9:16"
		}
		if width*4 == height*3 {
			return "3:4"
		}
	}
	return ""
}

func normalizeArkVideoResolution(value string) string {
	trimmed := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), "p")
	var resolution int
	_, _ = fmt.Sscan(trimmed, &resolution)
	if resolution >= 1080 {
		return "1080p"
	}
	return "720p"
}

func parseOptionalBool(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on":
		return true, true
	case "false", "0", "no", "off":
		return false, true
	default:
		return false, false
	}
}

func parseOptionalInt(value string) (int, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, false
	}
	var number int
	if _, err := fmt.Sscan(trimmed, &number); err != nil {
		return 0, false
	}
	return number, true
}

func stringMapValue(values map[string]any, keys ...string) string {
	for _, key := range keys {
		switch value := values[key].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return value
			}
		case float64:
			return fmt.Sprintf("%.0f", value)
		case int:
			return fmt.Sprintf("%d", value)
		case bool:
			return fmt.Sprintf("%t", value)
		}
	}
	return ""
}

func numberMapValue(values map[string]any, keys ...string) (int64, bool) {
	for _, key := range keys {
		switch value := values[key].(type) {
		case float64:
			return int64(value), true
		case int:
			return int64(value), true
		case int64:
			return value, true
		case string:
			var number int64
			if _, err := fmt.Sscan(strings.TrimSpace(value), &number); err == nil {
				return number, true
			}
		}
	}
	return 0, false
}

func boolMapValue(values map[string]any, keys ...string) (bool, bool) {
	for _, key := range keys {
		switch value := values[key].(type) {
		case bool:
			return value, true
		case string:
			if parsed, ok := parseOptionalBool(value); ok {
				return parsed, true
			}
		}
	}
	return false, false
}

func copyArkTaskStringFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value := stringMapValue(task, key); value != "" {
			payload[key] = value
		}
	}
}

func copyArkTaskNumberFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value, ok := numberMapValue(task, key); ok {
			payload[key] = value
		}
	}
}

func copyArkTaskBoolFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value, ok := boolMapValue(task, key); ok {
			payload[key] = value
		}
	}
}

func nestedStringMapValue(values map[string]any, key string, nestedKey string) string {
	nested, ok := values[key].(map[string]any)
	if !ok {
		return ""
	}
	return stringMapValue(nested, nestedKey)
}

func copyAIResponse(w http.ResponseWriter, request *http.Request, onFailure func()) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("AI proxy request failed: url=%s err=%v", request.URL.String(), err)
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		log.Printf("AI upstream error: url=%s status=%d body=%s", request.URL.String(), response.StatusCode, strings.TrimSpace(string(payload)))
		if onFailure != nil {
			onFailure()
		}
		Fail(w, "AI 接口请求失败")
		return
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
