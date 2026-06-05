package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/volcengine/volcengine-go-sdk/volcengine"
	"github.com/volcengine/volcengine-go-sdk/volcengine/credentials"
	"github.com/volcengine/volcengine-go-sdk/volcengine/session"
	"github.com/volcengine/volcengine-go-sdk/volcengine/universal"
)

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

type volcengineAssetClient interface {
	CreateAssetGroup(context.Context, model.VolcengineAssetSetting, string, string) (string, error)
	CreateAsset(context.Context, model.VolcengineAssetSetting, string, string, string, string) (string, error)
	GetAsset(context.Context, model.VolcengineAssetSetting, string, string) (VolcengineAssetStatus, error)
}

type volcengineObjectUploader interface {
	UploadObject(context.Context, model.VolcengineAssetSetting, string, []byte, string) error
}

var activeVolcengineAssetClient volcengineAssetClient = realVolcengineAssetClient{}
var activeVolcengineObjectUploader volcengineObjectUploader = realVolcengineObjectUploader{}

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
	imageFile, err = saveVolcenginePublicImage(ctx, setting, imageFile)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	return submitVolcenginePublicAsset(ctx, setting, imageFile.PublicURL, assetTitle, groupID, groupName, "我的素材", "我的素材人像素材审核", "Image")
}

func SubmitVolcengineMediaAsset(ctx context.Context, file multipart.File, header *multipart.FileHeader, assetTitle string, groupID string, groupName string) (VolcengineAssetSubmission, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	mediaFile, err := validateVolcengineMedia(file, header)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	mediaFile, err = saveVolcenginePublicMedia(ctx, setting, mediaFile)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	return submitVolcenginePublicAsset(ctx, setting, mediaFile.PublicURL, assetTitle, groupID, groupName, "我的素材", "我的素材人像素材审核", mediaFile.AssetType)
}

func submitVolcenginePublicAsset(ctx context.Context, setting model.VolcengineAssetSetting, publicURL string, assetTitle string, groupID string, groupName string, defaultGroupName string, description string, assetType string) (VolcengineAssetSubmission, error) {

	assetTitle = strings.TrimSpace(assetTitle)
	groupID = firstNonEmpty(strings.TrimSpace(groupID), setting.AssetGroupID)
	groupName = strings.TrimSpace(groupName)
	if groupID == "" {
		if groupName == "" {
			groupName = firstNonEmpty(assetTitle, defaultGroupName)
		}
		createdGroupID, err := activeVolcengineAssetClient.CreateAssetGroup(ctx, setting, groupName, description)
		if err != nil {
			return VolcengineAssetSubmission{}, err
		}
		groupID = strings.TrimSpace(createdGroupID)
		if groupID == "" {
			return VolcengineAssetSubmission{}, safeMessageError{message: "火山接口没有返回素材组 ID"}
		}
	}

	assetID, err := activeVolcengineAssetClient.CreateAsset(ctx, setting, groupID, publicURL, assetTitle, assetType)
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

func SubmitVolcengineImageAssetURL(ctx context.Context, rawURL string, assetTitle string, groupID string, groupName string) (VolcengineAssetSubmission, error) {
	return SubmitVolcengineMediaAssetURL(ctx, rawURL, assetTitle, groupID, groupName, model.AssetTypeImage)
}

func SubmitVolcengineMediaAssetURL(ctx context.Context, rawURL string, assetTitle string, groupID string, groupName string, mediaType model.AssetType) (VolcengineAssetSubmission, error) {
	setting, err := currentVolcengineAssetSetting()
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	publicURL, err := resolveVolcengineAssetURL(ctx, setting, rawURL)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	return submitVolcenginePublicAsset(ctx, setting, publicURL, assetTitle, groupID, groupName, "素材管理", "素材管理人像素材审核", volcengineCreateAssetType(mediaType))
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
	if asset.Type != model.AssetTypeImage && asset.Type != model.AssetTypeVideo {
		return model.Asset{}, safeMessageError{message: "只有图片或视频素材可以提交加白"}
	}
	submission, err := SubmitVolcengineMediaAssetURL(ctx, firstNonEmpty(asset.URL, asset.CoverURL), asset.Title, asset.VolcengineGroupID, asset.Title, asset.Type)
	if err != nil {
		return model.Asset{}, err
	}
	return repository.SaveAsset(assetWithVolcengineSubmission(asset, submission))
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
	return repository.SaveAsset(assetWithVolcengineStatus(asset, status))
}

func assetWithVolcengineSubmission(asset model.Asset, submission VolcengineAssetSubmission) model.Asset {
	asset.VolcengineAssetID = submission.AssetID
	asset.VolcengineGroupID = submission.GroupID
	asset.VolcengineProjectName = submission.ProjectName
	asset.VolcengineStatus = submission.Status
	asset.VolcengineError = ""
	asset.VolcenginePublicURL = submission.PublicURL
	asset.VolcengineSubmittedAt = submission.SubmittedAt
	asset.VolcengineUpdatedAt = submission.UpdatedAt
	return asset
}

func assetWithVolcengineStatus(asset model.Asset, status VolcengineAssetStatus) model.Asset {
	asset.VolcengineAssetID = firstNonEmpty(status.AssetID, asset.VolcengineAssetID)
	asset.VolcengineGroupID = firstNonEmpty(status.GroupID, asset.VolcengineGroupID)
	asset.VolcengineProjectName = firstNonEmpty(status.ProjectName, asset.VolcengineProjectName)
	asset.VolcengineStatus = firstNonEmpty(status.Status, asset.VolcengineStatus)
	asset.VolcengineError = status.Error
	asset.VolcenginePublicURL = firstNonEmpty(status.PublicURL, asset.VolcenginePublicURL)
	asset.VolcengineUpdatedAt = firstNonEmpty(status.UpdatedAt, now())
	return asset
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

func (realVolcengineAssetClient) CreateAsset(ctx context.Context, setting model.VolcengineAssetSetting, groupID string, publicURL string, name string, assetType string) (string, error) {
	payload := map[string]interface{}{
		"GroupId":     strings.TrimSpace(groupID),
		"URL":         strings.TrimSpace(publicURL),
		"AssetType":   firstNonEmpty(strings.TrimSpace(assetType), "Image"),
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

func volcengineCreateAssetType(mediaType model.AssetType) string {
	if mediaType == model.AssetTypeVideo {
		return "Video"
	}
	return "Image"
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
