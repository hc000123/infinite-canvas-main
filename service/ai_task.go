package service

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const redactedValue = "[redacted]"

type CreateAITaskInput struct {
	UserID      string
	TaskType    string
	Provider    string
	Protocol    string
	Model       string
	Path        string
	Credits     int
	RequestBody []byte
	ContentType string
}

func CreateAITask(input CreateAITaskInput) (model.AITask, error) {
	stamp := now()
	task := model.AITask{
		ID:          newID("aitask"),
		UserID:      input.UserID,
		Kind:        inferAITaskKind(input.Path),
		TaskType:    input.TaskType,
		ActionType:  inferAITaskActionType(input.Path, input.RequestBody, input.ContentType),
		Provider:    input.Provider,
		Protocol:    input.Protocol,
		Model:       strings.TrimSpace(input.Model),
		Path:        input.Path,
		Status:      model.AITaskStatusCreated,
		Credits:     input.Credits,
		RequestJSON: SanitizeAIJSON(input.RequestBody, input.ContentType),
		CreatedAt:   stamp,
		UpdatedAt:   stamp,
	}
	return repository.SaveAITask(task)
}

func MarkAITaskSucceeded(id string, responseBody []byte, contentType string) error {
	task, ok, err := repository.GetAITask(id)
	if err != nil || !ok {
		return err
	}
	task.Status = model.AITaskStatusSucceeded
	task.ResponseJSON = SanitizeAIJSON(responseBody, contentType)
	task.ErrorMessage = ""
	task.UpdatedAt = now()
	_, err = repository.SaveAITask(task)
	return err
}

func MarkAITaskFailed(id string, message string, responseBody []byte, contentType string) error {
	task, ok, err := repository.GetAITask(id)
	if err != nil || !ok {
		return err
	}
	task.Status = model.AITaskStatusFailed
	task.ResponseJSON = SanitizeAIJSON(responseBody, contentType)
	task.ErrorMessage = strings.TrimSpace(message)
	task.UpdatedAt = now()
	_, err = repository.SaveAITask(task)
	return err
}

func MarkAITaskArkCreated(id string, normalizedBody []byte) error {
	task, ok, err := repository.GetAITask(id)
	if err != nil || !ok {
		return err
	}
	applyArkVideoTaskPayload(&task, normalizedBody)
	return saveAITask(task)
}

func SyncArkVideoAITaskStatus(upstreamTaskID string, normalizedBody []byte) error {
	task, ok, err := repository.GetAITaskByUpstreamTaskID(strings.TrimSpace(upstreamTaskID))
	if err != nil || !ok {
		return err
	}
	applyArkVideoTaskPayload(&task, normalizedBody)
	if isRefundableAITaskStatus(task.Status) {
		if err := refundAITaskIfNeeded(&task, false); err != nil {
			return err
		}
	}
	return saveAITask(task)
}

func MarkArkVideoAITaskContentFetched(upstreamTaskID string) error {
	task, ok, err := repository.GetAITaskByUpstreamTaskID(strings.TrimSpace(upstreamTaskID))
	if err != nil || !ok {
		return err
	}
	task.FinishedAt = now()
	task.UpdatedAt = now()
	_, err = repository.SaveAITask(task)
	return err
}

func ListAdminAITasks(q model.AITaskQuery) (model.AITaskList, error) {
	tasks, total, err := repository.ListAITasks(q)
	if err != nil {
		return model.AITaskList{}, err
	}
	return model.AITaskList{Items: tasks, Total: int(total)}, nil
}

func GetAdminAITaskDetail(id string) (model.AITaskDetail, error) {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return model.AITaskDetail{}, err
	}
	if !ok {
		return model.AITaskDetail{}, safeMessageError{message: "任务不存在"}
	}
	detail := model.AITaskDetail{Task: task}
	if user, ok, err := repository.GetUserByID(task.UserID); err == nil && ok {
		detail.User = model.PublicUser(user)
	} else if err != nil {
		return detail, err
	}
	logs, err := repository.ListCreditLogsByRelatedID(task.ID)
	if err != nil {
		return detail, err
	}
	detail.CreditLogs = logs
	return detail, nil
}

func RefreshAdminAITask(id string) (model.AITask, error) {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return model.AITask{}, err
	}
	if !ok {
		return model.AITask{}, safeMessageError{message: "任务不存在"}
	}
	if !isVideoAITask(task) || strings.TrimSpace(task.UpstreamTaskID) == "" {
		return model.AITask{}, safeMessageError{message: "只支持刷新已有上游任务 ID 的视频任务"}
	}
	channel, err := resolveAITaskArkChannel(task)
	if err != nil {
		return model.AITask{}, err
	}
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(channel.BaseURL, "/")+"/contents/generations/tasks/"+url.PathEscape(task.UpstreamTaskID), nil)
	if err != nil {
		return model.AITask{}, err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	response, err := DoAIHTTPRequest(request)
	if err != nil {
		return model.AITask{}, safeMessageError{message: "刷新任务失败"}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode >= http.StatusBadRequest {
		return model.AITask{}, readAdminChannelError(body, response.StatusCode, "刷新任务失败")
	}
	normalized, err := NormalizeArkVideoTaskResponse(body)
	if err != nil {
		return model.AITask{}, err
	}
	if err := SyncArkVideoAITaskStatus(task.UpstreamTaskID, normalized); err != nil {
		return model.AITask{}, err
	}
	refreshed, ok, err := repository.GetAITask(task.ID)
	if err != nil || !ok {
		return refreshed, err
	}
	return refreshed, nil
}

func RefundAdminAITask(id string) (model.AITask, error) {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return model.AITask{}, err
	}
	if !ok {
		return model.AITask{}, safeMessageError{message: "任务不存在"}
	}
	if !isAdminRefundableAITask(task) {
		return model.AITask{}, safeMessageError{message: "当前任务状态不允许手动返还"}
	}
	if err := refundAITaskIfNeeded(&task, true); err != nil {
		return model.AITask{}, err
	}
	if err := saveAITask(task); err != nil {
		return model.AITask{}, err
	}
	return task, nil
}

func AITaskTypeForPath(path string) string {
	switch path {
	case "/images/generations":
		return "image_generation"
	case "/images/edits":
		return "image_edit"
	case "/chat/completions":
		return "chat"
	case "/videos":
		return "video_create"
	default:
		return strings.Trim(path, "/")
	}
}

func inferAITaskKind(path string) string {
	switch path {
	case "/images/generations", "/images/edits":
		return "image"
	case "/chat/completions":
		return "chat"
	case "/videos":
		return "video"
	default:
		return strings.Trim(path, "/")
	}
}

func inferAITaskActionType(path string, body []byte, contentType string) string {
	switch path {
	case "/images/generations":
		return "generate"
	case "/images/edits":
		return "edit"
	case "/chat/completions":
		return "chat"
	case "/videos":
		if value := readAITaskStringField(body, contentType, "task_mode", "video_action_type", "action_type"); value != "" {
			return value
		}
		return "generate"
	default:
		return ""
	}
}

func readAITaskStringField(body []byte, contentType string, keys ...string) string {
	if len(body) == 0 {
		return ""
	}
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return ""
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return ""
		}
		defer form.RemoveAll()
		for _, key := range keys {
			if values := form.Value[key]; len(values) > 0 && strings.TrimSpace(values[0]) != "" {
				return strings.TrimSpace(values[0])
			}
		}
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return aiTaskStringValue(payload, keys...)
}

func SanitizeAIJSON(body []byte, contentType string) string {
	if len(body) == 0 {
		return ""
	}
	if strings.HasPrefix(contentType, "multipart/form-data") {
		return sanitizeMultipartAIRequest(body, contentType)
	}
	var payload any
	if err := json.Unmarshal(body, &payload); err == nil {
		return marshalSanitized(sanitizeAIValue(payload, ""))
	}
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}
	return marshalSanitized(map[string]any{"body": sanitizeAIString(text)})
}

func sanitizeMultipartAIRequest(body []byte, contentType string) string {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return marshalSanitized(map[string]any{"body": "[multipart redacted]"})
	}
	form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return marshalSanitized(map[string]any{"body": "[multipart redacted]"})
	}
	defer form.RemoveAll()
	payload := map[string]any{}
	for key, values := range form.Value {
		items := make([]any, 0, len(values))
		for _, value := range values {
			items = append(items, sanitizeAIValue(value, key))
		}
		if len(items) == 1 {
			payload[key] = items[0]
		} else {
			payload[key] = items
		}
	}
	for key, files := range form.File {
		payload[key] = map[string]any{"files": len(files), "content": "[file redacted]"}
	}
	return marshalSanitized(payload)
}

func sanitizeAIValue(value any, key string) any {
	if isSensitiveAIKey(key) {
		return redactedValue
	}
	switch typed := value.(type) {
	case map[string]any:
		next := map[string]any{}
		for childKey, childValue := range typed {
			next[childKey] = sanitizeAIValue(childValue, childKey)
		}
		return next
	case []any:
		next := make([]any, 0, len(typed))
		for _, item := range typed {
			next = append(next, sanitizeAIValue(item, key))
		}
		return next
	case string:
		return sanitizeAIString(typed)
	default:
		return value
	}
}

func sanitizeAIString(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return value
	}
	lower := strings.ToLower(text)
	if strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "blob:") || strings.Contains(lower, ";base64,") {
		return "[media redacted]"
	}
	if len(text) > 512 && looksLikeBase64(text) {
		return "[base64 redacted]"
	}
	return value
}

func isSensitiveAIKey(key string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(key), "-", "_"), " ", "_"))
	for _, item := range []string{"api_key", "apikey", "authorization", "access_key", "secret", "token", "password", "_volcengine_api_key"} {
		if normalized == item || strings.Contains(normalized, item) {
			return true
		}
	}
	return false
}

func looksLikeBase64(value string) bool {
	count := 0
	for _, ch := range value {
		if unicode.IsSpace(ch) {
			continue
		}
		if unicode.IsLetter(ch) || unicode.IsDigit(ch) || ch == '+' || ch == '/' || ch == '=' {
			count++
			continue
		}
		return false
	}
	return count > 512
}

func marshalSanitized(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(body)
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

func arkTaskStatusFromNormalized(body []byte) model.AITaskStatus {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return model.AITaskStatusCreated
	}
	return normalizeAITaskStatus(aiTaskStringValue(payload, "status"))
}

func applyArkVideoTaskPayload(task *model.AITask, normalizedBody []byte) {
	var payload map[string]any
	_ = json.Unmarshal(normalizedBody, &payload)
	task.Status = normalizeAITaskStatus(aiTaskStringValue(payload, "status"))
	task.RawStatus = aiTaskStringValue(payload, "raw_status")
	if task.RawStatus == "" {
		task.RawStatus = aiTaskStringValue(payload, "status")
	}
	if id := aiTaskStringValue(payload, "id"); id != "" {
		task.UpstreamTaskID = id
	}
	task.VideoURL = aiTaskStringValue(payload, "video_url")
	task.VideoURLExpiresAt = aiTaskInt64Value(payload, "video_url_expires_at")
	task.ErrorCode, task.ErrorMessage = aiTaskErrorFields(payload)
	if task.Status != model.AITaskStatusFailed && task.Status != model.AITaskStatusCancelled {
		task.ErrorCode = ""
		task.ErrorMessage = ""
	}
	task.ResponseJSON = SanitizeAIJSON(normalizedBody, "application/json")
	task.UpdatedAt = now()
}

func saveAITask(task model.AITask) error {
	_, err := repository.SaveAITask(task)
	return err
}

func refundAITaskIfNeeded(task *model.AITask, failIfAlreadyRefunded bool) error {
	if task.RefundedAt != "" || task.CreditsRefunded > 0 {
		if failIfAlreadyRefunded {
			return safeMessageError{message: "任务已返还，不能重复返还"}
		}
		return nil
	}
	total, err := repository.CountCreditLogsByRelatedIDAndType(task.ID, model.CreditLogTypeAIRefund)
	if err != nil {
		return err
	}
	if total > 0 {
		if failIfAlreadyRefunded {
			return safeMessageError{message: "任务已返还，不能重复返还"}
		}
		return nil
	}
	if task.Credits > 0 {
		if err := RefundUserCreditsForTask(task.UserID, task.Model, task.Credits, task.Path, task.ID); err != nil {
			return err
		}
	}
	task.CreditsRefunded = task.Credits
	task.RefundedAt = now()
	return nil
}

func isVideoAITask(task model.AITask) bool {
	return task.Kind == "video" || task.TaskType == "video_create" || task.Path == "/videos"
}

func isAdminRefundableAITask(task model.AITask) bool {
	if task.Status == model.AITaskStatusFailed || task.Status == model.AITaskStatusCancelled {
		return true
	}
	return task.Status == model.AITaskStatusCreated && strings.TrimSpace(task.ErrorMessage) != ""
}

func resolveAITaskArkChannel(task model.AITask) (model.ModelChannel, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.ModelChannel{}, err
	}
	channels := modelChannelsForModel(normalizePrivateSetting(settings.Private).Channels, task.Model)
	for _, channel := range channels {
		if !IsVolcengineArkProtocol(channel.Protocol) {
			continue
		}
		if strings.TrimSpace(task.Provider) == "" || channel.Name == task.Provider {
			return channel, nil
		}
	}
	for _, channel := range channels {
		if IsVolcengineArkProtocol(channel.Protocol) {
			return channel, nil
		}
	}
	return model.ModelChannel{}, safeMessageError{message: "未找到可刷新该任务的 Ark 渠道"}
}

func normalizeAITaskStatus(status string) model.AITaskStatus {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case string(model.AITaskStatusQueued):
		return model.AITaskStatusQueued
	case string(model.AITaskStatusRunning), "processing", "in_progress":
		return model.AITaskStatusRunning
	case string(model.AITaskStatusSucceeded), "completed", "success":
		return model.AITaskStatusSucceeded
	case string(model.AITaskStatusFailed), "error", "expired":
		return model.AITaskStatusFailed
	case string(model.AITaskStatusCancelled), "canceled":
		return model.AITaskStatusCancelled
	default:
		return model.AITaskStatusCreated
	}
}

func isRefundableAITaskStatus(status model.AITaskStatus) bool {
	return status == model.AITaskStatusFailed || status == model.AITaskStatusCancelled
}

func aiTaskStringValue(values map[string]any, keys ...string) string {
	for _, key := range keys {
		switch value := values[key].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return value
			}
		case float64:
			return strconv.FormatFloat(value, 'f', -1, 64)
		case int:
			return strconv.Itoa(value)
		case int64:
			return strconv.FormatInt(value, 10)
		}
	}
	return ""
}

func aiTaskInt64Value(values map[string]any, keys ...string) int64 {
	for _, key := range keys {
		switch value := values[key].(type) {
		case float64:
			return int64(value)
		case int:
			return int64(value)
		case int64:
			return value
		case string:
			result, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
			if err == nil {
				return result
			}
		}
	}
	return 0
}

func aiTaskErrorFields(payload map[string]any) (string, string) {
	code := aiTaskStringValue(payload, "error_code", "code")
	message := aiTaskStringValue(payload, "error_message", "message", "msg")
	if nested, ok := payload["error"].(map[string]any); ok {
		if code == "" {
			code = aiTaskStringValue(nested, "code", "error_code")
		}
		if message == "" {
			message = aiTaskStringValue(nested, "message", "msg", "error_message")
		}
	} else if text, ok := payload["error"].(string); ok && message == "" {
		message = text
	}
	if message == "" {
		message = code
	}
	return strings.TrimSpace(code), strings.TrimSpace(message)
}
