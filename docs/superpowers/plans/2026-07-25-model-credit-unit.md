# Model Credit Unit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video models charge per requested second, image models charge per requested image, and language models charge once per API call.

**Architecture:** Keep `modelCosts[].credits` as the unit price. The Go AI proxy derives a usage multiplier from the request path and payload before reserving credits, while canvas previews pass the matching image count or video duration to the existing frontend estimator. The admin table explains the unit from each model's configured capability without changing persisted settings.

**Tech Stack:** Go, Gin handlers, React, TypeScript, Ant Design, existing model capability helpers.

---

### Task 1: Derive backend billing usage from the request type

**Files:**
- Modify: `handler/ai.go:180-190,1147-1176`
- Test: `handler/ai_test.go:551-557`

- [ ] **Step 1: Replace the count-only test with request-type billing cases**

Add a table-driven test that proves video uses `duration` or `seconds`, images use `n`, text ignores `n`, and invalid values fall back to one:

```go
func TestReadAIRequestUsageUsesRequestBillingUnit(t *testing.T) {
	tests := []struct {
		name        string
		path        string
		body        string
		contentType string
		want        int
	}{
		{name: "video duration", path: "/videos", body: `{"duration":6}`, contentType: "application/json", want: 6},
		{name: "video seconds", path: "/videos", body: `{"seconds":10}`, contentType: "application/json", want: 10},
		{name: "image count", path: "/images/generations", body: `{"n":4}`, contentType: "application/json", want: 4},
		{name: "text call", path: "/chat/completions", body: `{"n":4}`, contentType: "application/json", want: 1},
		{name: "invalid video duration", path: "/videos", body: `{"duration":0}`, contentType: "application/json", want: 1},
		{name: "capped video duration", path: "/videos", body: `{"duration":999}`, contentType: "application/json", want: maxAIRequestCount},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := readAIRequestUsage(tt.path, []byte(tt.body), tt.contentType); got != tt.want {
				t.Fatalf("usage = %d, want %d", got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Change the proxy to use request usage instead of image count only**

Replace the multiplier call with:

```go
credits, err = multiplyAICredits(credits, readAIRequestUsage(path, body, contentType))
```

- [ ] **Step 3: Generalize the payload reader by request path**

Replace `readAIRequestCount` with a request-aware reader. It must support JSON and multipart payloads and keep the existing `1..15` clamp:

```go
func readAIRequestUsage(path string, body []byte, contentType string) int {
	keys := []string{}
	switch path {
	case "/videos":
		keys = []string{"duration", "seconds"}
	case "/images/generations", "/images/edits":
		keys = []string{"n"}
	default:
		return 1
	}
	usage := readAIRequestInt(body, contentType, keys...)
	if usage < 1 {
		return 1
	}
	if usage > maxAIRequestCount {
		return maxAIRequestCount
	}
	return usage
}

func readAIRequestInt(body []byte, contentType string, keys ...string) int {
	if strings.HasPrefix(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return 0
		}
		form, err := multipart.NewReader(bytes.NewReader(body), params["boundary"]).ReadForm(32 << 20)
		if err != nil {
			return 0
		}
		defer form.RemoveAll()
		for _, key := range keys {
			if values := form.Value[key]; len(values) > 0 {
				var value int
				_, _ = fmt.Sscan(values[0], &value)
				if value != 0 {
					return value
				}
			}
		}
		return 0
	}
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	for _, key := range keys {
		if value := aiRequestIntValue(payload[key]); value != 0 {
			return value
		}
	}
	return 0
}

func aiRequestIntValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case string:
		var parsed int
		_, _ = fmt.Sscan(typed, &parsed)
		return parsed
	default:
		return 0
	}
}
```

- [ ] **Step 4: Format the touched Go files**

Run only the mechanical formatter:

```bash
gofmt -w handler/ai.go handler/ai_test.go
```

Per project instructions, do not run Go tests unless the user explicitly requests validation.

### Task 2: Match canvas credit previews to backend units

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx:73`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx:57`
- Review unchanged: `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx:72`
- Review unchanged: `web/src/constant/credits.tsx:28-32`

- [ ] **Step 1: Pass video duration from the normal node prompt panel**

Change the estimator call so video uses `videoSeconds`, image uses `count`, and text uses one:

```tsx
const credits = requestCreditCost({
    channelMode: config.channelMode,
    modelCosts,
    model: config.model,
    fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined,
    count: mode === "video" ? config.videoSeconds : mode === "image" ? config.count : 1,
});
```

- [ ] **Step 2: Pass video duration from the generation config node**

Apply the same unit choice while preserving its normalized image `count`:

```tsx
const credits = requestCreditCost({
    channelMode: config.channelMode,
    modelCosts,
    model: config.model,
    fallbackModel: mode === "video" ? config.seedanceModel || config.videoModel : undefined,
    count: mode === "video" ? config.videoSeconds : mode === "image" ? count : 1,
});
```

- [ ] **Step 3: Confirm existing text and image paths already match the design**

Keep `CanvasAssistantComposer` unchanged because it supports text and image only, already passing `1` for text and `config.count` for images. Keep `requestCreditCost` unchanged because its normalized multiplier works for both requested seconds and requested image count.

Per project instructions, do not run frontend tests, type checks, or builds unless the user explicitly requests validation.

### Task 3: Explain billing units in admin settings

**Files:**
- Modify: `web/src/app/(admin)/admin/settings/page.tsx:739-759,1613-1620`

- [ ] **Step 1: Add the billing unit to each model row**

Build table rows with a capability-derived unit label:

```tsx
dataSource={publicModels.map((model) => ({
    model,
    credits: modelCostCredits(modelCosts, model),
    unit: modelCreditUnitLabel(model, channels),
}))}
```

- [ ] **Step 2: Render the unit-specific column title without adding fields**

Replace the fixed column title with a neutral title and show the row's billing rule beside the input:

```tsx
{
    title: "单位算力点",
    dataIndex: "credits",
    width: 260,
    render: (_, item) => (
        <Space.Compact className="w-full">
            <InputNumber min={0} step={1} precision={0} className="!w-full" value={item.credits} onChange={(value) => setModelCost(form, setModelCosts, item.model, Number(value) || 0)} />
            <Input className="w-24 text-center" value={`点 / ${item.unit}`} readOnly />
        </Space.Compact>
    ),
}
```

Use natural Chinese in the final rendering, such as `点 / 秒`, `点 / 张`, and `点 / 次`; do not persist the label.

- [ ] **Step 3: Add a small capability helper**

Place the helper beside `modelCostCredits` and reuse the existing capability map:

```ts
function modelCreditUnitLabel(model: string, channels: AdminModelChannel[]) {
    const capabilities = modelCapabilitiesByChannel(channels).get(model);
    if (modelMatchesAiCapability(model, capabilities, "video")) return "秒";
    if (modelMatchesAiCapability(model, capabilities, "image")) return "张";
    return "次";
}
```

### Task 4: Update billing documentation and pending verification

**Files:**
- Modify: `docs/system-settings.md:42-58`
- Modify: `docs/pending-test.md` under `## 当前版本验收清单`
- Modify: `CHANGELOG.md:3-6`
- Review unchanged: `docs/todo.md`

- [ ] **Step 1: Document the unit meaning of `credits`**

Update the `modelCosts` description to state:

```markdown
`credits` 是模型单位算力点：视频模型按每秒配置，图片模型按每张配置，语言模型按每次调用配置。后端按请求中的视频秒数或图片张数计算实际预扣，语言请求固定计算一次；任务失败时原额返还。
```

- [ ] **Step 2: Add a concise pending-test section**

Add a section that asks the user to verify one text request, a multi-image request, and videos of two different durations, including both preview and final credit logs:

```markdown
### 模型算力点按单位计费

- 后台“模型算力点”按模型能力显示 `点 / 次`、`点 / 张` 或 `点 / 秒`，保存后仍沿用现有模型费用配置。
- 语言模型一次请求扣一次单位算力点；图片生成按实际请求张数扣费；视频生成按请求秒数扣费。
- 在画布分别生成多张图片和两个不同时长的视频，确认按钮预估、AI 任务扣费与算力流水一致；失败任务按本次实际预扣数原额返还。
```

- [ ] **Step 3: Add one Unreleased summary line**

Add a version-level summary without repeating implementation details:

```markdown
+ [优化] 模型算力点改为按业务单位计费：语言按调用次数、图片按实际张数、视频按生成秒数，并统一画布预估、后台单位提示和后端扣费口径。
```

- [ ] **Step 4: Confirm the roadmap does not change**

Do not edit `docs/todo.md`: this is a correction to an implemented billing capability, not a new roadmap item.

### Task 5: Review the completed diff

**Files:**
- Review all files changed by Tasks 1-4

- [ ] **Step 1: Inspect scope and whitespace**

Run read-only checks:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: only the planned billing, UI, test, and documentation files are changed; the unrelated untracked `docs/superpowers/specs/2026-07-25-admin-credit-transfer-design.md` remains untouched.

- [ ] **Step 2: Report unexecuted validation clearly**

State that automated tests, type checks, and builds were not run because the project instructions require explicit user authorization for those commands. Do not claim runtime verification.
