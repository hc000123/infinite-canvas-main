# 画布规模稳定性一期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为单画布增加容量软预警，并降低大量节点、连线和配置节点造成的渲染、计算与节点重叠风险。

**Architecture:** 新增容量统计和视口几何两个纯工具，由顶部容量组件与连线层消费；生成输入改为一次建立拓扑索引、多个配置节点复用；节点放置保留现有近邻搜索，并用内容最右边界提供必不重叠的最终位置。所有改动保持现有画布持久化结构和生成 payload 不变。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind、Zustand、Node.js test runner。

---

## 文件结构

- 新建 `web/src/app/(user)/canvas/utils/canvas-capacity.ts`：纯容量统计、阈值和格式化。
- 新建 `web/src/app/(user)/canvas/utils/canvas-capacity.test.mts`：容量统计回归。
- 新建 `web/src/app/(user)/canvas/hooks/use-canvas-capacity.ts`：读取浏览器 origin 存储估算。
- 新建 `web/src/app/(user)/canvas/components/canvas-capacity-indicator.tsx`：顶部轻量入口和容量详情弹窗。
- 新建 `web/src/app/(user)/canvas/utils/canvas-visibility.ts`：世界坐标视口边界和连线相交判断。
- 新建 `web/src/app/(user)/canvas/utils/canvas-visibility.test.mts`：节点/连线裁剪回归。
- 修改 `web/src/app/(user)/canvas/hooks/use-canvas-derived-state.ts`：复用统一视口边界。
- 修改 `web/src/app/(user)/canvas/components/canvas-connections-layer.tsx`：只渲染可见或强制保留的连线。
- 修改 `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts`：建立并消费生成输入拓扑索引。
- 修改 `web/src/app/(user)/canvas/hooks/use-canvas-config-node-actions.ts`：全部配置节点复用一个索引。
- 修改 `web/src/app/(user)/canvas/utils/canvas-node-placement.ts`：消除未检查重叠的兜底位置。
- 修改 `web/src/app/(user)/canvas/components/canvas-top-bar.tsx` 与 `canvas-client-page.tsx`：接入容量入口和视口参数。
- 新建 `web/src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts`：关键接线约束。
- 修改 `docs/pending-test.md`：记录本期实现和页面验收步骤。

### Task 1: 容量统计与顶部软预警

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-capacity.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-capacity.test.mts`
- Create: `web/src/app/(user)/canvas/hooks/use-canvas-capacity.ts`
- Create: `web/src/app/(user)/canvas/components/canvas-capacity-indicator.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Create: `web/src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts`

- [ ] **Step 1: 写容量统计失败测试**

测试构造重复 `storageKey`、200/300 节点边界、400/800 连线边界、历史版本和 70%/90% 配额，断言：

```ts
const snapshot = buildCanvasCapacitySnapshot(nodes, connections, { usage: 700, quota: 1000 });
assert.equal(snapshot.mediaBytes, 12_000);
assert.equal(snapshot.level, "warning");
assert.match(snapshot.reasons.join(" "), /节点|缓存/);
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-capacity.test.mts'
```

Expected: FAIL，提示 `canvas-capacity.ts` 或导出函数不存在。

- [ ] **Step 3: 实现纯容量快照**

实现公开类型和函数：

```ts
export type CanvasCapacityLevel = "normal" | "warning" | "critical";
export type CanvasStorageEstimate = { usage?: number; quota?: number };
export type CanvasCapacitySnapshot = {
    nodeCount: number;
    connectionCount: number;
    configNodeCount: number;
    mediaNodeCount: number;
    mediaVersionCount: number;
    mediaBytes: number;
    storageUsage?: number;
    storageQuota?: number;
    storageRatio?: number;
    level: CanvasCapacityLevel;
    reasons: string[];
};

export function buildCanvasCapacitySnapshot(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    estimate: CanvasStorageEstimate = {},
): CanvasCapacitySnapshot;

export function formatCanvasCapacityBytes(bytes?: number): string;
```

媒体字节按节点当前 `storageKey` 和所有 `mediaVersions[].metadata.storageKey` 去重；同一 key 取最大 `bytes`。级别按设计文档阈值取最高级。

- [ ] **Step 4: 运行容量测试确认 GREEN**

Run: Task 1 Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 写顶部接线失败测试**

`canvas-scale-stability-wiring.test.mts` 读取源码并断言：

```ts
assert.match(page, /useCanvasCapacity\(nodes, connections\)/);
assert.match(topBar, /<CanvasCapacityIndicator capacity=\{capacity\}/);
assert.match(indicator, /画布容量/);
```

- [ ] **Step 6: 运行接线测试确认 RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts'
```

Expected: FAIL，容量 hook 和组件尚未接入。

- [ ] **Step 7: 实现浏览器估算与容量 UI**

`useCanvasCapacity(nodes, connections)`：

- 先同步返回纯容量快照；
- 节点或连线变化后 500ms 调用 `navigator.storage.estimate()`；
- 不支持或失败时保持无配额快照；
- effect 卸载时清理 timer，避免卸载后更新。

`CanvasCapacityIndicator`：

- 始终显示 `节点 N · 连线 M`；
- normal 使用主题弱文本，warning 使用 `var(--studio-warning)`，critical 使用 `var(--studio-danger)`；
- 点击打开无保存动作的 Ant Design `Modal`；
- 展示配置节点、媒体节点、历史版本、本画布媒体估算、浏览器总缓存和原因；
- 文案明确“软提醒，不会阻止继续创建”。

在 `CanvasTopBar` 增加 `capacity: CanvasCapacitySnapshot` 并渲染组件；页面调用 `useCanvasCapacity(nodes, connections)` 后传入。

- [ ] **Step 8: 运行专项测试并提交**

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-capacity.test.mts' \
  'src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts'
cd ..
git add web/src/app/'(user)'/canvas docs/superpowers
git commit -m 'feat: show canvas capacity warnings'
```

Expected: PASS，并只提交 Task 1 文件。

### Task 2: 连线视口裁剪

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-visibility.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-visibility.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-derived-state.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-connections-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts`

- [ ] **Step 1: 写视口几何失败测试**

覆盖：视口内节点、视口外节点、起终点都在视口外但横跨视口的连线、完全在视口外的连线、强制 ID：

```ts
const bounds = canvasViewportBounds({ x: 0, y: 0, k: 1 }, { width: 1000, height: 800 }, 0);
assert.equal(canvasNodeIntersectsBounds(inside, bounds), true);
assert.equal(canvasConnectionIntersectsBounds(left, right, bounds), true);
assert.deepEqual(
    filterCanvasVisibleConnections(connections, nodeById, bounds, new Set(["forced"])).map((item) => item.id),
    ["crossing", "forced"],
);
```

- [ ] **Step 2: 运行测试确认 RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-visibility.test.mts'
```

Expected: FAIL，工具不存在。

- [ ] **Step 3: 实现视口工具**

导出：

```ts
export type CanvasWorldBounds = { left: number; top: number; right: number; bottom: number };
export function canvasViewportBounds(viewport: ViewportTransform, size: { width: number; height: number }, padding: number): CanvasWorldBounds;
export function canvasNodeIntersectsBounds(node: CanvasNodeData, bounds: CanvasWorldBounds): boolean;
export function canvasConnectionIntersectsBounds(from: CanvasNodeData, to: CanvasNodeData, bounds: CanvasWorldBounds): boolean;
export function filterCanvasVisibleConnections(
    connections: CanvasConnection[],
    nodeById: Map<string, CanvasNodeData>,
    bounds: CanvasWorldBounds,
    forcedIds?: Set<string>,
): CanvasConnection[];
```

连线相交使用起点 `(from.right, from.centerY)` 和终点 `(to.left, to.centerY)` 的包围盒；缺失端点只在强制集合中也不渲染。

- [ ] **Step 4: 接入节点与连线层**

- `useCanvasDerivedState` 用 `canvasViewportBounds(..., 280)` 和 `canvasNodeIntersectsBounds` 替代内联边界判断。
- `CanvasConnectionsLayer` 增加 `viewport`、`viewportSize`，用 600 边距和 `selectedConnectionId + relatedConnectionIds` 构建强制集合。
- 先调用 `filterCanvasVisibleConnections`，再执行批次隐藏判断。
- 页面传入当前 `viewport` 和 `size`。
- 接线测试断言 `filterCanvasVisibleConnections`、`viewportSize={size}` 存在。

- [ ] **Step 5: 运行专项测试并提交**

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-visibility.test.mts' \
  'src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts'
cd ..
git add web/src/app/'(user)'/canvas
git commit -m 'perf: cull offscreen canvas connections'
```

Expected: PASS。

### Task 3: 生成输入拓扑索引

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-inputs.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-generation.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-config-node-actions.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts`

- [ ] **Step 1: 写索引失败测试**

在现有 generation 测试中导入：

```ts
buildCanvasGenerationInputIndex,
buildCanvasGenerationInputsFromIndex,
```

用混合媒体和反向连接数组建立索引，断言 indexed API 与 `buildCanvasGenerationInputs` 深度相等，并保持 `inputOrder` 与首尾帧角色。

- [ ] **Step 2: 运行测试确认 RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/components/canvas-node-generation.test.mts'
```

Expected: FAIL，索引导出不存在。

- [ ] **Step 3: 实现并接入拓扑索引**

新增：

```ts
export type CanvasGenerationInputIndex = {
    nodeById: Map<string, CanvasGenerationNodeLike>;
    incomingConnectionsByTarget: Map<string, CanvasGenerationConnectionLike[]>;
};

export function buildCanvasGenerationInputIndex(
    nodes: CanvasGenerationNodeLike[],
    connections: CanvasGenerationConnectionLike[],
): CanvasGenerationInputIndex;

export function buildCanvasGenerationInputsFromIndex(
    nodeId: string,
    index: CanvasGenerationInputIndex,
): NodeGenerationInput[];
```

`buildCanvasGenerationInputs` 改为创建索引后调用 indexed API。`useCanvasConfigNodeActions` 在一个 `useMemo` 内先建立一次索引，再遍历配置节点构建 map。接线测试断言 hook 使用两个新导出。

- [ ] **Step 4: 运行专项测试并提交**

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/components/canvas-node-generation.test.mts' \
  'src/app/(user)/canvas/utils/canvas-scale-stability-wiring.test.mts'
cd ..
git add web/src/app/'(user)'/canvas
git commit -m 'perf: index canvas generation inputs'
```

Expected: PASS。

### Task 4: 节点放置最终防重叠

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-placement.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-placement.test.mts`

- [ ] **Step 1: 写失败测试**

新增两个用例：

1. 30 个连续占用的向右位置，结果必须位于最后节点右侧且不重叠；
2. 一个覆盖全部 24 圈候选的超大节点，通用放置结果必须等于其最右边界加 36，且不重叠。

- [ ] **Step 2: 运行测试确认 RED**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-placement.test.mts'
```

Expected: FAIL，旧向右搜索在第 25 个位置返回重叠点，通用搜索返回固定兜底点。

- [ ] **Step 3: 实现安全边界外位置**

新增私有函数：

```ts
function positionOutsideRightBoundary(nodes: NodeRect[], y: number, gap: number): Position {
    return {
        x: Math.max(...nodes.map((node) => node.position.x + node.width)) + gap,
        y,
    };
}
```

- 通用 24 圈搜索失败后调用该函数；
- 向右搜索循环上限改为 `nodes.length + MAX_RING`，失败后调用该函数；
- 空节点仍返回原位置。

- [ ] **Step 4: 运行测试并提交**

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-placement.test.mts'
cd ..
git add web/src/app/'(user)'/canvas/utils/canvas-node-placement.ts \
  web/src/app/'(user)'/canvas/utils/canvas-node-placement.test.mts
git commit -m 'fix: keep dense canvas nodes from overlapping'
```

Expected: PASS。

### Task 5: 文档与完整验证

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 更新待验收清单**

在“画布交互可靠性、批量连线与提示词内嵌图片引用”增加：

```md
15. 顶部显示单画布节点、连线和缓存容量，达到软阈值时提示但不阻断操作；画布只渲染视口附近连线，配置节点共享上游拓扑索引，高密度新建和派生节点不会落到已占用位置。
```

待验收增加：

```md
15. 在包含 200 个以上节点、400 条以上连线的测试画布中检查顶部容量提示；拖动、缩放、框选和新建节点，确认离屏连线不影响可见连线，节点不重叠，保存刷新后结构保持一致。
```

- [ ] **Step 2: 运行完整验证**

```bash
cd web
npm test
npm run typecheck
cd ..
git diff --check
git status --short
```

Expected: 所有测试通过，TypeScript 无错误，只有计划内文档修改。

- [ ] **Step 3: 提交文档**

```bash
git add docs/pending-test.md
git commit -m 'docs: add canvas scale stability acceptance'
```

- [ ] **Step 4: 合并与合并后验证**

使用 `finishing-a-development-branch` 流程，将分支本地合并回开始实施时的主开发分支；如果主工作区存在并行改动，先确认无文件覆盖。合并后重新运行 `npm test`、`npm run typecheck` 和 `git diff --check`，再清理隔离 worktree 和分支。
