package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
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
	Error       string `json:"error,omitempty"`
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

type volcengineImageConfig struct {
	Ext    string
	Width  int
	Height int
}

type volcengineAssetClient interface {
	CreateAssetGroup(context.Context, model.VolcengineAssetSetting, string, string) (string, error)
	CreateAsset(context.Context, model.VolcengineAssetSetting, string, string, string) (string, error)
	GetAsset(context.Context, model.VolcengineAssetSetting, string, string) (VolcengineAssetStatus, error)
}

type volcengineObjectUploader interface {
	UploadObject(context.Context, model.VolcengineAssetSetting, string, []byte, string) error
}

type volcengineTOSTarget struct {
	Endpoint string
	Region   string
	Bucket   string
	Key      string
}

var activeVolcengineAssetClient volcengineAssetClient = realVolcengineAssetClient{}
var activeVolcengineObjectUploader volcengineObjectUploader = realVolcengineObjectUploader{}

type realVolcengineAssetClient struct{}
type realVolcengineObjectUploader struct{}

func SubmitVolcengineImageAsset(ctx context.Context, file multipart.File, header *multipart.FileHeader, assetTitle string, groupID string, groupName string) (VolcengineAssetSubmission, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	imageFile, err := validateVolcengineImage(file, header)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	imageFile, err = saveVolcenginePublicImage(ctx, setting, imageFile)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}

	assetTitle = strings.TrimSpace(assetTitle)
	groupID = firstNonEmpty(strings.TrimSpace(groupID), setting.AssetGroupID)
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

func SubmitVolcengineImageAssetURL(ctx context.Context, rawURL string, assetTitle string, groupID string, groupName string) (VolcengineAssetSubmission, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	publicURL, err := resolveVolcengineAssetURL(ctx, setting, rawURL)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}

	assetTitle = strings.TrimSpace(assetTitle)
	groupID = firstNonEmpty(strings.TrimSpace(groupID), setting.AssetGroupID)
	groupName = strings.TrimSpace(groupName)
	if groupID == "" {
		if groupName == "" {
			groupName = firstNonEmpty(assetTitle, "素材管理")
		}
		groupID, err = activeVolcengineAssetClient.CreateAssetGroup(ctx, setting, groupName, "素材管理人像素材审核")
		if err != nil {
			return VolcengineAssetSubmission{}, err
		}
		groupID = strings.TrimSpace(groupID)
		if groupID == "" {
			return VolcengineAssetSubmission{}, safeMessageError{message: "火山接口没有返回素材组 ID"}
		}
	}

	assetID, err := activeVolcengineAssetClient.CreateAsset(ctx, setting, groupID, publicURL, assetTitle)
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
		PublicURL:   publicURL,
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

func SubmitAdminAssetVolcengineReview(ctx context.Context, assetID string) (model.Asset, error) {
	asset, err := repository.GetAsset(strings.TrimSpace(assetID))
	if err != nil {
		return model.Asset{}, err
	}
	if asset.Type != model.AssetTypeImage {
		return model.Asset{}, safeMessageError{message: "只有图片素材可以提交加白"}
	}
	submission, err := SubmitVolcengineImageAssetURL(ctx, firstNonEmpty(asset.URL, asset.CoverURL), asset.Title, asset.VolcengineGroupID, asset.Title)
	if err != nil {
		return model.Asset{}, err
	}
	asset.VolcengineAssetID = submission.AssetID
	asset.VolcengineGroupID = submission.GroupID
	asset.VolcengineProjectName = submission.ProjectName
	asset.VolcengineStatus = submission.Status
	asset.VolcengineError = ""
	asset.VolcenginePublicURL = submission.PublicURL
	asset.VolcengineSubmittedAt = submission.SubmittedAt
	asset.VolcengineUpdatedAt = submission.UpdatedAt
	return repository.SaveAsset(asset)
}

func RefreshAdminAssetVolcengineReview(ctx context.Context, assetID string) (model.Asset, error) {
	asset, err := repository.GetAsset(strings.TrimSpace(assetID))
	if err != nil {
		return model.Asset{}, err
	}
	if asset.VolcengineAssetID == "" {
		return model.Asset{}, safeMessageError{message: "素材尚未提交火山加白"}
	}
	status, err := GetVolcengineAssetStatus(ctx, asset.VolcengineAssetID, asset.VolcengineProjectName)
	if err != nil {
		return model.Asset{}, err
	}
	asset.VolcengineAssetID = firstNonEmpty(status.AssetID, asset.VolcengineAssetID)
	asset.VolcengineGroupID = firstNonEmpty(status.GroupID, asset.VolcengineGroupID)
	asset.VolcengineProjectName = firstNonEmpty(status.ProjectName, asset.VolcengineProjectName)
	asset.VolcengineStatus = firstNonEmpty(status.Status, asset.VolcengineStatus)
	asset.VolcengineError = status.Error
	asset.VolcenginePublicURL = firstNonEmpty(status.PublicURL, asset.VolcenginePublicURL)
	asset.VolcengineUpdatedAt = firstNonEmpty(status.UpdatedAt, now())
	return repository.SaveAsset(asset)
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
	if setting.PublicAssetBaseURL != "" {
		if err := validateVolcenginePublicAssetBaseURL(setting.PublicAssetBaseURL); err != nil {
			return model.VolcengineAssetSetting{}, err
		}
	}
	return setting, nil
}

func (realVolcengineAssetClient) CreateAssetGroup(ctx context.Context, setting model.VolcengineAssetSetting, name string, description string) (string, error) {
	data, err := callVolcengineUniversal(ctx, setting, "CreateAssetGroup", map[string]interface{}{
		"Name":        strings.TrimSpace(name),
		"Description": strings.TrimSpace(description),
		"GroupType":   "AIGC",
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
	return volcengineAssetStatusFromMap(setting, assetID, projectName, data), nil
}

func (realVolcengineObjectUploader) UploadObject(ctx context.Context, setting model.VolcengineAssetSetting, publicURL string, data []byte, contentType string) error {
	target, ok, err := volcengineTOSTargetFromPublicURL(publicURL)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	client, err := tos.NewClientV2(
		target.Endpoint,
		tos.WithRegion(firstNonEmpty(target.Region, setting.Region)),
		tos.WithCredentials(tos.NewStaticCredentials(setting.AccessKey, setting.SecretKey)),
		tos.WithMaxRetryCount(3),
	)
	if err != nil {
		return safeMessageError{message: fmt.Sprintf("初始化火山 TOS 客户端失败：%s", err.Error())}
	}
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	_, err = client.PutObjectV2(ctx, &tos.PutObjectV2Input{
		PutObjectBasicInput: tos.PutObjectBasicInput{
			Bucket:        target.Bucket,
			Key:           target.Key,
			ContentType:   contentType,
			ContentLength: int64(len(data)),
		},
		Content: bytes.NewReader(data),
	})
	if err != nil {
		return safeMessageError{message: fmt.Sprintf("上传图片到火山 TOS 失败：%s", err.Error())}
	}
	return nil
}

func volcengineAssetStatusFromMap(setting model.VolcengineAssetSetting, assetID string, projectName string, data map[string]interface{}) VolcengineAssetStatus {
	updatedAt := stringFromMap(data, "UpdateTime")
	if updatedAt == "" {
		updatedAt = now()
	}
	return VolcengineAssetStatus{
		AssetID:     firstNonEmpty(stringFromMap(data, "Id"), stringFromMap(data, "ID"), assetID),
		GroupID:     firstNonEmpty(stringFromMap(data, "GroupId"), stringFromMap(data, "GroupID")),
		ProjectName: firstNonEmpty(stringFromMap(data, "ProjectName"), projectName, setting.ProjectName),
		Status:      stringFromMap(data, "Status"),
		Error:       stringFromMap(data, "Error"),
		PublicURL:   firstNonEmpty(stringFromMap(data, "URL"), stringFromMap(data, "Url")),
		AssetType:   stringFromMap(data, "AssetType"),
		UpdatedAt:   updatedAt,
	}
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
		return nil, safeMessageError{message: fmt.Sprintf("火山 %s 失败：%s", action, err.Error())}
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
	if err := volcengineResponseError(action, data); err != nil {
		return nil, err
	}
	return unwrapVolcengineResponseMap(data), nil
}

func volcengineResponseError(action string, data map[string]interface{}) error {
	for _, root := range []map[string]interface{}{data, mapFromMap(data, "ResponseMetadata")} {
		if root == nil {
			continue
		}
		errorData, ok := mapValue(root, "Error")
		if !ok {
			continue
		}
		message := firstNonEmpty(
			stringFromMap(errorData, "Message"),
			stringFromMap(errorData, "MessageCn"),
			stringFromMap(errorData, "Code"),
		)
		if message == "" {
			message = "请检查 AK/SK、IAM 权限、ProjectName 和素材公网 URL"
		}
		return safeMessageError{message: fmt.Sprintf("火山 %s 失败：%s", action, message)}
	}
	return nil
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

func mapFromMap(data map[string]interface{}, key string) map[string]interface{} {
	result, _ := mapValue(data, key)
	return result
}

func validateVolcenginePublicAssetBaseURL(rawURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		return safeMessageError{message: "公网素材访问地址必须以 http:// 或 https:// 开头"}
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return safeMessageError{message: "公网素材访问地址必须以 http:// 或 https:// 开头"}
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return safeMessageError{message: "公网素材访问地址必须是火山可访问的公网地址，不能使用 localhost 或内网地址"}
	}
	if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()) {
		return safeMessageError{message: "公网素材访问地址必须是火山可访问的公网地址，不能使用 localhost 或内网地址"}
	}
	return nil
}

func resolveVolcengineAssetURL(ctx context.Context, setting model.VolcengineAssetSetting, rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", safeMessageError{message: "图片素材缺少 URL"}
	}
	if strings.HasPrefix(rawURL, "http://") || strings.HasPrefix(rawURL, "https://") {
		if err := validateVolcenginePublicAssetBaseURL(rawURL); err != nil {
			return "", err
		}
		return rawURL, nil
	}
	if setting.PublicAssetBaseURL == "" {
		return "", safeMessageError{message: "请先配置公网素材访问地址"}
	}
	relativePath, ok := uploadedAssetRelativePath(rawURL)
	if !ok {
		return "", safeMessageError{message: "图片素材 URL 需要是公网地址或 /uploaded-assets 上传路径"}
	}
	publicURL := volcenginePublicAssetURL(setting, relativePath)
	if err := uploadLocalVolcengineAssetToTOS(ctx, setting, publicURL, relativePath); err != nil {
		return "", err
	}
	return publicURL, nil
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
		heifConfig, ok := parseHEIFImageConfig(data, header.Filename)
		if !ok {
			return volcengineImageFile{}, safeMessageError{message: "无法读取图片尺寸，请使用 jpeg、png、webp、bmp、tiff、gif、heic 或 heif"}
		}
		cfg.Width = heifConfig.Width
		cfg.Height = heifConfig.Height
		format = heifConfig.Ext
	}
	ext := normalizeImageFormat(format)
	if ext == "" {
		return volcengineImageFile{}, safeMessageError{message: "图片格式需为 jpeg、png、webp、bmp、tiff、gif、heic 或 heif"}
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
	case "jpeg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif":
		return ext
	default:
		return ""
	}
}

func parseHEIFImageConfig(data []byte, filename string) (volcengineImageConfig, bool) {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), ".")
	if ext != "heic" && ext != "heif" {
		ext = ""
	}
	if detectedExt, ok := heifBrandExt(data); ok {
		if ext == "" {
			ext = detectedExt
		}
	} else if ext == "" {
		return volcengineImageConfig{}, false
	}
	width, height, ok := findHEIFSpatialExtents(data, 0, len(data), 0)
	if !ok {
		return volcengineImageConfig{}, false
	}
	return volcengineImageConfig{Ext: ext, Width: width, Height: height}, true
}

func heifBrandExt(data []byte) (string, bool) {
	if len(data) < 16 || string(data[4:8]) != "ftyp" {
		return "", false
	}
	size := int(binary.BigEndian.Uint32(data[:4]))
	if size == 0 || size > len(data) {
		size = len(data)
	}
	if size < 16 {
		return "", false
	}
	for offset := 8; offset+4 <= size; offset += 4 {
		switch string(data[offset : offset+4]) {
		case "heic", "heix", "hevc", "hevx":
			return "heic", true
		case "heif", "mif1", "msf1":
			return "heif", true
		}
	}
	return "", false
}

func findHEIFSpatialExtents(data []byte, start int, end int, depth int) (int, int, bool) {
	if depth > 8 || start < 0 || end > len(data) || start >= end {
		return 0, 0, false
	}
	for offset := start; offset+8 <= end; {
		size, headerSize, ok := isoBoxSize(data, offset, end)
		if !ok {
			return 0, 0, false
		}
		boxEnd := offset + size
		boxType := string(data[offset+4 : offset+8])
		payloadStart := offset + headerSize
		if boxType == "ispe" {
			if payloadStart+12 <= boxEnd {
				width := int(binary.BigEndian.Uint32(data[payloadStart+4 : payloadStart+8]))
				height := int(binary.BigEndian.Uint32(data[payloadStart+8 : payloadStart+12]))
				return width, height, width > 0 && height > 0
			}
			return 0, 0, false
		}
		if boxType == "meta" {
			payloadStart += 4
		}
		if boxType == "meta" || boxType == "iprp" || boxType == "ipco" {
			if width, height, ok := findHEIFSpatialExtents(data, payloadStart, boxEnd, depth+1); ok {
				return width, height, true
			}
		}
		offset = boxEnd
	}
	return 0, 0, false
}

func isoBoxSize(data []byte, offset int, end int) (int, int, bool) {
	size := int(binary.BigEndian.Uint32(data[offset : offset+4]))
	headerSize := 8
	if size == 1 {
		if offset+16 > end {
			return 0, 0, false
		}
		largeSize := binary.BigEndian.Uint64(data[offset+8 : offset+16])
		if largeSize > uint64(end-offset) {
			return 0, 0, false
		}
		size = int(largeSize)
		headerSize = 16
	} else if size == 0 {
		size = end - offset
	}
	if size < headerSize || offset+size > end {
		return 0, 0, false
	}
	return size, headerSize, true
}

func saveVolcenginePublicImage(ctx context.Context, setting model.VolcengineAssetSetting, imageFile volcengineImageFile) (volcengineImageFile, error) {
	if setting.PublicAssetBaseURL == "" {
		return imageFile, safeMessageError{message: "请先配置公网素材访问地址"}
	}
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
	imageFile.PublicURL = volcenginePublicAssetURL(setting, "images/"+filename)
	if err := activeVolcengineObjectUploader.UploadObject(ctx, setting, imageFile.PublicURL, imageFile.Bytes, imageFile.MimeType); err != nil {
		return imageFile, err
	}
	return imageFile, nil
}

func volcenginePublicAssetURL(setting model.VolcengineAssetSetting, relativePath string) string {
	return strings.TrimRight(setting.PublicAssetBaseURL, "/") + "/" + strings.TrimLeft(relativePath, "/")
}

func uploadedAssetRelativePath(rawURL string) (string, bool) {
	rawURL = strings.TrimSpace(rawURL)
	parsed, err := url.Parse(rawURL)
	if err == nil && parsed.Path != "" {
		rawURL = parsed.Path
	}
	original := rawURL
	rawURL = strings.TrimPrefix(rawURL, "/api/uploaded-assets")
	rawURL = strings.TrimPrefix(rawURL, "/uploaded-assets")
	if rawURL == original {
		return "", false
	}
	parts := strings.Split(strings.Trim(rawURL, "/"), "/")
	for _, part := range parts {
		if part == "" || part == ".." {
			return "", false
		}
	}
	relativePath := strings.TrimPrefix(path.Clean("/"+strings.TrimLeft(rawURL, "/")), "/")
	if relativePath == "" || strings.HasPrefix(relativePath, "../") {
		return "", false
	}
	return relativePath, true
}

func uploadLocalVolcengineAssetToTOS(ctx context.Context, setting model.VolcengineAssetSetting, publicURL string, relativePath string) error {
	if _, ok, err := volcengineTOSTargetFromPublicURL(publicURL); err != nil {
		return err
	} else if !ok {
		return nil
	}
	localPath := filepath.Join(config.Cfg.PublicAssetDir, filepath.FromSlash(relativePath))
	data, err := os.ReadFile(localPath)
	if err != nil {
		return safeMessageError{message: fmt.Sprintf("读取本地素材文件失败：%s", err.Error())}
	}
	contentType := mime.TypeByExtension(filepath.Ext(localPath))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	return activeVolcengineObjectUploader.UploadObject(ctx, setting, publicURL, data, contentType)
}

func volcengineTOSTargetFromPublicURL(rawURL string) (volcengineTOSTarget, bool, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		return volcengineTOSTarget{}, false, nil
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return volcengineTOSTarget{}, false, nil
	}
	host := strings.ToLower(parsed.Hostname())
	markerIndex := strings.Index(host, ".tos-")
	if markerIndex <= 0 {
		return volcengineTOSTarget{}, false, nil
	}
	endpointHost := host[markerIndex+1:]
	endpointService := strings.SplitN(endpointHost, ".", 2)[0]
	if !strings.HasPrefix(endpointService, "tos-") {
		return volcengineTOSTarget{}, false, nil
	}
	key := strings.TrimPrefix(parsed.Path, "/")
	if key == "" {
		return volcengineTOSTarget{}, true, safeMessageError{message: "火山 TOS 公网素材地址缺少对象路径"}
	}
	return volcengineTOSTarget{
		Endpoint: parsed.Scheme + "://" + endpointHost,
		Region:   strings.TrimPrefix(endpointService, "tos-"),
		Bucket:   host[:markerIndex],
		Key:      key,
	}, true, nil
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
