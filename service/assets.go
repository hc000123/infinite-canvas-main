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
	return repository.SaveAsset(item)
}

func DeleteAsset(id string) error {
	return repository.DeleteAsset(id)
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
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return model.AssetTypeImage
	case strings.HasPrefix(mimeType, "video/"):
		return model.AssetTypeVideo
	case strings.HasPrefix(mimeType, "audio/"):
		return model.AssetTypeAudio
	default:
		return ""
	}
}

func assetUploadExt(mimeType string, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != "" && len(ext) <= 10 {
		return ext
	}
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
