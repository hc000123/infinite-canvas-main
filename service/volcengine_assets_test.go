package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
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
	assetURL         string
}

var activeVolcengineAssetClientTestMu sync.Mutex

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

func (fake *fakeVolcengineAssetClient) CreateAssetGroup(ctx context.Context, setting model.VolcengineAssetSetting, name string, description string) (string, error) {
	fake.createGroupCalls++
	fake.groupName = name
	return fake.createGroupID, nil
}

func (fake *fakeVolcengineAssetClient) CreateAsset(ctx context.Context, setting model.VolcengineAssetSetting, groupID string, publicURL string, name string) (string, error) {
	fake.createAssetCalls++
	fake.assetURL = publicURL
	return fake.createAssetID, nil
}

func (fake *fakeVolcengineAssetClient) GetAsset(ctx context.Context, setting model.VolcengineAssetSetting, assetID string, projectName string) (VolcengineAssetStatus, error) {
	fake.getAssetCalls++
	return fake.status, nil
}
