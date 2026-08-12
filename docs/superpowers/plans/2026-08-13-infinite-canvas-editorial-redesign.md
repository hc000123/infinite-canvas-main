# Infinite Canvas Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将无限画布改造成“电影制作案头”式创作界面，以左侧创建、节点就地操作和按需任务面板取代重复入口与常驻右侧检查器，同时完整保留现有生成、资产、分镜、生产包和引用语义。

**Architecture:** 保持 `canvas-client-page.tsx` 为装配层，新增少量纯函数模型分别派生节点呈现、节点动作分层、临时面板状态和运行摘要；现有业务 callbacks、节点数据、LocalForage、生成队列、资产回写和生产包 hooks 不迁移。实施顺序为先建立视觉与状态 primitive，再收敛全局和节点入口，随后迁移右栏能力并删除布局占位，最后统一运行摘要与做定向回归。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand、Lucide React、Node.js `node:test`

---

## 文件结构与边界

- `web/src/lib/canvas-theme.ts`：画布唯一颜色 token 来源；加入暖灰案头、朱红标记色与浮层 token，不修改全站 `app-theme`。
- `web/src/app/(user)/canvas/utils/canvas-node-presentation.ts`：仅根据节点数据派生 Logo、真实媒体、加载和错误的展示模型。
- `web/src/app/(user)/canvas/utils/canvas-node-action-layout.ts`：仅决定“编辑、主推进动作、更多”的动作 key，不执行任何业务动作。
- `web/src/app/(user)/canvas/utils/canvas-transient-panel.ts`：临时主任务面板的互斥状态模型。
- `web/src/app/(user)/canvas/utils/canvas-run-summary.ts`：从现有节点和队列数据派生一句运行摘要，不持久化第二份任务状态。
- `web/src/app/(user)/canvas/components/canvas-logo-placeholder.tsx`：唯一 Logo 占位组件，只读取 `/logo.svg`。
- `web/src/app/(user)/canvas/components/canvas-creation-rail.tsx`：左侧仅创建和放置节点，不承载保存、资产和删除。
- `web/src/app/(user)/canvas/components/canvas-transient-panel-host.tsx`：桌面悬浮面板与小屏 Drawer 的统一容器。
- `web/src/app/(user)/canvas/components/canvas-run-summary.tsx`：低视觉重量摘要入口和按需详情。
- `canvas-client-page.tsx`：只装配上述模型、组件和原有 callbacks；不得把迁出的检查器业务重新写回页面。

## 不变契约

- 不改节点、连线、`inputOrder`、稳定媒体引用、固定 `assetVersion`、`sourceAssetId` 和 LocalForage 数据结构。
- 不改普通缓存与正式资产回写边界，不改 Workflow、Invocation、Artifact、任务幂等、付费确认、取消和失败恢复。
- 上一镜尾帧继续只作为普通 `continuity_reference`；不得变为首帧语义。
- 图片节点继续尊重原始比例；Logo 不作为水印、导出内容或资产回写内容。
- 自动验证只使用源码契约、纯函数和现有 fixture，不调用真实生成或任何可能扣费的 CLI。

### Task 1: Editorial theme、Logo 与节点呈现模型

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-node-presentation.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-node-presentation.test.mts`
- Create: `web/src/app/(user)/canvas/components/canvas-logo-placeholder.tsx`
- Modify: `web/src/lib/canvas-theme.ts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-tool-button.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-connections.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts`

- [ ] **Step 1: 写节点呈现模型的失败测试**

在 `canvas-node-presentation.test.mts` 写入：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { deriveCanvasNodePresentation } from "./canvas-node-presentation.ts";
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";

const node = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: `${type}-1`,
    type,
    title: "节点",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata,
});

test("only media nodes without real media use the brand placeholder", () => {
    assert.equal(deriveCanvasNodePresentation(node(CanvasNodeType.Image)).body, "logo");
    assert.equal(deriveCanvasNodePresentation(node(CanvasNodeType.Video, { status: "loading" })).body, "logo");
    assert.equal(deriveCanvasNodePresentation(node(CanvasNodeType.Image, { content: "blob:old" })).body, "media");
    assert.equal(deriveCanvasNodePresentation(node(CanvasNodeType.Text, { content: "正文" })).body, "content");
});

test("regeneration and failure preserve old media and add an overlay", () => {
    assert.deepEqual(deriveCanvasNodePresentation(node(CanvasNodeType.Image, { content: "blob:old", status: "loading", pendingMediaVersion: { prompt: "新版", startedAt: "2026-08-13T00:00:00.000Z" } })), {
        body: "media",
        overlay: "loading",
        preserveMedia: true,
    });
    assert.deepEqual(deriveCanvasNodePresentation(node(CanvasNodeType.Video, { content: "blob:old", status: "error", errorDetails: "生成失败" })), {
        body: "media",
        overlay: "error",
        preserveMedia: true,
    });
});
```

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-presentation.test.mts'
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND` 和 `canvas-node-presentation.ts`。

- [ ] **Step 3: 实现最小节点呈现模型**

在 `canvas-node-presentation.ts` 写入：

```ts
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";

export type CanvasNodePresentation = {
    body: "logo" | "media" | "content";
    overlay: "none" | "loading" | "error";
    preserveMedia: boolean;
};

export function deriveCanvasNodePresentation(node: CanvasNodeData): CanvasNodePresentation {
    const isMedia = node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio;
    const hasMedia = isMedia && Boolean(node.metadata?.content);
    const overlay = node.metadata?.status === "loading" ? "loading" : node.metadata?.status === "error" ? "error" : "none";
    return {
        body: hasMedia ? "media" : isMedia ? "logo" : "content",
        overlay,
        preserveMedia: hasMedia && overlay !== "none",
    };
}
```

- [ ] **Step 4: 接入 Logo 和案头视觉 primitive**

新增 `canvas-logo-placeholder.tsx`：

```tsx
export function CanvasLogoPlaceholder({ label = "等待素材" }: { label?: string }) {
    return (
        <div className="flex size-full flex-col items-center justify-center gap-3" aria-label={label}>
            <img src="/logo.svg" alt="" className="h-10 w-10 opacity-45" draggable={false} />
            <span className="text-xs opacity-55">{label}</span>
        </div>
    );
}
```

在 `canvas-theme.ts` 为深浅主题增加同名 token，并将深色基线改为暖黑：

```ts
accent: "#df593b",
surfaceRaised: "#2a261f",
surfaceOverlay: "rgba(42,38,31,.96)",
focusRing: "rgba(223,89,59,.42)",
```

浅色对应使用 `accent: "#c94d34"`、暖灰表面和相同语义。随后：

- `canvas-node.tsx` 使用 `rounded-[4px] border`，选中仅使用 `theme.accent` 的 1px 边界，移除蓝色发光与常驻阴影。
- `canvas-node-content.tsx` 先渲染真实媒体，再根据呈现模型叠加进度或错误；仅 `body === "logo"` 时渲染 `CanvasLogoPlaceholder`。
- `canvas-video-node-content.tsx` 保留视频比例与旧媒体，不以加载组件替换已有视频。
- `canvas-tool-button.tsx` 和 `canvas-connections.tsx` 使用新增 token；标记色只用于焦点、选中连接与主推进动作。
- 更新 `canvas-node-overlay-layout.test.mts`：断言媒体判断发生在进度 overlay 判断之前，并断言源码包含 `CanvasLogoPlaceholder`、不包含场记板资源或文案。

- [ ] **Step 5: 运行定向测试并确认通过**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-node-presentation.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-status.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts' \
  'src/app/(user)/canvas/utils/canvas-generation-retry-state.test.mts'
```

Expected: 以上文件全部 PASS；测试过程不访问网络、不创建真实生成任务。

- [ ] **Step 6: 提交本任务**

```bash
git add \
  web/src/lib/canvas-theme.ts \
  'web/src/app/(user)/canvas/components/canvas-logo-placeholder.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-content.tsx' \
  'web/src/app/(user)/canvas/components/canvas-video-node-content.tsx' \
  'web/src/app/(user)/canvas/components/canvas-tool-button.tsx' \
  'web/src/app/(user)/canvas/components/canvas-connections.tsx' \
  'web/src/app/(user)/canvas/utils/canvas-node-presentation.ts' \
  'web/src/app/(user)/canvas/utils/canvas-node-presentation.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts'
git commit -m "feat: establish editorial canvas primitives"
```

### Task 2: 收敛顶部动作并建立左侧创建栏

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-creation-rail.tsx`
- Create: `web/src/app/(user)/canvas/utils/canvas-global-action-entry.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-floating-controls.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-toolbar-actions.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-shortcuts.test.mts`

- [ ] **Step 1: 写入口唯一性失败测试**

新增 `canvas-global-action-entry.test.mts`，从源码读取顶栏、创建栏和底栏并断言：

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("global actions have one visible primary entry and creation lives on the left rail", async () => {
    const [top, rail, toolbar] = await Promise.all([
        read("../components/canvas-top-bar.tsx"),
        read("../components/canvas-creation-rail.tsx"),
        read("../components/canvas-toolbar.tsx"),
    ]);
    assert.equal((top.match(/label="导入"/g) || []).length, 1);
    assert.equal((top.match(/label="素材"/g) || []).length, 1);
    assert.equal((top.match(/label="整理画布"/g) || []).length, 1);
    assert.match(rail, /左侧创建栏/);
    assert.match(rail, /文本/);
    assert.match(rail, /图片/);
    assert.match(rail, /视频/);
    assert.match(rail, /音频/);
    assert.doesNotMatch(toolbar, /onAddImage|onAddVideo|onAddAudio|onAddText|onAddConfig/);
});
```

- [ ] **Step 2: 运行测试并确认创建栏文件缺失**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-global-action-entry.test.mts'
```

Expected: FAIL，错误指向缺少 `canvas-creation-rail.tsx` 或入口数量不符。

- [ ] **Step 3: 创建左侧创建栏**

实现 `CanvasCreationRail`，接口固定为：

```tsx
export type CanvasCreationRailActions = {
    onSelect: () => void;
    onAddText: () => void;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddConfig: () => void;
    onUpload: () => void;
};

export function CanvasCreationRail({ actions }: { actions: CanvasCreationRailActions }) {
    const items = [
        ["选择", actions.onSelect],
        ["文本", actions.onAddText],
        ["图片", actions.onAddImage],
        ["视频", actions.onAddVideo],
        ["音频", actions.onAddAudio],
    ] as const;
    return (
        <nav aria-label="左侧创建栏" className="pointer-events-auto absolute left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-1">
            {items.map(([label, onClick]) => <button key={label} type="button" onClick={onClick} aria-label={label}>{label}</button>)}
            <button type="button" onClick={actions.onAddConfig} aria-label="更多节点">更多</button>
        </nav>
    );
}
```

实际按钮使用 `CanvasToolButton`、Lucide 图标和 `canvasThemes`，但保持上述动作接口；“更多”内只放配置节点和上传，不加入保存、素材、整理、删除或资产管理。

- [ ] **Step 4: 收敛顶部、底部与装配**

- `canvas-top-bar.tsx`：顶部常驻保留返回、身份、导入、素材、整理、保存状态；菜单删除导入、素材、整理和保存重复项，只保留项目切换、新建、删除、快捷键及撤销/重做低频入口。
- `canvas-toolbar.tsx`：删除全部创建 action 类型和删除按钮，只保留选择、撤销、重做、外观；删除仍通过 Delete/Backspace、节点“更多”和右键菜单可达。
- `use-canvas-toolbar-actions.ts`：继续返回原创建 callbacks，不改 `createNode`、上传、资产和工作台行为；将返回类型同时供创建栏与顶栏使用。
- `canvas-floating-controls.tsx`：装配 `CanvasCreationRail`，把 `toolbarActions` 拆为 `creationActions` 与 `toolbarActions`，不复制 callbacks。
- `canvas-client-page.tsx`：只调整 props 接线。
- `canvas-shortcuts.test.mts`：锁定撤销、重做、删除、复制粘贴和 Esc 原行为，并断言没有新增创建快捷键覆盖现有输入场景。

- [ ] **Step 5: 运行入口与快捷键测试**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-global-action-entry.test.mts' \
  'src/app/(user)/canvas/utils/canvas-shortcuts.test.mts' \
  'src/app/(user)/canvas/utils/canvas-storyboard-overlay-wiring.test.mts'
```

Expected: 全部 PASS；顶栏三个全局动作各一个常驻入口，创建动作仅在左侧栏。

- [ ] **Step 6: 提交本任务**

```bash
git add \
  'web/src/app/(user)/canvas/components/canvas-creation-rail.tsx' \
  'web/src/app/(user)/canvas/components/canvas-top-bar.tsx' \
  'web/src/app/(user)/canvas/components/canvas-toolbar.tsx' \
  'web/src/app/(user)/canvas/components/canvas-floating-controls.tsx' \
  'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' \
  'web/src/app/(user)/canvas/hooks/use-canvas-toolbar-actions.ts' \
  'web/src/app/(user)/canvas/utils/canvas-global-action-entry.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-shortcuts.test.mts'
git commit -m "feat: move canvas creation to a focused rail"
```

### Task 3: 节点“编辑、主推进、更多”动作分层

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-node-action-layout.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-node-action-layout.test.mts`
- Create: `web/src/app/(user)/canvas/components/canvas-node-more-menu.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-media-node-controls.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-toolbar-state.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-node-toolbar-hover.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-capability-wiring.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-image-upscale-wiring.test.mts`

- [ ] **Step 1: 写动作分层失败测试**

新增：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasNodeActionLayout } from "./canvas-node-action-layout.ts";
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";

const node = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id: "n1", type, title: "节点", position: { x: 0, y: 0 }, width: 320, height: 180, metadata });

test("selected nodes expose no more than edit, primary and overflow", () => {
    const emptyImage = buildCanvasNodeActionLayout(node(CanvasNodeType.Image));
    assert.deepEqual(emptyImage.visible, ["edit", "open-generation", "more"]);
    assert.ok(emptyImage.overflow.includes("upload"));

    const failedVideo = buildCanvasNodeActionLayout(node(CanvasNodeType.Video, { content: "blob:old", status: "error" }));
    assert.deepEqual(failedVideo.visible, ["edit", "retry", "more"]);
    assert.ok(failedVideo.overflow.includes("download"));
    assert.ok(failedVideo.overflow.includes("save-asset"));
});

test("text and completed image choose a single context primary action", () => {
    assert.deepEqual(buildCanvasNodeActionLayout(node(CanvasNodeType.Text, { content: "提示词" })).visible, ["edit", "generate-image", "more"]);
    assert.deepEqual(buildCanvasNodeActionLayout(node(CanvasNodeType.Image, { content: "blob:image", status: "success" })).visible, ["edit", "open-generation", "more"]);
});
```

- [ ] **Step 2: 运行测试并确认缺少动作模型**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-node-action-layout.test.mts'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现纯动作布局模型**

在 `canvas-node-action-layout.ts` 定义完整 action key 联合类型，并保留所有现有能力：

```ts
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";

export type CanvasNodeActionKey =
    | "edit" | "open-generation" | "retry" | "generate-image" | "more"
    | "info" | "run-skill" | "upload" | "download" | "save-asset" | "update-asset-reference"
    | "continue-video" | "capture-video-frame" | "review-asset" | "refresh-review"
    | "decrease-font" | "increase-font" | "crop" | "angle" | "upscale" | "view-image"
    | "toggle-free-resize" | "delete";

export type CanvasNodeActionLayout = {
    visible: ["edit", CanvasNodeActionKey, "more"];
    overflow: CanvasNodeActionKey[];
};

export function buildCanvasNodeActionLayout(node: CanvasNodeData): CanvasNodeActionLayout {
    const hasMedia = Boolean(node.metadata?.content);
    const primary: CanvasNodeActionKey = node.metadata?.status === "error"
        ? "retry"
        : node.type === CanvasNodeType.Text
          ? "generate-image"
          : "open-generation";
    const overflow: CanvasNodeActionKey[] = ["info", "run-skill"];
    if (node.type !== CanvasNodeType.Text) overflow.push("upload");
    if (hasMedia) overflow.push("download", "save-asset");
    if (node.type === CanvasNodeType.Image && hasMedia) overflow.push("toggle-free-resize", "crop", "upscale", "angle", "view-image", "review-asset");
    if (node.type === CanvasNodeType.Video && hasMedia) overflow.push("capture-video-frame", "continue-video", "review-asset");
    if (node.type === CanvasNodeType.Text) overflow.push("decrease-font", "increase-font", "save-asset");
    overflow.push("delete");
    return { visible: ["edit", primary, "more"], overflow };
}
```

组件接线时可根据 `volcengineAsset` 状态把 `review-asset` 替换为 `refresh-review`，有新资产版本时把 `update-asset-reference` 插入 overflow；不得在纯模型中执行 callback。

- [ ] **Step 4: 将工具条改为 selection 驱动并接入更多菜单**

- `canvas-node-hover-toolbar.tsx` 只渲染 `layout.visible` 三项；`edit` 对文本调用 `onEditText`，对空媒体/配置调用 `onToggleDialog`，对已有媒体调用 `onInfo`；主动作映射到原 callback；`more` 打开 `CanvasNodeMoreMenu`。
- `canvas-node-more-menu.tsx` 接收 `node`、`actionKeys`、`actions` 和状态，将全部低频动作映射到原 `CanvasNodeHoverToolbarActions`，危险删除放在分隔线后。
- `use-canvas-node-toolbar-state.ts` 从单选 `selectedNodeIds` 派生 `toolbarNode`；多选、拖动、打开图片设置时返回 `null`。
- `use-canvas-node-toolbar-hover.ts` 只管理“更多”菜单的 pointer 安全区，不再让普通 hover 打开整条工具栏。
- `canvas-node-content.tsx` 移除与工具条重复的上传、生图、重试常驻按钮；版本切换和必要媒体信息保留。
- `canvas-media-node-controls.tsx` 删除永久成功 Badge。
- 更新结构测试，断言未选中不渲染工具条、可见 action 数量为 3，Skill、超分、审核、下载和删除仍在 overflow 接线中。

- [ ] **Step 5: 运行节点动作回归**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-node-action-layout.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts' \
  'src/app/(user)/canvas/components/canvas-capability-wiring.test.mts' \
  'src/app/(user)/canvas/components/canvas-image-upscale-wiring.test.mts' \
  'src/app/(user)/canvas/components/canvas-node-generation.test.mts'
```

Expected: 全部 PASS；三个可见入口之外的原动作均可从更多菜单到达。

- [ ] **Step 6: 提交本任务**

```bash
git add \
  'web/src/app/(user)/canvas/utils/canvas-node-action-layout.ts' \
  'web/src/app/(user)/canvas/utils/canvas-node-action-layout.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-node-more-menu.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-content.tsx' \
  'web/src/app/(user)/canvas/components/canvas-media-node-controls.tsx' \
  'web/src/app/(user)/canvas/hooks/use-canvas-node-toolbar-state.ts' \
  'web/src/app/(user)/canvas/hooks/use-canvas-node-toolbar-hover.ts' \
  'web/src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-capability-wiring.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-image-upscale-wiring.test.mts'
git commit -m "feat: simplify contextual canvas node actions"
```

### Task 4: 建立临时任务面板并迁移检查器能力

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-transient-panel.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-transient-panel.test.mts`
- Create: `web/src/app/(user)/canvas/components/canvas-transient-panel-host.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-assistant-panel-chrome.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-shot-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-production-package-inspector.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-production-package-bar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-inspector-panel-actions.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-capability-wiring.test.mts`

- [ ] **Step 1: 写临时面板互斥状态的失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { reduceCanvasTransientPanel, type CanvasTransientPanelState } from "./canvas-transient-panel.ts";

test("opening a task panel replaces the previous main panel", () => {
    const closed: CanvasTransientPanelState = { active: null };
    const assistant = reduceCanvasTransientPanel(closed, { type: "open", panel: { kind: "assistant" } });
    const production = reduceCanvasTransientPanel(assistant, { type: "open", panel: { kind: "production", packageId: "pkg-1" } });
    assert.deepEqual(production, { active: { kind: "production", packageId: "pkg-1" } });
});

test("close clears the panel without changing business selection", () => {
    assert.deepEqual(reduceCanvasTransientPanel({ active: { kind: "shot", shotId: "shot-1" } }, { type: "close" }), { active: null });
});
```

- [ ] **Step 2: 运行测试并确认缺少状态模型**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-transient-panel.test.mts'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现互斥面板模型与容器**

新增纯模型：

```ts
export type CanvasTransientPanel =
    | { kind: "assistant" }
    | { kind: "node"; nodeId: string }
    | { kind: "shot"; shotId: string }
    | { kind: "production"; packageId: string };

export type CanvasTransientPanelState = { active: CanvasTransientPanel | null };
export type CanvasTransientPanelAction = { type: "open"; panel: CanvasTransientPanel } | { type: "close" };

export function reduceCanvasTransientPanel(state: CanvasTransientPanelState, action: CanvasTransientPanelAction): CanvasTransientPanelState {
    return action.type === "close" ? { active: null } : { active: action.panel };
}
```

`CanvasTransientPanelHost` 的固定接口：

```tsx
export function CanvasTransientPanelHost({ title, open, triggerRef, onClose, children }: {
    title: string;
    open: boolean;
    triggerRef: React.RefObject<HTMLElement | null>;
    onClose: () => void;
    children: React.ReactNode;
}) {
    // >= 768px 渲染不参与主布局的 absolute 悬浮面板；更窄时使用 antd Drawer。
    // Esc、遮罩关闭统一调用 close，并在关闭动画完成后 triggerRef.current?.focus()。
}
```

桌面容器定位在画布内右上安全区，宽度 `min(420px, calc(100vw - 32px))`，不得成为 `<main>` 的 flex sibling；仅容器使用轻阴影和 4–6px 圆角。

- [ ] **Step 4: 将右栏内容迁入按需容器**

- `use-canvas-page-local-state.ts` 增加 `activeTaskPanel`，但暂时保留 `inspectorView`、`isInspectorCollapsed` 和 `assistantMounted`，直到 Task 5 完成旧栏撤除。
- `use-canvas-inspector-panel-actions.ts` 的 `openAssistant` 改为打开 `{ kind: "assistant" }`；新增打开节点、镜头和生产包面板动作。
- `canvas-node-inspector.tsx`、`canvas-shot-inspector.tsx`、`canvas-production-package-inspector.tsx` 保持为纯内容组件，不自行控制 Drawer。
- `canvas-assistant-panel.tsx` 使用现有 `embedded={false}` 模式；保留会话、选中节点引用、插入图片/文本、粘贴图片、Artifact 消费和 Workflow 助手 callbacks。
- `canvas-production-package-bar.tsx` 提供明确“镜头详情 / 生产包”按需入口。
- `canvas-page-overlays.tsx` 装配单个 `CanvasTransientPanelHost`，根据 `activeTaskPanel.kind` 渲染相应内容。
- `canvas-client-page.tsx` 只把现有选择、数据和 callbacks 接入新 host；此任务结束时旧 `CanvasSideInspector` 仍在，以便逐项比对能力，不先删除。
- 更新 `canvas-capability-wiring.test.mts`：Skill 只需从节点更多菜单可达，不再要求检查器重复接线；助手 Artifact 消费接线仍必须存在。

- [ ] **Step 5: 运行临时面板和能力接线测试**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-transient-panel.test.mts' \
  'src/app/(user)/canvas/components/canvas-capability-wiring.test.mts' \
  'src/app/(user)/canvas/utils/canvas-storyboard-overlay-wiring.test.mts' \
  'src/app/(user)/canvas/utils/canvas-shortcuts.test.mts'
```

Expected: 全部 PASS；打开新主面板会关闭旧主面板，Esc 仍可关闭浮层。

- [ ] **Step 6: 提交本任务**

```bash
git add \
  'web/src/app/(user)/canvas/utils/canvas-transient-panel.ts' \
  'web/src/app/(user)/canvas/utils/canvas-transient-panel.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-transient-panel-host.tsx' \
  'web/src/app/(user)/canvas/components/canvas-assistant-panel.tsx' \
  'web/src/app/(user)/canvas/components/canvas-assistant-panel-chrome.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-inspector.tsx' \
  'web/src/app/(user)/canvas/components/canvas-shot-inspector.tsx' \
  'web/src/app/(user)/canvas/components/canvas-production-package-inspector.tsx' \
  'web/src/app/(user)/canvas/components/canvas-production-package-bar.tsx' \
  'web/src/app/(user)/canvas/components/canvas-page-overlays.tsx' \
  'web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts' \
  'web/src/app/(user)/canvas/hooks/use-canvas-inspector-panel-actions.ts' \
  'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' \
  'web/src/app/(user)/canvas/components/canvas-capability-wiring.test.mts'
git commit -m "feat: migrate canvas details to transient panels"
```

### Task 5: 撤除常驻检查器与右侧 viewport 占位

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-inspector-removal.test.mts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.ts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-viewport.test.mts`
- Delete: `web/src/app/(user)/canvas/components/canvas-side-inspector.tsx`
- Delete: `web/src/app/(user)/canvas/components/canvas-context-inspector.tsx`
- Delete: `web/src/app/(user)/canvas/utils/canvas-inspector-visibility.ts`
- Delete: `web/src/app/(user)/canvas/utils/canvas-inspector-visibility.test.mts`

- [ ] **Step 1: 写“无常驻栏、无右侧偏置”的失败测试**

新增：

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("canvas no longer mounts a persistent inspector or reserves its width", async () => {
    const [page, state, actions] = await Promise.all([
        read("../[id]/canvas-client-page.tsx"),
        read("../hooks/use-canvas-page-local-state.ts"),
        read("../hooks/use-canvas-page-actions.ts"),
    ]);
    assert.doesNotMatch(page, /CanvasSideInspector|CanvasContextInspector/);
    assert.doesNotMatch(state, /inspectorView|isInspectorCollapsed/);
    assert.doesNotMatch(actions, /right:\s*160/);
    assert.match(actions, /right:\s*24/);
});
```

- [ ] **Step 2: 运行测试并确认仍装配旧检查器**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-inspector-removal.test.mts'
```

Expected: FAIL，命中 `CanvasSideInspector`、`inspectorView` 或 `right: 160`。

- [ ] **Step 3: 删除旧装配与布局状态**

- `canvas-client-page.tsx` 删除 `CanvasSideInspector` import、JSX 和仅为它准备的 props；保留 Task 4 已迁入临时面板的助手、镜头、生产包、节点信息和资产入口。
- `use-canvas-page-local-state.ts` 删除 `inspectorView`、`isInspectorCollapsed`、对应 setters 和移动端折叠 effect；保留真实业务选择 `activeTimelineShotId`、`activeProductionPackageId`、助手会话和 `activeTaskPanel`。
- `use-canvas-page-actions.ts` 将 viewport insets 固定为 `{ top: 24, right: 24, bottom: 32, left: 24 }`。
- 删除 `canvas-side-inspector.tsx`、`canvas-context-inspector.tsx` 和旧 visibility 工具/测试；保留可复用内容组件 `canvas-node-inspector.tsx`、`canvas-shot-inspector.tsx`、`canvas-production-package-inspector.tsx`。
- `use-canvas-page-actions.test.mts` 和 `canvas-viewport.test.mts` 增加对称 insets 用例，断言打开/关闭临时面板不会写节点位置或 viewport。

- [ ] **Step 4: 运行检查器撤除与 viewport 回归**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-inspector-removal.test.mts' \
  'src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' \
  'src/app/(user)/canvas/utils/canvas-viewport.test.mts' \
  'src/app/(user)/canvas/utils/canvas-transient-panel.test.mts' \
  'src/app/(user)/canvas/utils/canvas-storyboard-overlay-wiring.test.mts'
```

Expected: 全部 PASS；页面源码无旧检查器，fit/reset 不再向左偏移。

- [ ] **Step 5: 提交本任务**

```bash
git add -A \
  'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' \
  'web/src/app/(user)/canvas/hooks/use-canvas-page-local-state.ts' \
  'web/src/app/(user)/canvas/hooks/use-canvas-page-actions.ts' \
  'web/src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-viewport.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-inspector-removal.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-side-inspector.tsx' \
  'web/src/app/(user)/canvas/components/canvas-context-inspector.tsx' \
  'web/src/app/(user)/canvas/utils/canvas-inspector-visibility.ts' \
  'web/src/app/(user)/canvas/utils/canvas-inspector-visibility.test.mts'
git commit -m "refactor: remove the persistent canvas inspector"
```

### Task 6: 节点状态反馈与一句全局运行摘要

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-run-summary.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-run-summary.test.mts`
- Create: `web/src/app/(user)/canvas/components/canvas-run-summary.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-status.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-node-status.test.mts`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-content.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-video-task-progress-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-info-modal.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-floating-controls.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generation-retry-state.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-video-task-recovery.test.mts`

- [ ] **Step 1: 写运行摘要失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasRunSummary } from "./canvas-run-summary.ts";
import { CanvasNodeType, type CanvasNodeData } from "../types.ts";

const node = (id: string, status: "loading" | "error" | "success"): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { status } });

test("summary reports only active and actionable work", () => {
    assert.deepEqual(buildCanvasRunSummary({ nodes: [node("a", "loading"), node("b", "loading"), node("c", "error"), node("d", "success")], queuePaused: false }), {
        running: 2,
        needsAttention: 1,
        label: "2 个运行中 · 1 个需要处理",
    });
});

test("successful idle work leaves no persistent summary", () => {
    assert.equal(buildCanvasRunSummary({ nodes: [node("d", "success")], queuePaused: false }), null);
});
```

- [ ] **Step 2: 运行测试并确认摘要模块缺失**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-run-summary.test.mts'
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现摘要纯函数**

```ts
import type { CanvasNodeData } from "../types.ts";

export function buildCanvasRunSummary({ nodes, queuePaused }: { nodes: CanvasNodeData[]; queuePaused: boolean }) {
    const running = nodes.filter((node) => node.metadata?.status === "loading").length;
    const needsAttention = nodes.filter((node) => node.metadata?.status === "error").length;
    if (!running && !needsAttention && !queuePaused) return null;
    const parts = [running ? `${running} 个运行中` : "", needsAttention ? `${needsAttention} 个需要处理` : "", queuePaused ? "队列已暂停" : ""].filter(Boolean);
    return { running, needsAttention, label: parts.join(" · ") };
}
```

如果现有 `queueItems` 含有尚未映射到节点的活动项，在调用前按 task ID 去重后合并计数；不得把摘要写回节点 metadata 或另建 store。

- [ ] **Step 4: 装配摘要并把技术字段移入详情**

- `canvas-run-summary.tsx` 仅在 summary 非空时渲染一句按钮；点击后使用 Task 4 的临时面板显示运行项、阻断原因和取消入口。
- `canvas-floating-controls.tsx` 在画布边缘装配摘要，不遮挡左侧创建栏、底部工具或节点。
- `canvas-node-status.ts` 新增 `canvasNodeFailureMessage(node)`，输出用户可理解的原因和下一步；供应商原始错误保持在 `errorDetails`。
- `canvas-node-content.tsx`：生成中只显示阶段/进度；失败态显示简短原因和“重试/查看详情”，已有媒体继续留在底层。
- `canvas-video-task-progress-panel.tsx` 删除常驻 task ID、模型实参、账本、哈希等字段。
- `canvas-node-info-modal.tsx` 承接完整技术追溯字段，不删数据。
- `canvas-client-page.tsx` 以现有 `nodes`、`queueItems`、`queuePaused` 作为摘要输入。

- [ ] **Step 5: 运行状态、重试和恢复回归**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-run-summary.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-status.test.mts' \
  'src/app/(user)/canvas/utils/canvas-generation-retry-state.test.mts' \
  'src/app/(user)/canvas/utils/canvas-video-task-recovery.test.mts' \
  'src/app/(user)/canvas/utils/canvas-video-recovery-wiring.test.mts'
```

Expected: 全部 PASS；成功状态不留下全局摘要，旧媒体重试和恢复仍保留历史结果。

- [ ] **Step 6: 提交本任务**

```bash
git add \
  'web/src/app/(user)/canvas/utils/canvas-run-summary.ts' \
  'web/src/app/(user)/canvas/utils/canvas-run-summary.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-run-summary.tsx' \
  'web/src/app/(user)/canvas/utils/canvas-node-status.ts' \
  'web/src/app/(user)/canvas/utils/canvas-node-status.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-node-content.tsx' \
  'web/src/app/(user)/canvas/components/canvas-video-task-progress-panel.tsx' \
  'web/src/app/(user)/canvas/components/canvas-node-info-modal.tsx' \
  'web/src/app/(user)/canvas/components/canvas-floating-controls.tsx' \
  'web/src/app/(user)/canvas/[id]/canvas-client-page.tsx' \
  'web/src/app/(user)/canvas/utils/canvas-generation-retry-state.test.mts' \
  'web/src/app/(user)/canvas/utils/canvas-video-task-recovery.test.mts'
git commit -m "feat: clarify canvas run and error states"
```

### Task 7: 响应式、可访问性、核心语义回归与验收文档

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-editorial-contract.test.mts`
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/(user)/canvas/components/canvas-top-bar.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-creation-rail.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-transient-panel-host.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-run-summary.tsx`
- Modify: `docs/pending-test.md`
- Modify only if a matching item exists: `docs/todo.md`

- [ ] **Step 1: 写最终 UI 契约失败测试**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("editorial canvas keeps accessible transient controls", async () => {
    const [rail, panel, logo, page] = await Promise.all([
        read("../components/canvas-creation-rail.tsx"),
        read("../components/canvas-transient-panel-host.tsx"),
        read("../components/canvas-logo-placeholder.tsx"),
        read("../[id]/canvas-client-page.tsx"),
    ]);
    assert.match(rail, /aria-label="左侧创建栏"/);
    assert.match(panel, /Drawer/);
    assert.match(panel, /focus\(\)/);
    assert.match(logo, /\/logo\.svg/);
    assert.doesNotMatch(page, /CanvasSideInspector/);
});
```

- [ ] **Step 2: 运行契约测试并确认响应式/焦点接线尚未齐全**

Run:

```bash
cd web
node --experimental-strip-types --test 'src/app/(user)/canvas/utils/canvas-editorial-contract.test.mts'
```

Expected: 在 Drawer、焦点恢复或旧检查器断言之一 FAIL。

- [ ] **Step 3: 完成响应式和无障碍收口**

- `globals.css` 仅在 `.canvas-editorial-shell` 作用域加入 390/768/1280/1440 布局规则、可见焦点、`prefers-reduced-motion` 和画布浮层 z-index；不修改项目、资产、工作台或后台样式。
- `canvas-creation-rail.tsx` 在 390px 高度下保持全部关键动作可达，必要时将文字隐藏但保留 `aria-label` 和 title。
- `canvas-top-bar.tsx` 在窄屏将低频动作放入唯一画布菜单，不能重新制造桌面重复入口。
- `canvas-transient-panel-host.tsx`：`<768px` 使用可滚动 Drawer；桌面使用 absolute panel；两者 Esc、遮罩、关闭按钮语义一致，关闭后恢复触发点焦点。
- `canvas-run-summary.tsx` 状态文字不只依赖颜色，并具备 `aria-live="polite"`。
- 所有新增图标按钮提供中文可访问名称；尊重 reduced motion。

- [ ] **Step 4: 运行最小自动回归矩阵**

Run:

```bash
cd web
node --experimental-strip-types --test \
  'src/app/(user)/canvas/utils/canvas-editorial-contract.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-presentation.test.mts' \
  'src/app/(user)/canvas/utils/canvas-global-action-entry.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-action-layout.test.mts' \
  'src/app/(user)/canvas/utils/canvas-transient-panel.test.mts' \
  'src/app/(user)/canvas/utils/canvas-inspector-removal.test.mts' \
  'src/app/(user)/canvas/utils/canvas-run-summary.test.mts' \
  'src/app/(user)/canvas/components/canvas-node-generation.test.mts' \
  'src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts' \
  'src/app/(user)/canvas/utils/canvas-generation-retry-state.test.mts' \
  'src/app/(user)/canvas/utils/canvas-generated-asset-writeback.test.mts' \
  'src/app/(user)/canvas/utils/canvas-video-frame.test.mts' \
  'src/app/(user)/canvas/utils/canvas-viewport.test.mts' \
  'src/app/(user)/canvas/utils/canvas-shortcuts.test.mts' \
  'src/app/(user)/canvas/utils/canvas-node-overlay-layout.test.mts' \
  'src/app/(user)/canvas/hooks/use-canvas-page-actions.test.mts'
```

Expected: 全部 PASS；所有路径均指向仓库现有测试或本计划明确创建的测试，不复制测试文件。

- [ ] **Step 5: 完成人工视觉与交互验收**

启动项目现有本地开发环境，在深色与浅色主题分别检查 `390×844`、`768×1024`、`1280×900`、`1440×900`：

- 默认画布无常驻右栏，关闭临时面板后画布宽度、viewport 和节点位置不变。
- 左侧只创建；顶部导入、素材、整理和保存没有同权重复入口。
- 未选中节点无工具条；单选节点仅显示编辑、主推进动作、更多。
- 图片、视频、音频空节点使用 `/logo.svg`，没有场记板；真实媒体出现后 Logo 完全退场。
- 有旧媒体时生成、重试、失败都保留旧媒体，只叠加状态。
- 生成期间可继续选择、移动、连接和编辑其他节点。
- 助手会话、节点信息、镜头、生产包版本操作、Skill、裁剪、超分、多角度、预览、下载、存资产和资产入口均可达。
- 键盘验证选择、连接、删除、复制粘贴、撤销重做和 Esc；Drawer/浮层关闭后焦点返回触发按钮。
- 普通文本对比度不低于 4.5:1，关键边界不低于 3:1；状态同时有文字或图标表达。

不得用真实生成子命令做 UI 验收；需要任务状态时使用现有 fixture、假 CLI 或已保存的本地任务数据。

- [ ] **Step 6: 更新实际可测试变更文档**

在 `docs/pending-test.md` 的当前版本清单新增“无限画布电影制作案头重设计”，只记录本次真实完成的可测试变更与上述人工入口。检查 `docs/todo.md`：只有存在与本改造完全匹配的待办时才将该条移入 `pending-test`；没有匹配项则保持文件不变。

- [ ] **Step 7: 提交最终收口**

```bash
git add \
  web/src/app/globals.css \
  'web/src/app/(user)/canvas/utils/canvas-editorial-contract.test.mts' \
  'web/src/app/(user)/canvas/components/canvas-top-bar.tsx' \
  'web/src/app/(user)/canvas/components/canvas-creation-rail.tsx' \
  'web/src/app/(user)/canvas/components/canvas-transient-panel-host.tsx' \
  'web/src/app/(user)/canvas/components/canvas-run-summary.tsx' \
  docs/pending-test.md
git diff --quiet -- docs/todo.md || git add docs/todo.md
git commit -m "docs: prepare editorial canvas acceptance"
```

## 完成定义

- 七个任务均有独立提交，且未带入 `AGENTS.md`、`docs/virtual-team/` 或其他既有用户改动。
- 自动定向回归全部通过；没有运行真实或付费生成。
- 人工矩阵确认深浅主题和四个视口关键操作可达。
- 常驻检查器已撤除，但其助手、镜头、生产包、节点详情、资产和技术追溯能力全部存在明确按需入口。
- 视觉和交互验收满足已批准规格，且数据、引用、版本、回写与连续性语义无变化。
