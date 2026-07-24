# 画布节点复制继承上游连线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让右键复制和快捷键复制粘贴都自动继承被复制节点的上游连线，并把图片、视频副本重置为只保留提示词与生成参数的新草稿。

**Architecture:** 扩展现有 `canvas-clipboard.ts` 为统一的纯数据复制规划器：复制阶段收集所有进入选区的连线，粘贴阶段一次建立 ID 映射、重建节点元数据和上游连接。右键复制复用同一套 copy/paste 函数，React hooks 只应用规划结果，不维护第二套清理规则。

**Tech Stack:** TypeScript、React hooks、Node.js `node:test`、现有画布节点与连线类型。

---

### Task 1: 统一复制规划器

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-clipboard.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-clipboard.test.mts`

- [ ] **Step 1: 写入单节点上游继承与结果清理失败测试**

在 `canvas-clipboard.test.mts` 增加一个已生成视频节点，包含上游首帧、尾帧、下游连接、提示词草稿、结构化引用、生成参数、媒体结果、版本和任务字段。测试复制粘贴后：

```ts
test("duplicates a generated node with upstream connections but without generated results", () => {
    const sourceNodes = [firstFrame, lastFrame, generatedVideo, downstream];
    const clipboard = copySelectedCanvasItems(sourceNodes, sourceConnections, new Set(["video-result"]));
    const pasted = pasteCanvasClipboard(clipboard, { x: 900, y: 400 }, fixedIds);
    const copy = pasted?.nodes[0];

    assert.deepEqual(pasted?.connections.map(({ fromNodeId, toNodeId, toHandle }) => [fromNodeId, toNodeId, toHandle]), [
        ["image-first", "video-copy", "first_frame"],
        ["image-last", "video-copy", "last_frame"],
    ]);
    assert.equal(copy?.metadata?.prompt, "修改后的提示词");
    assert.deepEqual(copy?.metadata?.promptDocument, draftDocument);
    assert.equal(copy?.metadata?.model, "seedance-2.0");
    assert.equal(copy?.metadata?.content, undefined);
    assert.equal(copy?.metadata?.mediaVersions, undefined);
    assert.equal(copy?.metadata?.taskId, undefined);
    assert.equal(copy?.metadata?.status, "idle");
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-clipboard.test.mts'
```

Expected: FAIL；当前只复制选区内部连接，并且副本仍保留 `content`、`mediaVersions` 和任务字段。

- [ ] **Step 3: 写入多选内部映射失败测试**

新增测试：外部图片连接到选中的配置节点，配置节点再连接到选中的视频节点，视频节点连接未选中下游。粘贴后断言外部图片仍连接新配置，新配置连接新视频，下游连接不复制；同时结构化 `@`、`inputOrder`、`referenceOrder` 和 `referenceRoles` 中的选区内部节点 ID 映射为新 ID。

```ts
assert.deepEqual(pasted?.connections.map((item) => [item.fromNodeId, item.toNodeId]), [
    ["external-image", "config-copy"],
    ["config-copy", "video-copy"],
]);
assert.deepEqual(pastedConfig.metadata?.inputOrder, ["external-image"]);
assert.equal(pastedVideo.metadata?.promptDocument?.blocks[0]?.nodeId, "config-copy");
assert.equal(pastedVideo.metadata?.referenceRoles?.[0]?.nodeId, "config-copy");
```

- [ ] **Step 4: 实现上游收集、元数据规范化与 ID 重映射**

在 `canvas-clipboard.ts` 增加以下职责明确的私有函数：

```ts
function duplicateCanvasNodeMetadata(node: CanvasNodeData, idMap: ReadonlyMap<string, string>) {
    const metadata = { ...node.metadata };
    const prompt = metadata.promptDraft ?? metadata.prompt;
    const promptDocument = remapPromptDocument(metadata.promptDraftDocument ?? metadata.promptDocument, idMap);

    metadata.prompt = prompt;
    metadata.promptDocument = promptDocument;
    metadata.promptDraft = undefined;
    metadata.promptDraftDocument = undefined;
    metadata.pendingMediaVersion = undefined;
    metadata.mediaVersions = undefined;
    metadata.currentMediaVersionId = undefined;
    metadata.errorDetails = undefined;
    metadata.taskId = undefined;
    metadata.taskStatus = undefined;
    metadata.rawTaskStatus = undefined;
    metadata.aiTaskId = undefined;
    metadata.upstreamTaskId = undefined;
    metadata.aiTaskStatus = undefined;
    metadata.generationStartedAt = undefined;
    metadata.taskCreatedAt = undefined;
    metadata.taskUpdatedAt = undefined;
    metadata.finishedAt = undefined;
    metadata.referenceRoles = metadata.referenceRoles?.map((item) => ({ ...item, nodeId: idMap.get(item.nodeId) || item.nodeId }));
    metadata.referenceOrder = metadata.referenceOrder?.map((item) => ({ ...item, nodeId: item.nodeId ? idMap.get(item.nodeId) || item.nodeId : undefined }));
    metadata.inputOrder = metadata.inputOrder?.map((id) => idMap.get(id) || id);

    if (node.type === "image" || node.type === "video") clearDuplicatedMediaResult(metadata);
    else if (node.type === "config") metadata.status = "idle";
    return metadata;
}
```

`clearDuplicatedMediaResult` 使用完整键表清空媒体地址、存储、尺寸、任务账本、素材身份、生产绑定、变体/连续镜头来源和批量图片关系，并把 `status` 设为 `idle`。音频内容和文本 `content` 不进入该清理函数：

```ts
const DUPLICATED_MEDIA_RESULT_KEYS = [
    "content", "mediaVersions", "currentMediaVersionId", "pendingMediaVersion",
    "videoUrl", "cacheUrl", "cachePath", "cacheFilename", "lastFrameUrl", "lastFrameStorageKey",
    "storageKey", "mimeType", "bytes", "naturalWidth", "naturalHeight", "volcengineAsset",
    "taskId", "taskStatus", "rawTaskStatus", "aiTaskId", "upstreamTaskId", "aiTaskStatus",
    "aiTaskCredits", "creditLogId", "creditsRefunded", "refundedAt", "finishedAt",
    "generationStartedAt", "taskCreatedAt", "taskUpdatedAt", "taskDuration",
    "executionExpiresAfter", "videoUrlExpiresAt", "localStoredAt", "errorDetails",
    "sourceAssetId", "assetVersion", "assetReferenceMode", "assetNodeNumber", "canvasSource",
    "variantOfNodeId", "continuationOfNodeId", "sourceVideoNodeId",
    "capturedFrameSourceVideoNodeId", "capturedFrameTime", "capturedFrameAt", "capturedFrameSource",
    "videoReferences", "audioReferences", "references",
    "isBatchRoot", "batchRootId", "batchChildIds", "batchUsesReferenceImages", "primaryImageId", "imageBatchExpanded",
    "productionVideoVersionId", "productionVideoVersionNumber", "productionVideoVersionCreatedAt",
    "productionVideoVersionNote", "productionVideoVersionHidden", "isCurrentProductionVersion",
] as const satisfies readonly (keyof CanvasNodeMetadata)[];

function clearDuplicatedMediaResult(metadata: CanvasNodeMetadata) {
    for (const key of DUPLICATED_MEDIA_RESULT_KEYS) delete metadata[key];
    metadata.status = "idle";
}
```

结构化提示词只替换选区内部已复制节点的 ID，外部上游 ID 保持不变：

```ts
function remapPromptDocument(document: CanvasPromptDocument | undefined, idMap: ReadonlyMap<string, string>) {
    if (!document) return undefined;
    return {
        ...document,
        blocks: document.blocks.map((block) => block.type === "reference" ? { ...block, nodeId: idMap.get(block.nodeId) || block.nodeId } : { ...block }),
    };
}
```

将连接收集改为只保存目标位于选区、且源节点真实存在的连接，并按 `fromNodeId + toNodeId + fromHandle + toHandle` 去重：

```ts
connections: connections.filter((connection) => selectedIds.has(connection.toNodeId) && nodeIds.has(connection.fromNodeId))
```

粘贴阶段先为全部节点建立 `idMap`，再创建节点；连接目标必须映射，连接源优先使用映射后的选区内部节点，否则保留外部上游 ID：

```ts
const fromNodeId = idMap.get(connection.fromNodeId) || connection.fromNodeId;
const toNodeId = idMap.get(connection.toNodeId);
if (!toNodeId) return [];
```

- [ ] **Step 5: 运行专项测试并确认通过**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-clipboard.test.mts'
```

Expected: 所有 clipboard 测试 PASS，且原有居中和防重复位置测试保持通过。

- [ ] **Step 6: 提交纯数据规划器**

```bash
git add 'web/src/app/(user)/canvas/utils/canvas-clipboard.ts' \
        'web/src/app/(user)/canvas/utils/canvas-clipboard.test.mts'
git commit -m 'feat: inherit upstream links when copying canvas nodes'
```

### Task 2: 右键复制接入共享规划器

**Files:**
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Create: `web/src/app/(user)/canvas/utils/canvas-duplicate-wiring.test.mts`

- [ ] **Step 1: 写入右键与快捷键共享规划器的失败接线测试**

创建源码接线测试：

```ts
test("context duplicate and keyboard paste use the same canvas clipboard planner", () => {
    const crud = readCanvasFile("../hooks/use-canvas-node-crud-actions.ts");
    const clipboard = readCanvasFile("../hooks/use-canvas-clipboard-actions.ts");
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");

    assert.match(crud, /copySelectedCanvasItems/);
    assert.match(crud, /pasteCanvasClipboard/);
    assert.match(crud, /setConnections\(\(prev\) => \[\.\.\.prev, \.\.\.pasted\.connections\]\)/);
    assert.match(clipboard, /pasteCanvasClipboard/);
    assert.match(page, /connectionsRef=\{connectionsRef\}/);
});
```

- [ ] **Step 2: 运行接线测试并确认正确失败**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-duplicate-wiring.test.mts'
```

Expected: FAIL；当前右键复制手写节点浅拷贝，不读取或新增连线。

- [ ] **Step 3: 将右键复制改为共享 copy/paste 流程**

为 `UseCanvasNodeCrudActionsOptions` 增加：

```ts
connectionsRef: RefObject<CanvasConnection[]>;
```

`duplicateNode` 先复制单节点选区，再以原节点中心偏移 36 像素规划粘贴；对返回的单节点使用现有 `placeCanvasNodeAwayFromNodes` 做最终防重叠，然后同时应用节点和连线：

```ts
const clipboard = copySelectedCanvasItems(nodesRef.current, connectionsRef.current, new Set([nodeId]));
const pasted = pasteCanvasClipboard(clipboard, {
    x: source.position.x + source.width / 2 + 36,
    y: source.position.y + source.height / 2 + 36,
}, undefined, nodesRef.current);
if (!pasted) return;

const [draft] = pasted.nodes;
if (!draft) return;
const next = placeCanvasNodeAwayFromNodes(draft, nodesRef.current);
setNodes((prev) => [...prev, next]);
setConnections((prev) => [...prev, ...pasted.connections]);
```

页面调用处传入 `connectionsRef={connectionsRef}`。保留当前选择新节点、清除连线选择和打开节点面板的交互。

- [ ] **Step 4: 运行接线、clipboard 测试与类型检查**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-clipboard.test.mts' \
  'src/app/(user)/canvas/utils/canvas-duplicate-wiring.test.mts'
npm run typecheck
```

Expected: 专项测试全部 PASS，TypeScript exit 0。

- [ ] **Step 5: 提交右键复制接线**

```bash
git add 'web/src/app/(user)/canvas/hooks/use-canvas-node-crud-actions.ts' \
        'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' \
        'web/src/app/(user)/canvas/utils/canvas-duplicate-wiring.test.mts'
git commit -m 'feat: reuse upstream-aware duplication from node menu'
```

### Task 3: 验收记录与完整验证

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 增加待验收说明**

在“画布交互可靠性、批量连线与提示词内嵌图片引用”的本次实现和待验收列表各追加一项：

```md
16. 复制节点会自动继承全部上游连线；右键复制与快捷键复制粘贴行为一致。图片和视频副本保留当前提示词、结构化 `@` 引用及生成参数，但清空媒体结果、任务和版本历史，从 v1 重新生成。
```

```md
16. 分别使用右键和快捷键复制一个已有多条上游素材连线、两个媒体版本的视频节点；确认新节点自动接回相同上游，首尾帧接口不变，不连接原下游，媒体区域为空且首次生成后只有 v1。多选包含上游节点和目标节点后复制，确认选区内部连接映射到新节点。
```

- [ ] **Step 2: 运行完整前端验证**

Run:

```bash
cd web
npm test
npm run typecheck
cd ..
git diff --check
```

Expected: 全部测试 PASS、TypeScript exit 0、`git diff --check` 无输出。

- [ ] **Step 3: 提交验收记录**

```bash
git add docs/pending-test.md
git commit -m 'docs: add upstream copy acceptance checks'
```

- [ ] **Step 4: 按完成分支流程合并**

确认功能分支干净后，使用 `finishing-a-development-branch`。用户已授权直接实施，因此选择本地合并；合并前保护主工作区的其他未提交文件，合并后重新运行 `npm test` 与 `npm run typecheck`，最后移除隔离工作区和功能分支。
