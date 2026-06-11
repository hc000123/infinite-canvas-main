package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestValidateVolcengineImageAcceptsValidPNG(t *testing.T) {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 512, 768))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	result, err := validateVolcengineImage(testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "portrait.png", Size: int64(buf.Len())})
	if err != nil {
		t.Fatalf("validateVolcengineImage returned error: %v", err)
	}
	if result.Ext != "png" || result.Width != 512 || result.Height != 768 {
		t.Fatalf("result = %#v", result)
	}
}

func TestValidateVolcengineImageAcceptsHEIC(t *testing.T) {
	data := testHEIFBytes(t, "heic", 512, 768)

	result, err := validateVolcengineImage(testMultipartFile{Reader: bytes.NewReader(data)}, &multipart.FileHeader{Filename: "portrait.heic", Size: int64(len(data))})
	if err != nil {
		t.Fatalf("validateVolcengineImage returned error: %v", err)
	}
	if result.Ext != "heic" || result.Width != 512 || result.Height != 768 {
		t.Fatalf("result = %#v", result)
	}
}

func TestValidateVolcengineImageRejectsInvalidRatio(t *testing.T) {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 1200, 400))
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	_, err := validateVolcengineImage(testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "wide.png", Size: int64(buf.Len())})
	if err == nil {
		t.Fatal("validateVolcengineImage returned nil error")
	}
	if safe, ok := err.(interface{ SafeMessage() string }); !ok || safe.SafeMessage() != "图片宽高比需在 0.4 到 2.5 之间" {
		t.Fatalf("error = %#v", err)
	}
}

func TestValidateVolcengineImageRejectsInvalidDimensions(t *testing.T) {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 300, 512))
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	_, err := validateVolcengineImage(testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "small.png", Size: int64(buf.Len())})
	if err == nil {
		t.Fatal("validateVolcengineImage returned nil error")
	}
	if safe, ok := err.(interface{ SafeMessage() string }); !ok || safe.SafeMessage() != "图片宽高需大于 300px 且小于 6000px" {
		t.Fatalf("error = %#v", err)
	}
}

func TestSubmitVolcengineImageAssetCreatesGroupAndAsset(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		config.Cfg.PublicAssetDir = oldPublicAssetDir
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{
		createGroupID: "group-test",
		createAssetID: "asset-test",
	}
	setVolcengineAssetClientForTest(t, fake)

	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 512, 768))
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	result, err := SubmitVolcengineImageAsset(context.Background(), testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "portrait.png", Size: int64(buf.Len())}, "头像素材", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineImageAsset returned error: %v", err)
	}
	if result.GroupID != "group-test" || result.AssetID != "asset-test" || result.Status != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if result.ProjectName != "project-test" {
		t.Fatalf("ProjectName = %q", result.ProjectName)
	}
	if !strings.HasPrefix(result.PublicURL, "https://example.com/uploaded-assets/images/") {
		t.Fatalf("PublicURL = %q", result.PublicURL)
	}
	if fake.createGroupCalls != 1 || fake.createAssetCalls != 1 {
		t.Fatalf("fake calls: createGroup=%d createAsset=%d", fake.createGroupCalls, fake.createAssetCalls)
	}
	if fake.groupName != "头像素材" {
		t.Fatalf("groupName = %q", fake.groupName)
	}
	if fake.assetURL != result.PublicURL {
		t.Fatalf("assetURL = %q, result.PublicURL = %q", fake.assetURL, result.PublicURL)
	}
}

func TestSubmitVolcengineImageAssetUsesConfiguredGroupID(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		config.Cfg.PublicAssetDir = oldPublicAssetDir
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				AssetGroupID:       "group-configured",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{createGroupID: "group-created", createAssetID: "asset-test"}
	setVolcengineAssetClientForTest(t, fake)

	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 512, 768))
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	result, err := SubmitVolcengineImageAsset(context.Background(), testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "portrait.png", Size: int64(buf.Len())}, "头像素材", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineImageAsset returned error: %v", err)
	}
	if fake.createGroupCalls != 0 {
		t.Fatalf("createGroupCalls = %d", fake.createGroupCalls)
	}
	if fake.groupID != "group-configured" || result.GroupID != "group-configured" {
		t.Fatalf("fake.groupID = %q, result.GroupID = %q", fake.groupID, result.GroupID)
	}
}

func TestSubmitVolcengineMediaAssetAcceptsVideo(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		config.Cfg.PublicAssetDir = oldPublicAssetDir
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{createGroupID: "group-test", createAssetID: "asset-video"}
	setVolcengineAssetClientForTest(t, fake)
	header := &multipart.FileHeader{Filename: "reference.mp4", Size: int64(len("video-bytes"))}
	header.Header = textproto.MIMEHeader{"Content-Type": {"video/mp4"}}

	result, err := SubmitVolcengineMediaAsset(context.Background(), testMultipartFile{Reader: bytes.NewReader([]byte("video-bytes"))}, header, "视频参考", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineMediaAsset returned error: %v", err)
	}
	if result.AssetID != "asset-video" || result.Status != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if fake.assetType != "Video" {
		t.Fatalf("assetType = %q", fake.assetType)
	}
	if !strings.HasPrefix(result.PublicURL, "https://example.com/uploaded-assets/videos/") {
		t.Fatalf("PublicURL = %q", result.PublicURL)
	}
}

func TestSubmitVolcengineMediaAssetAcceptsAudio(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		config.Cfg.PublicAssetDir = oldPublicAssetDir
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{createGroupID: "group-test", createAssetID: "asset-audio"}
	setVolcengineAssetClientForTest(t, fake)
	header := &multipart.FileHeader{Filename: "reference.mp3", Size: int64(len("audio-bytes"))}
	header.Header = textproto.MIMEHeader{"Content-Type": {"audio/mpeg"}}

	result, err := SubmitVolcengineMediaAsset(context.Background(), testMultipartFile{Reader: bytes.NewReader([]byte("audio-bytes"))}, header, "音频参考", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineMediaAsset returned error: %v", err)
	}
	if result.AssetID != "asset-audio" || result.Status != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if fake.assetType != "Audio" {
		t.Fatalf("assetType = %q", fake.assetType)
	}
	if !strings.HasPrefix(result.PublicURL, "https://example.com/uploaded-assets/audios/") {
		t.Fatalf("PublicURL = %q", result.PublicURL)
	}
}

func TestSaveVolcenginePublicImageUploadsToTOSPublicBaseURL(t *testing.T) {
	tmp := t.TempDir()
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")

	fakeUploader := &fakeVolcengineObjectUploader{}
	setVolcengineObjectUploaderForTest(t, fakeUploader)

	setting := model.VolcengineAssetSetting{
		AccessKey:          "ak-test",
		SecretKey:          "sk-test",
		Region:             "cn-beijing",
		PublicAssetBaseURL: "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets",
	}
	imageFile := volcengineImageFile{
		Bytes:    []byte("image-bytes"),
		Ext:      "jpeg",
		MimeType: "image/jpeg",
	}

	result, err := saveVolcenginePublicImage(context.Background(), setting, imageFile)
	if err != nil {
		t.Fatalf("saveVolcenginePublicImage returned error: %v", err)
	}
	if !strings.HasPrefix(result.PublicURL, "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets/images/") {
		t.Fatalf("PublicURL = %q", result.PublicURL)
	}
	if fakeUploader.uploadCalls != 1 {
		t.Fatalf("uploadCalls = %d", fakeUploader.uploadCalls)
	}
	if fakeUploader.publicURL != result.PublicURL {
		t.Fatalf("fake publicURL = %q, result.PublicURL = %q", fakeUploader.publicURL, result.PublicURL)
	}
	if string(fakeUploader.data) != "image-bytes" || fakeUploader.contentType != "image/jpeg" {
		t.Fatalf("fake upload data = %q, contentType = %q", string(fakeUploader.data), fakeUploader.contentType)
	}
}

func TestSubmitVolcengineImageAssetURLConvertsUploadedAssetURL(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				AssetGroupID:       "group-configured",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{
		createGroupID: "group-test",
		createAssetID: "asset-test",
	}
	setVolcengineAssetClientForTest(t, fake)

	result, err := SubmitVolcengineImageAssetURL(context.Background(), "/api/uploaded-assets/library/image/portrait.jpg", "头像素材", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineImageAssetURL returned error: %v", err)
	}
	if result.PublicURL != "https://example.com/uploaded-assets/library/image/portrait.jpg" {
		t.Fatalf("PublicURL = %q", result.PublicURL)
	}
	if fake.assetURL != result.PublicURL {
		t.Fatalf("assetURL = %q, result.PublicURL = %q", fake.assetURL, result.PublicURL)
	}
	if fake.createGroupCalls != 0 {
		t.Fatalf("createGroupCalls = %d", fake.createGroupCalls)
	}
	if fake.groupID != "group-configured" || result.GroupID != "group-configured" {
		t.Fatalf("fake.groupID = %q, result.GroupID = %q", fake.groupID, result.GroupID)
	}
}

func TestResolveVolcengineAssetURLUploadsLocalFileToTOS(t *testing.T) {
	tmp := t.TempDir()
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	localPath := filepath.Join(config.Cfg.PublicAssetDir, "library", "image", "portrait.jpg")
	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(localPath, []byte("uploaded-image"), 0644); err != nil {
		t.Fatalf("write local image: %v", err)
	}

	fakeUploader := &fakeVolcengineObjectUploader{}
	setVolcengineObjectUploaderForTest(t, fakeUploader)

	setting := model.VolcengineAssetSetting{
		AccessKey:          "ak-test",
		SecretKey:          "sk-test",
		Region:             "cn-beijing",
		PublicAssetBaseURL: "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets",
	}

	result, err := resolveVolcengineAssetURL(context.Background(), setting, "/api/uploaded-assets/library/image/portrait.jpg")
	if err != nil {
		t.Fatalf("resolveVolcengineAssetURL returned error: %v", err)
	}
	if result != "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets/library/image/portrait.jpg" {
		t.Fatalf("PublicURL = %q", result)
	}
	if fakeUploader.uploadCalls != 1 {
		t.Fatalf("uploadCalls = %d", fakeUploader.uploadCalls)
	}
	if fakeUploader.publicURL != result || string(fakeUploader.data) != "uploaded-image" {
		t.Fatalf("fake publicURL = %q, data = %q", fakeUploader.publicURL, string(fakeUploader.data))
	}
}

func TestSubmitVolcengineImageAssetURLAcceptsAbsolutePublicURLWithoutBaseURL(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:      true,
				AccessKey:    "ak-test",
				SecretKey:    "sk-test",
				ProjectName:  "project-test",
				Region:       "cn-beijing",
				AssetGroupID: "group-configured",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	fake := &fakeVolcengineAssetClient{createGroupID: "group-created", createAssetID: "asset-test"}
	setVolcengineAssetClientForTest(t, fake)

	publicURL := "https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets/images/portrait.jpeg"
	result, err := SubmitVolcengineImageAssetURL(context.Background(), publicURL, "头像素材", "", "")
	if err != nil {
		t.Fatalf("SubmitVolcengineImageAssetURL returned error: %v", err)
	}
	if result.PublicURL != publicURL || fake.assetURL != publicURL {
		t.Fatalf("result.PublicURL = %q, fake.assetURL = %q", result.PublicURL, fake.assetURL)
	}
	if fake.createGroupCalls != 0 {
		t.Fatalf("createGroupCalls = %d", fake.createGroupCalls)
	}
	if fake.groupID != "group-configured" || result.GroupID != "group-configured" {
		t.Fatalf("fake.groupID = %q, result.GroupID = %q", fake.groupID, result.GroupID)
	}
}

func TestVolcengineTOSTargetFromPublicURL(t *testing.T) {
	target, ok, err := volcengineTOSTargetFromPublicURL("https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets/images/portrait.jpeg")
	if err != nil {
		t.Fatalf("volcengineTOSTargetFromPublicURL returned error: %v", err)
	}
	if !ok {
		t.Fatal("volcengineTOSTargetFromPublicURL did not detect TOS URL")
	}
	if target.Bucket != "jiabaitong" || target.Region != "cn-beijing" || target.Endpoint != "https://tos-cn-beijing.volces.com" || target.Key != "volcengine-assets/images/portrait.jpeg" {
		t.Fatalf("target = %#v", target)
	}
}

func TestSubmitAdminAssetVolcengineReviewSavesMetadata(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	_, err = repository.SaveAsset(model.Asset{
		ID:       "asset-admin-test",
		Title:    "后台头像",
		Type:     model.AssetTypeImage,
		CoverURL: "/api/uploaded-assets/library/image/portrait.jpg",
		URL:      "/api/uploaded-assets/library/image/portrait.jpg",
	})
	if err != nil {
		t.Fatalf("save asset: %v", err)
	}

	fake := &fakeVolcengineAssetClient{
		createGroupID: "group-test",
		createAssetID: "asset-test",
	}
	setVolcengineAssetClientForTest(t, fake)

	result, err := SubmitAdminAssetVolcengineReview(context.Background(), "asset-admin-test")
	if err != nil {
		t.Fatalf("SubmitAdminAssetVolcengineReview returned error: %v", err)
	}
	if result.VolcengineAssetID != "asset-test" || result.VolcengineStatus != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if result.VolcenginePublicURL != "https://example.com/uploaded-assets/library/image/portrait.jpg" {
		t.Fatalf("VolcenginePublicURL = %q", result.VolcenginePublicURL)
	}
}

func TestSubmitAdminAssetVolcengineReviewAcceptsVideo(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "project-test",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	_, err = repository.SaveAsset(model.Asset{
		ID:    "asset-admin-video",
		Title: "后台视频",
		Type:  model.AssetTypeVideo,
		URL:   "/api/uploaded-assets/library/video/reference.mp4",
	})
	if err != nil {
		t.Fatalf("save asset: %v", err)
	}

	fake := &fakeVolcengineAssetClient{createGroupID: "group-test", createAssetID: "asset-video"}
	setVolcengineAssetClientForTest(t, fake)

	result, err := SubmitAdminAssetVolcengineReview(context.Background(), "asset-admin-video")
	if err != nil {
		t.Fatalf("SubmitAdminAssetVolcengineReview returned error: %v", err)
	}
	if result.VolcengineAssetID != "asset-video" || result.VolcengineStatus != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if fake.assetType != "Video" {
		t.Fatalf("assetType = %q", fake.assetType)
	}
	if result.VolcenginePublicURL != "https://example.com/uploaded-assets/library/video/reference.mp4" {
		t.Fatalf("VolcenginePublicURL = %q", result.VolcenginePublicURL)
	}
}

func TestNormalizeVolcengineResponseUnwrapsNestedResultAsset(t *testing.T) {
	result, err := normalizeVolcengineResponse("GetAsset", map[string]interface{}{
		"Result": map[string]interface{}{
			"Asset": map[string]interface{}{
				"Id":     "asset-test",
				"Status": "Active",
			},
		},
	})
	if err != nil {
		t.Fatalf("normalizeVolcengineResponse returned error: %v", err)
	}
	if stringFromMap(result, "Id") != "asset-test" || stringFromMap(result, "Status") != "Active" {
		t.Fatalf("result = %#v", result)
	}
}

func TestNormalizeVolcengineResponseReturnsSafeError(t *testing.T) {
	_, err := normalizeVolcengineResponse("CreateAsset", map[string]interface{}{
		"ResponseMetadata": map[string]interface{}{
			"Error": map[string]interface{}{
				"Code":    "InvalidParameter",
				"Message": "URL is not accessible",
			},
		},
	})
	if err == nil {
		t.Fatal("normalizeVolcengineResponse returned nil error")
	}
	if safe, ok := err.(interface{ SafeMessage() string }); !ok || safe.SafeMessage() != "火山 CreateAsset 失败：URL is not accessible" {
		t.Fatalf("error = %#v", err)
	}
}

func TestVolcengineAssetStatusFromMapIncludesFailureReason(t *testing.T) {
	status := volcengineAssetStatusFromMap(model.VolcengineAssetSetting{ProjectName: "default"}, "asset-test", "project-test", map[string]interface{}{
		"Id":          "asset-test",
		"GroupId":     "group-test",
		"ProjectName": "project-test",
		"Status":      "Failed",
		"Error":       "URL is not accessible",
	})
	if status.Error != "URL is not accessible" {
		t.Fatalf("Error = %q", status.Error)
	}
}

func TestCurrentVolcengineAssetSettingRejectsLocalhostPublicURL(t *testing.T) {
	tmp := t.TempDir()
	oldStorageDriver := config.Cfg.StorageDriver
	oldDatabaseDSN := config.Cfg.DatabaseDSN
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldStorageDriver
		config.Cfg.DatabaseDSN = oldDatabaseDSN
		repository.ResetForTest()
	})

	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	repository.ResetForTest()

	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled:            true,
				AccessKey:          "ak-test",
				SecretKey:          "sk-test",
				ProjectName:        "default",
				Region:             "cn-beijing",
				PublicAssetBaseURL: "http://localhost:3000/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	_, err = currentVolcengineAssetSetting()
	if err == nil {
		t.Fatal("currentVolcengineAssetSetting returned nil error")
	}
	if safe, ok := err.(interface{ SafeMessage() string }); !ok || safe.SafeMessage() != "公网素材访问地址必须是火山可访问的公网地址，不能使用 localhost 或内网地址" {
		t.Fatalf("error = %#v", err)
	}
}

type testMultipartFile struct {
	*bytes.Reader
}

func (testMultipartFile) Close() error {
	return nil
}

type fakeVolcengineAssetClient struct {
	createGroupID    string
	createAssetID    string
	status           VolcengineAssetStatus
	createGroupCalls int
	createAssetCalls int
	getAssetCalls    int
	groupName        string
	groupID          string
	assetURL         string
	assetType        string
}

type fakeVolcengineObjectUploader struct {
	uploadCalls int
	publicURL   string
	data        []byte
	contentType string
}

var activeVolcengineAssetClientTestMu sync.Mutex
var activeVolcengineObjectUploaderTestMu sync.Mutex

func setVolcengineAssetClientForTest(t *testing.T, client volcengineAssetClient) {
	t.Helper()
	activeVolcengineAssetClientTestMu.Lock()
	oldClient := activeVolcengineAssetClient
	activeVolcengineAssetClient = client
	t.Cleanup(func() {
		activeVolcengineAssetClient = oldClient
		activeVolcengineAssetClientTestMu.Unlock()
	})
}

func setVolcengineObjectUploaderForTest(t *testing.T, uploader volcengineObjectUploader) {
	t.Helper()
	activeVolcengineObjectUploaderTestMu.Lock()
	oldUploader := activeVolcengineObjectUploader
	activeVolcengineObjectUploader = uploader
	t.Cleanup(func() {
		activeVolcengineObjectUploader = oldUploader
		activeVolcengineObjectUploaderTestMu.Unlock()
	})
}

func (fake *fakeVolcengineAssetClient) CreateAssetGroup(ctx context.Context, setting model.VolcengineAssetSetting, name string, description string) (string, error) {
	fake.createGroupCalls++
	fake.groupName = name
	return fake.createGroupID, nil
}

func (fake *fakeVolcengineAssetClient) CreateAsset(ctx context.Context, setting model.VolcengineAssetSetting, groupID string, publicURL string, name string, assetType string) (string, error) {
	fake.createAssetCalls++
	fake.groupID = groupID
	fake.assetURL = publicURL
	fake.assetType = assetType
	return fake.createAssetID, nil
}

func (fake *fakeVolcengineAssetClient) GetAsset(ctx context.Context, setting model.VolcengineAssetSetting, assetID string, projectName string) (VolcengineAssetStatus, error) {
	fake.getAssetCalls++
	return fake.status, nil
}

func (fake *fakeVolcengineObjectUploader) UploadObject(ctx context.Context, setting model.VolcengineAssetSetting, publicURL string, data []byte, contentType string) error {
	fake.uploadCalls++
	fake.publicURL = publicURL
	fake.data = append([]byte(nil), data...)
	fake.contentType = contentType
	return nil
}

func testHEIFBytes(t *testing.T, brand string, width int, height int) []byte {
	t.Helper()
	box := func(name string, payload []byte) []byte {
		data := make([]byte, 8+len(payload))
		binary.BigEndian.PutUint32(data[:4], uint32(len(data)))
		copy(data[4:8], name)
		copy(data[8:], payload)
		return data
	}

	ftypPayload := []byte(brand + "\x00\x00\x00\x00mif1" + brand)
	ispePayload := make([]byte, 12)
	binary.BigEndian.PutUint32(ispePayload[4:8], uint32(width))
	binary.BigEndian.PutUint32(ispePayload[8:12], uint32(height))

	data := box("ftyp", ftypPayload)
	data = append(data, box("meta", append([]byte{0, 0, 0, 0}, box("iprp", box("ipco", box("ispe", ispePayload)))...))...)
	return data
}
