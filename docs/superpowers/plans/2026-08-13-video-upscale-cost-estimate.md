# 视频超分输出选项与费用预估 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 LAS 视频超分弹窗加入逐任务输出选项和可核验的费用预估，同时保留现有任务、派生节点与归档流程。

**Architecture:** 后端作为计价规则和任务快照的唯一可信来源：能力接口公开规则，创建任务时用 `ffprobe` 的真实规格计算并持久化快照，LAS Submit 只读取任务快照。前端用同一能力规则做即时预估，智能插帧只展示禁用入口，不调用真实渠道。

**Tech Stack:** Go、Gin、GORM、ffprobe、Next.js、React、TypeScript、Ant Design、Node test runner

---

## 文件结构

- `model/video_upscale.go`：为任务增加帧率、输出选项与计费快照字段。
- `service/video_upscale_pricing.go`：纯计费规则、区间系数和预估函数。
- `service/video_upscale.go`：解析创建选项、探测帧率、校验并保存快照、公开能力。
- `service/video_upscale_volcengine.go`：LAS Submit 从任务快照读取质量和音频参数。
- `handler/video_upscale.go`：接收三个新增表单字段。
- `web/src/services/api/video-upscale.ts`：同步能力、任务和创建请求类型。
- `web/src/app/(user)/canvas/utils/video-upscale-cost.ts`：前端纯费用计算和展示格式化。
- `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`：输出选项、禁用插帧和费用卡片。
- `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`：把弹窗选择提交到既有创建动作。
- `web/src/app/(user)/canvas/types.ts`、`utils/canvas-video-upscale.ts`：把服务端计费快照保存到派生节点元数据。
- `docs/backend-database.md`、`docs/pending-test.md`、`docs/todo.md`：记录表字段和待用户验收内容。

### Task 1: 后端计费纯函数

**Files:**
- Create: `service/video_upscale_pricing.go`
- Create: `service/video_upscale_pricing_test.go`

- [ ] **Step 1: 写失败测试**

覆盖 720/1080/1440/超 1440 分辨率边界、30/60/90/120fps 边界、10 秒 1080p 24fps 得到 1.10 元，以及时长或帧率无效时不可预估。测试直接调用：

```go
estimate, ok := estimateVideoUpscaleCost(10, 24, 1920, 1080)
if !ok || estimate.ResolutionFactor != 3 || estimate.FrameRateFactor != 1 || math.Abs(estimate.CostCNY-1.1) > 1e-9 {
    t.Fatalf("estimate = %#v ok=%v", estimate, ok)
}
```

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service -run 'TestVideoUpscalePricing' -count=1`
Expected: FAIL，提示 `estimateVideoUpscaleCost` 未定义。

- [ ] **Step 3: 最小实现**

新增常量 `videoUpscaleUnitPriceCNY = 2.2`、`videoUpscalePricingRuleVersion = "las-2026-08"`，以及：

```go
type videoUpscaleCostEstimate struct {
    ResolutionFactor float64
    FrameRateFactor  float64
    BillableMinutes  float64
    CostCNY          float64
}

func estimateVideoUpscaleCost(durationSeconds, frameRate float64, outputWidth, outputHeight int) (videoUpscaleCostEstimate, bool)
```

以输出短边判断 P 档位，严格实现官方四档区间；任一输入无效或帧率大于 120 时返回 `ok=false`。

- [ ] **Step 4: 运行测试**

Run: `go test ./service -run 'TestVideoUpscalePricing' -count=1`
Expected: PASS。

### Task 2: 帧率探测、选项校验与任务快照

**Files:**
- Modify: `model/video_upscale.go`
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_test.go`
- Modify: `handler/video_upscale.go`
- Modify: `handler/video_upscale_test.go`

- [ ] **Step 1: 写失败测试**

扩展假元数据为 `FrameRate: 24`，断言创建任务保存：

```go
if job.InputFrameRate != 24 || job.OutputQualityMode != "balanced" || !job.PreserveAudio || job.FrameInterpolationMode != "keep" || job.EstimatedCostCNY != 1.1 {
    t.Fatalf("job snapshot = %#v", job)
}
```

另测 `avg_frame_rate` 优先、`r_frame_rate` 回退、零值和大于 120fps 返回未知；非法质量模式和非 `keep` 插帧模式被拒绝；handler 将三个表单字段传给 service。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service ./handler -run 'VideoUpscale' -count=1`
Expected: FAIL，提示新增字段或解析函数不存在。

- [ ] **Step 3: 最小实现模型与创建输入**

在 `VideoUpscaleJob` 增加：

```go
InputFrameRate        float64 `json:"inputFrameRate"`
OutputQualityMode     string  `json:"outputQualityMode"`
PreserveAudio         bool    `json:"preserveAudio"`
FrameInterpolationMode string `json:"frameInterpolationMode"`
EstimatedBillableMinutes float64 `json:"estimatedBillableMinutes"`
EstimatedCostCNY      float64 `json:"estimatedCostCny"`
PricingRuleVersion    string  `json:"pricingRuleVersion"`
CostEstimateAvailable bool    `json:"costEstimateAvailable"`
```

`VideoUpscaleCreateInput` 同步三个选项。质量模式只接受 `compatible|balanced|master`，插帧模式只接受 `keep`；音频布尔值由 handler 用明确字符串解析，缺省沿用 `true`。

- [ ] **Step 4: 实现 ffprobe 帧率读取**

将查询改为 `stream=width,height,avg_frame_rate,r_frame_rate:format=duration`，新增有理数字符串解析：优先合法 `avg_frame_rate`，否则合法 `r_frame_rate`；零、非数值或大于 120 均保持未知，不猜默认值。

- [ ] **Step 5: 创建时保存计费快照**

输出尺寸确定后调用 `estimateVideoUpscaleCost`，有结果时写入折算分钟、金额、规则版本和可用标志。没有可靠帧率时仍创建任务，但 `CostEstimateAvailable=false`。

- [ ] **Step 6: 运行测试**

Run: `go test ./service ./handler -run 'VideoUpscale' -count=1`
Expected: PASS。

### Task 3: 能力接口与 LAS 提交快照

**Files:**
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_volcengine.go`
- Modify: `service/video_upscale_volcengine_test.go`
- Modify: `handler/video_upscale_test.go`

- [ ] **Step 1: 写失败测试**

能力响应断言包含：

```go
if result.Pricing.UnitPriceCNY != 2.2 || result.Pricing.RuleVersion == "" || result.FrameInterpolation.Status != "unavailable" {
    t.Fatalf("capabilities = %#v", result)
}
```

LAS payload 测试构造任务快照为 `master/false`，管理员当前设置为 `compatible/true`，断言 payload 仍为任务值。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service ./handler -run 'VideoUpscaleCapabilities|LASSubmit' -count=1`
Expected: FAIL，能力字段和快照行为未实现。

- [ ] **Step 3: 扩展能力响应**

公开 `outputQualityModes`、`preserveAudioSupported`、`frameInterpolation: { status: "unavailable", modes: ["keep"] }` 和计价规则。计价规则携带单价、版本和前端计算所需四档边界/系数，且不暴露 API Key、AK/SK 或 TOS 路径。

- [ ] **Step 4: LAS Submit 使用任务值**

`volcengineLASSubmitPayload` 不再读取可变的管理员质量/音频默认值，直接使用 `job.OutputQualityMode` 与 `job.PreserveAudio`。Provider 连接配置仍只负责密钥与 TOS。

- [ ] **Step 5: 运行测试**

Run: `go test ./service ./handler -run 'VideoUpscaleCapabilities|LASSubmit' -count=1`
Expected: PASS。

### Task 4: 前端类型、纯费用计算与 API 请求

**Files:**
- Modify: `web/src/services/api/video-upscale.ts`
- Modify: `web/src/services/api/video-upscale.test.mts`
- Create: `web/src/app/(user)/canvas/utils/video-upscale-cost.ts`
- Create: `web/src/app/(user)/canvas/utils/video-upscale-cost.test.mts`

- [ ] **Step 1: 写失败测试**

纯函数测试使用能力规则断言 10 秒、24fps、1080p 显示 `¥1.10`；未知时长或帧率返回 `null`；API 源码测试断言 FormData 包含 `outputQualityMode`、`preserveAudio`、`frameInterpolationMode`。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: FAIL，费用工具和新增请求字段不存在。

- [ ] **Step 3: 同步 API 类型和表单**

增加 `VideoUpscalePricingRules`、质量和帧率模式联合类型；任务增加服务端快照字段；创建请求带三个新选项并逐项写入 FormData。

- [ ] **Step 4: 实现前端纯计算**

```ts
export function estimateVideoUpscaleCost(input: {
    durationSeconds: number;
    frameRate: number;
    outputWidth: number;
    outputHeight: number;
    pricing: VideoUpscalePricingRules;
}): VideoUpscaleCostEstimate | null
```

只使用能力接口规则，内部保留完整精度，`formatVideoUpscaleCost` 用两位小数展示。

- [ ] **Step 5: 运行测试**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: PASS。

### Task 5: 弹窗输出选项和费用明细

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`

- [ ] **Step 1: 写失败测试**

源码/纯逻辑测试锁定“兼容、均衡、母版”“保留原音频”“智能插帧 2×”“智能插帧至 60fps”“渠道待接入”“预估金额，实际费用以火山引擎账单为准”，以及提交参数从 Modal 到 hook 的完整传递。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'`
Expected: FAIL，新增 UI 文案和参数尚不存在。

- [ ] **Step 3: 实现输出选项**

弹窗本地状态默认 `compatible`、`preserveAudio=true`、`frameInterpolationMode="keep"`。质量可选，音频可切换；两种智能插帧以 disabled 选项展示并带“渠道待接入”。提交仍只允许 `keep`。

- [ ] **Step 4: 实现费用卡片与按钮**

从节点读取可靠的 `duration` 和帧率元数据；可计算时显示源时长/帧率、目标档位、两个系数、折算分钟、LAS 费用、插帧状态和总费用，按钮为 `预计 ¥X.XX · 开始视频超分`。不可计算时显示“暂无法预估”，按钮仍可提交。固定显示账单免责声明。

- [ ] **Step 5: 接通创建参数**

将 `onSubmit` 参数收拢为选项对象，经 `canvas-page-overlays.tsx` 传到 `use-canvas-video-upscale-actions.ts`，最终写入 `createVideoUpscaleJob`，不改派生节点、连线和轮询结构。

- [ ] **Step 6: 运行测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts' 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: PASS。

### Task 6: 派生节点保存计费快照和文档

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-upscale.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-upscale.test.mts`
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: 写失败测试**

扩展 `queuedJob` 并断言 `videoUpscaleMetadata(job)` 保存帧率、质量、音频、插帧模式、费用、折算分钟和计价版本。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: FAIL，画布元数据尚无计费快照。

- [ ] **Step 3: 保存快照**

给 `CanvasVideoUpscaleMetadata` 增加与公开任务字段一致的可选字段，在 `videoUpscaleMetadata` 中逐项复制，不改变节点位置、连接、结果 URL 或状态映射。

- [ ] **Step 4: 更新文档**

`docs/backend-database.md` 增加任务快照字段；`docs/pending-test.md` 增加用户可验收的输出选项和费用明细；若 `docs/todo.md` 已有对应待办则移除，否则保持不变。

- [ ] **Step 5: 运行测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: PASS。

### Task 7: 综合验证

**Files:**
- Verify only

- [ ] **Step 1: 后端相关包**

Run: `go test ./service ./repository ./handler ./router -count=1`
Expected: PASS，且测试不调用真实 LAS。

- [ ] **Step 2: 前端目标测试**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts' 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts' 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: 全部 PASS。

- [ ] **Step 3: TypeScript**

Run: `cd web && npm run typecheck`
Expected: PASS。

- [ ] **Step 4: 差异检查**

Run: `git diff --check`
Expected: 无输出，退出码 0；同时确认未覆盖既有 UI 改动，未新增真实任务或密钥。
