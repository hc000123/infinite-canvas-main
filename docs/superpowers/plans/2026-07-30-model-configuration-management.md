# 简化模型配置管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将厂商连接与模型部署分离，建立管理员专属的四步配置流程、先测试后发布门禁、按稳定部署 ID 路由的公开模型目录，并让普通用户只选择已发布模型。

**Architecture:** 厂商连接、模型部署和三类默认部署继续保存在 `SettingKeyPrivate` 的 JSON 中，公开目录从私有配置派生，不新增业务表，也不保留旧渠道字段兼容。后端以部署 ID 为唯一运行时路由身份，适配器注册表负责请求路径和入口校验；前端只消费安全目录中的部署 ID、类型和请求模式，管理员通过专用接口而不是整份设置提交来管理模型。

**Tech Stack:** Go 1.24、Gin、GORM、标准库 `net/http` / `encoding/json` / `crypto/sha256`，Next.js App Router、React、TypeScript、Ant Design、Zustand、Node test runner。

---

## 实施前约束

- 以 `docs/superpowers/specs/2026-07-30-model-configuration-management-design.md` 为产品真相。
- 工作区当前有未提交的模型测试修复和其他用户改动；每次提交只暂存任务列出的文件，禁止使用 `git add .`。
- 不保留 `private.channels`、公开 `availableModels`、模型来源、协议、能力和文本端点字段的兼容读取；项目未上线，不写迁移或回退分支。
- 算力点的数值、文本按次、图片按张、视频按秒、预扣与失败返还算法不变，只把配置关联键换成 `deploymentId`。
- 不做厂商价格同步，不做同名模型静默 fallback，不开放普通用户编辑厂商连接。
- 图片和视频的真实模型测试必须由前端先显示费用风险确认；后端仍执行完整发布门禁，不能信任前端状态。

## 文件结构

### 新建文件

- `model/model_config.go`：厂商连接、模型部署、公开目录、发现候选、枚举和管理请求/响应结构。
- `service/model_presets.go`：厂商预设、内置候选和四级分类规则。
- `service/model_adapter.go`：适配器注册表、入口/协议校验、上游路径和配置指纹。
- `service/model_adapter_test.go`：适配器路径、协议、类型和指纹测试。
- `service/model_config.go`：专用配置服务、连接检查、发现、导入、CRUD、发布/默认/删除门禁、公开目录派生。
- `service/model_config_test.go`：模型配置核心状态机与安全输出测试。
- `handler/model_config.go`：严格解码管理接口，handler 只负责入参、service 调用和统一响应。
- `handler/model_config_test.go`：鉴权路由、请求上限、未知字段和响应脱敏测试。
- `repository/model_config_reference.go`：只负责查询部署/厂商是否被 Agent Run、Invocation Attempt 或 AI Task 历史引用。
- `web/src/services/api/model-catalog.ts`：普通用户可读的公开模型目录类型和请求。
- `web/src/services/api/admin-model-config.ts`：管理员模型配置 API 和 TypeScript 类型。
- `web/src/app/(admin)/admin/settings/model-config-model.ts`：向导纯状态、候选筛选、步骤门禁和测试费用判断。
- `web/src/app/(admin)/admin/settings/model-config-model.test.mts`：管理员模型配置纯逻辑测试。
- `web/src/app/(admin)/admin/settings/use-model-configuration.ts`：页面私有查询、保存和动作 hook。
- `web/src/app/(admin)/admin/settings/components/model-provider-wizard.tsx`：四步添加厂商向导。
- `web/src/app/(admin)/admin/settings/components/model-deployment-list.tsx`：文本/图片/视频分栏与厂商分组列表。
- `web/src/app/(admin)/admin/settings/components/model-deployment-editor.tsx`：部署高级配置抽屉。

### 修改文件

- `model/setting.go:19-139`：删除旧模型渠道结构，将私有模型配置和公开目录接入 `Settings`。
- `service/settings.go:20-940`：保留非模型设置逻辑，移除旧渠道归一化/选择逻辑，整份设置保存时保护专用模型配置。
- `service/settings_test.go:1-640`：删除旧渠道行为断言，保留非模型设置测试并增加专用配置保护测试。
- `handler/settings.go:1-80`：移除旧渠道发现/测试 handler，整份设置接口不再维护模型。
- `router/router.go:28,290-294`：注册公开目录和管理员模型配置路由，删除旧渠道动作路由。
- `handler/ai.go:138-255`、`handler/ai_test.go`：代理请求按部署 ID 解析、校验入口、重写上游模型并记录快照。
- `service/agent_run.go:39-340`、`service/agent_run_executor.go:45-130,300-360`：Invocation/Agent Run 冻结部署快照并按适配器执行。
- `service/invocation_contracts.go:32-58`、`service/invocation_preflight.go:480-540`、`service/invocation_runner.go:120-255`：执行策略从模型名/渠道改为部署快照。
- `web/src/services/api/admin.ts:489-616`：移除旧渠道 API，只保留非模型设置类型并引用新配置类型。
- `web/src/stores/use-config-store.ts:19-380`：用公开部署目录构建三类模型、默认值、算力点和请求模式。
- `web/src/components/model-picker.tsx:1-100`、`web/src/components/model-picker-options.ts:1-95`：picker 值改为部署 ID，标签显示模型和厂商。
- `web/src/services/api/image.ts:1-260`、`web/src/services/api/video.ts:1-260`、`web/src/services/api/ai-channel-boundary.ts:1-180`：从目录请求模式选择入口，不再根据模型名称猜测。
- `web/src/app/(admin)/admin/settings/page.tsx:1-1669`：用新的模型管理区替换旧渠道/公开模型编辑器，保留认证、素材和提示词同步设置。
- `web/src/app/(admin)/admin/settings/model-channel-presets.ts`、`model-channel-presets.test.mts`、`components/provider-preset-modal.tsx`：完成新向导后删除，预设真相迁到后端。
- `docs/api-response.md`、`docs/pending-test.md`、`docs/todo.md`、`CHANGELOG.md`：记录新接口和待验收变更；不修改 `docs/backend-database.md`。

## 统一数据契约

实现过程中统一使用以下名称，后续任务不得重新命名：

```go
// 私有路由身份
ProviderConnection.ID
ModelDeployment.ID
ModelDeployment.ProviderConnectionID
ModelDeployment.UpstreamModelID
ModelDeployment.Kind
ModelDeployment.Adapter

// 公开请求身份
PublishedModelDeployment.DeploymentID
PublishedModelDeployment.RequestMode
ModelCost.DeploymentID

// 历史字段复用，避免新增数据库列
AgentRun.Model        // deployment ID
AgentRun.TargetModel  // upstream model ID snapshot
AgentRun.ChannelID    // provider connection ID snapshot
InvocationAttempt.Model     // deployment ID
InvocationAttempt.ChannelID // provider connection ID
AITask.Model          // deployment ID
```

公开 `requestMode` 只允许 `text_chat`、`text_responses`、`image_generation`、`image_chat`、`video_task`；它是前端构造请求所需的安全模式，不返回 Base URL、API Key、完整适配器配置或测试错误。

### Task 1: 建立模型配置领域类型与设置存储

**Files:**
- Create: `model/model_config.go`
- Modify: `model/setting.go:19-139`
- Modify: `service/settings.go:20-940`
- Test: `service/model_config_test.go`
- Test: `service/settings_test.go`

- [ ] **Step 1: 写私有结构归一化和公开目录为空的失败测试**

```go
func TestNormalizeModelConfigurationInitializesCollectionsAndDefaults(t *testing.T) {
	got := normalizeModelConfiguration(model.PrivateModelConfiguration{})
	if got.Providers == nil || got.Deployments == nil {
		t.Fatalf("collections must be non-nil: %#v", got)
	}
	if got.Defaults != (model.ModelDeploymentDefaults{}) {
		t.Fatalf("defaults=%#v", got.Defaults)
	}
}

func TestSaveSettingsPreservesDedicatedModelConfiguration(t *testing.T) {
	saved := model.PrivateModelConfiguration{Providers: []model.ProviderConnection{{ID: "provider-1", Name: "Provider", Enabled: true}}}
	seedSettings(t, model.Settings{Private: model.PrivateSetting{ModelConfiguration: saved}})
	_, err := SaveSettings(model.Settings{Public: model.PublicSetting{Auth: model.PublicAuthSetting{}}})
	if err != nil { t.Fatal(err) }
	got, _ := repository.GetSettings()
	if !reflect.DeepEqual(got.Private.ModelConfiguration, saved) {
		t.Fatalf("model configuration overwritten: %#v", got.Private.ModelConfiguration)
	}
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run 'TestNormalizeModelConfiguration|TestSaveSettingsPreservesDedicatedModelConfiguration' -count=1`

Expected: FAIL，提示 `PrivateModelConfiguration` 或 `normalizeModelConfiguration` 未定义。

- [ ] **Step 3: 添加领域类型并替换旧设置字段**

```go
type ModelKind string
type ModelAdapter string
type ModelRequestMode string
type ModelTestStatus string
type ConnectionCheckStatus string

const (
	ModelKindText ModelKind = "text"
	ModelKindImage ModelKind = "image"
	ModelKindVideo ModelKind = "video"
	ModelAdapterChatCompletions ModelAdapter = "chat_completions"
	ModelAdapterResponses ModelAdapter = "responses"
	ModelAdapterImagesGenerations ModelAdapter = "images_generations"
	ModelAdapterGeminiChatImage ModelAdapter = "gemini_chat_image"
	ModelAdapterVolcengineArkVideo ModelAdapter = "volcengine_ark_video"
	ModelAdapterJimengCLIVideo ModelAdapter = "jimeng_cli_video"
	ModelAdapterXinglianCloudVideo ModelAdapter = "xinglian_cloud_video"
	ModelTestUntested ModelTestStatus = "untested"
	ModelTestPassed ModelTestStatus = "passed"
	ModelTestFailed ModelTestStatus = "failed"
	ConnectionCheckUnchecked ConnectionCheckStatus = "unchecked"
	ConnectionCheckPassed ConnectionCheckStatus = "passed"
	ConnectionCheckFailed ConnectionCheckStatus = "failed"
	ModelRequestTextChat ModelRequestMode = "text_chat"
	ModelRequestTextResponses ModelRequestMode = "text_responses"
	ModelRequestImageGeneration ModelRequestMode = "image_generation"
	ModelRequestImageChat ModelRequestMode = "image_chat"
	ModelRequestVideoTask ModelRequestMode = "video_task"
)

type ProviderConnection struct {
	ID string `json:"id"`
	Name string `json:"name"`
	PresetID string `json:"presetId"`
	Protocol ModelProtocol `json:"protocol"`
	BaseURL string `json:"baseUrl"`
	APIKey string `json:"apiKey"`
	APIKeyConfigured bool `json:"apiKeyConfigured"`
	Enabled bool `json:"enabled"`
	CredentialRevision int `json:"credentialRevision"`
	ConnectionStatus ConnectionCheckStatus `json:"connectionStatus"`
	ConnectionCheckedAt string `json:"connectionCheckedAt"`
	ConnectionError string `json:"connectionError"`
	CLIPath string `json:"cliPath"`
	WorkDir string `json:"workDir"`
	OutputDir string `json:"outputDir"`
	SessionID int `json:"sessionId"`
}

type ModelDeployment struct {
	ID string `json:"id"`
	ProviderConnectionID string `json:"providerConnectionId"`
	UpstreamModelID string `json:"upstreamModelId"`
	DisplayName string `json:"displayName"`
	Kind ModelKind `json:"kind"`
	Adapter ModelAdapter `json:"adapter"`
	Capabilities []string `json:"capabilities"`
	EndpointID string `json:"endpointId"`
	TimeoutSeconds int `json:"timeoutSeconds"`
	ConcurrencyLimit int `json:"concurrencyLimit"`
	Enabled bool `json:"enabled"`
	TestStatus ModelTestStatus `json:"testStatus"`
	TestedAt string `json:"testedAt"`
	TestError string `json:"testError"`
	TestedFingerprint string `json:"testedFingerprint"`
	Published bool `json:"published"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type ModelDeploymentDefaults struct {
	TextDeploymentID string `json:"textDeploymentId"`
	ImageDeploymentID string `json:"imageDeploymentId"`
	VideoDeploymentID string `json:"videoDeploymentId"`
}

type ProviderConnectionInput struct {
	Name string `json:"name"`
	PresetID string `json:"presetId"`
	Protocol ModelProtocol `json:"protocol"`
	BaseURL string `json:"baseUrl"`
	APIKey string `json:"apiKey"`
	CLIPath string `json:"cliPath"`
	WorkDir string `json:"workDir"`
	OutputDir string `json:"outputDir"`
	SessionID int `json:"sessionId"`
}
type ProviderConnectionPatch struct {
	Name *string `json:"name"`
	BaseURL *string `json:"baseUrl"`
	APIKey *string `json:"apiKey"`
	CLIPath *string `json:"cliPath"`
	WorkDir *string `json:"workDir"`
	OutputDir *string `json:"outputDir"`
	SessionID *int `json:"sessionId"`
}
type ModelDeploymentInput struct {
	UpstreamModelID string `json:"upstreamModelId"`
	DisplayName string `json:"displayName"`
	Kind ModelKind `json:"kind"`
	Adapter ModelAdapter `json:"adapter"`
	Capabilities []string `json:"capabilities"`
	EndpointID string `json:"endpointId"`
	TimeoutSeconds int `json:"timeoutSeconds"`
	ConcurrencyLimit int `json:"concurrencyLimit"`
}
type ModelDeploymentPatch struct {
	UpstreamModelID *string `json:"upstreamModelId"`
	DisplayName *string `json:"displayName"`
	Kind *ModelKind `json:"kind"`
	Adapter *ModelAdapter `json:"adapter"`
	Capabilities *[]string `json:"capabilities"`
	EndpointID *string `json:"endpointId"`
	TimeoutSeconds *int `json:"timeoutSeconds"`
	ConcurrencyLimit *int `json:"concurrencyLimit"`
}
type ImportProviderInput struct {
	Provider ProviderConnectionInput `json:"provider"`
	Deployments []ModelDeploymentInput `json:"deployments"`
}
type DiscoveredModelCandidate struct {
	UpstreamModelID string `json:"upstreamModelId"`
	DisplayName string `json:"displayName"`
	Kind ModelKind `json:"kind"`
	Adapter ModelAdapter `json:"adapter"`
	AllowedAdapters []ModelAdapter `json:"allowedAdapters"`
	Confidence string `json:"confidence"`
	ClassificationSource string `json:"classificationSource"`
	Verified bool `json:"verified"`
	Selected bool `json:"selected"`
}

type PrivateModelConfiguration struct {
	Providers []ProviderConnection `json:"providers"`
	Deployments []ModelDeployment `json:"deployments"`
	Defaults ModelDeploymentDefaults `json:"defaults"`
}

type ModelCost struct { DeploymentID string `json:"deploymentId"`; Credits int `json:"credits"` }
type PublishedModelDeployment struct {
	DeploymentID string `json:"deploymentId"`
	DisplayName string `json:"displayName"`
	UpstreamModelID string `json:"upstreamModelId"`
	ProviderName string `json:"providerName"`
	Kind ModelKind `json:"kind"`
	RequestMode ModelRequestMode `json:"requestMode"`
	Capabilities []string `json:"capabilities"`
	Credits int `json:"credits"`
	Default bool `json:"default"`
}
type PublicModelCatalog struct {
	Deployments []PublishedModelDeployment `json:"deployments"`
	Defaults ModelDeploymentDefaults `json:"defaults"`
	Costs []ModelCost `json:"costs"`
	SystemPrompt string `json:"systemPrompt"`
}
type ProviderPresetSummary struct { ID string `json:"id"`; Name string `json:"name"`; Description string `json:"description"`; Protocol ModelProtocol `json:"protocol"`; DefaultBaseURL string `json:"defaultBaseUrl"` }
type ModelDiscoveryResult struct { Candidates []DiscoveredModelCandidate `json:"candidates"`; Source string `json:"source"`; Warning string `json:"warning"` }
type ModelConfigurationAdminView struct { Providers []ProviderConnection `json:"providers"`; Deployments []ModelDeployment `json:"deployments"`; Defaults ModelDeploymentDefaults `json:"defaults"`; Costs []ModelCost `json:"costs"`; Presets []ProviderPresetSummary `json:"presets"` }
type ImportProviderResult struct { Provider ProviderConnection `json:"provider"`; Deployments []ModelDeployment `json:"deployments"` }
type ModelCostPatch struct { Credits int `json:"credits"` }
```

保留现有 `ModelProtocol` 及四个协议常量（可从 `model/setting.go` 移到 `model/model_config.go`），只删除旧渠道结构。在 `PrivateSetting` 中用 `ModelConfiguration PrivateModelConfiguration json:"modelConfiguration"` 替换 `Channels`；在 `PublicSetting` 中用 `ModelCatalog PublicModelCatalog json:"modelCatalog"` 替换 `ModelChannel`。`normalizeModelConfiguration` 只补空数组、去空格和安全默认值；`SaveSettings` 从已保存设置复制 `Private.ModelConfiguration` 和 `Public.ModelCatalog`，使整份设置接口无法覆盖专用模型配置。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestNormalizeModelConfiguration|TestSaveSettingsPreservesDedicatedModelConfiguration' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交领域结构**

```bash
git add model/model_config.go model/setting.go service/settings.go service/model_config_test.go service/settings_test.go
git commit -m "refactor: define model configuration domain"
```

### Task 2: 建立后端厂商预设、发现与四级分类

**Files:**
- Create: `service/model_presets.go`
- Modify: `model/model_config.go`
- Modify: `service/model_config.go`
- Test: `service/model_config_test.go`

- [ ] **Step 1: 写发现不持久化、默认零选择和分类优先级测试**

```go
func TestDiscoverModelsReturnsUncheckedCandidatesWithoutPersisting(t *testing.T) {
	client := fakeModelDiscoveryClient{models: []upstreamModel{{ID: "gpt-image-2-all", Kind: "text"}, {ID: "unknown-x"}}}
	result, err := discoverProviderModels(context.Background(), model.ProviderConnectionInput{PresetID: "comfly", Protocol: model.ModelProtocolOpenAI}, client)
	if err != nil { t.Fatal(err) }
	if len(result.Candidates) != 2 || result.Candidates[0].Selected || result.Candidates[1].Selected {
		t.Fatalf("candidates=%#v", result.Candidates)
	}
	settings, _ := repository.GetSettings()
	if len(settings.Private.ModelConfiguration.Providers) != 0 || len(settings.Private.ModelConfiguration.Deployments) != 0 {
		t.Fatalf("discovery persisted data: %#v", settings.Private.ModelConfiguration)
	}
	if result.Candidates[0].Kind != model.ModelKindImage || result.Candidates[0].Adapter != model.ModelAdapterImagesGenerations || result.Candidates[0].ClassificationSource != "preset_exact" {
		t.Fatalf("preset must win over upstream metadata: %#v", result.Candidates[0])
	}
	if result.Candidates[1].ClassificationSource != "unconfirmed" { t.Fatalf("candidate=%#v", result.Candidates[1]) }
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run TestDiscoverModelsReturnsUncheckedCandidatesWithoutPersisting -count=1`

Expected: FAIL，提示发现输入、候选或预设规则未定义。

- [ ] **Step 3: 实现预设、候选和分类管线**

```go
func classifyCandidate(preset providerPreset, upstream upstreamModel) model.DiscoveredModelCandidate {
	if rule, ok := preset.ExactModels[upstream.ID]; ok { return rule.candidate(upstream.ID, "preset_exact", true) }
	if kind, adapter, ok := classificationFromMetadata(upstream); ok { return classifiedCandidate(upstream.ID, kind, adapter, "upstream_metadata", "high", true) }
	if kind, adapter, ok := knownModelClassification(upstream.ID); ok { return classifiedCandidate(upstream.ID, kind, adapter, "known_name_rule", "medium", true) }
	return model.DiscoveredModelCandidate{UpstreamModelID: upstream.ID, DisplayName: upstream.ID, AllowedAdapters: allAdapters(), ClassificationSource: "unconfirmed", Confidence: "none", Verified: true, Selected: false}
}
```

预设至少定义 `volcengine`、`xinglian`、`jimeng`、`comfly`、`openai-compatible`；内置规则必须精确覆盖 Responses 文本、GPT Image、Gemini chat image 和现有三类视频协议。发现接口不可用但连接成功时返回预设候选；手工添加候选使用 `Verified:false`，仍然 `Selected:false`。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestDiscoverModels|TestClassifyCandidate' -count=1`

Expected: PASS，且测试覆盖 `preset_exact > upstream_metadata > known_name_rule > unconfirmed`。

- [ ] **Step 5: 提交发现与分类**

```bash
git add model/model_config.go service/model_presets.go service/model_config.go service/model_config_test.go
git commit -m "feat: add provider discovery classification"
```

### Task 3: 实现厂商连接检查、原子导入和凭证安全更新

**Files:**
- Modify: `model/model_config.go`
- Modify: `service/model_config.go`
- Test: `service/model_config_test.go`

- [ ] **Step 1: 写连接检查、原子导入、脱敏和 Key 轮换测试**

```go
func TestImportProviderCreatesOnlySelectedUntestedUnpublishedDeployments(t *testing.T) {
	input := model.ImportProviderInput{
		Provider: model.ProviderConnectionInput{Name: "Comfly", PresetID: "comfly", Protocol: model.ModelProtocolOpenAI, BaseURL: "https://ai.example/v1", APIKey: "sk-new"},
		Deployments: []model.ModelDeploymentInput{{UpstreamModelID: "text-a", DisplayName: "Text A", Kind: model.ModelKindText, Adapter: model.ModelAdapterResponses}},
	}
	result, err := importProvider(input, passingConnectionChecker{})
	if err != nil { t.Fatal(err) }
	if result.Provider.APIKey != maskedAPIKey || !result.Provider.APIKeyConfigured { t.Fatalf("provider=%#v", result.Provider) }
	if len(result.Deployments) != 1 || result.Deployments[0].TestStatus != model.ModelTestUntested || result.Deployments[0].Published { t.Fatalf("deployments=%#v", result.Deployments) }
	if result.Deployments[0].ID == "" || result.Deployments[0].ProviderConnectionID != result.Provider.ID { t.Fatalf("ids not linked") }
}

func TestRotateProviderKeyChecksBeforeReplacingAndKeepsPublishedModels(t *testing.T) {
	seedPublishedDeployment(t)
	err := updateProvider("provider-1", model.ProviderConnectionPatch{APIKey: "bad-key"}, failingConnectionChecker{})
	if err == nil { t.Fatal("expected check failure") }
	assertStoredProviderKey(t, "provider-1", "old-key")
	updated, err := updateProvider("provider-1", model.ProviderConnectionPatch{APIKey: "good-key"}, passingConnectionChecker{})
	if err != nil { t.Fatal(err) }
	if updated.CredentialRevision != 2 { t.Fatalf("revision=%d", updated.CredentialRevision) }
	assertDeploymentPublished(t, "deployment-1", true)
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run 'TestImportProvider|TestRotateProviderKey' -count=1`

Expected: FAIL，提示导入和更新服务未定义。

- [ ] **Step 3: 实现管理写入边界**

```go
func ImportProvider(ctx context.Context, input model.ImportProviderInput) (model.ImportProviderResult, error) {
	if err := validateSelectedDeployments(input.Deployments); err != nil { return model.ImportProviderResult{}, err }
	checked, err := checkProviderConnection(ctx, input.Provider)
	if err != nil { return model.ImportProviderResult{}, err }
	settings, err := repository.GetSettings()
	if err != nil { return model.ImportProviderResult{}, err }
	config := normalizeModelConfiguration(settings.Private.ModelConfiguration)
	provider := newProviderConnection(input.Provider, checked)
	config.Providers = append(config.Providers, provider)
	created := make([]model.ModelDeployment, 0, len(input.Deployments))
	for _, selected := range input.Deployments {
		deployment := newUntestedDeployment(provider.ID, selected)
		config.Deployments = append(config.Deployments, deployment)
		created = append(created, deployment)
	}
	settings.Private.ModelConfiguration = config
	settings.Public.ModelCatalog = derivePublicModelCatalog(settings)
	if _, err := repository.SaveSettings(settings, now()); err != nil { return model.ImportProviderResult{}, err }
	return model.ImportProviderResult{Provider: safeProviderConnection(provider), Deployments: created}, nil
}
```

必须同时实现 `AdminModelConfiguration`、`CheckProviderConnection`、`DiscoverProviderModels`、`UpdateProvider`、`SetProviderEnabled`、`DeleteProvider`。管理响应始终把 Key 替换为 `********` 并设置 `apiKeyConfigured`；PATCH 未提供 Key 或提供遮罩值时保留旧 Key。Key 轮换先检查后落盘、修订号加一，不改变部署路由指纹，不取消已发布状态。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestImportProvider|TestRotateProviderKey|TestAdminModelConfigurationMasksSecrets' -count=1`

Expected: PASS，失败检查不会覆盖原凭证。

- [ ] **Step 5: 提交厂商管理服务**

```bash
git add model/model_config.go service/model_config.go service/model_config_test.go
git commit -m "feat: manage provider connections safely"
```

### Task 4: 建立适配器注册表、测试请求和路由指纹

**Files:**
- Create: `service/model_adapter.go`
- Create: `service/model_adapter_test.go`
- Modify: `service/model_config.go`

- [ ] **Step 1: 写适配器路径、入口匹配和指纹稳定性失败测试**

```go
func TestModelAdapterDefinitions(t *testing.T) {
	tests := []struct{ adapter model.ModelAdapter; kind model.ModelKind; path, mode string; billable bool }{
		{model.ModelAdapterChatCompletions, model.ModelKindText, "/chat/completions", "text_chat", false},
		{model.ModelAdapterResponses, model.ModelKindText, "/responses", "text_responses", false},
		{model.ModelAdapterImagesGenerations, model.ModelKindImage, "/images/generations", "image_generation", true},
		{model.ModelAdapterGeminiChatImage, model.ModelKindImage, "/chat/completions", "image_chat", true},
		{model.ModelAdapterVolcengineArkVideo, model.ModelKindVideo, "/contents/generations/tasks", "video_task", true},
	}
	for _, tt := range tests {
		got, err := modelAdapterDefinition(tt.adapter)
		if err != nil || got.Kind != tt.kind || got.Path != tt.path || got.RequestMode != tt.mode || got.BillableTest != tt.billable { t.Fatalf("%s: %#v %v", tt.adapter, got, err) }
	}
}

func TestDeploymentFingerprintIgnoresCredentialRotationButChangesCriticalRoute(t *testing.T) {
	provider := model.ProviderConnection{ID: "p", BaseURL: "https://one.example/v1", CredentialRevision: 1}
	deployment := model.ModelDeployment{UpstreamModelID: "m", Kind: model.ModelKindImage, Adapter: model.ModelAdapterImagesGenerations, EndpointID: "ep"}
	first := deploymentFingerprint(provider, deployment)
	provider.CredentialRevision = 2
	if deploymentFingerprint(provider, deployment) != first { t.Fatal("credential revision changed route fingerprint") }
	deployment.EndpointID = "ep-2"
	if deploymentFingerprint(provider, deployment) == first { t.Fatal("endpoint must change fingerprint") }
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run 'TestModelAdapterDefinitions|TestDeploymentFingerprint' -count=1`

Expected: FAIL，提示适配器注册表和指纹函数未定义。

- [ ] **Step 3: 实现注册表和显式模型测试**

```go
type modelAdapterSpec struct {
	Adapter model.ModelAdapter
	Kind model.ModelKind
	Protocols map[model.ModelProtocol]bool
	Path string
	RequestMode string
	BillableTest bool
}

func deploymentFingerprint(provider model.ProviderConnection, deployment model.ModelDeployment) string {
	parts := []string{strings.TrimRight(provider.BaseURL, "/"), string(provider.Protocol), deployment.UpstreamModelID, string(deployment.Kind), string(deployment.Adapter), deployment.EndpointID}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\n")))
	return hex.EncodeToString(sum[:])
}

func TestModelDeployment(ctx context.Context, id string) (model.ModelDeployment, error) {
	provider, deployment, settings, err := privateDeploymentByID(id)
	if err != nil { return model.ModelDeployment{}, err }
	spec, err := validateDeploymentAdapter(provider, deployment)
	if err != nil { return model.ModelDeployment{}, err }
	err = executeMinimumAdapterTest(ctx, provider, deployment, spec)
	deployment.TestedAt = now()
	deployment.TestedFingerprint = deploymentFingerprint(provider, deployment)
	if err != nil { deployment.TestStatus, deployment.TestError = model.ModelTestFailed, safeUpstreamError(err) } else { deployment.TestStatus, deployment.TestError = model.ModelTestPassed, "" }
	settings.Private.ModelConfiguration = replaceDeployment(settings.Private.ModelConfiguration, deployment)
	_, saveErr := repository.SaveSettings(settings, now())
	if saveErr != nil { return model.ModelDeployment{}, saveErr }
	return deployment, err
}
```

`executeMinimumAdapterTest` 必须分别构造 Chat Completions、Responses、Images Generations、Gemini 图片 Chat、Ark 视频、Jimeng CLI 和 Xinglian 视频的最小请求；失败只保存脱敏短摘要，不保存请求凭证或媒体响应。协议/类型/适配器不匹配必须在发请求前拒绝。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestModelAdapter|TestDeploymentFingerprint|TestModelDeploymentUses' -count=1`

Expected: PASS，Responses 命中 `/responses`，GPT Image 命中 `/images/generations`，Gemini 图片命中 `/chat/completions`。

- [ ] **Step 5: 提交适配器注册表**

```bash
git add service/model_adapter.go service/model_adapter_test.go service/model_config.go
git commit -m "feat: route model tests by adapter"
```

### Task 5: 实现部署编辑、发布、默认值和删除门禁

**Files:**
- Create: `repository/model_config_reference.go`
- Modify: `service/model_config.go`
- Modify: `service/model_config_test.go`

- [ ] **Step 1: 写关键配置失效、发布门禁、单默认和删除引用测试**

```go
func TestCriticalDeploymentEditInvalidatesTestAndUnpublishes(t *testing.T) {
	seedPublishedDeployment(t)
	got, err := UpdateModelDeployment("deployment-1", model.ModelDeploymentPatch{Adapter: ptr(model.ModelAdapterGeminiChatImage)})
	if err != nil { t.Fatal(err) }
	if got.Published || got.TestStatus != model.ModelTestUntested || got.TestedFingerprint != "" { t.Fatalf("deployment=%#v", got) }
}

func TestPublishAndDefaultGates(t *testing.T) {
	seedUntestedDeployment(t, "deployment-1", model.ModelKindText)
	if _, err := PublishModelDeployment("deployment-1"); err == nil { t.Fatal("untested deployment published") }
	markDeploymentTestPassed(t, "deployment-1")
	if _, err := SetDefaultModelDeployment(model.ModelKindText, "deployment-1"); err == nil { t.Fatal("unpublished default accepted") }
	published, err := PublishModelDeployment("deployment-1")
	if err != nil || !published.Published { t.Fatalf("published=%#v err=%v", published, err) }
	if _, err := SetDefaultModelDeployment(model.ModelKindText, "deployment-1"); err != nil { t.Fatal(err) }
	if _, err := UnpublishModelDeployment("deployment-1"); err == nil { t.Fatal("current default was unpublished") }
}

func TestModelCostUsesDeploymentIDWithoutChangingCredits(t *testing.T) {
	seedUnpublishedDeployment(t, "deployment-1")
	if _, err := UpdateModelCost("deployment-1", model.ModelCostPatch{Credits: 12}); err != nil { t.Fatal(err) }
	if got, err := ModelCostByDeploymentID("deployment-1"); err != nil || got != 12 { t.Fatalf("credits=%d err=%v", got, err) }
}

func TestReferencedDeploymentCannotBeDeleted(t *testing.T) {
	seedUnpublishedDeployment(t, "deployment-1")
	seedAgentRunReference(t, "deployment-1")
	if err := DeleteModelDeployment("deployment-1"); err == nil { t.Fatal("referenced deployment deleted") }
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run 'TestCriticalDeploymentEdit|TestPublishAndDefaultGates|TestReferencedDeployment' -count=1`

Expected: FAIL，提示部署状态动作未定义。

- [ ] **Step 3: 实现部署状态机和公开目录派生**

```go
func canPublish(provider model.ProviderConnection, deployment model.ModelDeployment) bool {
	return provider.Enabled && deployment.Enabled && deployment.TestStatus == model.ModelTestPassed && deployment.TestedFingerprint != "" && deployment.TestedFingerprint == deploymentFingerprint(provider, deployment)
}

func derivePublicModelCatalog(settings model.Settings) model.PublicModelCatalog {
	config := normalizeModelConfiguration(settings.Private.ModelConfiguration)
	providers := providerMap(config.Providers)
	costs := normalizeModelCosts(settings.Public.ModelCatalog.Costs)
	items := make([]model.PublishedModelDeployment, 0)
	for _, deployment := range config.Deployments {
		provider, ok := providers[deployment.ProviderConnectionID]
		if !ok || !deployment.Published || !canPublish(provider, deployment) { continue }
		items = append(items, publishedDeployment(provider, deployment, config.Defaults, costs))
	}
	sortPublishedDeployments(items)
	return model.PublicModelCatalog{Deployments: items, Defaults: publishedDefaults(config.Defaults, items), Costs: costs, SystemPrompt: settings.Public.ModelCatalog.SystemPrompt}
}
```

实现以下硬门禁：关键字段 `BaseURL / UpstreamModelID / Kind / Adapter / EndpointID` 变化时清空测试并自动取消发布；禁用厂商也使关联部署自动取消发布；默认部署必须已发布且类型一致；取消发布、禁用或删除默认部署前必须先换默认；部署被 `AgentRun.Model`、`InvocationAttempt.Model` 或 `AITask.Model` 引用时只能停用；厂商有关联部署或历史引用时不能删除。普通目录只包含可发布状态仍有效的条目。`UpdateModelCost` 只按 deployment ID 更新非负算力点，继续复用现有预扣、按次/张/秒和退款算法；能力/生成约束以部署级 `Capabilities` 安全投影到公开目录。

历史引用只能通过 repository 查询，service 不得直接调用 GORM：

```go
type ModelDeploymentReferenceSummary struct { AgentRuns int64; InvocationAttempts int64; AITasks int64 }

func CountModelDeploymentReferences(deploymentID string) (ModelDeploymentReferenceSummary, error) {
	db, err := DB()
	if err != nil { return ModelDeploymentReferenceSummary{}, err }
	result := ModelDeploymentReferenceSummary{}
	if err := db.Model(&model.AgentRun{}).Where("model = ?", deploymentID).Count(&result.AgentRuns).Error; err != nil { return result, err }
	if err := db.Model(&model.InvocationAttempt{}).Where("model = ?", deploymentID).Count(&result.InvocationAttempts).Error; err != nil { return result, err }
	if err := db.Model(&model.AITask{}).Where("model = ?", deploymentID).Count(&result.AITasks).Error; err != nil { return result, err }
	return result, nil
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestCriticalDeploymentEdit|TestPublishAndDefaultGates|TestReferencedDeployment|TestPublicModelCatalog' -count=1`

Expected: PASS，公开目录不含 API Key、测试错误、未发布部署和私有路径字段。

- [ ] **Step 5: 提交部署状态机**

```bash
git add repository/model_config_reference.go service/model_config.go service/model_config_test.go
git commit -m "feat: enforce model publication gates"
```

### Task 6: 添加严格的管理员接口和公开目录路由

**Files:**
- Create: `handler/model_config.go`
- Create: `handler/model_config_test.go`
- Modify: `handler/settings.go:1-80`
- Modify: `router/router.go:28,290-294`

- [ ] **Step 1: 写管理员鉴权、严格解码、大小上限和公开安全响应测试**

```go
func TestAdminModelConfigRejectsUnknownFields(t *testing.T) {
	server := newHandlerTestServer(t)
	response := adminJSON(t, server, http.MethodPost, "/api/admin/model-config/connection-check", `{"name":"P","presetId":"openai-compatible","protocol":"openai","baseUrl":"https://example.com/v1","apiKey":"sk","unknown":true}`)
	if response.Code == 0 || !strings.Contains(response.Msg, "请求内容格式") { t.Fatalf("response=%#v", response) }
}

func TestPublicModelCatalogDoesNotExposePrivateFields(t *testing.T) {
	seedPublishedDeployment(t)
	response := publicJSON(t, server, http.MethodGet, "/api/model-catalog", "")
	raw := string(response.Raw)
	for _, forbidden := range []string{"apiKey", "baseUrl", "testedFingerprint", "testError", "endpointId"} {
		if strings.Contains(raw, forbidden) { t.Fatalf("response exposed %s: %s", forbidden, raw) }
	}
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./handler -run 'TestAdminModelConfig|TestPublicModelCatalog' -count=1`

Expected: FAIL，路由返回 404 或 handler 未定义。

- [ ] **Step 3: 实现 handler 和路由表**

```go
const modelConfigBodyLimit = 1 << 20

func AdminImportProvider(w http.ResponseWriter, r *http.Request) {
	var input model.ImportProviderInput
	if !decodeStrictBody(w, r, &input, modelConfigBodyLimit) { return }
	result, err := service.ImportProvider(r.Context(), input)
	if err != nil { FailError(w, err); return }
	OK(w, result)
}

func AdminPublishModelDeployment(w http.ResponseWriter, r *http.Request, id string) {
	if !decodeZeroByteBody(w, r, modelConfigBodyLimit) { return }
	result, err := service.PublishModelDeployment(id)
	if err != nil { FailError(w, err); return }
	OK(w, result)
}
```

注册以下路由，并全部置于现有 `admin` 鉴权组内：

```text
GET    /api/model-catalog
GET    /api/admin/model-config
POST   /api/admin/model-config/connection-check
POST   /api/admin/model-config/discover
POST   /api/admin/model-config/import
PATCH  /api/admin/model-config/providers/:id
POST   /api/admin/model-config/providers/:id/check
POST   /api/admin/model-config/providers/:id/enable
POST   /api/admin/model-config/providers/:id/disable
DELETE /api/admin/model-config/providers/:id
PATCH  /api/admin/model-config/deployments/:id
PATCH  /api/admin/model-config/deployments/:id/cost
POST   /api/admin/model-config/deployments/:id/test
POST   /api/admin/model-config/deployments/:id/publish
POST   /api/admin/model-config/deployments/:id/unpublish
POST   /api/admin/model-config/defaults/:kind/:id
DELETE /api/admin/model-config/deployments/:id
```

删除 `/api/admin/settings/channel-models` 和 `/api/admin/settings/channel-test`。所有响应继续由 `OK` / `FailError` 形成 `{code,data,msg}`。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./handler -run 'TestAdminModelConfig|TestPublicModelCatalog' -count=1`

Expected: PASS，非管理员访问管理接口失败，未知字段和超过 1 MiB 请求失败。

- [ ] **Step 5: 提交接口层**

```bash
git add handler/model_config.go handler/model_config_test.go handler/settings.go router/router.go
git commit -m "feat: expose model configuration api"
```

### Task 7: 将 AI 代理改为部署 ID 解析和入口校验

**Files:**
- Modify: `handler/ai.go:138-255`
- Modify: `handler/ai_test.go`
- Modify: `service/model_config.go`
- Modify: `service/model_adapter.go`

- [ ] **Step 1: 写同名不同厂商、入口错配、模型重写和无 fallback 测试**

```go
func TestProxyAIRequestRoutesByDeploymentIDAndRewritesUpstreamModel(t *testing.T) {
	first := newUpstreamRecorder(t)
	second := newUpstreamRecorder(t)
	seedPublishedProxyDeployment(t, "deploy-a", "provider-a", "same-name", first.URL, model.ModelAdapterResponses)
	seedPublishedProxyDeployment(t, "deploy-b", "provider-b", "same-name", second.URL, model.ModelAdapterResponses)
	rec := httptest.NewRecorder()
	req := authenticatedAIRequest(t, `{"model":"deploy-b","input":"hello"}`)
	proxyAIRequest(rec, req, "/responses")
	if first.Calls() != 0 || second.Calls() != 1 { t.Fatalf("calls=%d/%d", first.Calls(), second.Calls()) }
	if second.LastModel() != "same-name" { t.Fatalf("upstream model=%q", second.LastModel()) }
}

func TestProxyAIRequestRejectsWrongEntryAndNeverFallsBack(t *testing.T) {
	failing := newFailingUpstream(t)
	backup := newUpstreamRecorder(t)
	seedPublishedProxyDeployment(t, "image-a", "provider-a", "image", failing.URL, model.ModelAdapterImagesGenerations)
	seedPublishedProxyDeployment(t, "image-b", "provider-b", "image", backup.URL, model.ModelAdapterImagesGenerations)
	wrong := callAIProxy(t, "/chat/completions", `{"model":"image-a"}`)
	if wrong.Code == 0 { t.Fatal("wrong entry accepted") }
	failed := callAIProxy(t, "/images/generations", `{"model":"image-a","prompt":"test"}`)
	if failed.Code == 0 || backup.Calls() != 0 { t.Fatalf("silent fallback occurred") }
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./handler -run 'TestProxyAIRequestRoutesByDeploymentID|TestProxyAIRequestRejectsWrongEntry' -count=1`

Expected: FAIL，旧代码仍按模型名选择渠道或错误命中第一个同名模型。

- [ ] **Step 3: 实现公开运行时解析**

```go
type ResolvedModelDeployment struct {
	Deployment model.ModelDeployment
	Provider model.ProviderConnection
	Adapter modelAdapterSpec
}

func ResolvePublishedModelDeployment(id string, requestPath string) (ResolvedModelDeployment, error) {
	provider, deployment, _, err := privateDeploymentByID(strings.TrimSpace(id))
	if err != nil || !deployment.Published || !provider.Enabled || !canPublish(provider, deployment) { return ResolvedModelDeployment{}, safeMessageError{message: "模型不可用"} }
	spec, err := validateDeploymentAdapter(provider, deployment)
	if err != nil || !spec.acceptsProxyPath(requestPath) { return ResolvedModelDeployment{}, safeMessageError{message: "模型与请求入口不匹配"} }
	return ResolvedModelDeployment{Deployment: deployment, Provider: provider, Adapter: spec}, nil
}
```

`proxyAIRequest` 从 JSON `model` 读取部署 ID，解析后把上游请求体的 `model` 改成 `UpstreamModelID`；URL、鉴权、Endpoint ID 和协议全部来自解析结果。算力点调用改为 `ModelCostByDeploymentID(deployment.ID)`。创建 `AITask` 时 `Model=deployment.ID`、`Provider=provider.Name`、`Protocol=provider.Protocol`、`Path=spec.Path`，请求快照保存已重写的上游模型。上游失败按现有路径退款，但绝不选择另一个部署。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./handler -run 'TestProxyAIRequestRoutesByDeploymentID|TestProxyAIRequestRejectsWrongEntry|TestAIHandler' -count=1`

Expected: PASS，同名部署精确路由且没有 fallback。

- [ ] **Step 5: 提交代理路由**

```bash
git add handler/ai.go handler/ai_test.go service/model_config.go service/model_adapter.go
git commit -m "refactor: route ai proxy by deployment id"
```

### Task 8: 冻结 Invocation / Agent Run 部署快照并按适配器执行

**Files:**
- Modify: `service/invocation_contracts.go:32-58`
- Modify: `service/invocation_preflight.go:480-540`
- Modify: `service/invocation_runner.go:120-255`
- Modify: `service/agent_run.go:39-340`
- Modify: `service/agent_run_executor.go:45-130,300-360`
- Modify: `service/invocation_preflight_test.go`
- Modify: `service/invocation_runner_test.go`
- Modify: `service/agent_run_api_image_executor_test.go`

- [ ] **Step 1: 写预检冻结和执行路径失败测试**

```go
func TestInvocationPreflightFreezesDeploymentSnapshot(t *testing.T) {
	seedPublishedDeployment(t, "text-deploy", "provider-1", "upstream-text", model.ModelAdapterResponses)
	result, err := PreflightInvocation("user-1", invocationRequestWithDeployment("text-deploy"))
	if err != nil { t.Fatal(err) }
	p := result.ExecutionPolicy
	if p.DeploymentID != "text-deploy" || p.UpstreamModelID != "upstream-text" || p.ProviderConnectionID != "provider-1" || p.Adapter != model.ModelAdapterResponses { t.Fatalf("policy=%#v", p) }
}

func TestAgentRunExecutorUsesFrozenResponsesAdapter(t *testing.T) {
	upstream := newUpstreamRecorder(t)
	run := frozenAgentRun("text-deploy", "upstream-text", "provider-1", model.ModelAdapterResponses, upstream.URL)
	result := NewAPIAgentRunExecutor(upstream.Client()).Call(context.Background(), run)
	if result.err != nil || upstream.LastPath() != "/responses" || upstream.LastModel() != "upstream-text" { t.Fatalf("result=%#v", result) }
}
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `go test ./service -run 'TestInvocationPreflightFreezesDeploymentSnapshot|TestAgentRunExecutorUsesFrozenResponsesAdapter' -count=1`

Expected: FAIL，旧执行策略只有 `Model`/`ChannelID`，文本执行器固定走 `/chat/completions`。

- [ ] **Step 3: 改造冻结策略和执行器**

```go
type InvocationExecutionPolicy struct {
	ExecutorKind string `json:"executorKind"`
	AgentExecutor string `json:"agentExecutor"`
	DeploymentID string `json:"deploymentId"`
	UpstreamModelID string `json:"upstreamModelId"`
	ProviderConnectionID string `json:"providerConnectionId"`
	ProviderName string `json:"providerName"`
	Protocol model.ModelProtocol `json:"protocol"`
	Adapter model.ModelAdapter `json:"adapter"`
	Credits int `json:"credits"`
	TimeoutSeconds int `json:"timeoutSeconds"`
	ConcurrencyLimit int `json:"concurrencyLimit"`
	OutputCount int `json:"outputCount"`
	ImageRequestJSON string `json:"imageRequestJson"`
	WritePolicy string `json:"writePolicy"`
	RequiresConfirm bool `json:"requiresConfirm"`
}

type FrozenAgentRunRequest struct {
	DeploymentID string `json:"deploymentId"`
	UpstreamModelID string `json:"upstreamModelId"`
	Adapter model.ModelAdapter `json:"adapter"`
	Body json.RawMessage `json:"body"`
}
```

预检的用户输入字段改为 `deploymentId`；为空时按执行类型读取相应默认部署。确认时将冻结策略写入 Agent Run：`Model=DeploymentID`、`TargetModel=UpstreamModelID`、`ChannelID=ProviderConnectionID`、`Provider=ProviderName`、`Protocol=string(Protocol)`。`AgentRun.RequestJSON` 改存 `FrozenAgentRunRequest`，其中 `Body` 是已经写入上游模型 ID 的真实请求体，避免新增数据库字段且让执行器能读取冻结适配器。执行器按 envelope 的 `Adapter` 选择路径和响应解析，并按 `ChannelID` 重新读取当前厂商凭证；厂商连接不能在有 Agent Run 引用时物理删除。确认/重试前仍验证部署可用，但不得改写冻结的上游模型、厂商或适配器，也不得 fallback。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `go test ./service -run 'TestInvocationPreflight|TestInvocationQueue|TestAgentRunExecutor|TestAPIAgentRunExecutor' -count=1`

Expected: PASS，Responses、图片和普通 Chat 均走冻结适配器；历史记录取消发布后仍可读，未确认的新执行不能选择未发布部署。

- [ ] **Step 5: 提交运行时冻结改造**

```bash
git add service/invocation_contracts.go service/invocation_preflight.go service/invocation_runner.go service/agent_run.go service/agent_run_executor.go service/invocation_preflight_test.go service/invocation_runner_test.go service/agent_run_api_image_executor_test.go
git commit -m "refactor: freeze model deployment routes"
```

### Task 9: 建立前端公开目录契约和配置 store

**Files:**
- Create: `web/src/services/api/model-catalog.ts`
- Create: `web/src/services/api/admin-model-config.ts`
- Modify: `web/src/services/api/admin.ts:489-616`
- Modify: `web/src/stores/use-config-store.ts:19-380`
- Create: `web/src/stores/model-catalog.test.mts`

- [ ] **Step 1: 写已发布过滤、默认回退和同名部署并存测试**

```ts
test("resolves deployment ids and falls back to the published type default", () => {
    const catalog = {
        deployments: [
            { deploymentId: "text-a", displayName: "Same", upstreamModelId: "same", providerName: "A", kind: "text", requestMode: "text_chat", capabilities: ["text"], credits: 1, default: true },
            { deploymentId: "text-b", displayName: "Same", upstreamModelId: "same", providerName: "B", kind: "text", requestMode: "text_responses", capabilities: ["text"], credits: 2, default: false },
        ],
        defaults: { textDeploymentId: "text-a", imageDeploymentId: "", videoDeploymentId: "" }, costs: [], systemPrompt: "",
    };
    const resolved = resolveEffectiveConfig({ ...defaultConfig, textModel: "removed" }, catalog);
    assert.equal(resolved.textModel, "text-a");
    assert.deepEqual(resolved.textModels, ["text-a", "text-b"]);
    assert.equal(resolved.modelCatalog["text-b"].requestMode, "text_responses");
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd web && node --experimental-strip-types --test src/stores/model-catalog.test.mts`

Expected: FAIL，store 仍读取 `availableModels` 并按模型名推断类型/端点。

- [ ] **Step 3: 实现前端类型和目录解析**

```ts
// web/src/services/api/model-catalog.ts
import { apiGet } from "@/services/api/request";

export type ModelKind = "text" | "image" | "video";
export type ModelRequestMode = "text_chat" | "text_responses" | "image_generation" | "image_chat" | "video_task";
export type PublishedModelDeployment = {
    deploymentId: string; displayName: string; upstreamModelId: string; providerName: string;
    kind: ModelKind; requestMode: ModelRequestMode; capabilities: string[]; credits: number; default: boolean;
};
export type ModelDeploymentDefaults = { textDeploymentId: string; imageDeploymentId: string; videoDeploymentId: string };
export type ModelCost = { deploymentId: string; credits: number };
export type PublicModelCatalog = {
    deployments: PublishedModelDeployment[];
    defaults: ModelDeploymentDefaults;
    costs: ModelCost[];
    systemPrompt: string;
};

export function fetchModelCatalog(token?: string) {
    return apiGet<PublicModelCatalog>("/api/model-catalog", undefined, token);
}

// web/src/services/api/admin-model-config.ts
import { apiDelete, apiGet, apiPatch, apiPost, apiPostEmpty } from "@/services/api/request";
import type { ModelKind, ModelCost, ModelDeploymentDefaults } from "@/services/api/model-catalog";

export type ProviderProtocol = "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
export type ModelAdapter = "chat_completions" | "responses" | "images_generations" | "gemini_chat_image" | "volcengine_ark_video" | "jimeng_cli_video" | "xinglian_cloud_video";
export type ProviderConnection = {
    id: string; name: string; presetId: string; protocol: ProviderProtocol; baseUrl: string; apiKey: string; apiKeyConfigured: boolean;
    enabled: boolean; credentialRevision: number; connectionStatus: "unchecked" | "passed" | "failed"; connectionCheckedAt: string;
    connectionError: string; cliPath: string; workDir: string; outputDir: string; sessionId: number;
};
export type ModelDeployment = {
    id: string; providerConnectionId: string; upstreamModelId: string; displayName: string; kind: ModelKind; adapter: ModelAdapter;
    capabilities: string[]; endpointId: string; timeoutSeconds: number; concurrencyLimit: number; enabled: boolean;
    testStatus: "untested" | "passed" | "failed"; testedAt: string; testError: string; testedFingerprint: string;
    published: boolean; createdAt: string; updatedAt: string;
};
export type ProviderConnectionInput = Pick<ProviderConnection, "name" | "presetId" | "protocol" | "baseUrl" | "apiKey" | "cliPath" | "workDir" | "outputDir" | "sessionId">;
export type ProviderConnectionPatch = Partial<Pick<ProviderConnection, "name" | "baseUrl" | "apiKey" | "cliPath" | "workDir" | "outputDir" | "sessionId">>;
export type ModelDeploymentInput = Pick<ModelDeployment, "upstreamModelId" | "displayName" | "kind" | "adapter" | "capabilities" | "endpointId" | "timeoutSeconds" | "concurrencyLimit">;
export type ModelDeploymentPatch = Partial<ModelDeploymentInput>;
export type ImportProviderInput = { provider: ProviderConnectionInput; deployments: ModelDeploymentInput[] };
export type ImportProviderResult = { provider: ProviderConnection; deployments: ModelDeployment[] };
export type ConnectionCheckResult = { status: "passed"; checkedAt: string };
export type DiscoveredModelCandidate = { upstreamModelId: string; displayName: string; kind: ModelKind | ""; adapter: ModelAdapter | ""; allowedAdapters: ModelAdapter[]; confidence: "high" | "medium" | "none"; classificationSource: "preset_exact" | "upstream_metadata" | "known_name_rule" | "unconfirmed"; verified: boolean; selected: boolean };
export type ModelDiscoveryResult = { candidates: DiscoveredModelCandidate[]; source: "upstream" | "preset" | "manual"; warning: string };
export type ProviderPresetSummary = { id: string; name: string; description: string; protocol: ProviderProtocol; defaultBaseUrl: string };
export type ModelConfigurationAdminView = { providers: ProviderConnection[]; deployments: ModelDeployment[]; defaults: ModelDeploymentDefaults; costs: ModelCost[]; presets: ProviderPresetSummary[] };

export function fetchAdminModelConfiguration(token: string) {
    return apiGet<ModelConfigurationAdminView>("/api/admin/model-config", undefined, token);
}
export function checkProviderConnection(token: string, input: ProviderConnectionInput) {
    return apiPost<ConnectionCheckResult>("/api/admin/model-config/connection-check", input, token);
}
export function discoverProviderModels(token: string, input: ProviderConnectionInput) {
    return apiPost<ModelDiscoveryResult>("/api/admin/model-config/discover", input, token);
}
export function importProviderModels(token: string, input: ImportProviderInput) {
    return apiPost<ImportProviderResult>("/api/admin/model-config/import", input, token);
}
export function updateProviderConnection(token: string, id: string, input: ProviderConnectionPatch) {
    return apiPatch<ProviderConnection>(`/api/admin/model-config/providers/${encodeURIComponent(id)}`, input, token);
}
export function checkSavedProviderConnection(token: string, id: string) {
    return apiPostEmpty<ProviderConnection>(`/api/admin/model-config/providers/${encodeURIComponent(id)}/check`, token);
}
export function setProviderEnabled(token: string, id: string, enabled: boolean) {
    const action = enabled ? "enable" : "disable";
    return apiPostEmpty<ProviderConnection>(`/api/admin/model-config/providers/${encodeURIComponent(id)}/${action}`, token);
}
export function deleteProviderConnection(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/model-config/providers/${encodeURIComponent(id)}`, token);
}
export function testModelDeployment(token: string, id: string) {
    return apiPostEmpty<ModelDeployment>(`/api/admin/model-config/deployments/${encodeURIComponent(id)}/test`, token);
}
export function updateModelDeployment(token: string, id: string, input: ModelDeploymentPatch) {
    return apiPatch<ModelDeployment>(`/api/admin/model-config/deployments/${encodeURIComponent(id)}`, input, token);
}
export function updateModelCost(token: string, id: string, credits: number) {
    return apiPatch<ModelCost>(`/api/admin/model-config/deployments/${encodeURIComponent(id)}/cost`, { credits }, token);
}
export function publishModelDeployment(token: string, id: string, publish: boolean) {
    const action = publish ? "publish" : "unpublish";
    return apiPostEmpty<ModelDeployment>(`/api/admin/model-config/deployments/${encodeURIComponent(id)}/${action}`, token);
}
export function setDefaultModelDeployment(token: string, kind: ModelKind, id: string) {
    return apiPostEmpty<ModelDeploymentDefaults>(`/api/admin/model-config/defaults/${kind}/${encodeURIComponent(id)}`, token);
}
export function deleteModelDeployment(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/model-config/deployments/${encodeURIComponent(id)}`, token);
}
```

所有动态 ID 都使用 `encodeURIComponent`。`AiConfig.textModel/imageModel/videoModel` 的值语义统一为 deployment ID，增加 `modelCatalog: Record<string, PublishedModelDeployment>`。`resolveEffectiveConfig` 只按 `kind` 划分目录，不调用名称推断；已选 ID 不存在时回退到同类型默认 ID，再回退到该类型第一条已发布部署。生成参数支持只读取目录中的安全 `capabilities`，不按名称猜测。`fetchPublicSettings` 改为调用 `fetchModelCatalog`，管理员 API 类型从 `admin.ts` 移入新文件。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd web && node --experimental-strip-types --test src/stores/model-catalog.test.mts`

Expected: PASS，同名上游模型保留两个不同 deployment ID。

- [ ] **Step 5: 提交目录 store**

```bash
git add web/src/services/api/model-catalog.ts web/src/services/api/admin-model-config.ts web/src/services/api/admin.ts web/src/stores/use-config-store.ts web/src/stores/model-catalog.test.mts
git commit -m "refactor: consume published model catalog"
```

### Task 10: 建立管理员向导纯状态和页面 hook

**Files:**
- Create: `web/src/app/(admin)/admin/settings/model-config-model.ts`
- Create: `web/src/app/(admin)/admin/settings/model-config-model.test.mts`
- Create: `web/src/app/(admin)/admin/settings/use-model-configuration.ts`

- [ ] **Step 1: 写步骤门禁、默认零选择和仅校验已选项测试**

```ts
test("wizard starts with no selected candidates and validates only selected rows", () => {
    const candidates = [candidate({ upstreamModelId: "known", kind: "text", adapter: "responses" }), candidate({ upstreamModelId: "unknown", kind: "", adapter: "" })];
    const state = initializeWizardCandidates(candidates);
    assert.deepEqual(selectedCandidates(state), []);
    assert.equal(canEnterCandidateStep({ connectionChecked: false, candidates: state }), false);
    assert.deepEqual(validateSelectedCandidates(state), []);
    const selectedUnknown = toggleCandidate(state, "unknown", true);
    assert.deepEqual(validateSelectedCandidates(selectedUnknown), ["unknown: 请选择模型类型", "unknown: 请选择请求适配器"]);
});

test("image and video deployment tests require a cost warning", () => {
    assert.equal(requiresBillableTestConfirmation({ kind: "text" }), false);
    assert.equal(requiresBillableTestConfirmation({ kind: "image" }), true);
    assert.equal(requiresBillableTestConfirmation({ kind: "video" }), true);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: FAIL，纯状态模块未定义。

- [ ] **Step 3: 实现纯状态和专用 hook**

```ts
export function canContinueWizard(step: number, state: WizardState) {
    if (step === 0) return Boolean(state.provider.presetId);
    if (step === 1) return state.connectionChecked && state.connectionError === "";
    if (step === 2) return selectedCandidates(state.candidates).length > 0;
    return validateSelectedCandidates(state.candidates).length === 0;
}

export function validateSelectedCandidates(items: WizardCandidate[]) {
    return items.filter((item) => item.selected).flatMap((item) => [
        ...(item.kind ? [] : [`${item.upstreamModelId}: 请选择模型类型`]),
        ...(item.adapter ? [] : [`${item.upstreamModelId}: 请选择请求适配器`]),
    ]);
}
```

`useModelConfiguration(token)` 封装配置加载、连接检查、发现、导入、部署编辑/测试/发布/默认/删除和刷新。每个 mutation 成功后只刷新 `model-config` 与 `public-model-catalog` 查询；组件不直接拼 API URL。图片/视频测试动作必须要求调用方先传入 `costConfirmed:true`，否则 hook 抛出中文提示。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: PASS，未连接不能进第 3 步，候选默认全未选，未选的待确认条目不阻塞保存。

- [ ] **Step 5: 提交向导状态**

```bash
git add 'web/src/app/(admin)/admin/settings/model-config-model.ts' 'web/src/app/(admin)/admin/settings/model-config-model.test.mts' 'web/src/app/(admin)/admin/settings/use-model-configuration.ts'
git commit -m "feat: add model configuration state"
```

### Task 11: 实现四步厂商添加向导

**Files:**
- Create: `web/src/app/(admin)/admin/settings/components/model-provider-wizard.tsx`
- Modify: `web/src/app/(admin)/admin/settings/use-model-configuration.ts`
- Modify: `web/src/app/(admin)/admin/settings/model-config-model.test.mts`

- [ ] **Step 1: 写向导结构和关键文案的静态失败测试**

```ts
test("provider wizard exposes four guarded stages and manual model entry", async () => {
    const source = await readFile(new URL("./components/model-provider-wizard.tsx", import.meta.url), "utf8");
    for (const label of ["选择厂商", "连接并发现", "选择模型", "确认配置", "手动添加模型 ID"]) assert.match(source, new RegExp(label));
    assert.match(source, /selected:\s*false/);
    assert.match(source, /canContinueWizard/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: FAIL，向导文件不存在。

- [ ] **Step 3: 实现向导组件**

```tsx
<Modal title="添加厂商与模型" open={open} width={920} footer={wizardFooter} onCancel={onClose} destroyOnHidden>
    <Steps current={step} items={[{ title: "选择厂商" }, { title: "连接并发现" }, { title: "选择模型" }, { title: "确认配置" }]} />
    {step === 0 ? <ProviderPresetStep presets={configuration.presets} value={state.provider.presetId} onChange={selectPreset} /> : null}
    {step === 1 ? <ProviderConnectionStep value={state.provider} checking={checking} onCheck={checkAndDiscover} /> : null}
    {step === 2 ? <CandidateSelectionStep candidates={state.candidates} selectedRowKeys={selectedIds} onSelect={setSelectedIds} onManualAdd={addManualCandidate} /> : null}
    {step === 3 ? <DeploymentConfirmationStep candidates={selectedCandidates(state.candidates)} onChange={updateCandidateClassification} /> : null}
</Modal>
```

候选 Table 使用受控 `selectedRowKeys` 且初始 `[]`，不设置默认全选。连接失败时保持第 2 步并显示脱敏错误。列表支持搜索、推测类型筛选和高级手工模型 ID；第 4 步只渲染已选项，高置信度配置可直接确认，待确认项必须选择类型和允许的适配器。完成按钮调用原子导入接口，成功文案明确“模型已保存为未测试、未发布”。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交四步向导**

```bash
git add 'web/src/app/(admin)/admin/settings/components/model-provider-wizard.tsx' 'web/src/app/(admin)/admin/settings/use-model-configuration.ts' 'web/src/app/(admin)/admin/settings/model-config-model.test.mts'
git commit -m "feat: add provider model wizard"
```

### Task 12: 实现部署列表、编辑抽屉和管理员设置页接线

**Files:**
- Create: `web/src/app/(admin)/admin/settings/components/model-deployment-list.tsx`
- Create: `web/src/app/(admin)/admin/settings/components/model-deployment-editor.tsx`
- Modify: `web/src/app/(admin)/admin/settings/page.tsx:1-1669`
- Delete: `web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx`
- Delete: `web/src/app/(admin)/admin/settings/model-channel-presets.ts`
- Delete: `web/src/app/(admin)/admin/settings/model-channel-presets.test.mts`
- Modify: `web/src/app/(admin)/admin/settings/model-config-model.test.mts`

- [ ] **Step 1: 写三类分栏、状态动作和费用提示静态失败测试**

```ts
test("deployment management shows type tabs, statuses, defaults and paid-test warning", async () => {
    const list = await readFile(new URL("./components/model-deployment-list.tsx", import.meta.url), "utf8");
    for (const text of ["文本", "图片", "视频", "未测试", "测试通过", "测试失败", "发布", "取消发布", "设为默认"]) assert.match(list, new RegExp(text));
    assert.match(list, /providerName/);
    assert.match(list, /Modal\.confirm/);
    assert.match(list, /可能产生厂商费用/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: FAIL，部署列表和编辑器不存在。

- [ ] **Step 3: 实现管理区并替换旧渠道编辑器**

```tsx
<Card title="模型配置" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setWizardOpen(true)}>添加厂商</Button>}>
    <ModelDeploymentList
        providers={configuration.providers}
        deployments={configuration.deployments}
        defaults={configuration.defaults}
        onTest={confirmThenTest}
        onPublish={publishDeployment}
        onUnpublish={unpublishDeployment}
        onDefault={setDefaultDeployment}
        onEdit={setEditingDeployment}
        onDelete={deleteDeployment}
    />
</Card>
```

列表使用 `Tabs` 按 text/image/video 分栏，每栏按 provider 分组；行内展示名称、厂商、适配器、算力点、测试/发布/默认状态和动作。算力点仍用现有数字输入与中文单位说明，只把保存键改为 deployment ID，并调用专用 cost 接口。图片/视频点击测试时用 `Modal.confirm` 显示“该测试可能调用厂商真实生成接口并产生费用”，确认后才传 `costConfirmed:true`。编辑抽屉默认隐藏 Endpoint、Timeout、Concurrency、Capabilities 和适配器到“高级配置”；关键字段保存后以后端返回状态为准。设置页删除旧公开模型、渠道表格、名称推断和整份设置自动保存接线，非模型设置继续走 `saveAdminSettings`。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts'`

Expected: PASS，旧 `ProviderPresetModal` 和 `applyModelChannelPreset` 不再被引用。

- [ ] **Step 5: 提交管理员界面**

```bash
git add 'web/src/app/(admin)/admin/settings/page.tsx' 'web/src/app/(admin)/admin/settings/components/model-deployment-list.tsx' 'web/src/app/(admin)/admin/settings/components/model-deployment-editor.tsx' 'web/src/app/(admin)/admin/settings/model-config-model.test.mts'
git rm 'web/src/app/(admin)/admin/settings/components/provider-preset-modal.tsx' 'web/src/app/(admin)/admin/settings/model-channel-presets.ts' 'web/src/app/(admin)/admin/settings/model-channel-presets.test.mts'
git commit -m "feat: simplify admin model management"
```

### Task 13: 将普通用户 picker 和生成客户端改为部署目录

**Files:**
- Modify: `web/src/components/model-picker.tsx:1-100`
- Modify: `web/src/components/model-picker-options.ts:1-95`
- Modify: `web/src/components/model-picker-options.test.mts`
- Modify: `web/src/services/api/image.ts:1-260`
- Modify: `web/src/services/api/video.ts:1-260`
- Modify: `web/src/services/api/ai-channel-boundary.ts:1-180`
- Modify: `web/src/services/api/image-routing.test.mts`

- [ ] **Step 1: 写 picker 标签、部署 ID 请求和目录模式路由测试**

```ts
test("picker keeps deployment id as value and disambiguates providers", () => {
    const options = buildModelPickerOptions({ deployments: [
        { deploymentId: "a", displayName: "Same", upstreamModelId: "same", providerName: "Provider A", kind: "image", requestMode: "image_generation", capabilities: ["image"], credits: 4, default: false },
        { deploymentId: "b", displayName: "Same", upstreamModelId: "same", providerName: "Provider B", kind: "image", requestMode: "image_chat", capabilities: ["image", "reference_image"], credits: 6, default: false },
    ], value: "b" });
    assert.deepEqual(options.map((item) => item.value), ["a", "b"]);
    assert.match(String(options[1].label), /Same.*Provider B/);
});

test("image request uses catalog request mode without name inference", () => {
    assert.equal(resolveImageRequestPath({ deploymentId: "opaque-id", requestMode: "image_generation" }), "/images/generations");
    assert.equal(resolveImageRequestPath({ deploymentId: "another-id", requestMode: "image_chat" }), "/chat/completions");
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `cd web && node --experimental-strip-types --test src/components/model-picker-options.test.mts src/services/api/image-routing.test.mts`

Expected: FAIL，options 仍接收模型名数组，图片路径仍使用名称/协议推断。

- [ ] **Step 3: 改造共享选择器和请求客户端**

```ts
export function resolveImageRequestPath(model: Pick<PublishedModelDeployment, "requestMode">) {
    if (model.requestMode === "image_generation") return "/images/generations";
    if (model.requestMode === "image_chat") return "/chat/completions";
    throw new Error("所选模型不支持图片生成");
}

export function resolveTextRequestPath(model: Pick<PublishedModelDeployment, "requestMode">) {
    if (model.requestMode === "text_responses") return "/responses";
    if (model.requestMode === "text_chat") return "/chat/completions";
    throw new Error("所选模型不支持文本生成");
}
```

`ModelPicker` 的 options 从 `config.modelCatalog` 中按 `modelType` 过滤，value/onChange 始终使用 `deploymentId`，标签使用“显示名称 · 厂商”，可附算力点。关闭普通用户自定义模型入口。图片、文本、视频请求体的 `model` 发送 deployment ID；路径仅由 `requestMode` 决定。删除 GPT、Gemini、Seedance 等名称判断用于运行时路由的分支，但保留纯 UI 生成参数规则，前提是它不决定服务端调用路径。

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `cd web && node --experimental-strip-types --test src/components/model-picker-options.test.mts src/services/api/image-routing.test.mts`

Expected: PASS，同名不同厂商均可选，失效选择由 store 回退到类型默认部署。

- [ ] **Step 5: 提交通用用户端改造**

```bash
git add web/src/components/model-picker.tsx web/src/components/model-picker-options.ts web/src/components/model-picker-options.test.mts web/src/services/api/image.ts web/src/services/api/video.ts web/src/services/api/ai-channel-boundary.ts web/src/services/api/image-routing.test.mts
git commit -m "refactor: select published model deployments"
```

### Task 14: 做针对性回归、更新验收文档

**Files:**
- Modify: `docs/api-response.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Modify: `CHANGELOG.md`
- Test: `service/model_config_test.go`
- Test: `service/model_adapter_test.go`
- Test: `handler/model_config_test.go`
- Test: `handler/ai_test.go`
- Test: `web/src/app/(admin)/admin/settings/model-config-model.test.mts`
- Test: `web/src/stores/model-catalog.test.mts`
- Test: `web/src/components/model-picker-options.test.mts`

- [ ] **Step 1: 增加设计文档六项人工路径对应的回归用例**

```go
func TestModelConfigurationLifecycleResponsesImageVideo(t *testing.T) {
	result := importThreeDeploymentFixture(t)
	if len(result.Deployments) != 3 { t.Fatalf("deployments=%#v", result.Deployments) }
	assertNoPublicDeployments(t)
	for _, deployment := range result.Deployments { passDeploymentTest(t, deployment.ID); publishDeployment(t, deployment.ID) }
	setDefault(t, model.ModelKindText, deploymentIDByKind(result, model.ModelKindText))
	setDefault(t, model.ModelKindImage, deploymentIDByKind(result, model.ModelKindImage))
	setDefault(t, model.ModelKindVideo, deploymentIDByKind(result, model.ModelKindVideo))
	assertPublicCatalogKinds(t, model.ModelKindText, model.ModelKindImage, model.ModelKindVideo)
	editDeploymentAdapter(t, deploymentIDByKind(result, model.ModelKindImage), model.ModelAdapterGeminiChatImage)
	assertDeploymentPublished(t, deploymentIDByKind(result, model.ModelKindImage), false)
}
```

- [ ] **Step 2: 运行所有本功能定向测试**

Run: `go test ./service ./handler -run 'ModelConfig|ModelConfiguration|ModelAdapter|ModelDeployment|PublicModelCatalog|ProxyAIRequest|InvocationPreflightFreezesDeployment|AgentRunExecutorUsesFrozen' -count=1`

Expected: PASS。

Run: `cd web && node --experimental-strip-types --test 'src/app/(admin)/admin/settings/model-config-model.test.mts' src/stores/model-catalog.test.mts src/components/model-picker-options.test.mts src/services/api/image-routing.test.mts`

Expected: PASS。

- [ ] **Step 3: 更新接口和验收文档**

在 `docs/api-response.md` 写出 Task 6 的全部路由、请求示例和 `{code,data,msg}` 响应，并明确公开目录不含私有字段。在 `docs/pending-test.md` 记录四步向导、默认零选择、先测后发、费用确认、三类默认、部署 ID 路由和无 fallback 的可测试变化；从 `docs/todo.md` 移除本次已完成项；`CHANGELOG.md` 的 `Unreleased` 只加一条版本级归纳：

```markdown
- 简化管理员模型配置流程，新增厂商发现、模型测试发布门禁和基于部署 ID 的安全路由。
```

不修改 `docs/features.md`，等待用户测试确认后再转正式功能；不修改 `docs/backend-database.md`，因为厂商连接和部署仍存储在设置 JSON，运行历史复用现有字段。

- [ ] **Step 4: 检查旧渠道符号已经从运行时代码移除**

Run: `rg -n 'ModelChannel|SelectModelChannel|availableModels|modelTextEndpoints|modelSources|channel-models|channel-test|applyModelChannelPreset' model service handler router web/src --glob '!**/*.test.*'`

Expected: 无运行时代码匹配；若测试 fixture 仍含旧结构，也应在本任务改成新领域类型。

Run: `git diff --check`

Expected: 无空白错误。

- [ ] **Step 5: 提交回归和文档**

```bash
git add service/model_config_test.go service/model_adapter_test.go handler/model_config_test.go handler/ai_test.go 'web/src/app/(admin)/admin/settings/model-config-model.test.mts' web/src/stores/model-catalog.test.mts web/src/components/model-picker-options.test.mts docs/api-response.md docs/todo.md docs/pending-test.md CHANGELOG.md
git commit -m "test: cover model configuration lifecycle"
```

## 人工验收清单

- [ ] 从“添加厂商”进入四步向导，候选模型默认 0 个已选。
- [ ] 连接失败停留在“连接并发现”，页面只显示脱敏错误。
- [ ] 选择 Responses 文本、GPT Image 图片和一个视频模型；未选的待确认候选不阻塞，已选待确认候选必须补齐类型和适配器。
- [ ] 保存后三个部署均显示“未测试、未发布”，普通用户目录为空。
- [ ] 图片和视频测试前出现可能产生厂商费用的确认框；取消确认不发请求。
- [ ] 测试通过后才可发布；发布后三个部署出现在普通用户 picker 中。
- [ ] 三类各设置一个默认部署；已选部署取消发布后普通用户自动回退到同类默认。
- [ ] 修改 GPT Image 的适配器或上游模型 ID 后，部署自动取消发布并变回未测试。
- [ ] 同一上游模型由两个厂商发布时出现两个带厂商名的选项，选择其中一个只请求对应厂商。
- [ ] 上游请求失败时发生原有退款流程，但不切换到另一个同名部署。
- [ ] 普通用户接口和浏览器网络响应中看不到 API Key、Base URL、端点 ID、测试错误或未发布模型。

## 最终自检

- [ ] 对照设计文档逐节确认：概念、存储、四步向导、发现分类、测试发布、默认值、普通用户、路由、错误、删除历史和文档均有对应任务。
- [ ] 扫描计划中的未完成占位表达，确认所有步骤都给出实际文件、命令、预期结果和代码。
- [ ] 核对 `ProviderConnectionID`、`DeploymentID`、`UpstreamModelID`、`ModelKind`、`ModelAdapter`、`RequestMode` 在 Go、TypeScript、接口和测试中的拼写一致。
- [ ] 用 `git status --short` 确认每个提交只包含当前任务文件，未混入工作区原有用户修改。
