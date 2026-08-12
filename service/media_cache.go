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

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

const maxAssetUploadBytes = 200 * 1024 * 1024

type CanvasMediaCacheResult struct {
	URL      string `json:"url"`
	Path     string `json:"path"`
	MimeType string `json:"mimeType"`
	Bytes    int64  `json:"bytes"`
	Filename string `json:"filename"`
}

func SaveCanvasMediaCache(file multipart.File, header *multipart.FileHeader) (CanvasMediaCacheResult, error) {
	data, err := io.ReadAll(io.LimitReader(file, maxAssetUploadBytes+1))
	if err != nil {
		return CanvasMediaCacheResult{}, err
	}
	if len(data) == 0 {
		return CanvasMediaCacheResult{}, safeMessageError{message: "缓存文件不能为空"}
	}
	if len(data) > maxAssetUploadBytes {
		return CanvasMediaCacheResult{}, safeMessageError{message: "缓存文件不能超过 200 MB"}
	}
	mimeType := assetUploadMimeType(data, header)
	assetType := assetUploadType(mimeType)
	if assetType != model.AssetTypeVideo && assetType != model.AssetTypeAudio {
		return CanvasMediaCacheResult{}, safeMessageError{message: "仅支持缓存视频或音频文件"}
	}
	id, err := randomAssetUploadID()
	if err != nil {
		return CanvasMediaCacheResult{}, err
	}
	ext := assetUploadExt(mimeType, header.Filename)
	dir := filepath.Join(config.Cfg.PublicAssetDir, "canvas", string(assetType))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return CanvasMediaCacheResult{}, err
	}
	filename := id + ext
	path := filepath.Join(dir, filename)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return CanvasMediaCacheResult{}, err
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		absolutePath = path
	}
	url := "/api/uploaded-assets/canvas/" + string(assetType) + "/" + filename
	return CanvasMediaCacheResult{URL: url, Path: absolutePath, MimeType: mimeType, Bytes: int64(len(data)), Filename: strings.TrimSpace(header.Filename)}, nil
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
