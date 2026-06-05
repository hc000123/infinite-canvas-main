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

const (
	arkLocalAPIKeyField  = "_volcengine_api_key"
	arkLocalBaseURLField = "_volcengine_base_url"
)

type arkVideoCreateFields struct {
	ModelName       string
	Prompt          string
	Duration        string
	Ratio           string
	Resolution      string
	GenerateAudio   string
	Watermark       string
	Seed            string
	ReturnLastFrame string
	Content         []any
}

func BuildArkVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	fields := arkVideoCreateFields{}
	if strings.HasPrefix(contentType, "multipart/form-data") {
		form, err := readArkMultipartForm(body, contentType)
		if err != nil {
			return nil, "", err
		}
		defer form.RemoveAll()
		fields, err = arkVideoFieldsFromForm(form, true)
		if err != nil {
			return nil, "", err
		}
	} else {
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, "", err
		}
		fields = arkVideoFieldsFromMap(payload)
	}
	payload, err := buildArkVideoPayload(fields, true)
	if err != nil {
		return nil, "", err
	}
	nextBody, _ := json.Marshal(payload)
	return nextBody, "application/json", nil
}

func ReadArkLocalVideoConfig(body []byte, contentType string) (apiKey string, baseURL string, payload map[string]any, err error) {
	if strings.HasPrefix(contentType, "application/json") {
		if err := json.Unmarshal(body, &payload); err != nil {
			return "", "", nil, err
		}
		if apiKey, baseURL, err = arkLocalConfigFromMap(payload); err != nil {
			return "", "", nil, err
		}
		removeArkLocalConfigFields(payload)
		return apiKey, baseURL, payload, nil
	}
	form, formErr := readArkMultipartForm(body, contentType)
	if formErr != nil {
		return "", "", nil, formErr
	}
	defer form.RemoveAll()
	if apiKey, baseURL, err = arkLocalConfigFromForm(form); err != nil {
		return "", "", nil, err
	}
	fields, fieldsErr := arkVideoFieldsFromForm(form, false)
	if fieldsErr != nil {
		return "", "", nil, fieldsErr
	}
	payload, err = buildArkVideoPayload(fields, false)
	return apiKey, baseURL, payload, nil
}

func readArkMultipartForm(body []byte, contentType string) (*multipart.Form, error) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, err
	}
	return multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
}

func arkVideoFieldsFromMap(payload map[string]any) arkVideoCreateFields {
	fields := arkVideoCreateFields{
		ModelName:       arkStringMapValue(payload, "model"),
		Prompt:          arkStringMapValue(payload, "prompt"),
		Duration:        arkStringMapValue(payload, "duration", "seconds"),
		Ratio:           arkStringMapValue(payload, "ratio", "size"),
		Resolution:      arkStringMapValue(payload, "resolution", "resolution_name"),
		GenerateAudio:   arkStringMapValue(payload, "generate_audio"),
		Watermark:       arkStringMapValue(payload, "watermark"),
		Seed:            arkStringMapValue(payload, "seed"),
		ReturnLastFrame: arkStringMapValue(payload, "return_last_frame"),
	}
	if rawContent, ok := payload["content"].([]any); ok {
		fields.Content = rawContent
	}
	return fields
}

func arkVideoFieldsFromForm(form *multipart.Form, failOnFileError bool) (arkVideoCreateFields, error) {
	fields := arkVideoCreateFields{
		ModelName:       firstArkFormValue(form.Value, "model"),
		Prompt:          firstArkFormValue(form.Value, "prompt"),
		Duration:        firstArkFormAliasValue(form.Value, "duration", "seconds"),
		Ratio:           firstArkFormAliasValue(form.Value, "ratio", "size"),
		Resolution:      firstArkFormAliasValue(form.Value, "resolution", "resolution_name"),
		GenerateAudio:   firstArkFormValue(form.Value, "generate_audio"),
		Watermark:       firstArkFormValue(form.Value, "watermark"),
		Seed:            firstArkFormValue(form.Value, "seed"),
		ReturnLastFrame: firstArkFormValue(form.Value, "return_last_frame"),
	}
	for _, header := range form.File["input_reference[]"] {
		dataURL, err := multipartArkFileDataURL(header)
		if err != nil {
			if failOnFileError {
				return arkVideoCreateFields{}, err
			}
			continue
		}
		fields.Content = append(fields.Content, arkImageContent(dataURL))
	}
	return fields, nil
}

func buildArkVideoPayload(fields arkVideoCreateFields, requirePrompt bool) (map[string]any, error) {
	content := fields.Content
	if content == nil {
		content = []any{}
	}
	if strings.TrimSpace(fields.Prompt) != "" {
		content = append([]any{map[string]any{"type": "text", "text": fields.Prompt}}, content...)
	}
	if requirePrompt {
		if strings.TrimSpace(fields.ModelName) == "" {
			return nil, errors.New("缺少模型名称")
		}
		if len(content) == 0 {
			return nil, errors.New("缺少视频提示词")
		}
	}
	payload := map[string]any{
		"model":   fields.ModelName,
		"content": content,
	}
	appendArkVideoControls(payload, fields.Duration, fields.Ratio, fields.Resolution, fields.GenerateAudio, fields.Watermark, fields.Seed, fields.ReturnLastFrame)
	return payload, nil
}

func arkLocalConfigFromMap(payload map[string]any) (string, string, error) {
	return requireArkLocalConfig(arkStringMapValue(payload, arkLocalAPIKeyField), arkStringMapValue(payload, arkLocalBaseURLField))
}

func arkLocalConfigFromForm(form *multipart.Form) (string, string, error) {
	return requireArkLocalConfig(firstArkFormValue(form.Value, arkLocalAPIKeyField), firstArkFormValue(form.Value, arkLocalBaseURLField))
}

func requireArkLocalConfig(apiKey string, baseURL string) (string, string, error) {
	if apiKey == "" || baseURL == "" {
		return "", "", errors.New("缺少火山引擎配置")
	}
	return apiKey, baseURL, nil
}

func removeArkLocalConfigFields(payload map[string]any) {
	delete(payload, arkLocalAPIKeyField)
	delete(payload, arkLocalBaseURLField)
}

func NormalizeArkVideoTaskResponse(body []byte) ([]byte, error) {
	task, err := readArkTaskResponse(body)
	if err != nil {
		return nil, err
	}
	id := firstArkTaskString(task.ID, task.TaskID)
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	rawStatus := task.Status.String()
	status := normalizeArkTaskStatus(rawStatus)
	payload := map[string]any{
		"id":         id,
		"status":     status,
		"raw_status": rawStatus,
	}
	putArkTaskString(payload, "model", task.Model)
	putArkTaskString(payload, "resolution", task.Resolution)
	putArkTaskString(payload, "ratio", task.Ratio)
	putArkTaskString(payload, "service_tier", task.ServiceTier)
	putArkTaskNumber(payload, "created_at", task.CreatedAt)
	putArkTaskNumber(payload, "updated_at", task.UpdatedAt)
	putArkTaskNumber(payload, "execution_expires_after", task.ExecutionExpiresAfter)
	putArkTaskNumber(payload, "seed", task.Seed)
	putArkTaskNumber(payload, "duration", task.Duration)
	putArkTaskNumber(payload, "framespersecond", task.FramesPerSecond)
	putArkTaskNumber(payload, "priority", task.Priority)
	putArkTaskBool(payload, "generate_audio", task.GenerateAudio)
	putArkTaskBool(payload, "watermark", task.Watermark)
	putArkTaskBool(payload, "draft", task.Draft)
	if task.ExecutionExpiresAfter.Valid {
		if task.UpdatedAt.Valid && task.UpdatedAt.Value > 0 {
			payload["video_url_expires_at"] = task.UpdatedAt.Value + task.ExecutionExpiresAfter.Value
		} else if task.CreatedAt.Valid && task.CreatedAt.Value > 0 {
			payload["video_url_expires_at"] = task.CreatedAt.Value + task.ExecutionExpiresAfter.Value
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
	task, err := readArkTaskResponse(body)
	if err != nil {
		return ""
	}
	return arkVideoURLFromTask(task)
}

type arkVideoTask struct {
	ID                    arkFlexibleString `json:"id"`
	TaskID                arkFlexibleString `json:"task_id"`
	Status                arkFlexibleString `json:"status"`
	Model                 arkFlexibleString `json:"model"`
	Resolution            arkFlexibleString `json:"resolution"`
	Ratio                 arkFlexibleString `json:"ratio"`
	ServiceTier           arkFlexibleString `json:"service_tier"`
	CreatedAt             arkFlexibleInt64  `json:"created_at"`
	UpdatedAt             arkFlexibleInt64  `json:"updated_at"`
	ExecutionExpiresAfter arkFlexibleInt64  `json:"execution_expires_after"`
	Seed                  arkFlexibleInt64  `json:"seed"`
	Duration              arkFlexibleInt64  `json:"duration"`
	FramesPerSecond       arkFlexibleInt64  `json:"framespersecond"`
	Priority              arkFlexibleInt64  `json:"priority"`
	GenerateAudio         arkFlexibleBool   `json:"generate_audio"`
	Watermark             arkFlexibleBool   `json:"watermark"`
	Draft                 arkFlexibleBool   `json:"draft"`
	VideoURL              arkFlexibleString `json:"video_url"`
	URL                   arkFlexibleString `json:"url"`
	LastFrameURL          arkFlexibleString `json:"last_frame_url"`
	LastFrame             arkFlexibleString `json:"last_frame"`
	LastFrameImageURL     arkFlexibleString `json:"last_frame_image_url"`
	ImageURL              arkFlexibleString `json:"image_url"`
	Message               arkFlexibleString `json:"message"`
	Msg                   arkFlexibleString `json:"msg"`
	ErrorMessage          arkFlexibleString `json:"error_message"`
	FailReason            arkFlexibleString `json:"fail_reason"`
	Code                  arkFlexibleString `json:"code"`
	ErrorCode             arkFlexibleString `json:"error_code"`
	Content               json.RawMessage   `json:"content"`
	Output                json.RawMessage   `json:"output"`
	Result                json.RawMessage   `json:"result"`
	Error                 json.RawMessage   `json:"error"`
}

type arkFlexibleString string

func (value *arkFlexibleString) UnmarshalJSON(body []byte) error {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	switch item := raw.(type) {
	case string:
		*value = arkFlexibleString(strings.TrimSpace(item))
	case float64:
		*value = arkFlexibleString(fmt.Sprintf("%.0f", item))
	case bool:
		*value = arkFlexibleString(fmt.Sprintf("%t", item))
	}
	return nil
}

func (value arkFlexibleString) String() string {
	return strings.TrimSpace(string(value))
}

type arkFlexibleInt64 struct {
	Value int64
	Valid bool
}

func (value *arkFlexibleInt64) UnmarshalJSON(body []byte) error {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	switch item := raw.(type) {
	case float64:
		value.Value = int64(item)
		value.Valid = true
	case string:
		var number int64
		if _, err := fmt.Sscan(strings.TrimSpace(item), &number); err == nil {
			value.Value = number
			value.Valid = true
		}
	}
	return nil
}

type arkFlexibleBool struct {
	Value bool
	Valid bool
}

func (value *arkFlexibleBool) UnmarshalJSON(body []byte) error {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	switch item := raw.(type) {
	case bool:
		value.Value = item
		value.Valid = true
	case string:
		if parsed, ok := arkOptionalBool(item); ok {
			value.Value = parsed
			value.Valid = true
		}
	}
	return nil
}

func readArkTaskResponse(body []byte) (arkVideoTask, error) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(body, &envelope); err != nil {
		return arkVideoTask{}, err
	}
	taskBody := body
	for _, key := range []string{"data", "task", "result"} {
		if value, ok := envelope[key]; ok && isArkJSONObject(value) {
			taskBody = value
			break
		}
	}
	var task arkVideoTask
	if err := json.Unmarshal(taskBody, &task); err != nil {
		return arkVideoTask{}, err
	}
	return task, nil
}

func isArkJSONObject(value json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(value))
	return strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}")
}

func arkVideoURLFromTask(task arkVideoTask) string {
	if value := firstArkTaskString(task.VideoURL, task.URL); value != "" {
		return value
	}
	for _, item := range []json.RawMessage{task.Content, task.Output, task.Result} {
		if value := arkURLFromRawContent(item, "video_url", "url"); value != "" {
			return value
		}
	}
	return ""
}

func arkLastFrameURLFromTask(task arkVideoTask) string {
	if value := firstArkTaskString(task.LastFrameURL, task.LastFrame, task.LastFrameImageURL, task.ImageURL); value != "" {
		return value
	}
	for _, item := range []json.RawMessage{task.Content, task.Output, task.Result} {
		if value := arkURLFromRawContent(item, "last_frame_url", "last_frame", "last_frame_image_url", "image_url"); value != "" {
			return value
		}
	}
	return ""
}

func arkURLFromRawContent(raw json.RawMessage, keys ...string) string {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return ""
	}
	var object map[string]arkFlexibleString
	if err := json.Unmarshal(raw, &object); err == nil {
		for _, key := range keys {
			if value := object[key].String(); value != "" {
				return value
			}
		}
	}
	var items []map[string]arkFlexibleString
	if err := json.Unmarshal(raw, &items); err == nil {
		for _, item := range items {
			for _, key := range keys {
				if value := item[key].String(); value != "" {
					return value
				}
			}
		}
	}
	return ""
}

func arkTaskErrorDetails(task arkVideoTask) map[string]string {
	message := firstArkTaskString(task.Message, task.Msg, task.ErrorMessage, task.FailReason)
	code := firstArkTaskString(task.Code, task.ErrorCode)
	if len(task.Error) > 0 && strings.TrimSpace(string(task.Error)) != "null" {
		var details struct {
			Message   arkFlexibleString `json:"message"`
			Msg       arkFlexibleString `json:"msg"`
			Code      arkFlexibleString `json:"code"`
			ErrorCode arkFlexibleString `json:"error_code"`
		}
		if err := json.Unmarshal(task.Error, &details); err == nil {
			if message == "" {
				message = firstArkTaskString(details.Message, details.Msg)
			}
			if code == "" {
				code = firstArkTaskString(details.Code, details.ErrorCode)
			}
		} else if message == "" {
			var text arkFlexibleString
			if textErr := json.Unmarshal(task.Error, &text); textErr == nil {
				message = text.String()
			}
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

func firstArkTaskString(values ...arkFlexibleString) string {
	for _, value := range values {
		if text := value.String(); text != "" {
			return text
		}
	}
	return ""
}

func putArkTaskString(payload map[string]any, key string, value arkFlexibleString) {
	if text := value.String(); text != "" {
		payload[key] = text
	}
}

func putArkTaskNumber(payload map[string]any, key string, value arkFlexibleInt64) {
	if value.Valid {
		payload[key] = value.Value
	}
}

func putArkTaskBool(payload map[string]any, key string, value arkFlexibleBool) {
	if value.Valid {
		payload[key] = value.Value
	}
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

func firstArkFormValue(values map[string][]string, key string) string {
	if items := values[key]; len(items) > 0 {
		return items[0]
	}
	return ""
}

func firstArkFormAliasValue(values map[string][]string, keys ...string) string {
	for _, key := range keys {
		if value := firstArkFormValue(values, key); value != "" {
			return value
		}
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
