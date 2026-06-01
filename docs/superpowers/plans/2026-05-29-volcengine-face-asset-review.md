# 火山私域人像素材加白 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “我的素材” image workflow that uploads local images to backend-hosted public files, submits them to Volcengine Ark private virtual portrait assets, and lets users refresh review status.

**Architecture:** Backend owns secrets, public file hosting, image validation, and Volcengine OpenAPI calls. Frontend only uploads the selected image Blob, updates local asset metadata, and renders submission/status controls. “我的素材” remains browser-local; Volcengine IDs live in `Asset.metadata.volcengineAsset`.

**Tech Stack:** Go + Gin + GORM, Volcengine Go SDK universal OpenAPI client, Next.js App Router, React, TypeScript, Ant Design, Zustand/localForage.

---

## Current Workspace Note

This extracted workspace has no `.git` directory, so commit steps cannot run here. If implementing in a Git clone, run the commit commands listed at task boundaries. If implementing in this workspace, skip only the commit command and keep the file changes grouped by task.

## File Structure

- Modify: `config/config.go`
  - Add `PublicAssetDir` so the static upload directory can be configured.
- Modify: `router/router.go`
  - Expose `/uploaded-assets` and register authenticated Volcengine asset endpoints.
- Modify: `model/setting.go`
  - Add public/private Volcengine asset settings.
- Modify: `service/settings.go`
  - Normalize defaults, keep saved AK/SK when form fields are blank, and hide secrets in admin responses.
- Create: `service/volcengine_assets.go`
  - Validate images, save public files, call Volcengine, and return safe result types.
- Create: `service/volcengine_assets_test.go`
  - Cover config validation, image validation, public URL generation, and fake-client submission/status flows.
- Create: `handler/volcengine_assets.go`
  - Parse multipart and status JSON requests.
- Modify: `web/src/services/api/request.ts`
  - Add `apiPostForm`.
- Modify: `web/src/services/api/admin.ts`
  - Add frontend setting types for Volcengine asset config.
- Create: `web/src/services/api/volcengine-assets.ts`
  - Add submit/status API calls.
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`
  - Add private settings UI and normalization.
- Modify: `web/src/stores/use-asset-store.ts`
  - Add typed Volcengine metadata shape.
- Modify: `web/src/app/(user)/assets/page.tsx`
  - Add submit dialog, status badges, upload/refresh handlers, and detail actions.
- Modify: `docs/pending-test.md`
  - Record the new testable feature.

## Task 1: Settings Model And Admin Configuration

**Files:**
- Modify: `model/setting.go`
- Modify: `service/settings.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx`

- [ ] **Step 1: Add settings types in Go**

In `model/setting.go`, add these types after `PublicLinuxDoAuthSetting`:

```go
type PublicVolcengineAssetSetting struct {
	Enabled bool `json:"enabled"`
}

type VolcengineAssetSetting struct {
	Enabled            bool   `json:"enabled"`
	AccessKey          string `json:"accessKey"`
	SecretKey          string `json:"secretKey"`
	ProjectName        string `json:"projectName"`
	Region             string `json:"region"`
	PublicAssetBaseURL string `json:"publicAssetBaseUrl"`
}
```

Update `PublicSetting`:

```go
type PublicSetting struct {
	ModelChannel    PublicModelChannelSetting    `json:"modelChannel"`
	Auth            PublicAuthSetting            `json:"auth"`
	VolcengineAsset PublicVolcengineAssetSetting `json:"volcengineAsset"`
}
```

Update `PrivateSetting`:

```go
type PrivateSetting struct {
	Channels        []ModelChannel           `json:"channels"`
	PromptSync      PromptSyncSetting        `json:"promptSync"`
	Auth            PrivateAuthSetting       `json:"auth"`
	VolcengineAsset VolcengineAssetSetting   `json:"volcengineAsset"`
}
```

- [ ] **Step 2: Normalize and protect secrets**

In `service/settings.go`, change `PublicSettings` to normalize both public and private settings:

```go
func PublicSettings() (model.PublicSetting, error) {
	settings, err := repository.GetSettings()
	return normalizeSettings(settings).Public, err
}
```

In `SaveSettings`, call a new keeper after `keepPrivateAuthSecrets`:

```go
keepPrivateVolcengineAssetSecrets(&settings, normalizeSettings(saved))
```

In `normalizeSettings`, after normalizing private settings, derive the public enabled flag:

```go
settings.Public.VolcengineAsset.Enabled = settings.Private.VolcengineAsset.Enabled
```

Add this helper near `normalizePrivateSetting`:

```go
func normalizeVolcengineAssetSetting(setting model.VolcengineAssetSetting) model.VolcengineAssetSetting {
	setting.AccessKey = strings.TrimSpace(setting.AccessKey)
	setting.SecretKey = strings.TrimSpace(setting.SecretKey)
	setting.ProjectName = strings.TrimSpace(setting.ProjectName)
	if setting.ProjectName == "" {
		setting.ProjectName = "default"
	}
	setting.Region = strings.TrimSpace(setting.Region)
	if setting.Region == "" {
		setting.Region = "cn-beijing"
	}
	setting.PublicAssetBaseURL = strings.TrimRight(strings.TrimSpace(setting.PublicAssetBaseURL), "/")
	return setting
}
```

Call it from `normalizePrivateSetting`:

```go
setting.VolcengineAsset = normalizeVolcengineAssetSetting(setting.VolcengineAsset)
```

Extend `hidePrivateAPIKeys`:

```go
settings.Private.VolcengineAsset.AccessKey = ""
settings.Private.VolcengineAsset.SecretKey = ""
```

Add the secret keeper:

```go
func keepPrivateVolcengineAssetSecrets(settings *model.Settings, saved model.Settings) {
	if strings.TrimSpace(settings.Private.VolcengineAsset.AccessKey) == "" {
		settings.Private.VolcengineAsset.AccessKey = saved.Private.VolcengineAsset.AccessKey
	}
	if strings.TrimSpace(settings.Private.VolcengineAsset.SecretKey) == "" {
		settings.Private.VolcengineAsset.SecretKey = saved.Private.VolcengineAsset.SecretKey
	}
}
```

- [ ] **Step 3: Add frontend API setting types**

In `web/src/services/api/admin.ts`, add:

```ts
export type AdminPublicVolcengineAssetSettings = {
    enabled: boolean;
};

export type AdminPrivateVolcengineAssetSettings = {
    enabled: boolean;
    accessKey: string;
    secretKey: string;
    projectName: string;
    region: string;
    publicAssetBaseUrl: string;
};
```

Update `AdminPublicSettings`:

```ts
export type AdminPublicSettings = {
    modelChannel: AdminPublicModelChannelSettings;
    auth: {
        allowRegister: boolean;
        linuxDo: {
            enabled: boolean;
        };
    };
    volcengineAsset: AdminPublicVolcengineAssetSettings;
};
```

Update `AdminPrivateSettings`:

```ts
export type AdminPrivateSettings = {
    channels: AdminModelChannel[];
    promptSync: {
        enabled: boolean;
        cron: string;
    };
    auth: {
        linuxDo: {
            clientId: string;
            clientSecret: string;
        };
    };
    volcengineAsset: AdminPrivateVolcengineAssetSettings;
};
```

- [ ] **Step 4: Add admin settings defaults and normalizers**

In `web/src/app/(admin)/admin/settings/page.tsx`, update `emptySettings.public`:

```ts
volcengineAsset: { enabled: false },
```

Update `emptySettings.private`:

```ts
private: {
    channels: [],
    promptSync: { enabled: true, cron: "*/5 * * * *" },
    auth: { linuxDo: { clientId: "", clientSecret: "" } },
    volcengineAsset: { enabled: false, accessKey: "", secretKey: "", projectName: "default", region: "cn-beijing", publicAssetBaseUrl: "" },
},
```

In `normalizePublicSetting`, add:

```ts
volcengineAsset: {
    enabled: setting.volcengineAsset?.enabled === true,
},
```

In `normalizePrivateSetting`, add:

```ts
volcengineAsset: normalizePrivateVolcengineAssetSetting(setting.volcengineAsset),
```

Add:

```ts
function normalizePrivateVolcengineAssetSetting(setting: Partial<AdminSettings["private"]["volcengineAsset"]> = {}): AdminSettings["private"]["volcengineAsset"] {
    return {
        enabled: setting.enabled === true,
        accessKey: setting.accessKey || "",
        secretKey: setting.secretKey || "",
        projectName: setting.projectName || "default",
        region: setting.region || "cn-beijing",
        publicAssetBaseUrl: setting.publicAssetBaseUrl || "",
    };
}
```

- [ ] **Step 5: Preserve secrets after admin save**

In `web/src/app/(admin)/admin/settings/page.tsx`, update the save merge flow. Replace:

```ts
const merged = mergeChannelApiKeys(values.private.channels, saved);
```

with:

```ts
const merged = mergePrivateSecrets(values, saved);
```

Rename `mergeChannelApiKeys` to `mergePrivateSecrets` and use this body:

```ts
function mergePrivateSecrets(input: AdminSettings, saved: AdminSettings): AdminSettings {
    const channels = saved.private.channels.map((item, index) => ({
        ...item,
        apiKey: input.private.channels[index]?.apiKey || item.apiKey,
    }));
    return {
        public: saved.public,
        private: {
            ...saved.private,
            channels,
            volcengineAsset: {
                ...saved.private.volcengineAsset,
                accessKey: input.private.volcengineAsset.accessKey || saved.private.volcengineAsset.accessKey,
                secretKey: input.private.volcengineAsset.secretKey || saved.private.volcengineAsset.secretKey,
            },
        },
    };
}
```

- [ ] **Step 6: Add admin visual settings card**

In the private visual settings section, insert this `Card` before “提示词定时同步”:

```tsx
<Card size="small" title="火山私域人像素材审核">
    <Flex vertical gap={14}>
        <Typography.Text type="secondary">
            图片会先保存到后端公开静态目录，再提交到火山方舟私域虚拟人像素材资产库。公网素材访问地址必须能被火山服务器访问。
        </Typography.Text>
        <Row gutter={16}>
            <Col xs={24} md={6}>
                <Form.Item name={["private", "volcengineAsset", "enabled"]} label="启用素材审核" valuePropName="checked">
                    <Switch />
                </Form.Item>
            </Col>
            <Col xs={24} md={9}>
                <Form.Item name={["private", "volcengineAsset", "accessKey"]} label="Access Key">
                    <Input.Password placeholder="留空则沿用已保存的 AK" />
                </Form.Item>
            </Col>
            <Col xs={24} md={9}>
                <Form.Item name={["private", "volcengineAsset", "secretKey"]} label="Secret Key">
                    <Input.Password placeholder="留空则沿用已保存的 SK" />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                <Form.Item name={["private", "volcengineAsset", "projectName"]} label="ProjectName">
                    <Input placeholder="default" />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                <Form.Item name={["private", "volcengineAsset", "region"]} label="Region">
                    <Input placeholder="cn-beijing" />
                </Form.Item>
            </Col>
            <Col xs={24} md={8}>
                <Form.Item name={["private", "volcengineAsset", "publicAssetBaseUrl"]} label="公网素材访问地址">
                    <Input placeholder="https://example.com/uploaded-assets" />
                </Form.Item>
            </Col>
        </Row>
    </Flex>
</Card>
```

- [ ] **Step 7: Commit settings task**

Run:

```bash
git add model/setting.go service/settings.go web/src/services/api/admin.ts 'web/src/app/(admin)/admin/settings/page.tsx'
git commit -m "feat: add volcengine asset settings"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Task 2: Backend Static Hosting And Image Validation

**Files:**
- Modify: `config/config.go`
- Modify: `router/router.go`
- Create: `service/volcengine_assets.go`
- Create: `service/volcengine_assets_test.go`

- [ ] **Step 1: Add public asset directory config**

In `config/config.go`, add a field to `Config`:

```go
PublicAssetDir string `env:"PUBLIC_ASSET_DIR" envDefault:"data/public-assets"`
```

- [ ] **Step 2: Expose the static directory**

In `router/router.go`, import config:

```go
import (
	"net/http"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/middleware"
	"github.com/gin-gonic/gin"
)
```

Before `router.NoRoute`, add:

```go
router.Static("/uploaded-assets", config.Cfg.PublicAssetDir)
```

- [ ] **Step 3: Create validation and storage helpers**

Create `service/volcengine_assets.go` with the package, imports, constants, and helper types:

```go
package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
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
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const maxVolcengineAssetImageBytes = 30 * 1024 * 1024

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
```

Add validation helpers:

```go
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
	ext := normalizeImageExt(filepath.Ext(header.Filename), mimeType)
	if ext == "" {
		return volcengineImageFile{}, safeMessageError{message: "图片格式需为 jpeg、png、webp、bmp、tiff 或 gif"}
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return volcengineImageFile{}, safeMessageError{message: "无法读取图片尺寸，请使用 jpeg、png、webp、bmp、tiff 或 gif"}
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

func normalizeImageExt(filenameExt string, mimeType string) string {
	ext := strings.ToLower(strings.TrimPrefix(filenameExt, "."))
	switch ext {
	case "jpg":
		ext = "jpeg"
	case "tif":
		ext = "tiff"
	}
	switch ext {
	case "jpeg", "png", "webp", "bmp", "tiff", "gif":
		return ext
	}
	switch mimeType {
	case "image/jpeg":
		return "jpeg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	default:
		return ""
	}
}
```

Add storage helpers:

```go
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
```

- [ ] **Step 4: Write validation tests**

Create `service/volcengine_assets_test.go`:

```go
package service

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"testing"
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
	img := image.NewRGBA(image.Rect(0, 0, 1200, 300))
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

type testMultipartFile struct {
	*bytes.Reader
}

func (testMultipartFile) Close() error {
	return nil
}
```

- [ ] **Step 5: Run targeted validation tests**

Run:

```bash
go test ./service -run TestValidateVolcengineImage
```

Expected: tests pass after `golang.org/x/image` is added in Task 3. If run before dependency addition, expected failure contains `no required module provides package golang.org/x/image`.

- [ ] **Step 6: Commit static hosting task**

Run:

```bash
git add config/config.go router/router.go service/volcengine_assets.go service/volcengine_assets_test.go go.mod go.sum
git commit -m "feat: add public asset image storage"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Task 3: Volcengine Client, Service Flow, And Routes

**Files:**
- Modify: `go.mod`
- Modify: `service/volcengine_assets.go`
- Modify: `service/volcengine_assets_test.go`
- Create: `handler/volcengine_assets.go`
- Modify: `router/router.go`

- [ ] **Step 1: Add dependencies**

Run:

```bash
go get github.com/volcengine/volcengine-go-sdk@latest golang.org/x/image@latest
```

Expected: `go.mod` gains direct or indirect requirements for Volcengine SDK and `golang.org/x/image`; `go.sum` updates.

- [ ] **Step 2: Add client interface and real client**

In `service/volcengine_assets.go`, extend imports with:

```go
	"fmt"

	"github.com/volcengine/volcengine-go-sdk/volcengine"
	"github.com/volcengine/volcengine-go-sdk/volcengine/credentials"
	"github.com/volcengine/volcengine-go-sdk/volcengine/session"
	"github.com/volcengine/volcengine-go-sdk/volcengine/universal"
```

Add:

```go
type volcengineAssetClient interface {
	CreateAssetGroup(context.Context, model.VolcengineAssetSetting, string, string) (string, error)
	CreateAsset(context.Context, model.VolcengineAssetSetting, string, string, string) (string, error)
	GetAsset(context.Context, model.VolcengineAssetSetting, string, string) (VolcengineAssetStatus, error)
}

var activeVolcengineAssetClient volcengineAssetClient = realVolcengineAssetClient{}

type realVolcengineAssetClient struct{}
```

Add real methods:

```go
func (realVolcengineAssetClient) CreateAssetGroup(ctx context.Context, setting model.VolcengineAssetSetting, name string, description string) (string, error) {
	resp, err := doVolcengineAssetCall(setting, "CreateAssetGroup", map[string]any{
		"Name":        name,
		"Description": description,
		"ProjectName": setting.ProjectName,
	})
	if err != nil {
		return "", err
	}
	return stringFromMap(resp, "Id"), nil
}

func (realVolcengineAssetClient) CreateAsset(ctx context.Context, setting model.VolcengineAssetSetting, groupID string, imageURL string, name string) (string, error) {
	payload := map[string]any{
		"GroupId":     groupID,
		"URL":         imageURL,
		"AssetType":   "Image",
		"ProjectName": setting.ProjectName,
	}
	if strings.TrimSpace(name) != "" {
		payload["Name"] = strings.TrimSpace(name)
	}
	resp, err := doVolcengineAssetCall(setting, "CreateAsset", payload)
	if err != nil {
		return "", err
	}
	return stringFromMap(resp, "Id"), nil
}

func (realVolcengineAssetClient) GetAsset(ctx context.Context, setting model.VolcengineAssetSetting, assetID string, projectName string) (VolcengineAssetStatus, error) {
	resp, err := doVolcengineAssetCall(setting, "GetAsset", map[string]any{
		"Id":          assetID,
		"ProjectName": projectName,
	})
	if err != nil {
		return VolcengineAssetStatus{}, err
	}
	return VolcengineAssetStatus{
		AssetID:     stringFromMap(resp, "Id"),
		GroupID:     stringFromMap(resp, "GroupId"),
		ProjectName: stringFromMap(resp, "ProjectName"),
		Status:      stringFromMap(resp, "Status"),
		PublicURL:   stringFromMap(resp, "URL"),
		AssetType:   stringFromMap(resp, "AssetType"),
		UpdatedAt:   firstNonEmpty(stringFromMap(resp, "UpdateTime"), now()),
	}, nil
}

func doVolcengineAssetCall(setting model.VolcengineAssetSetting, action string, payload map[string]any) (map[string]any, error) {
	cfg := volcengine.NewConfig().WithCredentials(credentials.NewStaticCredentials(setting.AccessKey, setting.SecretKey, "")).WithRegion(setting.Region)
	sess, err := session.NewSession(cfg)
	if err != nil {
		return nil, err
	}
	resp, err := universal.New(sess).DoCall(
		universal.RequestUniversal{
			ServiceName: "ark",
			Action:      action,
			Version:     "2024-01-01",
			HttpMethod:  universal.POST,
			ContentType: universal.ApplicationJSON,
		},
		&payload,
	)
	if err != nil {
		return nil, err
	}
	data, ok := resp.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("volcengine %s returned %T", action, resp)
	}
	return data, nil
}

func stringFromMap(data map[string]any, key string) string {
	if value, ok := data[key].(string); ok {
		return value
	}
	return ""
}
```

- [ ] **Step 3: Add service functions**

In `service/volcengine_assets.go`, add:

```go
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
	groupID = strings.TrimSpace(groupID)
	if groupID == "" {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			groupName = firstNonEmpty(strings.TrimSpace(assetTitle), "我的素材")
		}
		groupID, err = activeVolcengineAssetClient.CreateAssetGroup(ctx, setting, groupName, "来自无限画布我的素材")
		if err != nil {
			return VolcengineAssetSubmission{}, err
		}
	}
	assetID, err := activeVolcengineAssetClient.CreateAsset(ctx, setting, groupID, imageFile.PublicURL, assetTitle)
	if err != nil {
		return VolcengineAssetSubmission{}, err
	}
	if assetID == "" {
		return VolcengineAssetSubmission{}, errors.New("火山接口没有返回素材 ID")
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
	return activeVolcengineAssetClient.GetAsset(ctx, setting, assetID, projectName)
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
	if strings.TrimSpace(setting.AccessKey) == "" || strings.TrimSpace(setting.SecretKey) == "" {
		return model.VolcengineAssetSetting{}, safeMessageError{message: "请先配置火山 AK/SK"}
	}
	if strings.TrimSpace(setting.PublicAssetBaseURL) == "" {
		return model.VolcengineAssetSetting{}, safeMessageError{message: "请先配置公网素材访问地址"}
	}
	return setting, nil
}
```

Ensure `service/volcengine_assets.go` imports `github.com/basketikun/infinite-canvas/repository`.

- [ ] **Step 4: Add fake-client service tests**

Append to `service/volcengine_assets_test.go`:

```go
type fakeVolcengineAssetClient struct {
	groupID string
	assetID string
	status  VolcengineAssetStatus
}

func (fake fakeVolcengineAssetClient) CreateAssetGroup(context.Context, model.VolcengineAssetSetting, string, string) (string, error) {
	return fake.groupID, nil
}

func (fake fakeVolcengineAssetClient) CreateAsset(context.Context, model.VolcengineAssetSetting, string, string, string) (string, error) {
	return fake.assetID, nil
}

func (fake fakeVolcengineAssetClient) GetAsset(context.Context, model.VolcengineAssetSetting, string, string) (VolcengineAssetStatus, error) {
	return fake.status, nil
}
```

Add imports to the test file:

```go
	"context"
	"path/filepath"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
```

Add a test that avoids global DB cross-talk by using a unique sqlite DSN:

```go
func TestSubmitVolcengineImageAssetCreatesGroupAndAsset(t *testing.T) {
	tmp := t.TempDir()
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(tmp, "test.db")
	config.Cfg.PublicAssetDir = filepath.Join(tmp, "public-assets")
	repository.ResetForTest()
	_, err := repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{
			VolcengineAsset: model.VolcengineAssetSetting{
				Enabled: true,
				AccessKey: "ak",
				SecretKey: "sk",
				ProjectName: "default",
				Region: "cn-beijing",
				PublicAssetBaseURL: "https://example.com/uploaded-assets",
			},
		},
	}, now())
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}
	previous := activeVolcengineAssetClient
	activeVolcengineAssetClient = fakeVolcengineAssetClient{groupID: "group-test", assetID: "asset-test"}
	t.Cleanup(func() { activeVolcengineAssetClient = previous })

	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 512, 768))
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	result, err := SubmitVolcengineImageAsset(context.Background(), testMultipartFile{Reader: bytes.NewReader(buf.Bytes())}, &multipart.FileHeader{Filename: "portrait.png", Size: int64(buf.Len())}, "头像", "", "角色组")
	if err != nil {
		t.Fatalf("SubmitVolcengineImageAsset returned error: %v", err)
	}
	if result.AssetID != "asset-test" || result.GroupID != "group-test" || result.Status != "Processing" {
		t.Fatalf("result = %#v", result)
	}
	if result.PublicURL == "" || !strings.HasPrefix(result.PublicURL, "https://example.com/uploaded-assets/images/") {
		t.Fatalf("public url = %q", result.PublicURL)
	}
}
```

Add missing test import `strings`.

- [ ] **Step 5: Add repository test reset helper**

In `repository/db.go`, add:

```go
func ResetForTest() {
	db = nil
	dbErr = nil
	dbOnce = sync.Once{}
}
```

- [ ] **Step 6: Add handlers**

Create `handler/volcengine_assets.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

type volcengineAssetStatusRequest struct {
	AssetID     string `json:"assetId"`
	ProjectName string `json:"projectName"`
}

func SubmitVolcengineImageAsset(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		Fail(w, "请选择图片文件")
		return
	}
	defer file.Close()
	result, err := service.SubmitVolcengineImageAsset(r.Context(), file, header, r.FormValue("assetTitle"), r.FormValue("groupId"), r.FormValue("groupName"))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func VolcengineAssetStatus(w http.ResponseWriter, r *http.Request) {
	var request volcengineAssetStatusRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.GetVolcengineAssetStatus(r.Context(), request.AssetID, request.ProjectName)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}
```

- [ ] **Step 7: Register routes**

In `router/router.go`, add these routes inside `v1 := api.Group("/v1", middleware.UserAuth)`:

```go
v1.POST("/volcengine/assets/image-review", gin.WrapF(handler.SubmitVolcengineImageAsset))
v1.POST("/volcengine/assets/status", gin.WrapF(handler.VolcengineAssetStatus))
```

- [ ] **Step 8: Run targeted backend tests**

Run:

```bash
go test ./service -run 'TestValidateVolcengineImage|TestSubmitVolcengineImageAsset'
```

Expected: tests pass.

- [ ] **Step 9: Commit backend flow task**

Run:

```bash
git add go.mod go.sum repository/db.go router/router.go handler/volcengine_assets.go service/volcengine_assets.go service/volcengine_assets_test.go
git commit -m "feat: submit images to volcengine assets"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Task 4: Frontend API And Metadata Types

**Files:**
- Modify: `web/src/services/api/request.ts`
- Create: `web/src/services/api/volcengine-assets.ts`
- Modify: `web/src/stores/use-asset-store.ts`

- [ ] **Step 1: Add form request helper**

In `web/src/services/api/request.ts`, add:

```ts
export async function apiPostForm<T>(url: string, form: FormData, token?: string) {
    return apiRequest<T>({
        url,
        method: "POST",
        data: form,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
}
```

No `Content-Type` header is set here; axios must set the multipart boundary.

- [ ] **Step 2: Create Volcengine asset API wrapper**

Create `web/src/services/api/volcengine-assets.ts`:

```ts
import { apiPost, apiPostForm } from "@/services/api/request";

export type VolcengineAssetStatusValue = "Processing" | "Active" | "Failed" | string;

export type VolcengineAssetSubmission = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: VolcengineAssetStatusValue;
    publicUrl: string;
    submittedAt: string;
    updatedAt: string;
};

export type VolcengineAssetStatus = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: VolcengineAssetStatusValue;
    publicUrl: string;
    assetType: string;
    updatedAt: string;
};

export async function submitVolcengineImageAsset(token: string, payload: { file: Blob; filename: string; assetTitle: string; groupId?: string; groupName?: string }) {
    const form = new FormData();
    form.append("file", payload.file, payload.filename);
    form.append("assetTitle", payload.assetTitle);
    if (payload.groupId) form.append("groupId", payload.groupId);
    if (payload.groupName) form.append("groupName", payload.groupName);
    return apiPostForm<VolcengineAssetSubmission>("/api/v1/volcengine/assets/image-review", form, token);
}

export async function fetchVolcengineAssetStatus(token: string, payload: { assetId: string; projectName?: string }) {
    return apiPost<VolcengineAssetStatus>("/api/v1/volcengine/assets/status", payload, token);
}
```

- [ ] **Step 3: Type asset metadata**

In `web/src/stores/use-asset-store.ts`, export:

```ts
export type VolcengineAssetMetadata = {
    assetId: string;
    groupId: string;
    projectName: string;
    status: "Processing" | "Active" | "Failed" | string;
    publicUrl: string;
    submittedAt: string;
    updatedAt: string;
};
```

Change `metadata` in `AssetBase`:

```ts
metadata?: Record<string, unknown> & { volcengineAsset?: VolcengineAssetMetadata };
```

- [ ] **Step 4: Commit frontend API task**

Run:

```bash
git add web/src/services/api/request.ts web/src/services/api/volcengine-assets.ts web/src/stores/use-asset-store.ts
git commit -m "feat: add volcengine asset frontend api"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Task 5: “我的素材” UI Integration

**Files:**
- Modify: `web/src/app/(user)/assets/page.tsx`

- [ ] **Step 1: Add imports**

In `web/src/app/(user)/assets/page.tsx`, update imports:

```tsx
import { CheckCircle, Copy, Download, PencilLine, RefreshCw, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
```

Add:

```tsx
import { getImageBlob } from "@/services/image-storage";
import { fetchVolcengineAssetStatus, submitVolcengineImageAsset } from "@/services/api/volcengine-assets";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
```

- [ ] **Step 2: Add state and config in `AssetsPage`**

Inside `AssetsPage`, add:

```tsx
const token = useUserStore((state) => state.token);
const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
const [reviewingAsset, setReviewingAsset] = useState<ImageAsset | null>(null);
const [reviewGroupName, setReviewGroupName] = useState("");
const [submittingReview, setSubmittingReview] = useState(false);
const [refreshingReviewId, setRefreshingReviewId] = useState<string | null>(null);
```

- [ ] **Step 3: Add submit and refresh handlers**

Inside `AssetsPage`, add:

```tsx
const openReviewDialog = (asset: Asset) => {
    if (asset.kind !== "image") return;
    setReviewingAsset(asset);
    setReviewGroupName(asset.title || "我的素材");
};

const submitImageReview = async () => {
    if (!reviewingAsset) return;
    if (!token) {
        message.error("请先登录");
        return;
    }
    const blob = reviewingAsset.data.storageKey ? await getImageBlob(reviewingAsset.data.storageKey) : await (await fetch(reviewingAsset.data.dataUrl)).blob();
    if (!blob) {
        message.error("没有找到图片文件");
        return;
    }
    setSubmittingReview(true);
    try {
        const saved = reviewingAsset.metadata?.volcengineAsset;
        const result = await submitVolcengineImageAsset(token, {
            file: blob,
            filename: `${reviewingAsset.title || reviewingAsset.id}.${reviewingAsset.data.mimeType.split("/")[1] || "png"}`,
            assetTitle: reviewingAsset.title,
            groupId: saved?.groupId,
            groupName: reviewGroupName.trim() || reviewingAsset.title || "我的素材",
        });
        updateAsset(reviewingAsset.id, {
            metadata: {
                ...(reviewingAsset.metadata || {}),
                volcengineAsset: result,
            },
        });
        message.success("已提交火山审核");
        setReviewingAsset(null);
    } catch (error) {
        message.error(error instanceof Error ? error.message : "提交失败");
    } finally {
        setSubmittingReview(false);
    }
};

const refreshImageReview = async (asset: Asset) => {
    if (asset.kind !== "image" || !asset.metadata?.volcengineAsset?.assetId) return;
    if (!token) {
        message.error("请先登录");
        return;
    }
    setRefreshingReviewId(asset.id);
    try {
        const status = await fetchVolcengineAssetStatus(token, {
            assetId: asset.metadata.volcengineAsset.assetId,
            projectName: asset.metadata.volcengineAsset.projectName,
        });
        updateAsset(asset.id, {
            metadata: {
                ...(asset.metadata || {}),
                volcengineAsset: {
                    ...asset.metadata.volcengineAsset,
                    ...status,
                    publicUrl: status.publicUrl || asset.metadata.volcengineAsset.publicUrl,
                },
            },
        });
        message.success(`当前状态：${volcengineStatusLabel(status.status)}`);
    } catch (error) {
        message.error(error instanceof Error ? error.message : "刷新失败");
    } finally {
        setRefreshingReviewId(null);
    }
};
```

- [ ] **Step 4: Pass review props to cards and drawer**

Replace the `AssetCard` render call with:

```tsx
<AssetCard
    key={asset.id}
    asset={asset}
    volcengineAssetEnabled={volcengineAssetEnabled}
    refreshingReview={refreshingReviewId === asset.id}
    onOpen={() => setPreviewAsset(asset)}
    onEdit={() => openEdit(asset)}
    onCopy={copyAssetText}
    onDownload={downloadImage}
    onDelete={() => setDeletingAsset(asset)}
    onReview={() => openReviewDialog(asset)}
    onRefreshReview={() => void refreshImageReview(asset)}
/>
```

Replace the `AssetDrawer` render call with:

```tsx
<AssetDrawer
    asset={previewAsset}
    volcengineAssetEnabled={volcengineAssetEnabled}
    refreshingReview={previewAsset ? refreshingReviewId === previewAsset.id : false}
    onClose={() => setPreviewAsset(null)}
    onCopy={copyAssetText}
    onDownload={downloadImage}
    onReview={openReviewDialog}
    onRefreshReview={(asset) => void refreshImageReview(asset)}
/>
```

- [ ] **Step 5: Update `AssetCard` signature and actions**

Change `AssetCard` signature:

```tsx
function AssetCard({
    asset,
    volcengineAssetEnabled,
    refreshingReview,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    onReview,
    onRefreshReview,
}: {
    asset: Asset;
    volcengineAssetEnabled: boolean;
    refreshingReview: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    onReview: () => void;
    onRefreshReview: () => void;
}) {
```

Inside the card body after the type tag, add:

```tsx
{asset.kind === "image" && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
```

Inside the action row before delete, add:

```tsx
{asset.kind === "image" && volcengineAssetEnabled ? (
    asset.metadata?.volcengineAsset?.assetId ? (
        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={refreshingReview} onClick={onRefreshReview}>
            刷新
        </Button>
    ) : (
        <Button size="small" icon={<ShieldCheck className="size-3.5" />} onClick={onReview}>
            加白
        </Button>
    )
) : null}
```

- [ ] **Step 6: Update drawer actions**

Change `AssetDrawer` signature:

```tsx
function AssetDrawer({
    asset,
    volcengineAssetEnabled,
    refreshingReview,
    onClose,
    onCopy,
    onDownload,
    onReview,
    onRefreshReview,
}: {
    asset: Asset | null;
    volcengineAssetEnabled: boolean;
    refreshingReview: boolean;
    onClose: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onReview: (asset: Asset) => void;
    onRefreshReview: (asset: Asset) => void;
}) {
```

Inside the drawer metadata area, after the existing tags, add:

```tsx
{asset.kind === "image" && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
```

Inside the drawer action `<Space>`, add:

```tsx
{asset.kind === "image" && volcengineAssetEnabled ? (
    asset.metadata?.volcengineAsset?.assetId ? (
        <Button icon={<RefreshCw className="size-4" />} loading={refreshingReview} onClick={() => onRefreshReview(asset)}>
            刷新审核状态
        </Button>
    ) : (
        <Button icon={<ShieldCheck className="size-4" />} onClick={() => onReview(asset)}>
            提交加白
        </Button>
    )
) : null}
```

After the action `<Space>`, add:

```tsx
{asset.kind === "image" && asset.metadata?.volcengineAsset ? (
    <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
        <Typography.Text type="secondary" className="block text-xs">
            火山素材
        </Typography.Text>
        <Typography.Paragraph copyable className="!mb-0 !mt-2">
            {asset.metadata.volcengineAsset.assetId}
        </Typography.Paragraph>
        <Typography.Text type="secondary" className="block text-xs">
            素材组：{asset.metadata.volcengineAsset.groupId} · 项目：{asset.metadata.volcengineAsset.projectName}
        </Typography.Text>
    </div>
) : null}
```

- [ ] **Step 7: Add submit dialog**

Before the delete modal, add:

```tsx
<Modal
    title="提交火山人像加白"
    open={Boolean(reviewingAsset)}
    onCancel={() => setReviewingAsset(null)}
    onOk={() => void submitImageReview()}
    confirmLoading={submittingReview}
    okText="提交审核"
    cancelText="取消"
    destroyOnHidden
>
    <div className="space-y-4">
        <Typography.Paragraph type="secondary" className="!mb-0">
            仅提交你合法拥有并有权使用的虚拟人像素材。提交后素材会进入火山方舟私域虚拟人像素材资产库，状态变为 Active 后才可用于视频生成。
        </Typography.Paragraph>
        <Form layout="vertical" requiredMark={false}>
            <Form.Item label="素材组名称">
                <Input value={reviewGroupName} placeholder="我的素材" onChange={(event) => setReviewGroupName(event.target.value)} />
            </Form.Item>
        </Form>
        {reviewingAsset ? (
            <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
                <Typography.Text strong>{reviewingAsset.title}</Typography.Text>
                <Typography.Text type="secondary" className="block text-xs">
                    {reviewingAsset.data.width}x{reviewingAsset.data.height} · {formatBytes(reviewingAsset.data.bytes)}
                </Typography.Text>
            </div>
        ) : null}
    </div>
</Modal>
```

- [ ] **Step 8: Add status helpers**

At the bottom of `page.tsx`, add:

```tsx
function VolcengineAssetTag({ status }: { status: string }) {
    if (status === "Active")
        return (
            <Tag color="success" className="m-0 shrink-0 text-[11px]" icon={<CheckCircle className="size-3" />}>
                已加白
            </Tag>
        );
    if (status === "Failed")
        return (
            <Tag color="error" className="m-0 shrink-0 text-[11px]">
                审核失败
            </Tag>
        );
    return (
        <Tag color="processing" className="m-0 shrink-0 text-[11px]">
            审核中
        </Tag>
    );
}

function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}
```

- [ ] **Step 9: Run frontend type check command**

Run:

```bash
cd web && npm run lint
```

Expected in this project if no lint script exists: npm reports missing script. If lint exists, expected result is no new lint error from `assets/page.tsx`.

- [ ] **Step 10: Commit UI task**

Run:

```bash
git add 'web/src/app/(user)/assets/page.tsx'
git commit -m "feat: add asset review controls"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Task 6: Documentation And Verification

**Files:**
- Modify: `docs/pending-test.md`
- Optionally modify: `docs/todo.md` only if it already contains a matching todo item.

- [ ] **Step 1: Update pending test document**

Append this section to `docs/pending-test.md`:

```md
## 火山私域人像素材加白

- “我的素材”的图片素材支持提交到火山私域虚拟人像素材资产库。
- 后端会先把本地图片保存为公开静态文件，再使用后台配置的 AK/SK、ProjectName 调用火山素材接口。
- 图片素材详情中可查看火山 Asset ID、素材组 ID、ProjectName，并可手动刷新审核状态。
- 需要配置公网可访问的素材地址；本地开发地址无法被火山服务拉取。
```

- [ ] **Step 2: Check todo document**

Run:

```bash
rg -n "火山|加白|人像|素材审核|素材资产" docs/todo.md
```

Expected if no matching item exists: no output and exit code 1. If a matching item exists, move that exact item from `docs/todo.md` to the pending-test section above.

- [ ] **Step 3: Run targeted backend tests**

Run:

```bash
go test ./service -run 'TestValidateVolcengineImage|TestSubmitVolcengineImageAsset'
```

Expected: tests pass.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
cd web && npx tsc --noEmit
```

Expected: no TypeScript errors in touched files. If unrelated existing errors appear, record the first unrelated file path in the final handoff and do not refactor unrelated code.

- [ ] **Step 5: Commit documentation and verification task**

Run:

```bash
git add docs/pending-test.md docs/todo.md
git commit -m "docs: add volcengine asset review testing notes"
```

Expected in this extracted workspace: `fatal: not a git repository`. Expected in a Git clone: commit succeeds.

## Self-Review

Spec coverage:

- Backend-hosted public image URL: Task 2.
- AK/SK and ProjectName in private backend config: Task 1.
- Fire `CreateAssetGroup`, `CreateAsset`, and `GetAsset`: Task 3.
- “我的素材” image submission and manual refresh UI: Task 5.
- Metadata storage in local asset: Task 4 and Task 5.
- Documentation update: Task 6.

Placeholder scan:

- The plan contains no placeholder markers or deferred-implementation wording.
- Every code-changing step includes the concrete snippet to add or replace.

Type consistency:

- Go config type is `model.VolcengineAssetSetting`.
- Public frontend type is `AdminPublicVolcengineAssetSettings`.
- Private frontend type is `AdminPrivateVolcengineAssetSettings`.
- Local asset metadata key is `metadata.volcengineAsset`.
- API response fields use `assetId`, `groupId`, `projectName`, `status`, `publicUrl`, `submittedAt`, and `updatedAt`.
