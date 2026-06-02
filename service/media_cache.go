package service

import (
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

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
