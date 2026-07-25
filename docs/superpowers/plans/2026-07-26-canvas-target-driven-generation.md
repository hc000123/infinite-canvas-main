# Canvas Target-Driven Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas connections use the target node type as the generation mode, while keeping generation manual and making config nodes optional.

**Architecture:** Keep connections as the persisted source of truth and reuse the existing generation context. Change connection completion to focus and open the target node, change the text-node image shortcut to create an image target, and centralize prompt ordering/default text refinement in the existing generation-input utility.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Zustand, Node test runner

---

## File map

- `web/src/app/(user)/canvas/hooks/use-canvas-connections.ts`: select the actual target and open its generation panel after a valid connection.
- `web/src/app/(user)/canvas/components/canvas-connection-create-menu.tsx`: describe text targets as text optimization.
- `web/src/app/(user)/canvas/hooks/use-canvas-node-derivative-actions.ts`: create a connected image node from the text-node image shortcut.
- `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts`: put upstream text before local supplemental instructions and supply the default text-refinement request.
- `web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts`: use the centralized effective-prompt resolver.
- `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`: explain connected text and present the local editor as supplemental instructions.
- `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`: cover prompt ordering and default refinement.
- `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`: cover target focus/panel wiring and the shortcut target type.
- `docs/canvas-node-manual.md`: document direct target-driven generation.
- `docs/todo.md`, `docs/pending-test.md`: record feature completion and manual acceptance cases without replacing current user edits.

### Task 1: Centralize target-driven prompt semantics

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts`
- Test: `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`

- [ ] **Step 1: Add prompt-semantics coverage**

Add imports for `resolveCanvasEffectivePrompt`, then change the existing upstream prompt expectation and add the default-refinement case:

```ts
assert.equal(context.prompt, "雨夜街道\n\n生成一个广告片");

test("uses a default refinement request for an empty text target with connected text", () => {
    const context = buildCanvasGenerationContext(
        "target",
        [
            { id: "source", type: "text", title: "原文", metadata: { content: "这是一段需要优化的文本。" } },
            { id: "target", type: "text", title: "优化结果", metadata: {} },
        ],
        [{ fromNodeId: "source", toNodeId: "target" }],
        "",
    );

    assert.equal(
        resolveCanvasEffectivePrompt({ mode: "text", localPrompt: "", editingTextNode: false, context }),
        "这是一段需要优化的文本。\n\n优化要求：保持原意，优化表达，使内容更清晰、自然、完整。",
    );
});
```

- [ ] **Step 2: Implement prompt ordering and default refinement**

In `canvas-generation-inputs.ts`, build the context prompt in source-first order and export the resolver:

```ts
export const DEFAULT_TEXT_REFINEMENT_INSTRUCTION = "保持原意，优化表达，使内容更清晰、自然、完整。";

export function resolveCanvasEffectivePrompt({
    mode,
    localPrompt,
    editingTextNode,
    context,
}: {
    mode: "text" | "image" | "video";
    localPrompt: string;
    editingTextNode: boolean;
    context: NodeGenerationContext;
}) {
    const effectivePrompt = context.prompt.trim();
    if (mode !== "text" || editingTextNode || localPrompt.trim() || context.textCount === 0) return effectivePrompt;
    return `${effectivePrompt}\n\n优化要求：${DEFAULT_TEXT_REFINEMENT_INSTRUCTION}`;
}
```

Replace the context prompt expression with:

```ts
prompt: [upstreamText, prompt].map((item) => item.trim()).filter(Boolean).join("\n\n"),
```

In `use-canvas-generation-flow-actions.ts`, import the resolver and replace `generationContext.prompt.trim()` with:

```ts
const effectivePrompt = resolveCanvasEffectivePrompt({
    mode,
    localPrompt: nodePrompt,
    editingTextNode,
    context: generationContext,
});
```

- [ ] **Step 3: Check the focused diff without running tests**

Run:

```bash
git diff --check -- 'web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts' 'web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts' 'web/src/app/(user)/canvas/components/canvas-node-generation.test.mts'
```

Expected: no output. Per project `AGENTS.md`, do not run tests unless the user explicitly requests checks.

### Task 2: Focus and open direct connection targets

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-connections.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-connection-create-menu.tsx`
- Test: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`

- [ ] **Step 1: Add connection-wiring coverage**

Extend the source-wiring test to assert that valid connections select the resolved target and open every generation-capable target, including text:

```ts
assert.match(hook, /setSelectedNodeIds\(new Set\(\[toNodeId\]\)\)/);
assert.match(hook, /openConnectedTargetPanel\(toNodeId, nodesRef\.current, setDialogNodeId\)/);
assert.match(hook, /type !== CanvasNodeType\.Audio/);
```

- [ ] **Step 2: Implement target selection and panel opening**

Add a small local helper in `use-canvas-connections.ts`:

```ts
function openConnectedTargetPanel(nodeId: string, nodes: CanvasNodeData[], setDialogNodeId: Dispatch<SetStateAction<string | null>>) {
    if (nodes.find((node) => node.id === nodeId)?.type !== CanvasNodeType.Audio) setDialogNodeId(nodeId);
}
```

After a valid single or batch connection is added, select `toNodeId`, clear the connection selection, and call the helper. In `createConnectedNode`, replace the current text exclusion with the same helper so newly created text targets open their prompt panel. Do not call `handleGenerateNode` from connection code.

- [ ] **Step 3: Clarify the creation menu**

Change the text option to:

```tsx
<ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本优化" description="优化、扩写或改写上游文本" onClick={() => onCreate(CanvasNodeType.Text)} />
```

- [ ] **Step 4: Check the focused diff without running tests**

Run:

```bash
git diff --check -- 'web/src/app/(user)/canvas/hooks/use-canvas-connections.ts' 'web/src/app/(user)/canvas/components/canvas-connection-create-menu.tsx' 'web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts'
```

Expected: no output.

### Task 3: Make the text-node image shortcut create an image target

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-derivative-actions.ts`
- Test: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`

- [ ] **Step 1: Add shortcut source coverage**

Read the derivative-action source and assert the shortcut uses the image spec and creates an image node:

```ts
const derivatives = readFileSync(new URL("../hooks/use-canvas-node-derivative-actions.ts", import.meta.url), "utf8");
assert.match(derivatives, /const nodeSize = getNodeSpec\(CanvasNodeType\.Image\)/);
assert.match(derivatives, /createNode\(\s*CanvasNodeType\.Image,/);
```

- [ ] **Step 2: Replace the config target with an image target**

In `generateImageFromTextNode`, use `CanvasNodeType.Image` for both `getNodeSpec` and `createNode`. Preserve the current prompt validation, connection creation, selection, and `setDialogNodeId` call. Initialize only the image target settings already needed by the existing image panel:

```ts
{
    model: canvasAiConfig.imageModel || canvasAiConfig.model,
    size: canvasAiConfig.size,
    count: CANVAS_IMAGE_GENERATION_DEFAULT_COUNT,
}
```

Do not call a generation action from this shortcut.

- [ ] **Step 3: Check the focused diff without running tests**

Run:

```bash
git diff --check -- 'web/src/app/(user)/canvas/hooks/use-canvas-node-derivative-actions.ts' 'web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts'
```

Expected: no output.

### Task 4: Explain connected-text behavior in the target panel

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`

- [ ] **Step 1: Change the prompt placeholder contract**

Pass `hasConnectedText` into `promptPlaceholder` and use supplemental wording:

```ts
function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean, hasConnectedText: boolean) {
    if (hasConnectedText) return mode === "text" ? "输入优化要求（可选）" : "输入补充要求（可选）";
    const action = mode === "image" ? (hasImageContent ? "描述要如何修改图片" : "描述要生成的图片") : mode === "text" ? (hasTextContent ? "输入文本修改要求" : "输入文本生成要求") : "描述要生成或修改的视频";
    return `${action}，输入 @ 选择已连接的参考素材`;
}
```

- [ ] **Step 2: Show the live-reference hint**

Above the prompt editor, render:

```tsx
{hasConnectedText ? (
    <div className="mb-2 text-xs" style={{ color: theme.node.muted }}>
        已连接文本将作为基础内容；这里可填写补充要求，留空则直接使用上游文本。
    </div>
) : null}
```

For text targets, the default refinement resolver supplies the missing instruction at submission time.

- [ ] **Step 3: Check the focused diff without running tests**

Run:

```bash
git diff --check -- 'web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx'
```

Expected: no output.

### Task 5: Update user-facing documentation

**Files:**
- Modify: `docs/canvas-node-manual.md`
- Modify: `docs/todo.md`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: Replace the mandatory config-node instructions**

Document that text-to-image/video/text connections create live inputs, open the target panel, and wait for the user to click generate. State that the config node remains available for advanced batch and parameter control.

- [ ] **Step 2: Record acceptance cases**

Add a compact pending-test entry covering:

```md
#### 画布目标节点驱动生成

- 文本连接图片、视频或文本节点后只打开目标生成面板，不自动生成或扣费。
- 图片和视频目标读取上游文本作为基础提示词，输入框只补充要求。
- 空文本目标在补充要求为空时使用默认优化指令。
- 文本节点“生图”创建空图片节点，不再创建生成配置节点。
- 生成配置节点的批量、参数和输入排序能力保持不变。
```

Remove the corresponding unfinished todo if one exists; otherwise add no new todo item.

- [ ] **Step 3: Review only the touched diffs**

Run:

```bash
git diff --check -- docs/canvas-node-manual.md docs/todo.md docs/pending-test.md
git diff -- docs/canvas-node-manual.md docs/todo.md docs/pending-test.md
```

Expected: no whitespace errors; existing unrelated user changes remain intact.

### Task 6: Final static verification and commit

**Files:**
- All files listed above

- [ ] **Step 1: Inspect the complete feature diff**

Run `git diff --check` for the exact feature files. Expected: no output.

- [ ] **Step 2: Confirm no automatic generation path was introduced**

Search the connection and shortcut files for `handleGenerateNode` or generation-request calls. Expected: none in the modified connection-completion and shortcut code.

- [ ] **Step 3: Do not run build or tests**

The project `AGENTS.md` explicitly says routine development does not run syntax checks, builds, or tests unless the user requests them. Report that focused tests were added but not executed.

- [ ] **Step 4: Commit only feature files**

Stage the exact feature files and commit them without staging unrelated workspace changes:

```bash
git add \
  'web/src/app/(user)/canvas/hooks/use-canvas-connections.ts' \
  'web/src/app/(user)/canvas/components/canvas-connection-create-menu.tsx' \
  'web/src/app/(user)/canvas/hooks/use-canvas-node-derivative-actions.ts' \
  'web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts' \
  'web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts' \
  'web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-generation.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts' \
  docs/canvas-node-manual.md docs/todo.md docs/pending-test.md
git commit -m "feat: route canvas generation by target node"
```
