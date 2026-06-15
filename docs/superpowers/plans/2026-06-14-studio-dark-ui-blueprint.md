# Studio Dark UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 AI 画布工具改造成统一的 Studio Dark 专业创作工作台，优先统一视觉底座、画布中控台、右侧检查器和节点工具层级。

**Architecture:** 先收敛全局 Ant Design token、Tailwind/CSS 变量和画布主题，再按画布局部组件逐步重排，不改节点数据结构、素材结构、生成任务结构或后端 API。画布继续保留现有 Zustand store、hooks 和节点能力，UI 改造只调整展示层、操作入口和低频动作归位。

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, lucide-react.

---

## Execution Rules

- 本计划按任务顺序执行，不要一次改完整站。
- 每个任务完成后先人工打开相关页面检查，再进入下一任务。
- 日常开发不默认跑完整构建；只在任务写明时跑局部测试或人工验收。
- 不修改业务数据结构，不做旧数据兼容分支，不引入新的状态管理方案。
- 已存在的用户改动不要回滚；如果同文件已有改动，先读 diff 再叠加。
- 画布 UI 必须遵循 `canvasThemes`、`useThemeStore` 和 Ant Design token，不硬编码黑白、stone、slate 大色块。
- 页面文案保持中文。

## Worktree Preparation

**Files:**
- Read: `AGENTS.md`
- Inspect: `git status --short`

- [ ] **Step 1: Confirm working tree**

Run:

```bash
git status --short
```

Expected: 明确当前已有改动。不要回滚无关文件。

- [ ] **Step 2: Create a branch if user wants isolated execution**

Run only when the user asks to start implementation on a branch:

```bash
git switch -c codex/studio-dark-ui-refresh
```

Expected: 当前分支切到 `codex/studio-dark-ui-refresh`。

## File Map

### Design System

- Modify: `web/src/lib/app-theme.ts`
  - Ant Design token、组件 token、用户侧暗色主色。
- Modify: `web/src/lib/canvas-theme.ts`
  - 画布背景、节点、工具栏主题 token。
- Modify: `web/src/app/globals.css`
  - 全局 CSS 变量和 `studio-*` 通用类。
- Modify: `web/src/components/layout/app-providers.tsx`
  - 确认 AntD theme 注入不绕过 token。
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`
  - 用户侧工作区壳背景、导航、内容区统一。

### Canvas Workspace

- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
  - 页面装配层，只接线布局组件和 store。
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
  - 顶部项目栏。
- Modify: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`
  - 底部快捷栏。
- Modify: `web/src/app/(user)/canvas/components/canvas-tool-button.tsx`
  - 工具按钮稳定尺寸、tooltip、选中态。
- Modify: `web/src/app/(user)/canvas/components/canvas-floating-controls.tsx`
  - 缩放、小地图、外观等浮层。
- Create: `web/src/app/(user)/canvas/components/canvas-create-rail.tsx`
  - 左侧节点创建栏。
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
  - 节点 hover 工具条精简。
- Modify: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`
  - 右侧上下文检查器。
- Modify: `web/src/app/(user)/canvas/components/canvas-side-inspector.tsx`
  - 如果当前页面仍使用侧栏包装，在这里统一壳层。
- Modify: `web/src/app/(user)/canvas/components/storyboard-generation-queue-panel.tsx`
  - 任务队列复用或迁移入口。

### Node Components

- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-preview.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`

### Assets And Prompts

- Modify: `web/src/app/(user)/assets/page.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-drawer.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-list-toolbar.tsx`
- Modify: `web/src/components/prompts/prompt-card.tsx`
- Modify: `web/src/components/prompts/prompt-detail-dialog.tsx`
- Modify: `web/src/components/prompts/prompt-select-dialog.tsx`

### Image And Video Workbenches

- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/video/page.tsx`

### Docs

- Modify: `docs/pending-test.md`
  - 每个完成阶段追加可测项。
- Modify only if confirmed stable: `docs/features.md`
  - 用户验收通过后再迁移正式功能说明。

---

## Phase 0: Baseline Capture

**Goal:** 先留下当前页面基线，避免 UI 改造后不知道哪里变坏。

**Files:**
- Read: `web/src/lib/app-theme.ts`
- Read: `web/src/lib/canvas-theme.ts`
- Read: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Read: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`
- Read: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`

- [ ] **Step 1: Inspect current UI files**

Run:

```bash
sed -n '1,220p' web/src/lib/app-theme.ts
sed -n '1,180p' web/src/lib/canvas-theme.ts
sed -n '1,220p' 'web/src/app/(user)/canvas/components/canvas-toolbar.tsx'
sed -n '1,220p' 'web/src/app/(user)/canvas/components/canvas-context-inspector.tsx'
```

Expected: 能确认当前 token、画布工具栏和检查器结构。

- [ ] **Step 2: Record manual baseline**

Open these routes manually:

```text
/projects
/canvas/:id
/image
/assets
/prompts
/video
```

Expected: 记录明显割裂点、拥挤点、遮挡点和控制台 error。不要在本阶段修改代码。

- [ ] **Step 3: Stop condition**

Proceed only when the baseline notes answer:

```text
1. 哪些页面最割裂
2. 画布顶部、左侧、底部、右侧各有哪些入口
3. 节点 hover 工具条有哪些常驻动作
4. 右侧检查器当前能显示哪些内容
```

---

## Phase 1: Design System Foundation

**Goal:** 统一 Studio Dark token，让用户侧页面先像同一个产品。

**Files:**
- Modify: `web/src/lib/app-theme.ts`
- Modify: `web/src/lib/canvas-theme.ts`
- Modify: `web/src/app/globals.css`
- Check: `web/src/components/layout/app-providers.tsx`
- Modify: `web/src/app/(user)/projects/project-workspace-shell.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Normalize AntD dark token**

In `web/src/lib/app-theme.ts`, keep these dark semantic values:

```ts
colorBgBase: "#0f1117"
colorBgLayout: "#101217"
colorBgContainer: "#151821"
colorBgElevated: "#1b202a"
colorBorder: "#262b36"
colorBorderSecondary: "#202633"
colorText: "#f7f9fc"
colorTextSecondary: "#c7cede"
colorTextTertiary: "#9aa3b4"
colorPrimary: "#6fa8ff"
colorSuccess: "#57d57f"
colorWarning: "#d6a74a"
colorError: "#ff6b81"
```

Expected: Button, Card, Drawer, Input, Menu, Select, Tabs, Table, Tooltip 继续从 token 读取颜色。

- [ ] **Step 2: Normalize canvas theme**

In `web/src/lib/canvas-theme.ts`, align dark canvas values:

```ts
background: "#101217"
selectionStroke: "#6fa8ff"
selectionFill: "rgba(111,168,255,.10)"
node.panel: "#151821"
node.stroke: "#2b303b"
toolbar.panel: "rgba(21,24,33,.92)"
toolbar.border: "#2a2f3a"
```

Expected: 画布主题和全局工作台背景一致。

- [ ] **Step 3: Add or consolidate global studio classes**

In `web/src/app/globals.css`, keep shared classes limited to global shell patterns:

```css
.studio-shell {
  background: var(--studio-shell-bg, #101217);
  color: var(--studio-text-primary, #f2f4f8);
}

.studio-panel {
  background: var(--studio-panel-bg, #151821);
  border: 1px solid var(--studio-border-subtle, #262b36);
  border-radius: 8px;
}
```

Expected: 不把页面私有布局塞进 `globals.css`。

- [ ] **Step 4: Update workspace shell**

In `web/src/app/(user)/projects/project-workspace-shell.tsx`, make the user workspace:

```text
left nav: low contrast panel
selected nav: soft blue background
content background: #101217
cards/panels: #151821 with #262b36 border
```

Expected: `/projects` 和项目详情页属于同一 Studio Dark 壳层。

- [ ] **Step 5: Manual acceptance**

Open:

```text
/projects
/image
/assets
/prompts
/video
```

Expected:

```text
1. 用户侧页面背景、面板、按钮主色一致
2. 没有大面积 cyan/slate/stone/teal 拼贴感
3. 管理后台仍可读，不要求沉浸式改造
```

- [ ] **Step 6: Update pending-test**

Append to `docs/pending-test.md`:

```md
#### v0.2.91：Studio Dark 设计系统底座

- 入口：`/projects`、`/image`、`/assets`、`/prompts`、`/video`。
- 本次实现：
  - 用户侧页面统一暗色 token、面板、边框、按钮和工作区背景。
- 验收步骤：
  1. 打开用户侧主要页面，确认背景、按钮、卡片、Drawer、Modal 视觉一致。
  2. 确认页面没有大面积旧色系割裂。
  3. 确认业务功能入口仍可点击。
```

---

## Phase 2: Canvas Shell Layout

**Goal:** 把画布主界面拆成顶部项目栏、左侧创建栏、中央画布、右侧检查器、底部快捷栏、右下任务队列。

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-create-rail.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-floating-controls.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-tool-button.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Create left rail component**

Create `web/src/app/(user)/canvas/components/canvas-create-rail.tsx` with a small, local component:

```tsx
"use client";

import type { ReactNode } from "react";
import { ImageIcon, MessageSquareText, MousePointer2, Settings2, Upload, Video } from "lucide-react";
import { Tooltip } from "antd";

type CanvasCreateRailAction = {
    key: string;
    label: string;
    icon: ReactNode;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
};

type CanvasCreateRailProps = {
    actions: CanvasCreateRailAction[];
};

export function defaultCanvasCreateIcons() {
    return {
        select: <MousePointer2 className="size-4" />,
        text: <MessageSquareText className="size-4" />,
        image: <ImageIcon className="size-4" />,
        video: <Video className="size-4" />,
        config: <Settings2 className="size-4" />,
        upload: <Upload className="size-4" />,
    };
}

export function CanvasCreateRail({ actions }: CanvasCreateRailProps) {
    return (
        <div className="pointer-events-auto flex w-11 flex-col items-center gap-1 rounded-lg border border-white/10 bg-[#151821]/95 p-1 shadow-[0_12px_32px_rgba(0,0,0,.28)]">
            {actions.map((action) => (
                <Tooltip key={action.key} title={action.label} placement="right">
                    <button
                        type="button"
                        disabled={action.disabled}
                        aria-label={action.label}
                        onClick={action.onClick}
                        className={[
                            "grid size-9 place-items-center rounded-md text-[#aeb6c6] transition",
                            action.active ? "bg-[#243045] text-[#8fb9ff]" : "hover:bg-[#1f2633] hover:text-[#f2f4f8]",
                            action.disabled ? "cursor-not-allowed opacity-45" : "",
                        ].join(" ")}
                    >
                        {action.icon}
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}
```

Expected: 左侧栏是纯展示组件，不读取 store。

- [ ] **Step 2: Wire create rail in canvas page**

In `canvas-client-page.tsx`, create actions from existing node insertion callbacks. Use existing functions from current hooks instead of duplicating creation logic.

Expected wiring shape:

```tsx
const createIcons = defaultCanvasCreateIcons();
const createRailActions = [
    { key: "select", label: "选择", icon: createIcons.select, onClick: () => setMode("select") },
    { key: "text", label: "文本", icon: createIcons.text, onClick: createTextNode },
    { key: "image", label: "图片", icon: createIcons.image, onClick: openImageCreate },
    { key: "video", label: "视频", icon: createIcons.video, onClick: createVideoNode },
    { key: "config", label: "配置", icon: createIcons.config, onClick: createGenerationConfigNode },
    { key: "upload", label: "上传", icon: createIcons.upload, onClick: openImport },
];
```

If the exact callback names differ, use the existing callback names from `use-canvas-page-actions.ts`, `use-canvas-node-insertion-actions.ts`, or `use-canvas-toolbar-actions.ts`.

- [ ] **Step 3: Place rail without covering canvas**

In the canvas shell markup:

```tsx
<div className="pointer-events-none absolute left-3 top-20 z-30 hidden md:block">
    <CanvasCreateRail actions={createRailActions} />
</div>
```

Expected: desktop shows left rail; narrow screens continue using existing compact menu.

- [ ] **Step 4: Keep bottom toolbar for shortcuts only**

In `canvas-toolbar.tsx`, keep only:

```text
选择
撤销
重做
外观
删除选中
快捷键或更多
```

Move create/upload/material actions out of bottom toolbar if duplicated in left rail.

- [ ] **Step 5: Stabilize tool button dimensions**

In `canvas-tool-button.tsx`, enforce stable dimensions:

```text
icon button: 36 x 36
toolbar gap: 4-6px
no text wrapping inside compact toolbar buttons
tooltip for icon-only actions
```

- [ ] **Step 6: Manual acceptance**

Open `/canvas/:id`.

Expected:

```text
1. 桌面端左侧有创建栏
2. 底部只保留快捷操作
3. 顶部不拥挤，不遮挡画布
4. 窄屏仍可通过菜单访问创建、导入、素材、设置
```

---

## Phase 3: Right Context Inspector

**Goal:** 让右侧检查器成为完整内容、引用、配置、记录的唯一主阅读区。

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-side-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-shot-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-production-package-inspector.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Define inspector modes**

Use existing selected node / selected shot state. The inspector should render:

```text
no selection: 画布概览、最近任务、缺失配置、下一步动作
text node: 内容、引用、配置、记录
image node: 图片预览、提示词、来源、保存素材、下载、裁切
video node: 视频预览、提示词、首尾帧、续写、任务状态
config node: 最终输入预览、参考图顺序、模型参数、执行生成
shot: 脚本、分镜描述、Brief、Seedance 提示词、生成结果
```

- [ ] **Step 2: Add tabs**

Use AntD `Tabs` in `canvas-context-inspector.tsx`:

```tsx
const items = [
    { key: "content", label: "内容", children: contentPanel },
    { key: "references", label: "引用", children: referencesPanel },
    { key: "config", label: "配置", children: configPanel },
    { key: "logs", label: "记录", children: logsPanel },
];
```

Expected: 系统提示词、原始 JSON、debug 信息只出现在“记录”。

- [ ] **Step 3: Preserve full readable text**

For user input and AI output:

```tsx
<div className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-6">
    {text}
</div>
```

Expected: 不使用默认省略号隐藏用户输入、AI 输出、提示词、分镜文本。

- [ ] **Step 4: Keep mobile inspector as overlay**

For narrow screens, inspector should not squeeze the canvas:

```text
desktop: fixed right panel
mobile: right overlay drawer/panel, default collapsed
```

Use existing local state from `use-canvas-page-local-state.ts` if present.

- [ ] **Step 5: Manual acceptance**

Open `/canvas/:id`, select one text node, one image node, one video/config node if available.

Expected:

```text
1. 每类节点都有清楚的内容主区
2. 长文本能完整滚动阅读
3. 低频记录不污染主内容
4. 窄屏展开检查器不挤压画布
```

---

## Phase 4: Node Visual And Hover Toolbar

**Goal:** 节点看起来更像专业创作软件，同时 hover 工具条只保留高频动作。

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-preview.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-media-node-controls.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Normalize node frame**

In `canvas-node.tsx`, keep:

```text
default border: #2b303b
selected border: #6fa8ff
node panel: #151821
node text: #f2f4f8
node muted: #aeb6c6
radius: 10-12px for media nodes, 8px for dense controls
```

- [ ] **Step 2: Add lightweight status treatment**

Use existing status fields. Display:

```text
loading/generating: blue status dot + short text
done: green status dot
failed: red status dot + retry action available
warning/missing reference: yellow dot
```

- [ ] **Step 3: Simplify hover toolbar**

In `canvas-node-hover-toolbar.tsx`, keep visible actions:

```text
查看
编辑
生成
更多
删除
```

Move these into `更多`:

```text
裁切
多角度
锁比例
替换上传
查看 JSON
更新素材引用
加白审核
截帧
续写
字号调整
```

- [ ] **Step 4: Manual acceptance**

Open `/canvas/:id`, hover text/image/video/config nodes.

Expected:

```text
1. hover 工具条短，不遮挡主体
2. 低频动作仍可在更多菜单中找到
3. 选中态统一蓝色，不再按页面私有色乱跳
```

---

## Phase 5: Task Queue

**Goal:** 统一展示生图、视频、Agent 文本任务状态，先从画布右下轻量队列开始，不改任务数据模型。

**Files:**
- Modify: `web/src/app/(user)/canvas/components/storyboard-generation-queue-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-task-progress-panel.tsx`
- Modify: `web/src/app/(user)/canvas/stores/use-generation-queue-store.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

- [ ] **Step 1: Reuse existing generation queue**

Inspect `use-generation-queue-store.ts` and use existing queue items.

Expected item display:

```text
title
type: image/video/text
status: pending/running/done/failed
progress or elapsed time if available
retry/open result action if available
```

- [ ] **Step 2: Place queue bottom-right**

In canvas shell:

```tsx
<div className="pointer-events-none absolute bottom-4 right-4 z-30">
    <div className="pointer-events-auto">
        <StoryboardGenerationQueuePanel />
    </div>
</div>
```

Use the existing component name if it already renders the queue. Rename only if the codebase already has a broader naming pattern.

- [ ] **Step 3: Manual acceptance**

Trigger a non-cost action first, then inspect existing task records.

Expected:

```text
1. 队列不遮挡底部工具栏
2. 失败任务有清楚状态
3. 点击任务能定位或打开相关节点/记录
```

---

## Phase 6: Assets And Prompt Library Unification

**Goal:** 让素材、提示词、生成结果像同一个创作资产系统。

**Files:**
- Modify: `web/src/app/(user)/assets/page.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-drawer.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-list-toolbar.tsx`
- Modify: `web/src/components/prompts/prompt-card.tsx`
- Modify: `web/src/components/prompts/prompt-detail-dialog.tsx`
- Modify: `web/src/components/prompts/prompt-select-dialog.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Normalize asset cards**

Each asset card should show:

```text
media preview or text preview
type
title
tags
source/project/canvas if present
primary action
more menu
```

Expected: 卡片不使用营销式大装饰，只保持可扫。

- [ ] **Step 2: Normalize asset drawer**

Drawer sections:

```text
预览
内容
来源
版本/历史
引用
操作
```

Expected: 完整内容在 Drawer 中可读，不靠卡片塞满信息。

- [ ] **Step 3: Normalize prompt card**

Prompt card should show:

```text
title
category
tags
nodeGroup/type/scenario
short preview
copy/use/add-to-asset actions
```

- [ ] **Step 4: Manual acceptance**

Open:

```text
/assets
/prompts
```

Expected:

```text
1. 素材卡片和提示词卡片密度相近
2. 详情 Drawer 可以读完整内容
3. 复制、加入素材、插入画布或使用提示词动作仍可达
```

---

## Phase 7: Image And Video Workbench Alignment

**Goal:** 生图和视频页不再像孤立工具，而是画布外的生产面板。

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/video/page.tsx`
- Check: `web/src/components/image-settings-panel.tsx`
- Check: `web/src/components/video-settings-panel.tsx`
- Docs: `docs/pending-test.md`

- [ ] **Step 1: Align image page layout**

Target layout:

```text
left/top: prompt input and references
center: generation results
right/bottom: settings and history depending viewport
fixed primary action: start generation
```

Expected: 首屏能看到输入、参考图和主生成按钮。

- [ ] **Step 2: Align video page layout**

Target layout:

```text
left: prompt/package list
center: preview and result
right: config/history/details
bottom: task status
```

Expected: 视频生成状态、详情抽屉和筛选不抢主内容。

- [ ] **Step 3: Manual acceptance**

Open:

```text
/image
/video
```

Expected:

```text
1. 生图/视频都像 Studio Dark 工作台
2. 主操作明确
3. 结果能下载、保存素材、进入画布或被后续引用
```

---

## Phase 8: Verification And Documentation

**Goal:** 做一轮低成本人工验收，并把可测试项放入待验收清单。

**Files:**
- Modify: `docs/pending-test.md`
- Modify after user confirmation only: `docs/features.md`

- [ ] **Step 1: Manual route sweep**

Open:

```text
/projects
/canvas/:id
/image
/assets
/prompts
/video
```

Expected:

```text
1. 无页面级横向滚动
2. 无明显文字重叠
3. 主按钮可见
4. Drawer/Modal 关闭后无遮罩残留
5. 控制台无新增 error
```

- [ ] **Step 2: Canvas interaction sweep**

In `/canvas/:id`, check:

```text
1. 创建文本节点
2. 创建图片/配置节点
3. 选中节点
4. hover 节点
5. 打开更多菜单
6. 打开/关闭右侧检查器
7. 撤销/重做
8. 刷新后节点仍存在
```

- [ ] **Step 3: Update pending-test**

Append one section per completed phase. Keep each section short:

```md
#### v0.2.91：Studio Dark 画布中控台一期

- 入口：`/canvas/:id`。
- 本次实现：
  - 左侧创建栏、底部快捷栏、右侧检查器和节点 hover 工具条完成第一版收口。
- 验收步骤：
  1. 打开画布，确认左侧创建栏和底部快捷栏不重复拥挤。
  2. 选中节点，确认右侧检查器可读完整内容。
  3. hover 节点，确认低频动作进入更多菜单。
```

- [ ] **Step 4: Optional targeted tests**

Run only if related utility logic changes:

```bash
cd web
npm test -- canvas
```

Expected: Existing relevant canvas tests pass. If the repo uses a different script name, inspect `web/package.json` before running.

---

## Recommended Execution Order

1. Phase 0: Baseline Capture
2. Phase 1: Design System Foundation
3. Phase 2: Canvas Shell Layout
4. Phase 3: Right Context Inspector
5. Phase 4: Node Visual And Hover Toolbar
6. Phase 5: Task Queue
7. Phase 6: Assets And Prompt Library Unification
8. Phase 7: Image And Video Workbench Alignment
9. Phase 8: Verification And Documentation

## Minimal First Release

If time is limited, execute only:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4

Stop after Phase 4 and run manual acceptance. This gives the product the largest perceived quality jump without touching data models or generation flows.

## Self-Review

- Spec coverage: Covers design system, canvas shell, nodes, inspector, task queue, assets/prompts, image/video pages, and docs.
- Scope control: Does not change database schemas, APIs, generation payloads, localforage structures, or backend services.
- Ambiguity resolution: Left rail is desktop-first; mobile keeps existing compact menu. Inspector is desktop fixed panel and mobile overlay. Seed data and prompt library behavior are outside this UI plan except as card/detail presentation.
- Placeholder scan: No open placeholders or deferred undefined behavior. Any callback name mismatch is explicitly resolved by using existing hook callback names after inspection.
