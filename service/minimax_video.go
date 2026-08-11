package service

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
)

const miniMaxMaxRequestBytes = 64 * 1024 * 1024

type MiniMaxVideoEndpoints struct {
	BaseURL string
	Create  string
}

type miniMaxVideoContentItem struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL *struct {
		URL string `json:"url"`
	} `json:"image_url,omitempty"`
	VideoURL *struct {
		URL string `json:"url"`
	} `json:"video_url,omitempty"`
	AudioURL *struct {
		URL string `json:"url"`
	} `json:"audio_url,omitempty"`
	Role string `json:"role,omitempty"`
}

type miniMaxVideoCreateRequest struct {
	Model         string                    `json:"model"`
	Content       []miniMaxVideoContentItem `json:"content"`
	Resolution    string                    `json:"resolution"`
	Duration      int                       `json:"duration"`
	Ratio         string                    `json:"ratio"`
	AIGCWatermark bool                      `json:"aigc_watermark"`
}

func ResolveMiniMaxVideoEndpoints(baseURL string) (MiniMaxVideoEndpoints, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return MiniMaxVideoEndpoints{}, errors.New("MiniMax 接口地址无效")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	normalized := strings.TrimRight(parsed.String(), "/")
	return MiniMaxVideoEndpoints{BaseURL: normalized, Create: normalized + "/v2/video_generation"}, nil
}

func (endpoints MiniMaxVideoEndpoints) Query(taskID string) string {
	return endpoints.BaseURL + "/v2/query/video_generation/" + url.PathEscape(strings.TrimSpace(taskID))
}

func BuildMiniMaxVideoCreateRequest(body []byte, contentType string) ([]byte, string, error) {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "application/json") {
		return nil, "", errors.New("MiniMax H3 请求必须使用 JSON")
	}
	if len(body) > miniMaxMaxRequestBytes {
		return nil, "", errors.New("MiniMax H3 请求体超过 64 MB")
	}
	var payload miniMaxVideoCreateRequest
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", err
	}
	payload.Model = strings.TrimSpace(payload.Model)
	payload.Resolution = strings.TrimSpace(payload.Resolution)
	payload.Ratio = strings.TrimSpace(payload.Ratio)
	if err := validateMiniMaxVideoCreateRequest(&payload); err != nil {
		return nil, "", err
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, "", err
	}
	if len(encoded) > miniMaxMaxRequestBytes {
		return nil, "", errors.New("MiniMax H3 请求体超过 64 MB")
	}
	return encoded, "application/json", nil
}

func validateMiniMaxVideoCreateRequest(payload *miniMaxVideoCreateRequest) error {
	if payload.Model == "" {
		return errors.New("缺少模型名称")
	}
	if payload.Resolution != "768P" && payload.Resolution != "2K" {
		return errors.New("MiniMax H3 分辨率只支持 768P 或 2K")
	}
	if payload.Duration < 4 || payload.Duration > 15 {
		return errors.New("MiniMax H3 时长只支持 4 到 15 秒")
	}
	allowedRatios := map[string]bool{"adaptive": true, "21:9": true, "16:9": true, "4:3": true, "1:1": true, "3:4": true, "9:16": true}
	if !allowedRatios[payload.Ratio] {
		return errors.New("MiniMax H3 比例无效")
	}
	textCount, imageCount, videoCount, audioCount := 0, 0, 0, 0
	firstFrames, lastFrames := 0, 0
	hasFrame, hasReference := false, false
	for index := range payload.Content {
		item := &payload.Content[index]
		item.Type = strings.TrimSpace(item.Type)
		item.Role = strings.TrimSpace(item.Role)
		switch item.Type {
		case "text":
			item.Text = strings.TrimSpace(item.Text)
			if item.Text != "" {
				textCount++
			}
		case "image_url":
			imageCount++
			if item.ImageURL == nil || strings.TrimSpace(item.ImageURL.URL) == "" {
				return errors.New("MiniMax H3 图片缺少 URL")
			}
			item.ImageURL.URL = strings.TrimSpace(item.ImageURL.URL)
			if item.Role == "" {
				item.Role = "first_frame"
			}
			switch item.Role {
			case "first_frame":
				firstFrames++
				hasFrame = true
			case "last_frame":
				lastFrames++
				hasFrame = true
			case "reference_image":
				hasReference = true
			default:
				return errors.New("MiniMax H3 图片角色无效")
			}
		case "video_url":
			videoCount++
			hasReference = true
			if item.VideoURL == nil || strings.TrimSpace(item.VideoURL.URL) == "" || item.Role != "reference_video" {
				return errors.New("MiniMax H3 视频参考无效")
			}
			item.VideoURL.URL = strings.TrimSpace(item.VideoURL.URL)
		case "audio_url":
			audioCount++
			hasReference = true
			if item.AudioURL == nil || strings.TrimSpace(item.AudioURL.URL) == "" || item.Role != "reference_audio" {
				return errors.New("MiniMax H3 音频参考无效")
			}
			item.AudioURL.URL = strings.TrimSpace(item.AudioURL.URL)
		default:
			return errors.New("MiniMax H3 content 类型无效")
		}
	}
	if textCount == 0 {
		return errors.New("缺少视频提示词")
	}
	if firstFrames > 1 {
		return errors.New("MiniMax H3 首帧不能重复")
	}
	if lastFrames > 1 {
		return errors.New("MiniMax H3 尾帧不能重复")
	}
	if hasFrame && hasReference {
		return errors.New("MiniMax H3 首尾帧与全能参考不能混用")
	}
	if imageCount > 9 || videoCount > 3 || audioCount > 3 || imageCount+videoCount+audioCount > 12 {
		return errors.New("MiniMax H3 参考素材数量超限")
	}
	if hasFrame {
		payload.Ratio = "adaptive"
	} else if imageCount+videoCount+audioCount == 0 && payload.Ratio == "adaptive" {
		payload.Ratio = "16:9"
	}
	return nil
}

func NormalizeMiniMaxVideoCreateResponse(body []byte) ([]byte, error) {
	var response struct {
		TaskID arkFlexibleString `json:"task_id"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}
	id := response.TaskID.String()
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	return json.Marshal(map[string]any{"id": id, "status": "queued", "raw_status": "queued"})
}

func NormalizeMiniMaxVideoTaskResponse(body []byte) ([]byte, error) {
	var response struct {
		Task struct {
			ID        arkFlexibleString `json:"id"`
			Model     string            `json:"model"`
			Status    string            `json:"status"`
			CreatedAt int64             `json:"created_at"`
			UpdatedAt int64             `json:"updated_at"`
			Content   struct {
				URL string `json:"url"`
			} `json:"content"`
			Error struct {
				Code    arkFlexibleString `json:"code"`
				Message string            `json:"message"`
			} `json:"error"`
			Resolution string `json:"resolution"`
			Duration   int    `json:"duration"`
			Ratio      string `json:"ratio"`
		} `json:"task"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}
	task := response.Task
	id := task.ID.String()
	if id == "" {
		return nil, errors.New("视频任务没有返回任务 ID")
	}
	rawStatus := strings.TrimSpace(task.Status)
	payload := map[string]any{"id": id, "status": normalizeMiniMaxVideoStatus(rawStatus), "raw_status": rawStatus}
	if task.Model != "" {
		payload["model"] = task.Model
	}
	if task.CreatedAt > 0 {
		payload["created_at"] = task.CreatedAt
	}
	if task.UpdatedAt > 0 {
		payload["updated_at"] = task.UpdatedAt
	}
	if task.Content.URL != "" {
		payload["video_url"] = task.Content.URL
	}
	if task.Resolution != "" {
		payload["resolution"] = task.Resolution
	}
	if task.Duration > 0 {
		payload["duration"] = task.Duration
	}
	if task.Ratio != "" {
		payload["ratio"] = task.Ratio
	}
	if code := task.Error.Code.String(); code != "" || task.Error.Message != "" {
		payload["error"] = map[string]string{"code": code, "message": task.Error.Message}
	}
	return json.Marshal(payload)
}

func normalizeMiniMaxVideoStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "running":
		return "running"
	case "succeeded":
		return "succeeded"
	case "failed":
		return "failed"
	case "cancelled", "canceled":
		return "cancelled"
	default:
		return "queued"
	}
}

func MiniMaxTaskVideoURL(body []byte) string {
	normalized, err := NormalizeMiniMaxVideoTaskResponse(body)
	if err != nil {
		return ""
	}
	var payload struct {
		VideoURL string `json:"video_url"`
	}
	_ = json.Unmarshal(normalized, &payload)
	return payload.VideoURL
}
