package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

type geekNowImageReference struct {
	URL  string
	Role string
}

type geekNowVideoCreateFields struct {
	Model         string
	Prompt        string
	Duration      int
	Ratio         string
	Size          string
	Resolution    string
	GenerateAudio string
	Watermark     string
	Images        []geekNowImageReference
}

func IsGeekNowVideoChannel(channel model.ModelChannel) bool {
	return strings.TrimSpace(channel.ID) == "geeknow-video"
}

func BuildGeekNowVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	fields, err := readGeekNowVideoCreateFields(body, contentType)
	if err != nil {
		return nil, "", err
	}
	if fields.Model == "" {
		return nil, "", errors.New("缺少模型名称")
	}
	if fields.Prompt == "" {
		return nil, "", errors.New("缺少视频提示词")
	}
	payload := map[string]any{"model": fields.Model, "prompt": fields.Prompt}
	appendGeekNowVideoControls(payload, fields)
	if err := appendGeekNowImageReferences(payload, fields); err != nil {
		return nil, "", err
	}
	normalized, err := json.Marshal(payload)
	return normalized, "application/json", err
}

func readGeekNowVideoCreateFields(body []byte, contentType string) (geekNowVideoCreateFields, error) {
	if strings.HasPrefix(contentType, "multipart/form-data") {
		form, err := readArkMultipartForm(body, contentType)
		if err != nil {
			return geekNowVideoCreateFields{}, err
		}
		defer form.RemoveAll()
		fields := geekNowVideoCreateFields{
			Model:         strings.TrimSpace(firstArkFormValue(form.Value, "model")),
			Prompt:        strings.TrimSpace(firstArkFormValue(form.Value, "prompt")),
			Duration:      geekNowDuration(firstArkDurationFormValue(form.Value, "duration", "seconds")),
			Ratio:         geekNowRatio(firstArkFormAliasValue(form.Value, "ratio", "aspect_ratio", "size")),
			Size:          strings.TrimSpace(firstArkFormValue(form.Value, "size")),
			Resolution:    firstArkFormAliasValue(form.Value, "resolution", "resolution_name"),
			GenerateAudio: firstArkFormValue(form.Value, "generate_audio"),
			Watermark:     firstArkFormValue(form.Value, "watermark"),
		}
		roles := form.Value["input_reference_role[]"]
		for index, header := range form.File["input_reference[]"] {
			dataURL, err := multipartArkFileDataURL(header)
			if err != nil {
				return geekNowVideoCreateFields{}, err
			}
			role := "reference_image"
			if index < len(roles) && strings.TrimSpace(roles[index]) != "" {
				role = strings.TrimSpace(roles[index])
			}
			fields.Images = append(fields.Images, geekNowImageReference{URL: dataURL, Role: role})
		}
		return fields, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return geekNowVideoCreateFields{}, err
	}
	fields := geekNowVideoCreateFields{
		Model:         strings.TrimSpace(arkStringMapValue(payload, "model")),
		Prompt:        strings.TrimSpace(arkStringMapValue(payload, "prompt")),
		Duration:      geekNowDuration(arkDurationMapValue(payload, "duration", "seconds")),
		Ratio:         geekNowRatio(arkStringMapValue(payload, "ratio", "aspect_ratio", "size")),
		Size:          strings.TrimSpace(arkStringMapValue(payload, "size")),
		Resolution:    arkStringMapValue(payload, "resolution", "resolution_name"),
		GenerateAudio: arkStringMapValue(payload, "generate_audio"),
		Watermark:     arkStringMapValue(payload, "watermark"),
	}
	appendGeekNowMapImages(&fields.Images, payload["first_image"], "first_frame")
	appendGeekNowMapImages(&fields.Images, payload["first_image_url"], "first_frame")
	appendGeekNowMapImages(&fields.Images, payload["last_image"], "last_frame")
	appendGeekNowMapImages(&fields.Images, payload["last_image_url"], "last_frame")
	for _, key := range []string{"image", "images", "input_reference", "referenceImages", "reference_image_urls"} {
		appendGeekNowMapImages(&fields.Images, payload[key], "reference_image")
	}
	return fields, nil
}

func appendGeekNowVideoControls(payload map[string]any, fields geekNowVideoCreateFields) {
	modelName := strings.ToLower(fields.Model)
	size := geekNowSize(fields.Size, fields.Ratio)
	resolutionUpper := geekNowResolution(fields.Resolution, true)
	resolutionLower := geekNowResolution(fields.Resolution, false)
	switch {
	case strings.HasPrefix(modelName, "grok-imagine-video"):
		payload["seconds"] = strconv.Itoa(fields.Duration)
		payload["aspect_ratio"] = fields.Ratio
		payload["resolution"] = resolutionUpper
	case modelName == "sora-2":
		payload["seconds"] = strconv.Itoa(fields.Duration)
		payload["size"] = size
	case strings.HasPrefix(modelName, "veo_3_1"):
		payload["duration"] = fields.Duration
		payload["size"] = size
	case strings.HasPrefix(modelName, "doubao-seedance-2-0"):
		payload["duration"] = fields.Duration
		payload["aspect_ratio"] = fields.Ratio
		payload["resolution"] = resolutionUpper
		appendGeekNowBool(payload, "generate_audio", fields.GenerateAudio)
		appendGeekNowBool(payload, "watermark", fields.Watermark)
	case strings.HasPrefix(modelName, "minimax-h3"):
		payload["duration"] = fields.Duration
		payload["ratio"] = fields.Ratio
		payload["resolution"] = geekNowMiniMaxResolution(modelName, resolutionUpper)
	case modelName == "manxue-2.5":
		payload["duration"] = fields.Duration
		payload["ratio"] = fields.Ratio
		payload["resolution"] = resolutionLower
	case strings.HasPrefix(modelName, "omni-fast"):
		payload["seconds"] = strconv.Itoa(fields.Duration)
		payload["aspect_ratio"] = fields.Ratio
		payload["resolution"] = resolutionLower
	default:
		payload["duration"] = fields.Duration
		payload["ratio"] = fields.Ratio
		payload["resolution"] = resolutionLower
	}
}

func appendGeekNowImageReferences(payload map[string]any, fields geekNowVideoCreateFields) error {
	if len(fields.Images) == 0 {
		return nil
	}
	modelName := strings.ToLower(fields.Model)
	first, last, references := splitGeekNowImages(fields.Images)
	if last != "" && first == "" {
		return errors.New("尾帧必须和首帧一起提交")
	}
	switch {
	case strings.HasPrefix(modelName, "grok-imagine-video"):
		images := compactGeekNowImages(first, last, references)
		if modelName == "grok-imagine-video-1.5-preview" && len(images) > 1 {
			return errors.New("Grok Imagine 1.5 Preview 只支持一张参考图")
		}
		if len(images) == 1 {
			payload["image"] = images[0]
		} else {
			payload["images"] = images
		}
	case modelName == "sora-2", strings.HasPrefix(modelName, "veo_3_1"):
		images := compactGeekNowImages(first, last, references)
		if len(images) == 1 {
			payload["input_reference"] = images[0]
		} else {
			payload["input_reference"] = images
		}
	case strings.HasPrefix(modelName, "doubao-seedance-2-0"):
		putGeekNowString(payload, "first_image", first)
		putGeekNowString(payload, "last_image", last)
		if len(references) > 0 {
			payload["reference_image_urls"] = references
		}
	case strings.HasPrefix(modelName, "minimax-h3"):
		putGeekNowString(payload, "first_image", first)
		putGeekNowString(payload, "last_image", last)
		if len(references) > 0 {
			payload["referenceImages"] = references
		}
	case modelName == "manxue-2.5":
		payload["referenceImages"] = compactGeekNowImages(first, last, references)
	case strings.HasPrefix(modelName, "omni-fast"):
		putGeekNowString(payload, "first_image_url", first)
		putGeekNowString(payload, "last_image_url", last)
		if len(references) > 0 {
			payload["images"] = references
		}
	default:
		payload["images"] = compactGeekNowImages(first, last, references)
	}
	return nil
}

func NormalizeGeekNowVideoTaskResponse(body []byte) ([]byte, error) {
	var root map[string]any
	if err := json.Unmarshal(body, &root); err != nil {
		return nil, err
	}
	task := unwrapGeekNowTask(root)
	id := aiTaskStringValue(task, "id", "task_id")
	if id == "" {
		id = aiTaskStringValue(root, "id", "task_id")
	}
	if id == "" {
		return nil, errors.New("GeekNow 视频任务没有返回任务 ID")
	}
	rawStatus := aiTaskStringValue(task, "status", "state")
	if rawStatus == "" {
		rawStatus = aiTaskStringValue(root, "status", "state")
	}
	normalized := map[string]any{"id": id, "status": normalizeGeekNowTaskStatus(rawStatus), "raw_status": rawStatus}
	if modelName := aiTaskStringValue(task, "model"); modelName != "" {
		normalized["model"] = modelName
	}
	if videoURL := geekNowVideoURL(task); videoURL != "" {
		normalized["video_url"] = videoURL
		normalized["content"] = map[string]string{"video_url": videoURL}
	}
	if taskError := geekNowTaskError(task); taskError != nil {
		normalized["error"] = taskError
	}
	return json.Marshal(normalized)
}

func GeekNowTaskVideoURL(body []byte) string {
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return ""
	}
	return geekNowVideoURL(unwrapGeekNowTask(payload))
}

func geekNowDuration(value string) int {
	duration, _ := strconv.Atoi(strings.TrimSpace(value))
	if duration < 1 {
		return 6
	}
	return duration
}

func geekNowRatio(value string) string {
	value = strings.TrimSpace(value)
	if strings.Contains(value, "x") {
		parts := strings.SplitN(value, "x", 2)
		if len(parts) == 2 {
			width, _ := strconv.Atoi(parts[0])
			height, _ := strconv.Atoi(parts[1])
			if width > 0 && height > 0 {
				if width == height {
					return "1:1"
				}
				if width > height {
					return "16:9"
				}
				return "9:16"
			}
		}
	}
	if value == "" || value == "auto" || value == "adaptive" {
		return "16:9"
	}
	return value
}

func geekNowSize(value string, ratio string) string {
	if value = strings.TrimSpace(value); strings.Contains(value, "x") {
		return value
	}
	switch ratio {
	case "9:16":
		return "720x1280"
	case "1:1":
		return "1024x1024"
	default:
		return "1280x720"
	}
}

func geekNowResolution(value string, upper bool) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimSuffix(value, "p")
	switch value {
	case "2k", "2160":
		value = "2K"
	case "1080":
		value = "1080P"
	case "768":
		value = "768P"
	case "480":
		value = "480P"
	default:
		value = "720P"
	}
	if upper || strings.HasSuffix(value, "K") {
		return value
	}
	return strings.ToLower(value)
}

func geekNowMiniMaxResolution(modelName string, fallback string) string {
	if strings.HasSuffix(modelName, "-2k") {
		return "2K"
	}
	if strings.HasSuffix(modelName, "-768p") {
		return "768P"
	}
	return fallback
}

func appendGeekNowBool(payload map[string]any, key string, value string) {
	if normalized, ok := arkOptionalBool(value); ok {
		payload[key] = normalized
	}
}

func appendGeekNowMapImages(result *[]geekNowImageReference, value any, role string) {
	switch typed := value.(type) {
	case string:
		if value := strings.TrimSpace(typed); value != "" {
			*result = append(*result, geekNowImageReference{URL: value, Role: role})
		}
	case []any:
		for _, item := range typed {
			appendGeekNowMapImages(result, item, role)
		}
	case []string:
		for _, item := range typed {
			appendGeekNowMapImages(result, item, role)
		}
	}
}

func splitGeekNowImages(images []geekNowImageReference) (string, string, []string) {
	first, last := "", ""
	references := []string{}
	for _, image := range images {
		switch strings.ToLower(strings.TrimSpace(image.Role)) {
		case "first_frame", "first", "first_image":
			if first == "" {
				first = image.URL
			}
		case "last_frame", "last", "last_image":
			if last == "" {
				last = image.URL
			}
		default:
			references = append(references, image.URL)
		}
	}
	return first, last, references
}

func compactGeekNowImages(first string, last string, references []string) []string {
	result := make([]string, 0, len(references)+2)
	for _, item := range append([]string{first, last}, references...) {
		if strings.TrimSpace(item) != "" {
			result = append(result, item)
		}
	}
	return result
}

func putGeekNowString(payload map[string]any, key string, value string) {
	if strings.TrimSpace(value) != "" {
		payload[key] = value
	}
}

func unwrapGeekNowTask(payload map[string]any) map[string]any {
	for _, key := range []string{"data", "task"} {
		if nested, ok := payload[key].(map[string]any); ok && (aiTaskStringValue(nested, "id", "task_id", "status", "state") != "") {
			return nested
		}
	}
	return payload
}

func normalizeGeekNowTaskStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "completed", "succeeded", "success":
		return "succeeded"
	case "processing", "running", "in_progress":
		return "running"
	case "failed", "error", "expired":
		return "failed"
	case "cancelled", "canceled":
		return "cancelled"
	default:
		return "queued"
	}
}

func geekNowVideoURL(payload map[string]any) string {
	if value := aiTaskStringValue(payload, "video_url", "url", "file_url"); value != "" {
		return value
	}
	for _, key := range []string{"content", "output", "result", "data"} {
		if nested, ok := payload[key].(map[string]any); ok {
			if value := geekNowVideoURL(nested); value != "" {
				return value
			}
		}
	}
	for _, key := range []string{"file_infos", "files", "videos"} {
		if items, ok := payload[key].([]any); ok {
			for _, item := range items {
				if nested, ok := item.(map[string]any); ok {
					if value := geekNowVideoURL(nested); value != "" {
						return value
					}
				}
			}
		}
	}
	return ""
}

func geekNowTaskError(payload map[string]any) map[string]string {
	raw, ok := payload["error"]
	if !ok || raw == nil {
		return nil
	}
	result := map[string]string{}
	switch value := raw.(type) {
	case string:
		result["message"] = strings.TrimSpace(value)
	case map[string]any:
		result["code"] = aiTaskStringValue(value, "code", "error_code")
		result["message"] = aiTaskStringValue(value, "message", "msg", "detail")
	default:
		result["message"] = strings.TrimSpace(fmt.Sprint(value))
	}
	if result["message"] == "" {
		result["message"] = result["code"]
	}
	if result["message"] == "" {
		return nil
	}
	if result["code"] == "" {
		delete(result, "code")
	}
	return result
}
