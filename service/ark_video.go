package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
)

func BuildArkVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	modelName := ""
	prompt := ""
	seconds := ""
	size := ""
	resolution := ""
	generateAudio := ""
	watermark := ""
	seed := ""
	returnLastFrame := ""
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
		modelName = firstArkFormValue(form.Value, "model")
		prompt = firstArkFormValue(form.Value, "prompt")
		seconds = firstArkFormValue(form.Value, "duration")
		if seconds == "" {
			seconds = firstArkFormValue(form.Value, "seconds")
		}
		size = firstArkFormValue(form.Value, "ratio")
		if size == "" {
			size = firstArkFormValue(form.Value, "size")
		}
		resolution = firstArkFormValue(form.Value, "resolution")
		if resolution == "" {
			resolution = firstArkFormValue(form.Value, "resolution_name")
		}
		generateAudio = firstArkFormValue(form.Value, "generate_audio")
		watermark = firstArkFormValue(form.Value, "watermark")
		seed = firstArkFormValue(form.Value, "seed")
		returnLastFrame = firstArkFormValue(form.Value, "return_last_frame")
		for _, header := range form.File["input_reference[]"] {
			dataURL, err := multipartArkFileDataURL(header)
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
		modelName = arkStringMapValue(payload, "model")
		prompt = arkStringMapValue(payload, "prompt")
		seconds = arkStringMapValue(payload, "duration", "seconds")
		size = arkStringMapValue(payload, "ratio", "size")
		resolution = arkStringMapValue(payload, "resolution", "resolution_name")
		generateAudio = arkStringMapValue(payload, "generate_audio")
		watermark = arkStringMapValue(payload, "watermark")
		seed = arkStringMapValue(payload, "seed")
		returnLastFrame = arkStringMapValue(payload, "return_last_frame")
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
	appendArkVideoControls(payload, seconds, size, resolution, generateAudio, watermark, seed, returnLastFrame)
	nextBody, _ := json.Marshal(payload)
	return nextBody, "application/json", nil
}

func ReadArkLocalVideoConfig(body []byte, contentType string) (apiKey string, baseURL string, payload map[string]any, err error) {
	if strings.HasPrefix(contentType, "application/json") {
		if err := json.Unmarshal(body, &payload); err != nil {
			return "", "", nil, err
		}
		apiKey = arkStringMapValue(payload, "_volcengine_api_key")
		baseURL = arkStringMapValue(payload, "_volcengine_base_url")
		if apiKey == "" || baseURL == "" {
			return "", "", nil, errors.New("缺少火山引擎配置")
		}
		delete(payload, "_volcengine_api_key")
		delete(payload, "_volcengine_base_url")
		return apiKey, baseURL, payload, nil
	}
	_, params, parseErr := mime.ParseMediaType(contentType)
	if parseErr != nil {
		return "", "", nil, parseErr
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, formErr := reader.ReadForm(32 << 20)
	if formErr != nil {
		return "", "", nil, formErr
	}
	defer form.RemoveAll()
	apiKey = firstArkFormValue(form.Value, "_volcengine_api_key")
	baseURL = firstArkFormValue(form.Value, "_volcengine_base_url")
	if apiKey == "" || baseURL == "" {
		return "", "", nil, errors.New("缺少火山引擎配置")
	}
	modelName := firstArkFormValue(form.Value, "model")
	prompt := firstArkFormValue(form.Value, "prompt")
	seconds := firstArkFormValue(form.Value, "duration")
	if seconds == "" {
		seconds = firstArkFormValue(form.Value, "seconds")
	}
	size := firstArkFormValue(form.Value, "ratio")
	if size == "" {
		size = firstArkFormValue(form.Value, "size")
	}
	resolution := firstArkFormValue(form.Value, "resolution")
	if resolution == "" {
		resolution = firstArkFormValue(form.Value, "resolution_name")
	}
	generateAudio := firstArkFormValue(form.Value, "generate_audio")
	watermark := firstArkFormValue(form.Value, "watermark")
	seed := firstArkFormValue(form.Value, "seed")
	returnLastFrame := firstArkFormValue(form.Value, "return_last_frame")
	content := []any{}
	for _, header := range form.File["input_reference[]"] {
		dataURL, dataErr := multipartArkFileDataURL(header)
		if dataErr == nil {
			content = append(content, arkImageContent(dataURL))
		}
	}
	if strings.TrimSpace(prompt) != "" {
		content = append([]any{map[string]any{"type": "text", "text": prompt}}, content...)
	}
	payload = map[string]any{
		"model":   modelName,
		"content": content,
	}
	appendArkVideoControls(payload, seconds, size, resolution, generateAudio, watermark, seed, returnLastFrame)
	return apiKey, baseURL, payload, nil
}

func NormalizeArkVideoTaskResponse(body []byte) ([]byte, error) {
	task, err := readArkTaskObject(body)
	if err != nil {
		return nil, err
	}
	id := arkStringMapValue(task, "id", "task_id")
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	status := normalizeArkTaskStatus(arkStringMapValue(task, "status"))
	payload := map[string]any{
		"id":         id,
		"status":     status,
		"raw_status": arkStringMapValue(task, "status"),
	}
	copyArkTaskStringFields(payload, task, "model", "resolution", "ratio", "service_tier")
	copyArkTaskNumberFields(payload, task, "created_at", "updated_at", "execution_expires_after", "seed", "duration", "framespersecond", "priority")
	copyArkTaskBoolFields(payload, task, "generate_audio", "watermark", "draft")
	if expiresAfter, ok := arkNumberMapValue(task, "execution_expires_after"); ok {
		if updatedAt, ok := arkNumberMapValue(task, "updated_at"); ok && updatedAt > 0 {
			payload["video_url_expires_at"] = updatedAt + expiresAfter
		} else if createdAt, ok := arkNumberMapValue(task, "created_at"); ok && createdAt > 0 {
			payload["video_url_expires_at"] = createdAt + expiresAfter
		}
	}
	if videoURL := arkVideoURLFromTask(task); videoURL != "" {
		payload["video_url"] = videoURL
		payload["content"] = map[string]string{"video_url": videoURL}
	}
	if lastFrameURL := arkLastFrameURLFromTask(task); lastFrameURL != "" {
		payload["last_frame_url"] = lastFrameURL
	}
	if errorDetails := arkTaskErrorDetails(task); len(errorDetails) > 0 {
		payload["error"] = errorDetails
	}
	return json.Marshal(payload)
}

func ArkTaskVideoURL(body []byte) string {
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
	if value := arkStringMapValue(task, "video_url", "url"); value != "" {
		return value
	}
	for _, key := range []string{"content", "output", "result"} {
		if value := arkNestedStringMapValue(task, key, "video_url"); value != "" {
			return value
		}
		if items, ok := task[key].([]any); ok {
			for _, item := range items {
				if object, ok := item.(map[string]any); ok {
					if value := arkStringMapValue(object, "video_url", "url"); value != "" {
						return value
					}
				}
			}
		}
	}
	return ""
}

func arkLastFrameURLFromTask(task map[string]any) string {
	if value := arkStringMapValue(task, "last_frame_url", "last_frame", "last_frame_image_url", "image_url"); value != "" {
		return value
	}
	for _, key := range []string{"content", "output", "result"} {
		for _, field := range []string{"last_frame_url", "last_frame", "last_frame_image_url", "image_url"} {
			if value := arkNestedStringMapValue(task, key, field); value != "" {
				return value
			}
		}
		if items, ok := task[key].([]any); ok {
			for _, item := range items {
				if object, ok := item.(map[string]any); ok {
					if value := arkStringMapValue(object, "last_frame_url", "last_frame", "last_frame_image_url", "image_url"); value != "" {
						return value
					}
				}
			}
		}
	}
	return ""
}

func arkTaskErrorDetails(task map[string]any) map[string]string {
	message := arkStringMapValue(task, "message", "msg", "error_message", "fail_reason", "error")
	code := arkStringMapValue(task, "code", "error_code")
	if details, ok := task["error"].(map[string]any); ok {
		if message == "" {
			message = arkStringMapValue(details, "message", "msg")
		}
		if code == "" {
			code = arkStringMapValue(details, "code", "error_code")
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

func arkStringMapValue(values map[string]any, keys ...string) string {
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

func arkNumberMapValue(values map[string]any, keys ...string) (int64, bool) {
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

func arkBoolMapValue(values map[string]any, keys ...string) (bool, bool) {
	for _, key := range keys {
		switch value := values[key].(type) {
		case bool:
			return value, true
		case string:
			if parsed, ok := arkOptionalBool(value); ok {
				return parsed, true
			}
		}
	}
	return false, false
}

func arkOptionalBool(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on":
		return true, true
	case "false", "0", "no", "off":
		return false, true
	default:
		return false, false
	}
}

func copyArkTaskStringFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value := arkStringMapValue(task, key); value != "" {
			payload[key] = value
		}
	}
}

func copyArkTaskNumberFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value, ok := arkNumberMapValue(task, key); ok {
			payload[key] = value
		}
	}
}

func copyArkTaskBoolFields(payload map[string]any, task map[string]any, keys ...string) {
	for _, key := range keys {
		if value, ok := arkBoolMapValue(task, key); ok {
			payload[key] = value
		}
	}
}

func arkNestedStringMapValue(values map[string]any, key string, nestedKey string) string {
	nested, ok := values[key].(map[string]any)
	if !ok {
		return ""
	}
	return arkStringMapValue(nested, nestedKey)
}

func firstArkFormValue(values map[string][]string, key string) string {
	if items := values[key]; len(items) > 0 {
		return items[0]
	}
	return ""
}

func multipartArkFileDataURL(header *multipart.FileHeader) (string, error) {
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

func appendArkVideoControls(payload map[string]any, seconds string, size string, resolution string, generateAudio string, watermark string, seed string, returnLastFrame string) {
	if duration := normalizeArkVideoDuration(seconds); duration > 0 {
		payload["duration"] = duration
	}
	if ratio := normalizeArkVideoRatio(size); ratio != "" {
		payload["ratio"] = ratio
	}
	if normalizedResolution := normalizeArkVideoResolution(resolution); normalizedResolution != "" {
		payload["resolution"] = normalizedResolution
	}
	if value, ok := arkOptionalBool(generateAudio); ok {
		payload["generate_audio"] = value
	}
	if value, ok := arkOptionalBool(watermark); ok {
		payload["watermark"] = value
	}
	if value, ok := arkOptionalInt(seed); ok {
		payload["seed"] = value
	}
	if value, ok := arkOptionalBool(returnLastFrame); ok {
		payload["return_last_frame"] = value
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

func arkOptionalInt(value string) (int, bool) {
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
