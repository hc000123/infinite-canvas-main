# UI Layout Reliability Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复主要桌面页面的内容不可达、宽表裁切、画布安全区和 Skill 长列表滚动问题。

**Architecture:** 沿用现有 Next.js、Ant Design 与 Tailwind 结构，仅在页面外壳、表格滚动、画布 viewport 计算和 Skill 栏位布局中增加最小约束。画布适配逻辑继续集中在 `canvas-viewport.ts`，页面组件只传递可用尺寸和面板状态。

**Tech Stack:** Next.js App Router、React、TypeScript、Ant Design、Tailwind CSS、Zustand。

---

### Task 1: 修复生产总控与任务表格可达性

**Files:**
- Modify: `web/src/app/(user)/agent/agent-workspace.tsx`
- Modify: `web/src/app/(admin)/admin/ai-tasks/components/ai-task-log-panel.tsx`

- [x] **Step 1: 为生产总控建立主滚动容器**

将页面外壳改为占满父布局并自行纵向滚动：

```tsx
<main className="studio-shell h-full min-h-0 overflow-y-auto text-[var(--studio-text-primary)]">
```

- [x] **Step 2: 为任务表格提供内部横向滚动**

为 ProTable 添加滚动和固定列：

```tsx
scroll={{ x: 1600 }}
```

并在时间列配置 `fixed: "left"`，操作列配置 `fixed: "right"`。

- [x] **Step 3: 浏览器检查**

在 1280×900 与 1440×900 下确认生产总控可滚动到底，任务表格出现内部横向滚动且页面本身没有水平溢出。

### Task 2: 修复画布视图与面板安全区

**Files:**
- Modify: `web/src/app/(user)/canvas/utils/canvas-viewport.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`

- [x] **Step 1: 扩展视图适配参数**

为 `fitCanvasViewport` 增加可选安全区参数，并从可用宽高扣除安全区：

```ts
type CanvasViewportInsets = { top?: number; right?: number; bottom?: number; left?: number };

export function fitCanvasViewport(nodes: CanvasNodeData[], size: { width: number; height: number }, insets: CanvasViewportInsets = {}) {
    const left = insets.left || 0;
    const right = insets.right || 0;
    const top = insets.top || 0;
    const bottom = insets.bottom || 0;
    const availableWidth = Math.max(size.width - left - right, 1);
    const availableHeight = Math.max(size.height - top - bottom, 1);
    // 使用 availableWidth / availableHeight 计算缩放，并以安全区中心定位。
}
```

- [x] **Step 2: 让整理与重置使用可见节点**

统一过滤隐藏批次子节点，并把安全区传给两种操作：

```ts
const visibleNodes = nodes.filter((node) => !isHiddenBatchChild(node, nodes));
setViewport(fitCanvasViewport(visibleNodes, size, viewportInsets));
```

- [x] **Step 3: 调整面板与底部工具条**

右侧面板使用响应式宽度，底部工具条改为使用容器左右安全边距；节点视图由统一安全区负责避让右侧面板：

```tsx
<div className="pointer-events-none absolute inset-x-4 bottom-5 z-50 flex justify-center">
```

- [x] **Step 4: 浏览器检查**

在测试画布导入节点后分别执行整理和重置，确认所有节点可见；展开内容与助手面板时确认底部工具条和节点操作没有被遮挡。

### Task 3: 修复项目画布和 Skill 长列表

**Files:**
- Modify: `web/src/app/(user)/projects/[id]/components/project-episode-board.tsx`
- Modify: `web/src/app/(user)/projects/[id]/skills/page.tsx`
- Modify: `web/src/app/(admin)/admin/skills/page.tsx`

- [x] **Step 1: 约束项目画布页头**

让标题和操作区都能收缩，绑定区在窄桌面占满一行：

```tsx
<div className="flex min-w-0 flex-1 flex-wrap justify-end gap-3 max-lg:w-full max-lg:justify-start">
```

- [x] **Step 2: 建立 Skill 双栏独立滚动**

桌面布局限制到可视高度，左侧列表与中间详情各自滚动：

```tsx
<div className="grid min-h-0 grid-cols-[290px_minmax(560px,1fr)] items-stretch gap-4 lg:h-[calc(100dvh-230px)]">
    <div className="min-h-0 overflow-y-auto">...</div>
    <div className="min-h-0 overflow-y-auto">...</div>
</div>
```

- [x] **Step 3: 压缩列表摘要**

所有 Skill 列表卡片的说明保持 `line-clamp-2`，版本轨道留在左栏滚动范围内。

- [x] **Step 4: 浏览器检查**

确认 1280×900 下新建画布按钮可见；Skill 列表滚动到底时详情区仍可见，没有大片空白。

### Task 4: 更新待测文档

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [x] **Step 1: 记录本版可测试改动**

在 `docs/pending-test.md` 中新增 UI 布局可靠性条目，列出生产总控滚动、任务表横向滚动、画布安全区和 Skill 双栏四项验收点。

- [x] **Step 2: 检查待办**

仅当 `docs/todo.md` 已存在对应事项时将其移入待测；没有对应事项则不改动。
