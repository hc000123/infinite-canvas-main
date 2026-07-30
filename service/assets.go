package service

import (
	"crypto/rand"
	"encoding/hex"
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
)

const maxAssetUploadBytes = 200 * 1024 * 1024

type AssetUploadResult struct {
	Type     model.AssetType `json:"type"`
	URL      string          `json:"url"`
	CoverURL string          `json:"coverUrl"`
	MimeType string          `json:"mimeType"`
	Bytes    int64           `json:"bytes"`
	Filename string          `json:"filename"`
}

type AssetBatchUpdate struct {
	IDs            []string  `json:"ids"`
	ProjectID      string    `json:"projectId"`
	FolderID       *string   `json:"folderId,omitempty"`
	Category       *string   `json:"category,omitempty"`
	Tags           *[]string `json:"tags,omitempty"`
	EpisodeNumbers *[]string `json:"episodeNumbers,omitempty"`
	AllEpisodes    *bool     `json:"allEpisodes,omitempty"`
}

type AssetBatchDelete struct {
	IDs       []string `json:"ids"`
	ProjectID string   `json:"projectId"`
}

func ListAssets(q model.Query) (model.AssetList, error) {
	items, total, err := repository.ListAssets(q)
	if err != nil {
		return model.AssetList{}, err
	}
	tags, err := repository.ListAssetTags(q)
	if err != nil {
		return model.AssetList{}, err
	}
	return model.AssetList{Items: items, Tags: tags, Total: int(total)}, nil
}

func SaveAsset(item model.Asset) (model.Asset, error) {
	item.ProjectID = strings.TrimSpace(item.ProjectID)
	item.FolderID = strings.TrimSpace(item.FolderID)
	item.Title = strings.TrimSpace(item.Title)
	if item.Title == "" {
		return item, safeMessageError{message: "请输入素材名称"}
	}
	if err := validateAssetLocation(item.ProjectID, item.FolderID); err != nil {
		return item, err
	}
	item.Tags = cleanAssetStrings(item.Tags)
	item.EpisodeNumbers = cleanAssetStrings(item.EpisodeNumbers)
	if item.AllEpisodes {
		item.EpisodeNumbers = []string{}
	} else if len(item.EpisodeNumbers) > 0 {
		item.AllEpisodes = false
	}
	now := time.Now().Format(time.RFC3339)
	if item.Type == "" {
		item.Type = model.AssetTypeText
	}
	if item.ID == "" {
		item.ID = newID("asset")
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	if item.CoverURL == "" {
		item.CoverURL = assetCoverURL(item)
	}
	saved, err := repository.SaveAsset(item)
	if err == nil {
		err = repository.TouchAssetProject(item.ProjectID, now)
	}
	return saved, err
}

func DeleteAsset(id string) error {
	item, err := repository.GetAsset(id)
	if err != nil {
		return err
	}
	if err := repository.DeleteAsset(id); err != nil {
		return err
	}
	if item.ProjectID != "" {
		_ = repository.TouchAssetProject(item.ProjectID, time.Now().Format(time.RFC3339))
	}
	return cleanupUploadedAssetURL(item.URL)
}

func ImportAssetMedia(projectID string, folderID string, file multipart.File, header *multipart.FileHeader) (model.Asset, error) {
	projectID = strings.TrimSpace(projectID)
	folderID = strings.TrimSpace(folderID)
	if err := validateAssetLocation(projectID, folderID); err != nil {
		return model.Asset{}, err
	}
	upload, err := SaveAssetMedia(file, header)
	if err != nil {
		return model.Asset{}, err
	}
	title := strings.TrimSpace(strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)))
	if title == "" {
		title = "未命名素材"
	}
	item, err := SaveAsset(model.Asset{ProjectID: projectID, FolderID: folderID, Title: title, Type: upload.Type, URL: upload.URL, CoverURL: upload.CoverURL, Tags: []string{}, EpisodeNumbers: []string{}})
	if err != nil {
		_ = cleanupUploadedAssetURL(upload.URL)
	}
	return item, err
}

func BatchUpdateAssets(input AssetBatchUpdate) ([]model.Asset, error) {
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	ids := cleanAssetStrings(input.IDs)
	if input.ProjectID == "" || len(ids) == 0 {
		return nil, safeMessageError{message: "请选择需要整理的素材"}
	}
	if input.FolderID != nil {
		folderID := strings.TrimSpace(*input.FolderID)
		input.FolderID = &folderID
		if err := validateAssetLocation(input.ProjectID, folderID); err != nil {
			return nil, err
		}
	}
	items, err := repository.ListAssetsByIDs(input.ProjectID, ids)
	if err != nil {
		return nil, err
	}
	if len(items) != len(ids) {
		return nil, safeMessageError{message: "部分素材不存在或不属于当前项目"}
	}
	now := time.Now().Format(time.RFC3339)
	for index := range items {
		if input.FolderID != nil {
			items[index].FolderID = *input.FolderID
		}
		if input.Category != nil {
			items[index].Category = strings.TrimSpace(*input.Category)
		}
		if input.Tags != nil {
			items[index].Tags = cleanAssetStrings(*input.Tags)
		}
		if input.EpisodeNumbers != nil {
			items[index].EpisodeNumbers = cleanAssetStrings(*input.EpisodeNumbers)
			items[index].AllEpisodes = false
		}
		if input.AllEpisodes != nil {
			items[index].AllEpisodes = *input.AllEpisodes
			if *input.AllEpisodes {
				items[index].EpisodeNumbers = []string{}
			}
		}
		items[index].UpdatedAt = now
	}
	if err := repository.SaveAssets(items); err != nil {
		return nil, err
	}
	if err := repository.TouchAssetProject(input.ProjectID, now); err != nil {
		return nil, err
	}
	return items, nil
}

func BatchDeleteAssets(input AssetBatchDelete) error {
	input.ProjectID = strings.TrimSpace(input.ProjectID)
	ids := cleanAssetStrings(input.IDs)
	if input.ProjectID == "" || len(ids) == 0 {
		return safeMessageError{message: "请选择需要删除的素材"}
	}
	items, err := repository.DeleteAssets(input.ProjectID, ids)
	if err != nil {
		return safeMessageError{message: "部分素材不存在或不属于当前项目"}
	}
	if err := repository.TouchAssetProject(input.ProjectID, time.Now().Format(time.RFC3339)); err != nil {
		return err
	}
	return cleanupUploadedAssets(items)
}

func cleanAssetStrings(items []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(items))
	for _, item := range items {
		value := strings.TrimSpace(item)
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func assetCoverURL(item model.Asset) string {
	if item.CoverURL != "" {
		return item.CoverURL
	}
	if item.Type == model.AssetTypeImage {
		return item.URL
	}
	return ""
}

func SaveAssetMedia(file multipart.File, header *multipart.FileHeader) (AssetUploadResult, error) {
	data, err := io.ReadAll(io.LimitReader(file, maxAssetUploadBytes+1))
	if err != nil {
		return AssetUploadResult{}, err
	}
	if len(data) == 0 {
		return AssetUploadResult{}, safeMessageError{message: "素材文件不能为空"}
	}
	if len(data) > maxAssetUploadBytes {
		return AssetUploadResult{}, safeMessageError{message: "素材文件不能超过 200 MB"}
	}
	mimeType := assetUploadMimeType(data, header)
	assetType := assetUploadType(mimeType)
	if assetType == "" {
		return AssetUploadResult{}, safeMessageError{message: "仅支持上传图片、视频或音频素材"}
	}
	id, err := randomAssetUploadID()
	if err != nil {
		return AssetUploadResult{}, err
	}
	ext := assetUploadExt(mimeType, header.Filename)
	dir := filepath.Join(config.Cfg.PublicAssetDir, "library", string(assetType))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return AssetUploadResult{}, err
	}
	filename := id + ext
	if err := os.WriteFile(filepath.Join(dir, filename), data, 0644); err != nil {
		return AssetUploadResult{}, err
	}
	url := "/api/uploaded-assets/library/" + string(assetType) + "/" + filename
	coverURL := ""
	if assetType == model.AssetTypeImage {
		coverURL = url
	}
	return AssetUploadResult{Type: assetType, URL: url, CoverURL: coverURL, MimeType: mimeType, Bytes: int64(len(data)), Filename: header.Filename}, nil
}

func assetUploadMimeType(data []byte, header *multipart.FileHeader) string {
	mimeType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if mimeType == "" || mimeType == "application/octet-stream" {
		detected := http.DetectContentType(data)
		if detected != "" && detected != "application/octet-stream" {
			mimeType = detected
		}
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if mimeType == "" || mimeType == "application/octet-stream" {
		switch ext {
		case ".mp4", ".m4v":
			mimeType = "video/mp4"
		case ".webm":
			mimeType = "video/webm"
		case ".mov":
			mimeType = "video/quicktime"
		case ".mp3":
			mimeType = "audio/mpeg"
		case ".wav":
			mimeType = "audio/wav"
		case ".m4a":
			mimeType = "audio/mp4"
		case ".ogg":
			mimeType = "audio/ogg"
		}
	}
	return strings.ToLower(strings.TrimSpace(mimeType))
}

func assetUploadType(mimeType string) model.AssetType {
	switch mimeType {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		return model.AssetTypeImage
	case "video/mp4", "video/webm", "video/quicktime":
		return model.AssetTypeVideo
	case "audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav", "audio/mp4", "audio/ogg":
		return model.AssetTypeAudio
	default:
		return ""
	}
}

func assetUploadExt(mimeType string, filename string) string {
	switch mimeType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav", "audio/wave", "audio/x-wav":
		return ".wav"
	case "audio/mp4":
		return ".m4a"
	case "audio/ogg":
		return ".ogg"
	default:
		return ".bin"
	}
}

func randomAssetUploadID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}
