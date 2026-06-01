package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/volcengine/volcengine-go-sdk/volcengine"
	"github.com/volcengine/volcengine-go-sdk/volcengine/credentials"
	"github.com/volcengine/volcengine-go-sdk/volcengine/session"
	"github.com/volcengine/volcengine-go-sdk/volcengine/universal"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const maxVolcengineAssetImageBytes = 30 * 1024 * 1024

var errVolcengineEmptyResponse = errors.New("empty response")

type VolcengineAssetSubmission struct {
	AssetID     string `json:"assetId"`
	GroupID     string `json:"groupId"`
	ProjectName string `json:"projectName"`
	Status      string `json:"status"`
	PublicURL   string `json:"publicUrl"`
	SubmittedAt string `json:"submittedAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type VolcengineAssetStatus struct {
	AssetID     string `json:"assetId"`
	GroupID     string `json:"groupId"`
	ProjectName string `json:"projectName"`
	Status      string `json:"status"`
	PublicURL   string `json:"publicUrl"`
	AssetType   string `json:"assetType"`
	UpdatedAt   string `json:"updatedAt"`
}

type volcengineImageFile struct {
	Bytes     []byte
	Ext       string
	MimeType  string
	Width     int
	Height    int
	PublicURL string
}

type volcengineAssetClient interface {
	CreateAssetGroup(context.Context, model.VolcengineAssetSetting, string, string) (string, error)
	CreateAsset(context.Context, model.VolcengineAssetSetting, string, string, string) (string, error)
	GetAsset(context.Context, model.VolcengineAssetSetting, string, string) (VolcengineAssetStatus, error)
}

var activeVolcengineAssetClient volcengineAssetClient = realVolcengineAssetClient{}

type realVolcengineAssetClient struct{}

func SubmitVolcengineImageAsset(ctx context.Context, file multipart.File, header *multipart.FileHeader, assetTitle string, groupID string, groupName string) (VolcengineAssetSubmission, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	imageFile, err := validateVolcengineImage(file, header)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	imageFile, err = saveVolcenginePublicImage(setting, imageFile)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}

	assetTitle = strings.TrimSpace(assetTitle)
	groupID = strings.TrimSpace(groupID)
	groupName = strings.TrimSpace(groupName)
	if groupID == "" {
		if groupName == "" {
			groupName = firstNonEmpty(assetTitle, "我的素材")
		}
		groupID, err = activeVolcengineAssetClient.CreateAssetGroup(ctx, setting, groupName, "我的素材人像素材审核")
		if err != nil {
			return VolcengineAssetSubmission{}, err
		}
		groupID = strings.TrimSpace(groupID)
		if groupID == "" {
			return VolcengineAssetSubmission{}, safeMessageError{message: "火山接口没有返回素材组 ID"}
		}
	}

	assetID, err := activeVolcengineAssetClient.CreateAsset(ctx, setting, groupID, imageFile.PublicURL, assetTitle)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	assetID = strings.TrimSpace(assetID)
	if assetID == "" {
		return VolcengineAssetSubmission{}, safeMessageError{message: "火山接口没有返回素材 ID"}
	}
	timestamp := now()
	return VolcengineAssetSubmission{
		AssetID:     assetID,
		GroupID:     groupID,
		ProjectName: setting.ProjectName,
		Status:      "Processing",
		PublicURL:   imageFile.PublicURL,
		SubmittedAt: timestamp,
		UpdatedAt:   timestamp,
	}, nil
}

func GetVolcengineAssetStatus(ctx context.Context, assetID string, projectName string) (VolcengineAssetStatus, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetStatus{}, err
	}
	assetID = strings.TrimSpace(assetID)
	if assetID == "" {
		return VolcengineAssetStatus{}, safeMessageError{message: "缺少火山素材 ID"}
	}
	projectName = strings.TrimSpace(projectName)
	if projectName == "" {
		projectName = setting.ProjectName
	}
	status, err := activeVolcengineAssetClient.GetAsset(ctx, setting, assetID, projectName)
	if err != nil {
		return VolcengineAssetStatus{}, err
	}
	if status.AssetID == "" {
		status.AssetID = assetID
	}
	if status.ProjectName == "" {
		status.ProjectName = projectName
	}
	if status.UpdatedAt == "" {
		status.UpdatedAt = now()
	}
	return status, nil
}

func currentVolcengineAssetSetting() (model.VolcengineAssetSetting, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.VolcengineAssetSetting{}, err
	}
	setting := normalizeSettings(settings).Private.VolcengineAsset
	if !setting.Enabled {
		return model.VolcengineAssetSetting{}, safeMessageError{message: "火山素材审核未启用"}
	}
	if setting.AccessKey == "" || setting.SecretKey == "" {
		return model.VolcengineAssetSetting{}, safeMessageError{message: "请先配置火山 AK/SK"}
	}
	if setting.PublicAssetBaseURL == "" {
		return model.VolcengineAssetSetting{}, safeMessageError{message: "请先配置公网素材访问地址"}
	}
	return setting, nil
}

func (realVolcengineAssetClient) CreateAssetGroup(ctx context.Context, setting model.VolcengineAssetSetting, name string, description string) (string, error) {
	data, err := callVolcengineUniversal(ctx, setting, "CreateAssetGroup", map[string]interface{}{
		"Name":        strings.TrimSpace(name),
		"Description": strings.TrimSpace(description),
		"ProjectName": setting.ProjectName,
	})
	if err != nil {
		return "", err
	}
	return firstNonEmpty(
		stringFromMap(data, "Id"),
		stringFromMap(data, "ID"),
		stringFromMap(data, "GroupId"),
		stringFromMap(data, "GroupID"),
		stringFromMap(data, "AssetGroupId"),
		stringFromMap(data, "AssetGroupID"),
	), nil
}

func (realVolcengineAssetClient) CreateAsset(ctx context.Context, setting model.VolcengineAssetSetting, groupID string, publicURL string, name string) (string, error) {
	payload := map[string]interface{}{
		"GroupId":     strings.TrimSpace(groupID),
		"URL":         strings.TrimSpace(publicURL),
		"AssetType":   "Image",
		"ProjectName": setting.ProjectName,
	}
	if strings.TrimSpace(name) != "" {
		payload["Name"] = strings.TrimSpace(name)
	}
	data, err := callVolcengineUniversal(ctx, setting, "CreateAsset", payload)
	if err != nil {
		return "", err
	}
	return firstNonEmpty(
		stringFromMap(data, "Id"),
		stringFromMap(data, "ID"),
		stringFromMap(data, "AssetId"),
		stringFromMap(data, "AssetID"),
	), nil
}

func (realVolcengineAssetClient) GetAsset(ctx context.Context, setting model.VolcengineAssetSetting, assetID string, projectName string) (VolcengineAssetStatus, error) {
	data, err := callVolcengineUniversal(ctx, setting, "GetAsset", map[string]interface{}{
		"Id":          strings.TrimSpace(assetID),
		"ProjectName": strings.TrimSpace(projectName),
	})
	if err != nil {
		return VolcengineAssetStatus{}, err
	}
	updatedAt := stringFromMap(data, "UpdateTime")
	if updatedAt == "" {
		updatedAt = now()
	}
	return VolcengineAssetStatus{
		AssetID:     firstNonEmpty(stringFromMap(data, "Id"), stringFromMap(data, "ID"), assetID),
		GroupID:     firstNonEmpty(stringFromMap(data, "GroupId"), stringFromMap(data, "GroupID")),
		ProjectName: firstNonEmpty(stringFromMap(data, "ProjectName"), projectName, setting.ProjectName),
		Status:      stringFromMap(data, "Status"),
		PublicURL:   firstNonEmpty(stringFromMap(data, "URL"), stringFromMap(data, "Url")),
		AssetType:   stringFromMap(data, "AssetType"),
		UpdatedAt:   updatedAt,
	}, nil
}

func callVolcengineUniversal(ctx context.Context, setting model.VolcengineAssetSetting, action string, payload map[string]interface{}) (map[string]interface{}, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	cfg := volcengine.NewConfig().
		WithCredentials(credentials.NewStaticCredentials(setting.AccessKey, setting.SecretKey, "")).
		WithRegion(setting.Region).
		WithHTTPClient(&http.Client{Timeout: 30 * time.Second})
	sess, err := session.NewSession(cfg)
	if err != nil {
		return nil, err
	}
	client := universal.New(sess)
	output, err := client.DoCall(universal.RequestUniversal{
		ServiceName: "ark",
		Action:      action,
		Version:     "2024-01-01",
		HttpMethod:  universal.POST,
		ContentType: universal.ApplicationJSON,
	}, &payload)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return normalizeVolcengineResponse(action, output)
}

func normalizeVolcengineResponse(action string, response interface{}) (map[string]interface{}, error) {
	body, err := json.Marshal(response)
	if err != nil {
		return nil, fmt.Errorf("volcengine %s returned unmarshalable response: %w", action, err)
	}
	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("volcengine %s returned invalid response: %w", action, err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("volcengine %s returned %w", action, errVolcengineEmptyResponse)
	}
	return unwrapVolcengineResponseMap(data), nil
}

func unwrapVolcengineResponseMap(data map[string]interface{}) map[string]interface{} {
	for {
		next, ok := nestedVolcengineResponseMap(data)
		if !ok {
			return data
		}
		data = next
	}
}

func nestedVolcengineResponseMap(data map[string]interface{}) (map[string]interface{}, bool) {
	for _, key := range []string{"Result", "Data", "Asset", "AssetGroup"} {
		if result, ok := mapValue(data, key); ok {
			return result, true
		}
	}
	return nil, false
}

func mapValue(data map[string]interface{}, key string) (map[string]interface{}, bool) {
	value, ok := data[key]
	if !ok || value == nil {
		return nil, false
	}
	result, ok := value.(map[string]interface{})
	return result, ok
}

func validateVolcengineImage(file multipart.File, header *multipart.FileHeader) (volcengineImageFile, error) {
	data, err := io.ReadAll(io.LimitReader(file, maxVolcengineAssetImageBytes+1))
	if err != nil {
		return volcengineImageFile{}, err
	}
	if len(data) == 0 {
		return volcengineImageFile{}, safeMessageError{message: "图片文件不能为空"}
	}
	if len(data) > maxVolcengineAssetImageBytes {
		return volcengineImageFile{}, safeMessageError{message: "图片大小需小于 30 MB"}
	}
	mimeType := http.DetectContentType(data)
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return volcengineImageFile{}, safeMessageError{message: "无法读取图片尺寸，请使用 jpeg、png、webp、bmp、tiff 或 gif"}
	}
	ext := normalizeImageFormat(format)
	if ext == "" {
		return volcengineImageFile{}, safeMessageError{message: "图片格式需为 jpeg、png、webp、bmp、tiff 或 gif"}
	}
	if cfg.Width <= 300 || cfg.Width >= 6000 || cfg.Height <= 300 || cfg.Height >= 6000 {
		return volcengineImageFile{}, safeMessageError{message: "图片宽高需大于 300px 且小于 6000px"}
	}
	ratio := float64(cfg.Width) / float64(cfg.Height)
	if ratio <= 0.4 || ratio >= 2.5 {
		return volcengineImageFile{}, safeMessageError{message: "图片宽高比需在 0.4 到 2.5 之间"}
	}
	return volcengineImageFile{Bytes: data, Ext: ext, MimeType: mimeType, Width: cfg.Width, Height: cfg.Height}, nil
}

func normalizeImageFormat(format string) string {
	ext := strings.ToLower(format)
	switch ext {
	case "jpg":
		return "jpeg"
	case "tif":
		return "tiff"
	case "jpeg", "png", "webp", "bmp", "tiff", "gif":
		return ext
	default:
		return ""
	}
}

func saveVolcenginePublicImage(setting model.VolcengineAssetSetting, imageFile volcengineImageFile) (volcengineImageFile, error) {
	id, err := randomHexID()
	if err != nil {
		return imageFile, err
	}
	dir := filepath.Join(config.Cfg.PublicAssetDir, "images")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return imageFile, err
	}
	filename := id + "." + imageFile.Ext
	if err := os.WriteFile(filepath.Join(dir, filename), imageFile.Bytes, 0644); err != nil {
		return imageFile, err
	}
	imageFile.PublicURL = strings.TrimRight(setting.PublicAssetBaseURL, "/") + "/images/" + filename
	return imageFile, nil
}

func randomHexID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func stringFromMap(data map[string]interface{}, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return strings.TrimSpace(v.String())
	case float64:
		return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%f", v), "0"), ".")
	case bool:
		return fmt.Sprintf("%t", v)
	default:
		return ""
	}
}
