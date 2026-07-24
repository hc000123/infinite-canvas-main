# Canvas Prompt Autosave and Reference Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让放大提示词编辑实时保存，并让首次生成、派生结果和媒体版本继续显示生成时的结构化 `@` 素材预览。

**Architecture:** 普通节点的放大编辑器直接复用现有 `updatePromptDocument`，关闭时仅刷新紧凑编辑器。生成动作把当前 `promptDocument` 写入结果 metadata；`canvas-generation-nodes.ts` 负责把本次实际使用的直接上游媒体连接复制到新结果节点，继续由现有 mention options 和版本投影恢复预览。

**Tech Stack:** React、TypeScript、Next.js App Router、Lexical、Node.js `node:test`。

---

## 文件结构

- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx` — 放大编辑实时保存并移除手动保存按钮。
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts` — 锁定自动保存及生成 hook 的结构化文档接线。
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.ts` — 规划新结果继承的直接媒体连接。
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts` — 验证媒体连接筛选、去重、原地生成和 `promptDocument` 保留。
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts` — 将直接上游连接交给图片生成动作。
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts` — 将当前结构化文档及实际图片引用传入图片结果。
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts` — 将当前结构化文档及实际媒体引用传入视频结果。
- Modify: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts` — 验证版本完成和切换恢复对应的结构化引用。
- Modify: `docs/pending-test.md` — 记录自动保存与生成前后预览一致性的页面验收项。

### Task 1: 放大提示词实时保存

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`

- [ ] **Step 1: 写失败接线测试**

向 `canvas-prompt-editor-wiring.test.mts` 增加：

```ts
test("expanded prompt editing autosaves without a manual save action", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");

    assert.match(promptPanel, /const closeExpandedEditor = \(\) =>/);
    assert.match(promptPanel, /expanded\s+onChange=\{updatePromptDocument\}/);
    assert.match(promptPanel, /footer=\{null\}/);
    assert.doesNotMatch(promptPanel, /saveExpandedEditor/);
    assert.doesNotMatch(promptPanel, /okText="保存"/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
```

Expected: 新测试 FAIL，当前仍存在 `saveExpandedEditor` 和 `okText="保存"`。

- [ ] **Step 3: 实现实时保存**

删除 `expandedPromptDocument` 与 `saveExpandedEditor`，将打开/关闭动作改为：

```ts
const openExpandedEditor = () => setExpandedEditorOpen(true);
const closeExpandedEditor = () => {
    setExpandedEditorOpen(false);
    setEditorRevision((revision) => revision + 1);
};
```

弹窗改为无底部操作，编辑器直接同步：

```tsx
<Modal
    rootClassName="studio-modal"
    title="展开编辑提示词 · 自动保存"
    open={expandedEditorOpen}
    width="min(1040px, calc(100vw - 32px))"
    footer={null}
    destroyOnHidden
    onCancel={closeExpandedEditor}
>
    <CanvasPromptEditor
        key={`${node.id}:expanded:${expandedEditorOpen}`}
        initialDocument={promptDocument}
        options={referenceMentionOptions}
        placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
        expanded
        onChange={updatePromptDocument}
        onPreviewReference={onPreviewReference}
    />
</Modal>
```

- [ ] **Step 4: 运行测试并确认通过**

Run: 与 Step 2 相同。

Expected: 所有 `canvas-prompt-editor-wiring` 测试通过。

- [ ] **Step 5: 提交自动保存改动**

```bash
git add "web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx" "web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
git commit -m "fix: autosave expanded canvas prompts"
```

### Task 2: 生成结果保留结构化引用与媒体连线

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-nodes.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts`

- [ ] **Step 1: 写生成节点失败测试**

在 `canvas-generation-nodes.test.mts` 增加一个配置节点、一个图片连接和一个文本连接，分别调用图片与视频节点规划函数：

```ts
const promptDocument = { version: 1 as const, blocks: [{ type: "reference" as const, nodeId: "image-ref", kind: "image" as const, label: "图片 1" }] };
const sourceNode = { id: "config-1", type: "config" as const, title: "生成配置", position: { x: 0, y: 0 }, width: 320, height: 420, metadata: { promptDocument } };
const sourceConnections = [
    { id: "image-link", fromNodeId: "image-ref", toNodeId: "config-1", toHandle: "first_frame" },
    { id: "text-link", fromNodeId: "text-ref", toNodeId: "config-1" },
];

test("generated media keeps prompt documents and inherits only used media connections", () => {
    const image = createImageGenerationNodes({ nodeId: sourceNode.id, sourceNode, prompt: "图片 1 起飞", count: 1, metadata: { promptDocument }, sourceConnections, referenceNodeIds: ["image-ref"] });
    const video = createVideoGenerationNode({ nodeId: sourceNode.id, sourceNode, prompt: "图片 1 起飞", spec: { width: 420, height: 236 }, metadata: { promptDocument }, sourceConnections, referenceNodeIds: ["image-ref"] });

    assert.deepEqual(image.rootNode.metadata.promptDocument, promptDocument);
    assert.deepEqual(video.videoNode.metadata?.promptDocument, promptDocument);
    assert.deepEqual(image.connections.map(({ fromNodeId, toNodeId, toHandle }) => ({ fromNodeId, toNodeId, toHandle })), [
        { fromNodeId: "config-1", toNodeId: image.rootId, toHandle: undefined },
        { fromNodeId: "image-ref", toNodeId: image.rootId, toHandle: "first_frame" },
    ]);
    assert.deepEqual(video.connections.map(({ fromNodeId, toNodeId, toHandle }) => ({ fromNodeId, toNodeId, toHandle })), [
        { fromNodeId: "image-ref", toNodeId: video.videoId, toHandle: "first_frame" },
        { fromNodeId: "config-1", toNodeId: video.videoId, toHandle: undefined },
    ]);
});
```

再增加原地生成测试，确认 `toNodeId` 未变化时不会复制原连接。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts"
```

Expected: FAIL，图片和视频规划函数尚不接受 `sourceConnections` / `referenceNodeIds`，也不会继承媒体连接。

- [ ] **Step 3: 实现媒体连接继承纯函数**

在 `canvas-generation-nodes.ts` 增加：

```ts
function inheritReferenceConnections(sourceConnections: CanvasConnection[], referenceNodeIds: string[], targetNodeIds: string[]) {
    const references = new Set(referenceNodeIds);
    const keys = new Set<string>();
    return targetNodeIds.flatMap((toNodeId) =>
        sourceConnections.flatMap((connection) => {
            if (connection.toNodeId === toNodeId || !references.has(connection.fromNodeId)) return [];
            const key = `${connection.fromNodeId}:${toNodeId}:${connection.fromHandle || ""}:${connection.toHandle || ""}`;
            if (keys.has(key)) return [];
            keys.add(key);
            return [{ ...connection, id: nanoid(), toNodeId }];
        }),
    );
}
```

给 `createVideoGenerationNode` 与 `createImageGenerationNodes` 增加可选参数：

```ts
sourceConnections?: CanvasConnection[];
referenceNodeIds?: string[];
```

视频新结果把继承连接放在源节点关系之前；图片结果把继承连接添加到 root 与 child，跳过原地目标。

- [ ] **Step 4: 写生成 hook 接线失败测试**

在 `canvas-prompt-editor-wiring.test.mts` 增加：

```ts
test("image and video generation preserve the active prompt document", () => {
    const flow = readCanvasFile("../hooks/use-canvas-generation-flow-actions.ts");
    const image = readCanvasFile("../hooks/use-canvas-image-generation-actions.ts");
    const video = readCanvasFile("../hooks/use-canvas-video-generation-actions.ts");

    assert.match(flow, /sourceConnections: connectionsRef\.current\.filter/);
    assert.match(image, /canvasPromptEditorDocument\(sourceNode\)/);
    assert.match(image, /referenceNodeIds: referenceImages\.map\(\(reference\) => reference\.id\)/);
    assert.match(video, /canvasPromptEditorDocument\(sourceNode\)/);
    assert.match(video, /referenceNodeIds: videoPlan\.references\.inputs/);
});
```

- [ ] **Step 5: 运行接线测试并确认失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
```

Expected: 新测试 FAIL，因为生成 hooks 还没有传递结构化文档和媒体连接。

- [ ] **Step 6: 接入图片和视频生成动作**

在图片、视频生成 hook 中读取：

```ts
const promptDocument = sourceNode ? canvasPromptEditorDocument(sourceNode) : undefined;
```

图片生成从 flow 接收当前目标的 `sourceConnections`，并调用：

```ts
createImageGenerationNodes({
    nodeId,
    sourceNode,
    prompt: effectivePrompt,
    count,
    metadata: { ...generationMetadata, promptDocument, ...canvasEpisodeMetadata(episodeContext), batchUsesReferenceImages: referenceImages.length > 0 },
    sourceConnections,
    referenceNodeIds: referenceImages.map((reference) => reference.id),
});
```

视频生成 metadata 增加 `promptDocument`，并调用：

```ts
createVideoGenerationNode({
    nodeId,
    sourceNode,
    sourceConnections,
    referenceNodeIds: (videoPlan.references.inputs || []).map((input) => input.nodeId).filter((id): id is string => Boolean(id)),
    prompt: effectivePrompt,
    spec: pendingSpec,
    metadata: { prompt: effectivePrompt, promptDocument, status: NODE_STATUS_LOADING, generationStartedAt, ...generationMetadata },
    replaceExistingResult,
});
```

所有 `beginPendingCanvasMediaVersion`、`bindPendingCanvasMediaVersionTask` 和图片版本完成调用统一传递 `promptDocument`。

- [ ] **Step 7: 运行生成节点、接线与类型检查**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts" "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
npm run typecheck
```

Expected: 专项测试通过，TypeScript 0 error。

- [ ] **Step 8: 提交生成引用保留改动**

```bash
git add "web/src/app/(user)/canvas/utils/canvas-generation-nodes.ts" "web/src/app/(user)/canvas/utils/canvas-generation-nodes.test.mts" "web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts" "web/src/app/(user)/canvas/hooks/use-canvas-generation-flow-actions.ts" "web/src/app/(user)/canvas/hooks/use-canvas-image-generation-actions.ts" "web/src/app/(user)/canvas/hooks/use-canvas-video-generation-actions.ts"
git commit -m "fix: preserve canvas prompt references after generation"
```

### Task 3: 版本引用回归、文档与最终验证

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts`
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 写版本引用回归测试**

给 `legacyImageNode` 增加旧版本 `promptDocument`，完成新版本时传入另一份文档，并在切换 v1 / v2 后分别断言：

```ts
assert.deepEqual(switchCanvasMediaVersion(versionedNode, firstVersionId).metadata?.promptDocument, oldPromptDocument);
assert.deepEqual(switchCanvasMediaVersion(versionedNode, secondVersionId).metadata?.promptDocument, newPromptDocument);
```

同时给 `completePendingCanvasMediaVersion` 的 pending 记录加入 `promptDocument`，断言新版本保存该文档。

- [ ] **Step 2: 运行版本测试**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-media-versions.test.mts"
```

Expected: 测试通过；现有版本逻辑已经支持结构化文档，本步骤锁定回归。

- [ ] **Step 3: 更新待验收文档**

在 `docs/pending-test.md` 的“画布交互可靠性、批量连线与提示词内嵌图片引用”中增加：

```md
13. 放大提示词编辑改为实时自动保存，不再需要手动点击保存；首次生成、派生结果和新版本均保留生成时的结构化 `@` 引用及实际媒体连线，生成前后缩略图保持一致。
```

待验收增加：

```md
13. 在普通节点放大编辑提示词，输入文字和 `@` 图片后直接关闭，确认紧凑编辑器已同步；分别从空媒体节点、文本节点和生成配置节点生成结果，确认结果节点提示词仍显示相同图片缩略图，切换版本时恢复对应版本的引用。
```

- [ ] **Step 4: 完整验证**

Run:

```bash
cd web
npm test
npm run typecheck
cd ..
git diff --check
git status --short
```

Expected: 688 项基线加新增测试全部通过、TypeScript 0 error、`git diff --check` 无输出，状态只包含计划内文档修改。

- [ ] **Step 5: 提交文档与回归测试**

```bash
git add "web/src/app/(user)/canvas/utils/canvas-media-versions.test.mts" docs/pending-test.md
git commit -m "test: cover canvas prompt reference versions"
```
