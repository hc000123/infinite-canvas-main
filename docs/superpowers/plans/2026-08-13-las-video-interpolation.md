# LAS 视频智能插帧 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 LAS 视频超分任务中串联 `las_video_interpolation`，提供 2×/60fps、三档模式和独立费用预估，并保证恢复过程不重复提交付费任务。

**Architecture:** 一条 `video_upscale_jobs` 记录保存超分和插帧两个 LAS Task ID、两个上游结果地址、处理阶段及两段费用快照。Worker 按持久化阶段推进“超分 → 插帧 → 下载”，已有 Task ID 时只 Poll；前端继续使用一个弹窗和一个派生节点。

**Tech Stack:** Go、Gin、GORM、ffprobe、LAS Operator API、Next.js、React、TypeScript、Ant Design、Node test runner

---

## 文件结构

- `model/video_upscale.go`：增加插帧配置、Task ID、阶段、结果与费用快照。
- `service/video_interpolation_pricing.go`：插帧目标帧率和官方费用纯函数。
- `service/video_upscale.go`：创建参数校验、目标帧率、双段费用快照和能力响应。
- `service/video_upscale_volcengine.go`：两段 Provider 协议、阶段机、Submit/Poll 和恢复防重复。
- `handler/video_upscale.go`：接收插帧模式表单字段。
- `web/src/services/api/video-upscale.ts`：公开能力、任务和提交类型。
- `web/src/app/(user)/canvas/utils/video-upscale-cost.ts`：前端插帧费用纯计算。
- `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`：启用帧率和插帧模式选择，分段显示费用。
- `web/src/app/(user)/canvas/utils/canvas-video-upscale.ts`、`types.ts`：保存插帧任务快照到派生节点。
- `docs/backend-database.md`、`docs/pending-test.md`、`docs/todo.md`：数据字典与验收说明。

### Task 1: 插帧目标和费用纯函数

**Files:**
- Create: `service/video_interpolation_pricing.go`
- Create: `service/video_interpolation_pricing_test.go`

- [ ] **Step 1: 写失败测试**

测试目标解析：

```go
fps, err := videoInterpolationTargetFPS(24000.0/1001, "double")
if err != nil || math.Abs(fps-48000.0/1001) > 1e-9 { t.Fatalf("fps=%g err=%v", fps, err) }
```

覆盖 `to60`、源帧率 ≥60、目标超过 `source×6`、未知源帧率；费用覆盖四档像素阈值、三种模式、差值 30/60/90/>90 和官方 `60→120 / 720P / medium / 5 分钟 = 20 元`。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service -run 'TestVideoInterpolation' -count=1`
Expected: FAIL，提示目标和计费函数不存在。

- [ ] **Step 3: 最小实现**

新增：

```go
const videoInterpolationUnitPriceCNY = 0.5
const videoInterpolationPricingRuleVersion = "las-interpolation-2026-08"

type videoInterpolationCostEstimate struct {
    TargetFrameRate float64
    DeltaFrameRate float64
    ResolutionBaseFactor float64
    FrameRateMultiplier float64
    BillableMinutes float64
    CostCNY float64
}

func videoInterpolationTargetFPS(sourceFPS float64, mode string) (float64, error)
func estimateVideoInterpolationCost(duration, sourceFPS, targetFPS float64, width, height int, mode string) (videoInterpolationCostEstimate, bool)
```

像素阈值严格使用 `927408 / 2086876 / 3709632`，帧率倍数使用 `math.Ceil((target-source)/30)`。

- [ ] **Step 4: 运行测试**

Run: `go test ./service -run 'TestVideoInterpolation' -count=1`
Expected: PASS。

### Task 2: 创建校验、任务快照与能力接口

**Files:**
- Modify: `model/video_upscale.go`
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_test.go`
- Modify: `handler/video_upscale.go`
- Modify: `handler/video_upscale_test.go`

- [ ] **Step 1: 写失败测试**

创建 `double/fast` 任务并断言：

```go
if job.InterpolationMode != "fast" || math.Abs(job.InterpolationTargetFrameRate-48) > 1e-9 || !job.InterpolationCostEstimateAvailable || job.EstimatedTotalCostCNY != job.EstimatedCostCNY+job.EstimatedInterpolationCostCNY {
    t.Fatalf("job=%#v", job)
}
```

另测 `to60`、60fps 拒绝 to60、未知帧率选择插帧在启动前拒绝、非法模式拒绝、keep 跳过插帧费用，以及 handler 传入 `interpolationMode`。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service ./handler -run 'VideoUpscale|VideoInterpolation' -count=1`
Expected: FAIL，提示新字段或行为不存在。

- [ ] **Step 3: 增加任务字段**

在 `VideoUpscaleJob` 增加：

```go
ProcessingStage string `json:"processingStage"`
InterpolationMode string `json:"interpolationMode"`
InterpolationTargetFrameRate float64 `json:"interpolationTargetFrameRate"`
InterpolationRunID string `json:"interpolationRunId" gorm:"index"`
UpscaleResultTOSURL string `json:"-" gorm:"type:text"`
InterpolationResultTOSURL string `json:"-" gorm:"type:text"`
EstimatedInterpolationBillableMinutes float64 `json:"estimatedInterpolationBillableMinutes"`
EstimatedInterpolationCostCNY float64 `json:"estimatedInterpolationCostCny"`
InterpolationCostEstimateAvailable bool `json:"interpolationCostEstimateAvailable"`
InterpolationPricingRuleVersion string `json:"interpolationPricingRuleVersion"`
EstimatedTotalCostCNY float64 `json:"estimatedTotalCostCny"`
```

- [ ] **Step 4: 校验并保存快照**

`VideoUpscaleCreateInput` 增加 `InterpolationMode`。`keep` 时固定空插帧模式和目标 0；`to25/to30/double/to60` 时要求可靠 FPS，计算目标和插帧费用。创建成功后 `ProcessingStage="queued"`，两个计价版本均冻结；总费用仅在两段都可估时有效。

- [ ] **Step 5: 扩展能力接口**

把插帧能力从 unavailable 改为：

```json
{
  "status": "available",
  "modes": ["keep", "to25", "to30", "double", "to60"],
  "processingModes": ["ultra-fast", "fast", "medium"],
  "defaultProcessingMode": "fast",
  "maxTargetFrameRate": 480,
  "maxSourceMultiplier": 6,
  "pricing": { "unitPriceCny": 0.5, "ruleVersion": "las-interpolation-2026-08", "pixelTiers": [] }
}
```

- [ ] **Step 6: 运行测试**

Run: `go test ./service ./handler -run 'VideoUpscale|VideoInterpolation' -count=1`
Expected: PASS。

### Task 3: LAS 双算子协议

**Files:**
- Modify: `service/video_upscale_volcengine.go`
- Modify: `service/video_upscale_volcengine_test.go`

- [ ] **Step 1: 写失败测试**

测试插帧 payload：

```go
payload := volcengineLASInterpolationSubmitPayload(job)
if payload["operator_id"] != "las_video_interpolation" { t.Fatalf("payload=%#v", payload) }
```

断言 `video_url` 使用 `UpscaleResultTOSURL`、`target_fps`、`mode`、`preserve_audio` 和 `output_basename=jobID-interpolation`。Poll 必须携带相应 operator ID，并解析 `output_video_tos_url / output_video_url / processed`。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service -run 'LAS.*Interpolation' -count=1`
Expected: FAIL，插帧协议尚不存在。

- [ ] **Step 3: 泛化 LAS Poll**

将 Client Poll 签名改为：

```go
func (client *lasClient) Poll(ctx context.Context, operatorID, taskID string) (lasTaskResponse, error)
```

响应 data 增加 `OutputVideoURL string` 和 `Processed *bool`，保留现有超分解析。

- [ ] **Step 4: 扩展 Provider 接口**

定义明确阶段方法：

```go
StartUpscale(context.Context, model.VideoUpscaleJob) (string, string, error)
PollUpscale(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error)
StartInterpolation(context.Context, model.VideoUpscaleJob) (string, string, error)
PollInterpolation(context.Context, model.VideoUpscaleJob) (VideoUpscalePollResult, error)
```

`VideoUpscalePollResult` 增加 `Processed *bool`。真实 provider 分别使用两个 operator ID。

- [ ] **Step 5: 运行测试**

Run: `go test ./service -run 'LAS.*Interpolation|LASSubmitPayload' -count=1`
Expected: PASS。

### Task 4: 串联阶段机与恢复安全

**Files:**
- Modify: `service/video_upscale.go`
- Modify: `service/video_upscale_volcengine.go`
- Modify: `service/video_upscale_volcengine_test.go`

- [ ] **Step 1: 写失败测试**

用假 Provider 覆盖：

- keep：超分成功后直接下载；
- double：超分完成保存 TOS 地址，下一步提交插帧，插帧完成后才下载；
- 已有超分 RunID 只 Poll；
- 已有插帧 RunID 只 Poll；
- 插帧 `processed=false` 失败；
- 服务重启恢复 `upscale_processing / interpolation_processing`；
- `upscale_submitting / interpolation_submitting` 且缺 Task ID 时标记 `submission_uncertain`，不调用 Submit。

- [ ] **Step 2: 确认测试先失败**

Run: `go test ./service -run 'ProcessVideoUpscale|RecoverInterruptedVideoUpscale' -count=1`
Expected: FAIL，阶段机尚未串联。

- [ ] **Step 3: 实现持久化阶段机**

每次付费 Submit 前先保存 `*_submitting`；成功取得 ID 后保存 `*_processing`。超分成功后保存 `UpscaleResultTOSURL`：keep 写到最终 `ResultSourceURL`，插帧模式进入 `interpolation_submitting`。插帧成功后写 `InterpolationResultTOSURL` 和最终 `ResultSourceURL`。

- [ ] **Step 4: 恢复与重试边界**

`RecoverInterruptedVideoUpscaleJobs` 只恢复已有相应 Task ID 的 processing 阶段。提交中且无 ID 的任务失败为 `submission_uncertain`。`RetryVideoUpscaleJob` 对该错误拒绝原 job 重试，提示重新创建并再次确认付费，避免同一 job 自动重复 Submit。

- [ ] **Step 5: 运行测试**

Run: `go test ./service -run 'ProcessVideoUpscale|RecoverInterruptedVideoUpscale|RetryVideoUpscale' -count=1`
Expected: PASS。

### Task 5: 前端插帧费用纯函数与类型

**Files:**
- Modify: `web/src/services/api/video-upscale.ts`
- Modify: `web/src/services/api/video-upscale.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/video-upscale-cost.ts`
- Modify: `web/src/app/(user)/canvas/utils/video-upscale-cost.test.mts`

- [ ] **Step 1: 写失败测试**

测试 60→120、720P、medium、5 分钟得到 `¥20.00`；测试 24→48、1080P、fast；像素阈值边界和未知 FPS 返回 null。API 测试断言提交 `interpolationMode`。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: FAIL，插帧计费工具与字段不存在。

- [ ] **Step 3: 同步类型**

新增 `VideoInterpolationProcessingMode`、能力 pricing、任务插帧快照和创建字段；`frameInterpolation.status` 改为 `available`。

- [ ] **Step 4: 实现前端纯函数**

```ts
export function estimateVideoInterpolationCost(input: {
    durationSeconds: number;
    sourceFrameRate: number;
    targetFrameRate: number;
    outputWidth: number;
    outputHeight: number;
    processingMode: VideoInterpolationProcessingMode;
    pricing: VideoInterpolationPricingRules;
}): VideoInterpolationCostEstimate | null
```

算法与后端完全一致，只读取能力接口规则。

- [ ] **Step 5: 运行测试**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: PASS。

### Task 6: 弹窗选项、费用明细与提交接线

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-upscale.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-upscale-actions.ts`

- [ ] **Step 1: 写失败测试**

锁定可用 `保持原帧率 / 智能插帧至 25fps / 至 30fps / 2× / 至 60fps`，插帧模式三项、默认 fast、已知源帧率达到固定目标时禁用对应项、未知帧率提示、分段费用和提交字段。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts'`
Expected: FAIL，插帧项仍为禁用占位。

- [ ] **Step 3: 启用帧率与模式**

将帧率 Radio 改为受控状态。选择非 keep 时展示模式 Segmented；已知源帧率达到 25 / 30 / 60 时禁用对应固定目标，未知时允许选择但提示由服务端识别和校验。继续只信任 `videoUpscale.inputFrameRate`，不读取项目预设 FPS。

- [ ] **Step 4: 分段费用展示**

keep 只显示 LAS；插帧可估时显示目标/差值、模式、基础系数、折算分钟、插帧费和总价；不可估时不显示金额。提交按钮只有完整可估时显示总费用。

- [ ] **Step 5: 接通表单**

`VideoUpscaleSubmitOptions` 带 `interpolationMode`，hook 原样传给 API。原派生节点和轮询代码不增加第二节点。

- [ ] **Step 6: 运行测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts' 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts'`
Expected: PASS。

### Task 7: 派生节点快照与文档

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-upscale.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-upscale.test.mts`
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: 写失败测试**

断言派生节点保存 processing stage、插帧模式、目标 FPS、插帧 Task ID、两段费用与总费用，但不保存私有 TOS 地址。

- [ ] **Step 2: 确认测试先失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: FAIL，新快照未复制。

- [ ] **Step 3: 保存公开快照**

扩展 `CanvasVideoUpscaleMetadata` 和 `videoUpscaleMetadata`，只复制公开任务字段；节点位置、连线、结果缓存和资产归档保持不变。

- [ ] **Step 4: 更新文档**

数据库文档记录阶段、第二 Task ID 和计费字段；待验收清单把插帧从“渠道待接入”更新为可用并明确禁止重复真实测试；todo 保留字幕抹除等未实现项，移除“补帧未接入”的描述。

- [ ] **Step 5: 运行测试**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: PASS。

### Task 8: 综合验证与复核

**Files:**
- Verify only

- [ ] **Step 1: 后端验证**

Run: `go test ./service ./repository ./handler ./router -count=1`
Expected: PASS，测试只用假 Provider，不请求 LAS。

- [ ] **Step 2: 前端目标测试**

Run: `cd web && node --experimental-strip-types --test src/services/api/video-upscale.test.mts 'src/app/(user)/canvas/components/canvas-video-upscale.test.mts' 'src/app/(user)/canvas/utils/video-upscale-cost.test.mts' 'src/app/(user)/canvas/utils/canvas-video-upscale.test.mts'`
Expected: 全部 PASS。

- [ ] **Step 3: TypeScript 与差异**

Run: `cd web && npm run typecheck && cd .. && git diff --check`
Expected: PASS，且确认没有真实 LAS 调用、密钥或第二个派生节点。

- [ ] **Step 4: 双重审核**

规格审核逐项核对设计文档；质量审核重点检查阶段恢复、提交不确定态、计价边界、前端可靠 FPS 来源和画布回归。所有 Critical / Important 问题修复并复审通过后完成。
