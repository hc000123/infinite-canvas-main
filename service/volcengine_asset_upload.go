package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
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

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const maxVolcengineAssetImageBytes = 30 * 1024 * 1024
const maxVolcengineAssetMediaBytes = 200 * 1024 * 1024

type volcengineImageFile struct {
	Bytes     []byte
	Ext       string
	MimeType  string
	Width     int
	Height    int
	PublicURL string
}

type volcengineMediaFile struct {
	Bytes     []byte
	Ext       string
	MimeType  string
	AssetType string
	PublicURL string
}

type volcengineImageConfig struct {
	Ext    string
	Width  int
	Height int
}

type volcengineTOSTarget struct {
	Endpoint string
	Region   string
	Bucket   string
	Key      string
}

type realVolcengineObjectUploader struct{}

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
		tos.WithRequestTimeout(AIVideoTaskTimeout),
		tos.WithSocketTimeout(AIVideoTaskTimeout, AIVideoTaskTimeout),
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
	return validateVolcengineImageBytes(data, header)
}

func validateVolcengineImageBytes(data []byte, header *multipart.FileHeader) (volcengineImageFile, error) {
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

func validateVolcengineMedia(file multipart.File, header *multipart.FileHeader) (volcengineMediaFile, error) {
	data, err := io.ReadAll(io.LimitReader(file, maxVolcengineAssetMediaBytes+1))
	if err != nil {
		return volcengineMediaFile{}, err
	}
	if len(data) == 0 {
		return volcengineMediaFile{}, safeMessageError{message: "素材文件不能为空"}
	}
	if len(data) > maxVolcengineAssetMediaBytes {
		return volcengineMediaFile{}, safeMessageError{message: "视频素材大小需小于 200 MB"}
	}
	mimeType := assetUploadMimeType(data, header)
	assetType := assetUploadType(mimeType)
	if assetType == model.AssetTypeImage {
		imageFile, err := validateVolcengineImageBytes(data, header)
		if err != nil {
			return volcengineMediaFile{}, err
		}
		return volcengineMediaFile{Bytes: imageFile.Bytes, Ext: imageFile.Ext, MimeType: imageFile.MimeType, AssetType: "Image"}, nil
	}
	if assetType != model.AssetTypeVideo && assetType != model.AssetTypeAudio {
		return volcengineMediaFile{}, safeMessageError{message: "仅支持图片、视频或音频素材加白"}
	}
	ext := strings.TrimPrefix(assetUploadExt(mimeType, header.Filename), ".")
	if ext == "" || ext == "bin" {
		return volcengineMediaFile{}, safeMessageError{message: "素材格式需为 mp4、mov、m4v、webm、mp3、wav、m4a 或 ogg"}
	}
	if assetType == model.AssetTypeAudio {
		return volcengineMediaFile{Bytes: data, Ext: ext, MimeType: mimeType, AssetType: "Audio"}, nil
	}
	return volcengineMediaFile{Bytes: data, Ext: ext, MimeType: mimeType, AssetType: "Video"}, nil
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
	mediaFile, err := saveVolcenginePublicMedia(ctx, setting, volcengineMediaFile{Bytes: imageFile.Bytes, Ext: imageFile.Ext, MimeType: imageFile.MimeType, AssetType: "Image"})
	if err != nil {
		return imageFile, err
	}
	imageFile.PublicURL = mediaFile.PublicURL
	return imageFile, nil
}

func saveVolcenginePublicMedia(ctx context.Context, setting model.VolcengineAssetSetting, mediaFile volcengineMediaFile) (volcengineMediaFile, error) {
	if setting.PublicAssetBaseURL == "" {
		return mediaFile, safeMessageError{message: "请先配置公网素材访问地址"}
	}
	id, err := randomHexID()
	if err != nil {
		return mediaFile, err
	}
	dirName := "images"
	if mediaFile.AssetType == "Video" {
		dirName = "videos"
	} else if mediaFile.AssetType == "Audio" {
		dirName = "audios"
	}
	dir := filepath.Join(config.Cfg.PublicAssetDir, dirName)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return mediaFile, err
	}
	filename := id + "." + mediaFile.Ext
	if err := os.WriteFile(filepath.Join(dir, filename), mediaFile.Bytes, 0644); err != nil {
		return mediaFile, err
	}
	mediaFile.PublicURL = volcenginePublicAssetURL(setting, dirName+"/"+filename)
	if err := activeVolcengineObjectUploader.UploadObject(ctx, setting, mediaFile.PublicURL, mediaFile.Bytes, mediaFile.MimeType); err != nil {
		return mediaFile, err
	}
	return mediaFile, nil
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
