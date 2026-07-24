# Canvas Video Reference Order Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除视频节点多素材提交时结构化 `@` 编号、素材输入顺序和首尾帧角色发生 A/B 互换的风险。

**Architecture:** 在生成输入工具中增加纯函数，把当前有效连接顺序固化到目标节点 `metadata.inputOrder`，连接 hook 在单条、批量和新节点连接时统一调用。提交动作不再使用缓存编号，而是用当前结构化文档和当前 mention options 即时序列化；Seedance payload 继续消费同一生成输入顺序。

**Tech Stack:** React、TypeScript、Next.js、Node.js `node:test`。

---

## 文件结构

- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts` — 合并并固化目标节点输入顺序。
- Modify: `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts` — 验证顺序固化、去重和首尾帧稳定。
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-connections.ts` — 单条、批量、新节点连接时写入 `inputOrder`。
- Modify: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts` — 锁定连接 hook 的顺序接线。
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx` — 普通图片、视频、文本节点提交时即时序列化。
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx` — 生成配置节点提交时即时序列化。
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts` — 锁定两条提交入口不再使用缓存编号。
- Modify: `docs/pending-test.md` — 增加多素材防漂移验收项。

### Task 1: 固化连接素材顺序

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-connections.ts`

- [ ] **Step 1: 写输入顺序失败测试**

在 `canvas-node-generation.test.mts` 中导入 `applyCanvasInputOrder`，验证已有顺序优先、失效 ID 被移除、新来源追加且重复 ID 去重：

```ts
test("persists connected input order without replacing an explicit order", () => {
    const nodes = [
        { id: "image-a", type: "image", title: "A", metadata: { content: "asset://A" } },
        { id: "image-b", type: "image", title: "B", metadata: { content: "asset://B" } },
        { id: "image-c", type: "image", title: "C", metadata: { content: "asset://C" } },
        { id: "target", type: "video", title: "视频", metadata: { inputOrder: ["missing", "image-b", "image-a"] } },
    ];

    const next = applyCanvasInputOrder(nodes, "target", ["image-a", "image-b", "image-c", "image-a"]);

    assert.deepEqual(next.find((node) => node.id === "target")?.metadata?.inputOrder, ["image-b", "image-a", "image-c"]);
});
```

再增加一个 `first_last_frame` 测试：连接数组顺序为 B、A，但 `inputOrder` 为 A、B，断言角色仍为 A=首帧、B=尾帧。

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/components/canvas-node-generation.test.mts"
```

Expected: FAIL，`applyCanvasInputOrder` 尚未导出。

- [ ] **Step 3: 实现纯函数**

在 `canvas-generation-inputs.ts` 增加：

```ts
export function applyCanvasInputOrder<T extends CanvasGenerationNodeLike>(nodes: T[], targetNodeId: string, sourceNodeIds: string[]) {
    const connectedIds = [...new Set(sourceNodeIds)];
    return nodes.map((node) => {
        if (node.id !== targetNodeId) return node;
        const current = node.metadata?.inputOrder || [];
        const next = [...current.filter((id) => connectedIds.includes(id)), ...connectedIds.filter((id) => !current.includes(id))];
        if (next.length === current.length && next.every((id, index) => id === current[index])) return node;
        return { ...node, metadata: { ...node.metadata, inputOrder: next } };
    });
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: 与 Step 2 相同。

Expected: `canvas-node-generation` 全部通过。

- [ ] **Step 5: 写连接 hook 失败接线测试**

在 `canvas-batch-connections.test.mts` 的 hook 接线测试中增加：

```ts
assert.match(hook, /applyCanvasInputOrder/);
assert.match(hook, /nextInputSourceIds/);
```

- [ ] **Step 6: 运行测试确认 RED**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-batch-connections.test.mts"
```

Expected: FAIL，连接 hook 尚未调用顺序固化函数。

- [ ] **Step 7: 接入三种连接路径**

在 `use-canvas-connections.ts` 增加局部工具：

```ts
const nextInputSourceIds = (targetNodeId: string, additions: CanvasConnectionDraft[]) => [
    ...connectionsRef.current.filter((connection) => connection.toNodeId === targetNodeId).map((connection) => connection.fromNodeId),
    ...additions.filter((connection) => connection.toNodeId === targetNodeId).map((connection) => connection.fromNodeId),
];
```

单条连接、批量连接和创建新节点连接的 `setNodes` 都在帧角色 metadata 更新后调用：

```ts
applyCanvasInputOrder(nextNodes, targetNodeId, nextInputSourceIds(targetNodeId, additions))
```

- [ ] **Step 8: 运行两组专项测试**

Run:

```bash
cd web
node --experimental-strip-types --test \
  "src/app/(user)/canvas/components/canvas-node-generation.test.mts" \
  "src/app/(user)/canvas/utils/canvas-batch-connections.test.mts"
```

Expected: 全部通过。

- [ ] **Step 9: 提交**

```bash
git add \
  "web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts" \
  "web/src/app/(user)/canvas/components/canvas-node-generation.test.mts" \
  "web/src/app/(user)/canvas/hooks/use-canvas-connections.ts" \
  "web/src/app/(user)/canvas/utils/canvas-batch-connections.test.mts"
git commit -m "fix: stabilize canvas reference input order"
```

### Task 2: 提交时原子重建提示词编号

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`

- [ ] **Step 1: 写失败接线测试**

在 `canvas-prompt-editor-wiring.test.mts` 增加：

```ts
test("generation serializes structured references against the latest input order", () => {
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");

    assert.match(promptPanel, /serializePromptDocument\(promptDocument, referenceMentionOptions\)\.trim\(\)/);
    assert.match(layer, /serializePromptDocument\(target\.metadata\.promptDocument, buildReferenceMentionOptions\(inputs\)\)/);
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
```

Expected: FAIL，两个提交入口仍使用缓存 `prompt`。

- [ ] **Step 3: 修改普通节点提交**

将 `CanvasNodePromptPanel.submit` 的文本来源改为：

```ts
const text = serializePromptDocument(promptDocument, referenceMentionOptions).trim();
```

这样图片相机提示仍在重新序列化之后追加。

- [ ] **Step 4: 修改生成配置节点提交**

在 `canvas-nodes-layer.tsx` 导入 `serializePromptDocument`，配置节点生成入口改为：

```ts
const inputs = configInputsById.get(nodeId) || [];
const prompt = target?.metadata?.promptDocument
    ? serializePromptDocument(target.metadata.promptDocument, buildReferenceMentionOptions(inputs))
    : target?.metadata?.prompt || "";
void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", prompt);
```

- [ ] **Step 5: 运行接线与提示词测试**

Run:

```bash
cd web
node --experimental-strip-types --test \
  "src/app/(user)/canvas/utils/canvas-prompt-document.test.mts" \
  "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
```

Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add \
  "web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx" \
  "web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx" \
  "web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
git commit -m "fix: submit canvas references with current ordering"
```

### Task 3: 验收文档与完整验证

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 更新待验收说明**

在“画布交互可靠性、批量连线与提示词内嵌图片引用”增加：

```md
14. 视频节点和视频生成配置节点会固化连接素材顺序；提交时按当前顺序即时序列化结构化 `@` 引用，避免图片 A / B 编号、缩略图、首尾帧角色和实际 payload 互换。
```

待验收增加：

```md
14. 将素材 A、B 连接到视频节点并在提示词中分别 `@`；调整顺序、断开重连和批量连接后提交，确认界面显示的“图片 N”、缩略图、首尾帧角色与最终请求顺序始终一致。
```

- [ ] **Step 2: 完整验证**

Run:

```bash
cd web
npm test
npm run typecheck
cd ..
git diff --check
git status --short
```

Expected: 前端全量测试通过、TypeScript 0 error、差异格式检查无输出，只包含计划内文档修改。

- [ ] **Step 3: 提交**

```bash
git add docs/pending-test.md
git commit -m "docs: add canvas reference order acceptance"
```
