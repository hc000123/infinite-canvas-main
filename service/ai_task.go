package service

import (
	"bytes"
	"encoding/json"
	"fmt"
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
	UserID           string
	TaskType         string
	Provider         string
	ChannelID        string
	Protocol         string
	Model            string
	Path             string
	Credits          int
	GeneratedSeconds int
	RequestBody      []byte
	ContentType      string
	FrontendTrace    string
}

func CreateAITask(input CreateAITaskInput) (model.AITask, error) {
	stamp := now()
	frontendTrace := sanitizeFrontendTraceJSON(input.FrontendTrace)
	task := model.AITask{
		ID:               newID("aitask"),
		UserID:           input.UserID,
		Kind:             inferAITaskKind(input.Path),
		TaskType:         input.TaskType,
		ActionType:       inferAITaskActionType(input.Path, input.RequestBody, input.ContentType),
		Provider:         input.Provider,
		ChannelID:        strings.TrimSpace(input.ChannelID),
		Protocol:         input.Protocol,
		Model:            strings.TrimSpace(input.Model),
		Path:             input.Path,
		Status:           model.AITaskStatusCreated,
		Credits:          input.Credits,
		GeneratedSeconds: max(0, input.GeneratedSeconds),
		RequestJSON:      mergeAITaskFrontendTrace(SanitizeAIJSON(input.RequestBody, input.ContentType), input.FrontendTrace),
		CreatedAt:        stamp,
		UpdatedAt:        stamp,
	}
	if len(frontendTrace) > 0 {
		task.FrontendTraceJSON = marshalSanitized(frontendTrace)
	}
	return repository.SaveAITask(task)
}

func SelectVideoTaskModelChannel(upstreamTaskID string, fallbackModel string) (model.ModelChannel, error) {
	task, ok, err := repository.GetAITaskByUpstreamTaskID(strings.TrimSpace(upstreamTaskID))
	if err != nil {
		return model.ModelChannel{}, err
	}
	if !ok {
		return SelectModelChannel(fallbackModel)
	}
	return selectBoundVideoTaskModelChannel(task, fallbackModel)
}

func SelectUserVideoTaskModelChannel(aiTaskID string, upstreamTaskID string, userID string, fallbackModel string) (model.ModelChannel, string, error) {
	if strings.TrimSpace(aiTaskID) == "" {
		channel, err := SelectVideoTaskModelChannel(upstreamTaskID, fallbackModel)
		return channel, "", err
	}
	task, ok, err := repository.GetAITask(strings.TrimSpace(aiTaskID))
	if err != nil {
		return model.ModelChannel{}, "", err
	}
	if !ok || task.UserID != strings.TrimSpace(userID) || task.UpstreamTaskID != strings.TrimSpace(upstreamTaskID) {
		return model.ModelChannel{}, "", safeMessageError{message: "视频任务不存在或无权访问"}
	}
	channel, err := selectBoundVideoTaskModelChannel(task, fallbackModel)
	return channel, task.ID, err
}

func selectBoundVideoTaskModelChannel(task model.AITask, fallbackModel string) (model.ModelChannel, error) {
	if strings.TrimSpace(task.ChannelID) == "" {
		return SelectModelChannel(fallbackModel)
	}
	modelName := strings.TrimSpace(task.Model)
	if modelName == "" {
		modelName = fallbackModel
	}
	return SelectModelChannelWithOptions(modelName, task.ChannelID, nil, "")
}

func NormalizedVideoTaskStatus(body []byte) model.AITaskStatus {
	return arkTaskStatusFromNormalized(body)
}

func MarkAITaskSucceeded(id string, responseBody []byte, contentType string) error {
	task, ok, err := repository.GetAITask(id)
	if err != nil || !ok {
		return err
	}
	task.Status = model.AITaskStatusSucceeded
	if isVideoAITask(task) {
		if seconds := aiTaskGeneratedSecondsFromResponse(responseBody); seconds > 0 {
			task.GeneratedSeconds = seconds
		}
	}
	task.ResponseJSON = preserveAITaskFrontendArtifacts(sanitizeAITaskResponse(responseBody, contentType), task.ResponseJSON)
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
	task.ResponseJSON = preserveAITaskFrontendArtifacts(SanitizeAIJSON(responseBody, contentType), task.ResponseJSON)
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

func MarkAITaskJimengCreated(id string, normalizedBody []byte) error {
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
	return syncVideoAITaskStatus(task, normalizedBody)
}

func SyncUserVideoAITaskStatus(id string, userID string, normalizedBody []byte) error {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !ok || task.UserID != strings.TrimSpace(userID) {
		return safeMessageError{message: "视频任务不存在或无权访问"}
	}
	return syncVideoAITaskStatus(task, normalizedBody)
}

func syncVideoAITaskStatus(task model.AITask, normalizedBody []byte) error {
	applyArkVideoTaskPayload(&task, normalizedBody)
	if isRefundableAITaskStatus(task.Status) {
		if err := refundAITaskIfNeeded(&task, false); err != nil {
			return err
		}
	}
	return saveAITask(task)
}

func SyncJimengVideoAITaskStatus(upstreamTaskID string, normalizedBody []byte) error {
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
	return markVideoAITaskContentFetched(task)
}

func MarkUserVideoAITaskContentFetched(id string, userID string) error {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !ok || task.UserID != strings.TrimSpace(userID) {
		return safeMessageError{message: "视频任务不存在或无权访问"}
	}
	return markVideoAITaskContentFetched(task)
}

func markVideoAITaskContentFetched(task model.AITask) error {
	task.FinishedAt = now()
	task.UpdatedAt = now()
	_, err := repository.SaveAITask(task)
	return err
}

func MarkJimengVideoAITaskContentFetched(upstreamTaskID string) error {
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
	for i := range tasks {
		tasks[i] = hydrateAITaskFrontendLinks(tasks[i])
		tasks[i].RequestJSON = ""
		tasks[i].ResponseJSON = ""
	}
	users, err := repository.ListUserSummariesByIDs(func() []string {
		ids := make([]string, 0, len(tasks))
		for _, task := range tasks {
			ids = append(ids, task.UserID)
		}
		return ids
	}())
	if err != nil {
		return model.AITaskList{}, err
	}
	for i := range tasks {
		tasks[i].User = users[tasks[i].UserID]
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
	detail := model.AITaskDetail{Task: hydrateAITaskFrontendLinks(task)}
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

func GetUserAITaskDetail(id string, userID string) (model.AITaskDetail, error) {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return model.AITaskDetail{}, err
	}
	if !ok || task.UserID != strings.TrimSpace(userID) {
		return model.AITaskDetail{}, safeMessageError{message: "任务不存在"}
	}
	logs, err := repository.ListCreditLogsByRelatedID(task.ID)
	if err != nil {
		return model.AITaskDetail{}, err
	}
	return model.AITaskDetail{Task: hydrateAITaskFrontendLinks(task), CreditLogs: logs}, nil
}

func RecordUserAITaskFrontendArtifact(id string, userID string, artifact model.AITaskFrontendArtifact) (model.AITask, error) {
	task, ok, err := repository.GetAITask(strings.TrimSpace(id))
	if err != nil {
		return model.AITask{}, err
	}
	if !ok || task.UserID != strings.TrimSpace(userID) {
		return model.AITask{}, safeMessageError{message: "任务不存在"}
	}
	artifact = normalizeAITaskFrontendArtifact(artifact)
	if artifact.AssetID == "" && artifact.NodeID == "" {
		return model.AITask{}, safeMessageError{message: "缺少前台产物 ID"}
	}
	artifacts := frontendArtifactsFromJSON(task.FrontendArtifactsJSON)
	if len(artifacts) == 0 {
		artifacts = frontendArtifactsFromPayload(jsonObjectFromString(task.ResponseJSON))
	}
	task.FrontendArtifactsJSON = marshalSanitized(appendOrReplaceFrontendArtifact(artifacts, artifact))
	task.ResponseJSON = mergeAITaskFrontendArtifact(task.ResponseJSON, artifact)
	task.UpdatedAt = now()
	task, err = repository.SaveAITask(task)
	return hydrateAITaskFrontendLinks(task), err
}

func LatestAITaskConsumeCreditLog(id string) (model.CreditLog, bool, error) {
	return repository.LatestCreditLogByRelatedIDAndType(strings.TrimSpace(id), model.CreditLogTypeAIConsume)
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
	case "/chat/completions", "/responses":
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
	case "/chat/completions", "/responses":
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
	case "/chat/completions", "/responses":
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

func sanitizeAITaskResponse(body []byte, contentType string) string {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err == nil && strings.EqualFold(mediaType, "text/event-stream") {
		return summarizeAIEventStream(body)
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "text/event-stream") {
		return summarizeAIEventStream(body)
	}
	return SanitizeAIJSON(body, contentType)
}

func summarizeAIEventStream(body []byte) string {
	collector := NewAIEventStreamCollector()
	_, _ = collector.Write(body)
	return collector.ArchiveJSON()
}

func appendAIStreamText(output *strings.Builder, payload map[string]any) {
	if delta, ok := payload["delta"].(string); ok {
		output.WriteString(delta)
		return
	}
	choices, _ := payload["choices"].([]any)
	for _, choice := range choices {
		record, _ := choice.(map[string]any)
		delta, _ := record["delta"].(map[string]any)
		if content, ok := delta["content"].(string); ok {
			output.WriteString(content)
		}
	}
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
	if isAITokenCount(key, value) {
		return value
	}
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

func isAITokenCount(key string, value any) bool {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(key), "-", "_"), " ", "_"))
	if !strings.HasSuffix(normalized, "_tokens") {
		return false
	}
	switch value.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, json.Number:
		return true
	default:
		return false
	}
}

func sanitizeAIString(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return value
	}
	lower := strings.ToLower(text)
	if isMediaDataURL(lower) || strings.HasPrefix(lower, "blob:") || strings.Contains(lower, ";base64,") {
		return "[media redacted]"
	}
	if len(text) > 512 && looksLikeBase64(text) {
		return "[base64 redacted]"
	}
	return value
}

func isMediaDataURL(value string) bool {
	if !strings.HasPrefix(value, "data:") {
		return false
	}
	mediaType := strings.TrimSpace(strings.TrimPrefix(value, "data:"))
	if strings.HasPrefix(mediaType, "{") || strings.HasPrefix(mediaType, "[") {
		return false
	}
	return strings.Contains(mediaType, "/")
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

func mergeAITaskFrontendTrace(requestJSON string, traceJSON string) string {
	trace := sanitizeFrontendTraceJSON(traceJSON)
	if len(trace) == 0 {
		return requestJSON
	}
	payload := jsonObjectFromString(requestJSON)
	payload["_frontend_trace"] = trace
	return marshalSanitized(payload)
}

func mergeAITaskFrontendArtifact(responseJSON string, artifact model.AITaskFrontendArtifact) string {
	payload := jsonObjectFromString(responseJSON)
	artifacts := frontendArtifactsFromPayload(payload)
	artifacts = appendOrReplaceFrontendArtifact(artifacts, artifact)
	payload["frontendArtifacts"] = artifacts
	return marshalSanitized(payload)
}

func preserveAITaskFrontendArtifacts(nextJSON string, previousJSON string) string {
	artifacts := frontendArtifactsFromPayload(jsonObjectFromString(previousJSON))
	if len(artifacts) == 0 {
		return nextJSON
	}
	payload := jsonObjectFromString(nextJSON)
	payload["frontendArtifacts"] = artifacts
	return marshalSanitized(payload)
}

func hydrateAITaskFrontendLinks(task model.AITask) model.AITask {
	task.FrontendTrace = frontendTraceFromJSON(task.FrontendTraceJSON)
	if aitaskFrontendTraceEmpty(task.FrontendTrace) {
		task.FrontendTrace = frontendTraceFromPayload(jsonObjectFromString(task.RequestJSON))
	}
	task.FrontendArtifacts = frontendArtifactsFromJSON(task.FrontendArtifactsJSON)
	if len(task.FrontendArtifacts) == 0 {
		task.FrontendArtifacts = frontendArtifactsFromPayload(jsonObjectFromString(task.ResponseJSON))
	}
	return task
}

func aitaskFrontendTraceEmpty(trace model.AITaskFrontendTrace) bool {
	return trace.ProjectID == "" && trace.CanvasID == "" && trace.NodeID == "" && trace.AssetID == "" && trace.StoryboardGroupID == "" && trace.StoryboardShotID == "" && trace.ShotGroupID == "" && len(trace.ShotIDs) == 0 && trace.Source == ""
}

func frontendTraceFromJSON(value string) model.AITaskFrontendTrace {
	var trace map[string]any
	if json.Unmarshal([]byte(strings.TrimSpace(value)), &trace) != nil {
		return model.AITaskFrontendTrace{}
	}
	return frontendTraceFromPayload(map[string]any{"_frontend_trace": trace})
}

func frontendArtifactsFromJSON(value string) []model.AITaskFrontendArtifact {
	var items []any
	if json.Unmarshal([]byte(strings.TrimSpace(value)), &items) != nil {
		return nil
	}
	return frontendArtifactsFromPayload(map[string]any{"frontendArtifacts": items})
}

func sanitizeFrontendTraceJSON(traceJSON string) map[string]any {
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(traceJSON)), &payload); err != nil {
		return nil
	}
	clean := map[string]any{}
	for _, key := range []string{"projectId", "canvasId", "nodeId", "assetId", "storyboardGroupId", "storyboardShotId", "shotGroupId", "source"} {
		if value := strings.TrimSpace(aiTaskStringValue(payload, key)); value != "" {
			clean[key] = sanitizeAIString(value)
		}
	}
	if values := aiTaskStringSliceValue(payload["shotIds"]); len(values) > 0 {
		clean["shotIds"] = values
	}
	if len(clean) == 0 {
		return nil
	}
	return clean
}

func jsonObjectFromString(value string) map[string]any {
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(value)), &payload); err == nil && payload != nil {
		return payload
	}
	if strings.TrimSpace(value) == "" {
		return map[string]any{}
	}
	return map[string]any{"upstream": sanitizeAIString(value)}
}

func frontendTraceFromPayload(payload map[string]any) model.AITaskFrontendTrace {
	trace, _ := payload["_frontend_trace"].(map[string]any)
	return model.AITaskFrontendTrace{
		ProjectID:         aiTaskStringValue(trace, "projectId"),
		CanvasID:          aiTaskStringValue(trace, "canvasId"),
		NodeID:            aiTaskStringValue(trace, "nodeId"),
		AssetID:           aiTaskStringValue(trace, "assetId"),
		StoryboardGroupID: aiTaskStringValue(trace, "storyboardGroupId"),
		StoryboardShotID:  aiTaskStringValue(trace, "storyboardShotId"),
		ShotGroupID:       aiTaskStringValue(trace, "shotGroupId"),
		ShotIDs:           aiTaskStringSliceValue(trace["shotIds"]),
		Source:            aiTaskStringValue(trace, "source"),
	}
}

func frontendArtifactsFromPayload(payload map[string]any) []model.AITaskFrontendArtifact {
	items, _ := payload["frontendArtifacts"].([]any)
	result := make([]model.AITaskFrontendArtifact, 0, len(items))
	for _, item := range items {
		record, ok := item.(map[string]any)
		if !ok {
			continue
		}
		artifact := model.AITaskFrontendArtifact{
			AssetID:           aiTaskStringValue(record, "assetId"),
			CanvasID:          aiTaskStringValue(record, "canvasId"),
			NodeID:            aiTaskStringValue(record, "nodeId"),
			ProjectID:         aiTaskStringValue(record, "projectId"),
			StoryboardGroupID: aiTaskStringValue(record, "storyboardGroupId"),
			StoryboardShotID:  aiTaskStringValue(record, "storyboardShotId"),
			ShotGroupID:       aiTaskStringValue(record, "shotGroupId"),
			ShotIDs:           aiTaskStringSliceValue(record["shotIds"]),
			Kind:              aiTaskStringValue(record, "kind"),
			CreatedAt:         aiTaskStringValue(record, "createdAt"),
		}
		if artifact.AssetID != "" || artifact.NodeID != "" {
			result = append(result, artifact)
		}
	}
	return result
}

func normalizeAITaskFrontendArtifact(artifact model.AITaskFrontendArtifact) model.AITaskFrontendArtifact {
	artifact.AssetID = strings.TrimSpace(sanitizeAIString(artifact.AssetID))
	artifact.CanvasID = strings.TrimSpace(sanitizeAIString(artifact.CanvasID))
	artifact.NodeID = strings.TrimSpace(sanitizeAIString(artifact.NodeID))
	artifact.ProjectID = strings.TrimSpace(sanitizeAIString(artifact.ProjectID))
	artifact.StoryboardGroupID = strings.TrimSpace(sanitizeAIString(artifact.StoryboardGroupID))
	artifact.StoryboardShotID = strings.TrimSpace(sanitizeAIString(artifact.StoryboardShotID))
	artifact.ShotGroupID = strings.TrimSpace(sanitizeAIString(artifact.ShotGroupID))
	artifact.Kind = strings.TrimSpace(sanitizeAIString(artifact.Kind))
	artifact.ShotIDs = aiTaskStringSliceValue(artifact.ShotIDs)
	if strings.TrimSpace(artifact.CreatedAt) == "" {
		artifact.CreatedAt = now()
	}
	return artifact
}

func appendOrReplaceFrontendArtifact(items []model.AITaskFrontendArtifact, artifact model.AITaskFrontendArtifact) []model.AITaskFrontendArtifact {
	for i, item := range items {
		if item.AssetID != "" && item.AssetID == artifact.AssetID {
			items[i] = artifact
			return items
		}
	}
	return append(items, artifact)
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
	task.ResponseJSON = preserveAITaskFrontendArtifacts(SanitizeAIJSON(normalizedBody, "application/json"), task.ResponseJSON)
	if isVideoAITask(*task) && task.Status == model.AITaskStatusSucceeded {
		if seconds := aiTaskGeneratedSecondsFromResponse(normalizedBody); seconds > 0 {
			task.GeneratedSeconds = seconds
		}
	}
	task.UpdatedAt = now()
}

func aiTaskGeneratedSecondsFromResponse(body []byte) int {
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return 0
	}
	candidates := []map[string]any{payload}
	for _, key := range []string{"task", "data", "output"} {
		if nested, ok := payload[key].(map[string]any); ok {
			candidates = append(candidates, nested)
		}
	}
	for _, item := range candidates {
		for _, key := range []string{"duration", "seconds"} {
			if seconds := int(aiTaskInt64Value(item, key)); seconds > 0 {
				return seconds
			}
		}
	}
	return 0
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
	logs, err := repository.ListCreditLogsByRelatedID(task.ID)
	if err != nil {
		return err
	}
	consumed := 0
	refunded := 0
	for _, log := range logs {
		switch log.Type {
		case model.CreditLogTypeAIConsume:
			consumed -= log.Amount
		case model.CreditLogTypeAIRefund:
			refunded += log.Amount
		}
	}
	if refunded > 0 {
		if failIfAlreadyRefunded {
			return safeMessageError{message: "任务已返还，不能重复返还"}
		}
		return nil
	}
	if consumed > 0 {
		if err := RefundUserCreditsForTask(task.UserID, task.Model, consumed, task.Path, task.ID); err != nil {
			return err
		}
	}
	task.CreditsRefunded = consumed
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

func aiTaskStringSliceValue(value any) []string {
	raw, ok := value.([]any)
	if !ok {
		if typed, ok := value.([]string); ok {
			return cleanStringSlice(typed)
		}
		return nil
	}
	result := make([]string, 0, len(raw))
	for _, item := range raw {
		if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
			result = append(result, sanitizeAIString(text))
		}
	}
	return cleanStringSlice(result)
}

func cleanStringSlice(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		text := strings.TrimSpace(sanitizeAIString(value))
		if text == "" || seen[text] {
			continue
		}
		seen[text] = true
		result = append(result, text)
	}
	return result
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
