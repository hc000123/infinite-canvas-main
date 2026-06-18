# Canvas Prompt Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first version of the canvas prompt Agent inside the existing canvas assistant.

**Architecture:** Keep the current assistant panel, sessions, and assistant action preview model. Add a small prompt-agent layer that parses model JSON into structured prompt outputs, maps those outputs to safe canvas actions, and renders prompt cards in assistant messages.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind, Zustand, existing canvas utility tests with `node --experimental-strip-types --test`.

---

## File Structure

- Create `web/src/app/(user)/canvas/utils/canvas-prompt-agent-types.ts`
  Defines `PromptAgentPlan`, output/action types, and type guards.
- Create `web/src/app/(user)/canvas/utils/canvas-prompt-agent.ts`
  Builds Agent system context and parses JSON replies with safe fallback.
- Create `web/src/app/(user)/canvas/utils/canvas-prompt-agent-actions.ts`
  Converts prompt Agent actions into existing `AssistantCanvasAction` previews.
- Create `web/src/app/(user)/canvas/utils/canvas-prompt-agent-render.ts`
  Formats structured outputs into compact Chinese display text for cards.
- Create `web/src/app/(user)/canvas/utils/canvas-prompt-agent.test.mts`
  Tests JSON parsing, fallback, and action mapping.
- Modify `web/src/app/(user)/canvas/types.ts`
  Adds optional `promptAgentPlan` and `promptAgentIntent` on assistant messages.
- Modify `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`
  Adds intent chips and default Agent placeholder.
- Modify `web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx`
  Renders structured prompt cards.
- Modify `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
  Routes submit through Prompt Agent for prompt-like requests and falls back to current chat.
- Modify `web/src/app/(user)/canvas/hooks/use-canvas-assistant-write-actions.ts`
  Adds image generation from a confirmed prompt config node if the plan includes generate-image action.
- Modify docs after implementation:
  `docs/todo.md`, `docs/pending-test.md`, and possibly `docs/features.md` only if the feature is ready for user-visible documentation.

## Task 1: Prompt Agent Types And Parser

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-agent-types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-agent.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-prompt-agent.test.mts`

- [ ] **Step 1: Write failing parser tests**

Add tests that import `parsePromptAgentPlan` and assert:

```ts
const raw = JSON.stringify({
    intent: "image_prompt",
    reply: "已整理图片提示词。",
    outputs: [{ id: "out-1", kind: "image_prompt", title: "雨夜角色", finalPrompt: "cinematic rain portrait", subject: "角色", style: "电影感" }],
    actions: [{ id: "act-1", type: "node.create_image_config", outputId: "out-1", title: "雨夜角色生图配置" }],
});
const result = parsePromptAgentPlan(raw);
assert.equal(result.ok, true);
assert.equal(result.plan?.intent, "image_prompt");
assert.equal(result.plan?.outputs[0].kind, "image_prompt");
```

Also test broken JSON:

```ts
const result = parsePromptAgentPlan("不是 JSON");
assert.equal(result.ok, false);
assert.match(result.text, /不是 JSON/);
```

- [ ] **Step 2: Run parser tests and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-agent.test.mts'
```

Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Add types and parser**

Implement union types for image/video/storyboard outputs, action types, `parsePromptAgentPlan`, `buildPromptAgentSystemContext`, `isPromptAgentRequest`, and `extractJsonObject`.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run the same command. Expected: PASS.

## Task 2: Agent Action Mapping

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-agent-actions.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-agent.test.mts`

- [ ] **Step 1: Write failing action mapping tests**

Add tests for:

```ts
const plan = {
    intent: "video_prompt",
    reply: "已整理视频提示词。",
    outputs: [{ id: "v1", kind: "video_prompt", title: "追逐镜头", finalPrompt: "低机位跟拍奔跑", duration: "6", ratio: "16:9" }],
    actions: [{ id: "a1", type: "node.create_video_config", outputId: "v1", title: "追逐镜头视频配置" }],
};
const result = buildPromptAgentCanvasActions({ plan, nodes: [], connections: [], selectedNodeIds: [] });
assert.equal(result?.actions[0].type, "node.create_config");
assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.mode : "", "video");
```

Add a storyboard test that creates more than one text/config action.

- [ ] **Step 2: Run action tests and verify RED**

Expected: FAIL because mapper is missing.

- [ ] **Step 3: Implement action mapper**

Map:

- `node.create_image_config` → `node.create_config` with `mode: "image"`, `prompt`, `finalPrompt`, `sourceType: "manual"`.
- `node.create_video_config` → `node.create_config` with `mode: "video"`, `prompt`, `finalPrompt`, `duration`, `seconds`, `ratio`, `size`, `storyboardRole: "video_config"`.
- `node.create_storyboard_group` → one `node.create_text` per shot with readable shot content.

Use `buildAssistantCanvasActionPreview` to attach previews and update `nextNodes` between actions.

- [ ] **Step 4: Run tests and verify GREEN**

Run the prompt agent test file. Expected: PASS.

## Task 3: Assistant Message Model And Prompt Cards

**Files:**
- Modify: `web/src/app/(user)/canvas/types.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-prompt-agent-render.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx`

- [ ] **Step 1: Add render tests if formatting is non-trivial**

Add pure tests for `formatPromptAgentOutputText` if the helper has branching for image/video/storyboard.

- [ ] **Step 2: Extend assistant message type**

Add:

```ts
promptAgentPlan?: PromptAgentPlan;
promptAgentIntent?: PromptAgentIntent;
```

Import the types with `import type`.

- [ ] **Step 3: Render prompt cards**

In assistant messages, if `message.promptAgentPlan?.outputs.length`, render a compact card below the message text:

- label: 图片提示词 / 视频提示词 / 分镜提示词
- title
- final prompt in `whitespace-pre-wrap`
- storyboard shots as short numbered blocks

Use current canvas theme tokens, no global CSS.

- [ ] **Step 4: Keep existing actions working**

Ensure existing assistant action preview still renders under the prompt card.

## Task 4: Composer Intent Controls

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-composer.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`

- [ ] **Step 1: Add an optional intent prop**

Add `intent` and `onIntentChange` props to composer:

```ts
intent: PromptAgentIntent | "auto";
onIntentChange: (intent: PromptAgentIntent | "auto") => void;
```

- [ ] **Step 2: Add intent chips**

Add compact Ant Design text buttons or existing button styling for:

- 自动
- 图片
- 视频
- 分镜

Clicking a chip sets intent but does not submit.

- [ ] **Step 3: Update placeholder**

Use:

```ts
placeholder={mode === "image" ? "描述你想生成或修改的图片" : "描述你想写的图片、视频或分镜提示词"}
```

Keep the current prompt library, model picker, and image settings controls.

## Task 5: Panel Submit Flow

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`

- [ ] **Step 1: Add Agent request path**

Before the current plain chat request, detect prompt-like requests with `isPromptAgentRequest(text, intent)`.

- [ ] **Step 2: Call text model with Agent system context**

Build chat messages using current conversation plus:

```ts
buildPromptAgentSystemContext({ workflowContext: workflowContext.text, selectedReferences, intent })
```

Use `requestImageQuestion` with text model config.

- [ ] **Step 3: Parse and append Agent message**

If parse succeeds:

- append assistant message with `promptAgentPlan`
- map actions with `buildPromptAgentCanvasActions`
- attach `assistantActions` and `assistantActionStatus: "pending"` when actions exist

If parse fails:

- append assistant message as normal text with the raw answer

- [ ] **Step 4: Preserve old controlled action parsing**

Keep workflow action suggestions and simple existing action parsing before Agent text call.

## Task 6: Confirmed Image Generation

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-messages.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-assistant-write-actions.ts`

- [ ] **Step 1: Add optional generate callback**

Add a callback for prompt Agent image generation. It receives the assistant message and selected image output id.

- [ ] **Step 2: Execute as create config plus image generation**

First apply the node-create action. Then call existing `sendMessage` image path using the selected output final prompt and references, so generated images remain in assistant history and can be inserted into canvas.

- [ ] **Step 3: Do not add video generation**

Ensure no video action calls generation APIs. Video config nodes are the final first-version output.

## Task 7: Docs And Focused Verification

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`
- Optional Modify: `docs/features.md`

- [ ] **Step 1: Move or add pending-test entry**

Record that画布助手 now has a first-version prompt Agent pending user testing.

- [ ] **Step 2: Run focused tests**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-prompt-agent.test.mts' 'src/app/(user)/canvas/utils/canvas-assistant-actions.test.mts'
```

Expected: PASS.

- [ ] **Step 3: Typecheck only if needed**

Run `cd web && npm run typecheck` if TypeScript uncertainty remains after implementation. The project instruction says not to run broad checks by default, so this is optional unless needed.

## Self Review

- Spec coverage: image/video/storyboard prompt outputs, confirmation, node creation, and image generation are covered.
- Scope control: no direct video generation and no backend Agent Run.
- Test order: pure parser/action tests are written before implementation.
- Existing user changes: do not stage or modify `web/next-env.d.ts`.
