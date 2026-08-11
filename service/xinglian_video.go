package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

type XinglianVideoEndpoints struct {
	BaseURL string
	Submit  string
}

func ResolveXinglianVideoEndpoints(baseURL string) (XinglianVideoEndpoints, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return XinglianVideoEndpoints{}, errors.New("星链云接口地址无效")
	}
	parsed.Path = strings.TrimSuffix(strings.TrimRight(parsed.Path, "/"), "/v1")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	normalizedBaseURL := strings.TrimRight(parsed.String(), "/")
	return XinglianVideoEndpoints{BaseURL: normalizedBaseURL, Submit: normalizedBaseURL + "/v1/video/submit/generate"}, nil
}

func (endpoints XinglianVideoEndpoints) Fetch(taskID string) string {
	return endpoints.BaseURL + "/v1/video/fetch/" + url.PathEscape(strings.TrimSpace(taskID))
}

func (endpoints XinglianVideoEndpoints) Balance() string {
	return endpoints.BaseURL + "/api/user/balance"
}

func BuildXinglianVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	if !strings.HasPrefix(strings.ToLower(contentType), "application/json") {
		return nil, "", errors.New("星链云参考素材必须使用 HTTPS 地址")
	}
	var source map[string]any
	if err := json.Unmarshal(body, &source); err != nil {
		return nil, "", err
	}
	modelName := xinglianString(source, "model")
	prompt := xinglianString(source, "prompt")
	if modelName == "" {
		return nil, "", errors.New("缺少模型名称")
	}
	if prompt == "" {
		return nil, "", errors.New("缺少视频提示词")
	}
	duration, err := xinglianDuration(source, modelName)
	if err != nil {
		return nil, "", err
	}
	payload := map[string]any{
		"model":    modelName,
		"prompt":   prompt,
		"duration": duration,
		"metadata": map[string]any{
			"ratio":       xinglianRatio(xinglianString(source, "ratio", "size")),
			"enableSound": xinglianEnableSound(source),
		},
	}
	for _, field := range []string{"images", "audios", "videos"} {
		values, err := xinglianHTTPSURLs(source[field])
		if err != nil {
			return nil, "", err
		}
		if len(values) > 0 {
			payload[field] = values
		}
	}
	encoded, err := json.Marshal(payload)
	return encoded, "application/json", err
}

func NormalizeXinglianVideoTaskResponse(body []byte) ([]byte, error) {
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		body = envelope.Data
	}
	var task struct {
		ID          arkFlexibleString `json:"id"`
		TaskID      string            `json:"task_id"`
		Status      string            `json:"status"`
		Model       string            `json:"model"`
		CreatedAt   int64             `json:"created_at"`
		CompletedAt int64             `json:"completed_at"`
		SubmitTime  int64             `json:"submit_time"`
		FinishTime  int64             `json:"finish_time"`
		ResultURL   string            `json:"result_url"`
		FailReason  string            `json:"fail_reason"`
		Metadata    struct {
			URL string `json:"url"`
		} `json:"metadata"`
		Data struct {
			VideoURL string `json:"video_url"`
			ErrorMsg string `json:"error_msg"`
		} `json:"data"`
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &task); err != nil {
		return nil, err
	}
	id := strings.TrimSpace(task.TaskID)
	if id == "" {
		id = task.ID.String()
	}
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	payload := map[string]any{
		"id":         id,
		"status":     normalizeXinglianVideoStatus(task.Status),
		"raw_status": strings.TrimSpace(task.Status),
	}
	if task.Model != "" {
		payload["model"] = task.Model
	}
	if createdAt := max(task.CreatedAt, task.SubmitTime); createdAt > 0 {
		payload["created_at"] = createdAt
	}
	if completedAt := max(task.CompletedAt, task.FinishTime); completedAt > 0 {
		payload["updated_at"] = completedAt
	}
	if videoURL := firstXinglianString(task.Metadata.URL, task.ResultURL, task.Data.VideoURL); videoURL != "" {
		payload["video_url"] = videoURL
	}
	if task.Error.Message != "" || task.Error.Code != "" || task.FailReason != "" || task.Data.ErrorMsg != "" {
		errorPayload := map[string]string{}
		if message := firstXinglianString(task.Error.Message, task.FailReason, task.Data.ErrorMsg); message != "" {
			errorPayload["message"] = message
		}
		if task.Error.Code != "" {
			errorPayload["code"] = task.Error.Code
		}
		payload["error"] = errorPayload
	}
	return json.Marshal(payload)
}

func firstXinglianString(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}

func XinglianTaskVideoURL(body []byte) string {
	normalized, err := NormalizeXinglianVideoTaskResponse(body)
	if err != nil {
		return ""
	}
	var payload struct {
		VideoURL string `json:"video_url"`
	}
	_ = json.Unmarshal(normalized, &payload)
	return payload.VideoURL
}

func PreflightXinglianChannel(channel model.ModelChannel, modelName string) error {
	models, err := fetchAdminChannelModels(channel)
	if err != nil {
		return err
	}
	modelName = strings.TrimSpace(modelName)
	if !slices.Contains(models, modelName) {
		return safeMessageError{message: fmt.Sprintf("星链云模型 %s 在当前账户不可用，请刷新渠道模型列表后重新选择", modelName)}
	}
	endpoints, err := ResolveXinglianVideoEndpoints(channel.BaseURL)
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodGet, endpoints.Balance(), nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	response, err := DoAIHTTPRequest(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return readAdminChannelError(body, response.StatusCode, "星链云余额预检失败")
	}
	var payload struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}
	if !payload.Success {
		if strings.TrimSpace(payload.Message) != "" {
			return safeMessageError{message: payload.Message}
		}
		return safeMessageError{message: "星链云余额预检失败"}
	}
	return nil
}

func normalizeXinglianVideoStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success", "succeeded", "completed":
		return "completed"
	case "queued", "submitted", "not_start", "pending":
		return "queued"
	case "in_progress", "running", "processing":
		return "running"
	case "failure", "failed", "error":
		return "failed"
	default:
		return "queued"
	}
}

func xinglianString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			return strings.TrimSpace(fmt.Sprint(value))
		}
	}
	return ""
}

func xinglianDuration(values map[string]any, modelName string) (int, error) {
	duration := 4
	for _, key := range []string{"duration", "seconds"} {
		if value, ok := values[key]; ok {
			switch number := value.(type) {
			case float64:
				if number >= 1 && number <= 30 {
					duration = int(number)
				}
			case string:
				var parsed int
				if _, err := fmt.Sscan(number, &parsed); err == nil && parsed >= 1 && parsed <= 30 {
					duration = parsed
				}
			}
			break
		}
	}
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if strings.HasSuffix(modelName, "-20s") {
		if duration != 20 {
			return 0, errors.New("当前星链云模型固定 20 秒，请将视频时长设置为 20 秒")
		}
		return duration, nil
	}
	if strings.HasPrefix(modelName, "sd2-720p-ds") && duration != 10 && duration != 15 {
		return 0, errors.New("当前星链云 DS 模型仅支持 10 秒或 15 秒")
	}
	maxDuration := 15
	if strings.HasPrefix(modelName, "sd2.5-") {
		maxDuration = 30
	}
	if duration > maxDuration {
		return 0, fmt.Errorf("当前星链云模型最长支持 %d 秒", maxDuration)
	}
	return duration, nil
}

func xinglianRatio(value string) string {
	switch value {
	case "9:16", "1:1", "16:9":
		return value
	default:
		return "16:9"
	}
}

func xinglianEnableSound(values map[string]any) string {
	switch value := values["generate_audio"].(type) {
	case bool:
		if value {
			return "on"
		}
	case string:
		if strings.EqualFold(value, "true") || strings.EqualFold(value, "on") {
			return "on"
		}
	}
	return "off"
}

func xinglianHTTPSURLs(raw any) ([]string, error) {
	if raw == nil {
		return nil, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, errors.New("星链云参考素材必须使用 HTTPS 地址")
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		value, ok := item.(string)
		if !ok || !strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), "https://") {
			return nil, errors.New("星链云参考素材必须使用 HTTPS 地址")
		}
		result = append(result, strings.TrimSpace(value))
	}
	return result, nil
}
