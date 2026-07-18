# 上线门禁与统一模型路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 禁用生产 Codex CLI，统一后台模型目录与画布节点模型解析，并通过前后端及 Docker 上线验收。

**Architecture:** 后台私有渠道继续作为协议、凭据、能力和模型的唯一来源，公开设置只决定开放范围与默认值。前端通过单一模型目录解析器验证模型能力并解析视频协议，节点只提供模型 ID 和生成参数；Next 服务端采用拒绝本地 Runner 的安全默认值。

**Tech Stack:** Go、Gin、GORM、Next.js App Router、React、TypeScript、Zustand、Node test runner、Docker Compose。

---

### Task 1: 后台模型配置冲突门禁

**Files:**
- Modify: `service/settings.go`
- Test: `service/settings_test.go`

- [x] **Step 1: 写失败测试**

新增测试，构造两个启用渠道为同一个公开模型声明不同协议，调用保存前校验并断言错误包含“同名模型跨协议冲突”。再新增同协议多渠道测试，断言允许保存。

- [x] **Step 2: 验证测试失败**

Run: `go test ./service -run 'TestValidateModelProtocolConflicts' -count=1`

Expected: FAIL，因为冲突校验尚不存在。

- [x] **Step 3: 实现最小校验**

在设置服务中增加：

```go
func validateModelProtocolConflicts(channels []model.ModelChannel) error {
    protocols := map[string]string{}
    for _, channel := range normalizePrivateSetting(model.PrivateSetting{Channels: channels}).Channels {
        if !channel.Enabled {
            continue
        }
        protocol := normalizeModelProtocol(channel.Protocol)
        for _, modelName := range channel.Models {
            modelName = strings.TrimSpace(modelName)
            if modelName == "" {
                continue
            }
            if previous := protocols[modelName]; previous != "" && previous != protocol {
                return fmt.Errorf("同名模型跨协议冲突：%s 同时属于 %s 和 %s", modelName, previous, protocol)
            }
            protocols[modelName] = protocol
        }
    }
    return nil
}
```

`SaveSettings` 在持久化前调用该函数。火山渠道使用公开模型名参与校验，不把 EP 当成公开模型。

- [x] **Step 4: 验证服务测试通过**

Run: `go test ./service -run 'TestValidateModelProtocolConflicts|TestNormalizePublicModel' -count=1`

Expected: PASS。

### Task 2: 建立前端统一模型目录

**Files:**
- Create: `web/src/lib/ai-model-catalog.ts`
- Create: `web/src/lib/ai-model-catalog.test.mts`
- Modify: `web/src/lib/ai-model-kind.ts`
- Modify: `web/src/stores/use-config-store.ts`

- [x] **Step 1: 写模型目录失败测试**

测试覆盖：明确能力优先于模型名猜测；按能力只返回公开模型；节点模型失效时依次回退项目默认和系统默认；视频协议只来自模型协议映射；不存在可用模型时返回空值。

- [x] **Step 2: 验证测试失败**

Run: `cd web && node --experimental-strip-types --test src/lib/ai-model-catalog.test.mts`

Expected: FAIL，因为目录解析器尚不存在。

- [x] **Step 3: 实现目录解析器**

导出以下稳定接口：

```ts
export type AiModelCatalogEntry = {
    id: string;
    capabilities: AiModelKind[];
    protocol: AiConfig["videoProtocol"];
    sources: AdminModelSource[];
    textEndpointType?: TextModelEndpointType;
};

export function buildAiModelCatalog(config: AiConfig): AiModelCatalogEntry[];
export function modelsForCapability(config: AiConfig, capability: AiModelKind): string[];
export function resolveGenerationModel(input: {
    config: AiConfig;
    capability: AiModelKind;
    nodeModel?: string;
    projectModel?: string;
}): string;
export function protocolForModel(config: AiConfig, model: string): AiConfig["videoProtocol"];
```

能力存在后台映射时必须使用映射；只有后台完全没有能力记录时才使用名称推断。`resolveEffectiveConfig` 使用目录结果生成三类模型和默认值，禁止跨类型 fallback。

- [x] **Step 4: 验证目录与 store 测试**

Run: `cd web && node --experimental-strip-types --test src/lib/ai-model-catalog.test.mts src/stores/use-config-store.test.mts src/services/api/ai-channel-boundary.test.mts`

Expected: PASS。

### Task 3: 收口画布节点模型解析

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-config.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-config.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-project-preset.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Modify: `web/src/components/model-picker.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-generation-config.test.mts`
- Test: `web/src/app/(user)/canvas/utils/canvas-video-config.test.mts`

- [x] **Step 1: 写节点路由失败测试**

覆盖：旧节点 `provider=openai` 但目录协议为 `xinglian-cloud` 时实际配置走星链云；节点选择了图片模型作为视频模型时回退视频默认；无效节点模型不进入请求；项目预设 provider 不覆盖模型目录协议。

- [x] **Step 2: 验证测试失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-generation-config.test.mts' 'src/app/(user)/canvas/utils/canvas-video-config.test.mts'`

Expected: 至少新增的旧 provider 和跨能力用例 FAIL。

- [x] **Step 3: 接入统一解析器**

`buildGenerationConfig` 和 `buildCanvasVideoConfig` 都调用 `resolveGenerationModel`。视频配置随后调用 `protocolForModel`，不再让 `metadata.provider` 参与实际协议选择。节点模型切换只写 `{ model }`；模型选择器只使用 `modelsForCapability` 的结果。

- [x] **Step 4: 验证画布模型测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-generation-config.test.mts' 'src/app/(user)/canvas/utils/canvas-video-config.test.mts' src/components/model-picker-options.test.mts`

Expected: PASS。

### Task 4: 禁用 Codex CLI 并统一不可用提示

**Files:**
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Modify: `web/src/app/(user)/original-workflow/use-original-workflow-store.ts`
- Modify: `web/src/app/(user)/original-workflow/page.tsx`
- Modify: `web/src/app/api/original-workflow/route.ts`
- Modify: `web/src/app/api/original-workflow/script-optimizer/route.ts`
- Test: `web/src/app/api/original-workflow/route.test.mts`
- Create: `web/src/app/api/original-workflow/execution-mode.test.mts`

- [x] **Step 1: 写服务端门禁失败测试**

测试默认执行模式为 `cloud-worker`，`local-runner` 请求被拒绝，错误包含“生产环境已禁用本地 Codex CLI”；阶段启动与剧本优化的云端请求统一包含“云端执行器尚未启用”。

- [x] **Step 2: 验证测试失败**

Run: `cd web && node --experimental-strip-types --test src/app/api/original-workflow/route.test.mts src/app/api/original-workflow/execution-mode.test.mts`

Expected: FAIL，因为当前默认值仍是 `local-runner`。

- [x] **Step 3: 实现安全默认值与禁用 UI**

抽出纯函数：

```ts
export const CLOUD_EXECUTOR_UNAVAILABLE = "云端执行器尚未启用";

export function requireCloudExecutionMode(value?: string) {
    if (value === "local-runner") throw new Error("生产环境已禁用本地 Codex CLI");
    return "cloud-worker" as const;
}
```

两个路由在任何文件访问或 `spawn` 前调用它。配置弹窗删除 Codex 开关；持久化 store 迁移后始终为 `cloud-worker`；工作流执行按钮 disabled 并显示统一提示。

- [x] **Step 4: 验证 Codex 门禁测试**

Run: `cd web && node --experimental-strip-types --test src/app/api/original-workflow/route.test.mts src/app/api/original-workflow/execution-mode.test.mts`

Expected: PASS。

### Task 5: 前后端上线前自动化检查

**Files:**
- Modify as needed only for failures introduced by Tasks 1-4.

- [x] **Step 1: 运行 Go 全量测试**

Run: `go test ./... -count=1`

Expected: PASS，零失败。

- [x] **Step 2: 运行前端全量测试**

Run: `cd web && npm test`

Expected: PASS，零失败。

- [x] **Step 3: 运行前端类型检查和生产构建**

Run: `cd web && npm run typecheck && npm run build`

Expected: 两条命令退出码均为 0。

- [x] **Step 4: 本地接口冒烟**

启动 Go API 与 Next production server，调用 `/api/health`、`/api/settings`、登录与鉴权接口；向 original-workflow 两个路由发送 `local-runner` 和 `cloud-worker` 请求，分别验证禁用本地 CLI 和统一云端不可用提示。

Expected: 健康与设置接口成功，两个工作流路由均不存在本地执行回退。

### Task 6: Docker 真实部署验收

**Files:**
- Modify: `docker-compose.local.yml`
- Modify: `.env.example`
- Modify only if required: `Dockerfile`

- [x] **Step 1: 固化生产门禁环境变量**

Compose 与示例环境增加：

```dotenv
ORIGINAL_WORKFLOW_EXECUTION_MODE=cloud-worker
ORIGINAL_WORKFLOW_FORCE_CLOUD_WORKER=true
```

- [x] **Step 2: 校验 Compose 并构建**

Run: `docker compose -f docker-compose.local.yml config && docker compose -f docker-compose.local.yml --progress=plain build`

Expected: 配置和镜像构建退出码为 0。

- [x] **Step 3: 使用临时数据目录启动**

使用单独的临时 Compose project 和临时 `/app/data` 挂载启动，避免覆盖现有用户数据。轮询 `docker inspect`，直到 health 为 `healthy`。

- [x] **Step 4: 验证真实容器**

验证 `/api/health`、`/login`、`/projects`、`/api/settings`；注册并重启后再次登录验证 SQLite 持久化；验证 `/api/uploaded-assets/...`；执行 `command -v codex` 必须失败；向两个工作流路由发送本地模式请求必须被拒绝。

- [x] **Step 5: 清理临时容器与数据**

停止并删除本次验收使用的 Compose project、网络和临时数据目录，不操作用户现有容器和 `./data`。

### Task 7: 文档与完成审计

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/system-settings.md`
- Modify: `docs/api-channel-workflow.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [x] **Step 1: 更新配置和部署文档**

记录模型配置唯一来源、模型选择优先级、同名跨协议限制、节点不保存实际协议、生产 Codex CLI 门禁和云端执行器未启用状态。

- [x] **Step 2: 记录本版本实际验收证据**

把测试命令、Docker 镜像、容器健康、持久化、公开素材路径和 Codex 不存在的结果写入 `docs/pending-test.md`；从 `docs/todo.md` 移除本次已经完成的模型路由整理和 Codex 关闭事项，保留云端 Worker 实现待办。

- [x] **Step 3: 完成逐项审计**

对照设计文档的上线判定逐项检查代码、测试输出、Docker 状态和文档。任何缺失项都回到对应任务补齐，不以局部测试代替完整验收。
