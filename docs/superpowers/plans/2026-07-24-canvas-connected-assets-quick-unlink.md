# Canvas Connected Assets Quick Unlink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在所有支持提示词的画布节点中展示直接上游媒体，并允许通过单击关闭按钮只断开对应连线。

**Architecture:** 新增一个纯函数把 `nodes + connections + targetNodeId` 转换为带 connectionId 的媒体展示项，再由一个画布私有组件统一渲染。`CanvasNodesLayer` 负责组装数据并把现有 `deleteConnection` 下传给普通提示词面板和生成配置面板；媒体预览继续复用 `previewNodeId`，并把现有图片弹窗扩展为图片、视频、音频通用预览。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、lucide-react、Ant Design、Node.js `node:test`。

---

## 文件结构

- Create: `web/src/app/(user)/canvas/utils/canvas-connected-media.ts` — 只负责从画布数据生成直接上游媒体展示项。
- Create: `web/src/app/(user)/canvas/utils/canvas-connected-media.test.mts` — 验证过滤、排序、连接 ID 和专用接口角色。
- Create: `web/src/app/(user)/canvas/components/canvas-connected-media-strip.tsx` — 统一的预览与快速断线展示组件。
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx` — 普通图片、视频、文本节点提示词面板接入素材条。
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx` — 生成配置节点接入素材条。
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx` — 构建展示项并下传现有预览和删除动作。
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx` — 将 `deleteConnection` 传入节点层。
- Modify: `web/src/app/(user)/canvas/components/canvas-page-modals.tsx` — 将图片预览扩展为媒体预览。
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx` — 使用媒体预览组件。
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts` — 锁定两类面板与统一删除动作的接线。
- Create: `web/src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts` — 锁定视频和音频预览分支。
- Modify: `docs/pending-test.md` — 记录真实页面验收步骤。

### Task 1: 直接上游媒体数据转换

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-connected-media.ts`
- Create: `web/src/app/(user)/canvas/utils/canvas-connected-media.test.mts`

- [ ] **Step 1: 写失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { buildCanvasConnectedMedia } from "./canvas-connected-media.ts";

test("builds direct upstream media items with exact connection identities", () => {
    const nodes = [
        { id: "image-1", type: "image", title: "角色图", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "image-url" } },
        { id: "video-1", type: "video", title: "动作参考", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "video-url" } },
        { id: "audio-1", type: "audio", title: "节奏参考", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "audio-url" } },
        { id: "text-1", type: "text", title: "文本", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "提示词" } },
        { id: "target", type: "video", title: "目标", position: { x: 0, y: 0 }, width: 100, height: 100 },
        { id: "other", type: "video", title: "其他", position: { x: 0, y: 0 }, width: 100, height: 100 },
    ];
    const connections = [
        { id: "connection-image", fromNodeId: "image-1", toNodeId: "target", toHandle: "first_frame" },
        { id: "connection-video", fromNodeId: "video-1", toNodeId: "target" },
        { id: "connection-audio", fromNodeId: "audio-1", toNodeId: "target" },
        { id: "connection-text", fromNodeId: "text-1", toNodeId: "target" },
        { id: "connection-indirect", fromNodeId: "image-1", toNodeId: "other" },
        { id: "connection-missing", fromNodeId: "missing", toNodeId: "target" },
    ];

    assert.deepEqual(buildCanvasConnectedMedia("target", nodes, connections), [
        { connectionId: "connection-image", nodeId: "image-1", type: "image", label: "首帧 · 图片 1", title: "角色图", previewUrl: "image-url", role: "first_frame" },
        { connectionId: "connection-video", nodeId: "video-1", type: "video", label: "视频 1", title: "动作参考", previewUrl: "video-url" },
        { connectionId: "connection-audio", nodeId: "audio-1", type: "audio", label: "音频 1", title: "节奏参考", previewUrl: "audio-url" },
    ]);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-connected-media.test.mts"
```

Expected: FAIL，错误为找不到 `canvas-connected-media.ts` 或 `buildCanvasConnectedMedia`。

- [ ] **Step 3: 实现最小纯函数**

```ts
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types.ts";

export type CanvasConnectedMediaItem = {
    connectionId: string;
    nodeId: string;
    type: "image" | "video" | "audio";
    label: string;
    title: string;
    previewUrl?: string;
    role?: string;
};

export function buildCanvasConnectedMedia(targetNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasConnectedMediaItem[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const counts = { image: 0, video: 0, audio: 0 };
    return connections.flatMap((connection) => {
        if (connection.toNodeId !== targetNodeId) return [];
        const node = nodeById.get(connection.fromNodeId);
        if (!node || (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio)) return [];
        const type = node.type as CanvasConnectedMediaItem["type"];
        counts[type] += 1;
        const baseLabel = `${type === "image" ? "图片" : type === "video" ? "视频" : "音频"} ${counts[type]}`;
        const roleLabel = connection.toHandle === "first_frame" ? "首帧" : connection.toHandle === "last_frame" ? "尾帧" : "";
        return [
            {
                connectionId: connection.id,
                nodeId: node.id,
                type,
                label: roleLabel ? `${roleLabel} · ${baseLabel}` : baseLabel,
                title: node.title,
                previewUrl: node.metadata?.content,
                ...(connection.toHandle ? { role: connection.toHandle } : {}),
            },
        ];
    });
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: 与 Step 2 相同。

Expected: 1 test passed，0 failed。

- [ ] **Step 5: 提交纯函数与测试**

```bash
git add "web/src/app/(user)/canvas/utils/canvas-connected-media.ts" "web/src/app/(user)/canvas/utils/canvas-connected-media.test.mts"
git commit -m "feat: map connected canvas media"
```

### Task 2: 已连接素材展示组件与节点面板接线

**Files:**
- Create: `web/src/app/(user)/canvas/components/canvas-connected-media-strip.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts`

- [ ] **Step 1: 写接线失败测试**

向 `canvas-prompt-editor-wiring.test.mts` 增加：

```ts
test("all prompt node panels expose connected media preview and exact unlink actions", () => {
    const layer = readCanvasFile("../components/canvas-nodes-layer.tsx");
    const promptPanel = readCanvasFile("../components/canvas-node-prompt-panel.tsx");
    const configPanel = readCanvasFile("../components/canvas-config-node-panel.tsx");
    const page = readCanvasFile("../[id]/canvas-client-page.tsx");

    assert.match(layer, /buildCanvasConnectedMedia\(panelNode\.id, nodes, connections\)/);
    assert.match(layer, /onDisconnectConnectedMedia=\{deleteConnection\}/);
    assert.match(promptPanel, /<CanvasConnectedMediaStrip/);
    assert.match(configPanel, /<CanvasConnectedMediaStrip/);
    assert.match(page, /deleteConnection=\{deleteConnection\}/);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
```

Expected: 新测试 FAIL，因为组件和 props 尚不存在。

- [ ] **Step 3: 创建展示组件**

```tsx
"use client";

import { AudioLines, Image as ImageIcon, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnectedMediaItem } from "../utils/canvas-connected-media";

export function CanvasConnectedMediaStrip({ items, onPreview, onDisconnect }: { items: CanvasConnectedMediaItem[]; onPreview?: (nodeId: string) => void; onDisconnect: (connectionId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!items.length) return null;
    return (
        <section className="mb-2" aria-label="已连接素材" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: theme.node.muted }}>
                <span>已连接素材</span>
                <span className="tabular-nums">{items.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <div key={item.connectionId} className="flex min-w-0 max-w-[190px] items-center gap-1 rounded-md border p-1" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onPreview?.(item.nodeId)} title={`预览 ${item.title}`}>
                            <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded" style={{ background: theme.node.panel, color: theme.node.muted }}>
                                {item.type === "image" && item.previewUrl ? <img src={item.previewUrl} alt="" className="size-full object-cover" /> : item.type === "image" ? <ImageIcon className="size-4" /> : item.type === "video" ? <Video className="size-4" /> : <AudioLines className="size-4" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-[10px]" style={{ color: theme.node.muted }}>{item.label}</span>
                                <span className="block truncate text-xs" style={{ color: theme.node.text }}>{item.title}</span>
                            </span>
                        </button>
                        <button type="button" className="grid size-6 shrink-0 place-items-center rounded transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]" aria-label={`断开素材：${item.title}`} title="断开与当前节点的连线" onClick={(event) => { event.stopPropagation(); onDisconnect(item.connectionId); }}>
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}
```

- [ ] **Step 4: 给两个面板增加统一 props 与渲染**

两个面板都增加以下 props：

```ts
connectedMedia?: CanvasConnectedMediaItem[];
onDisconnectConnectedMedia?: (connectionId: string) => void;
```

在普通提示词编辑器上方、生成配置节点标题下方渲染：

```tsx
<CanvasConnectedMediaStrip
    items={connectedMedia}
    onPreview={onPreviewReference}
    onDisconnect={(connectionId) => onDisconnectConnectedMedia?.(connectionId)}
/>
```

默认 `connectedMedia = []`；只有 `onDisconnectConnectedMedia` 存在时才渲染，避免产生无效关闭按钮。

- [ ] **Step 5: 在节点层构建数据并接入现有删除动作**

给 `CanvasNodesLayer` 增加：

```ts
deleteConnection: (connectionId: string) => void;
```

在 `renderPanel` 和 `renderNodeContent` 中分别调用：

```ts
const connectedMedia = buildCanvasConnectedMedia(panelNode.id, nodes, connections);
```

并向两个面板传递：

```tsx
connectedMedia={connectedMedia}
onDisconnectConnectedMedia={deleteConnection}
```

预览回调对所有媒体统一调用已有动作：

```ts
onPreviewReference={(nodeId) => {
    const referenceNode = nodesRef.current.find((item) => item.id === nodeId);
    if (referenceNode) nodeToolActions.onViewImage(referenceNode);
}}
```

最后在 `canvas-client-page.tsx` 的 `<CanvasNodesLayer>` 上增加：

```tsx
deleteConnection={deleteConnection}
```

- [ ] **Step 6: 运行测试与类型检查**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-connected-media.test.mts" "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
npm run typecheck
```

Expected: 所有专项测试通过，TypeScript 0 error。

- [ ] **Step 7: 提交组件与接线**

```bash
git add "web/src/app/(user)/canvas/components/canvas-connected-media-strip.tsx" "web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx" "web/src/app/(user)/canvas/components/canvas-config-node-panel.tsx" "web/src/app/(user)/canvas/components/canvas-nodes-layer.tsx" "web/src/app/(user)/canvas/[id]/canvas-client-page.tsx" "web/src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts"
git commit -m "feat: unlink connected canvas media"
```

### Task 3: 图片、视频、音频通用预览

**Files:**
- Modify: `web/src/app/(user)/canvas/components/canvas-page-modals.tsx`
- Modify: `web/src/app/(user)/canvas/components/canvas-page-overlays.tsx`
- Create: `web/src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts`

- [ ] **Step 1: 写预览失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the canvas media preview renders image video and audio content", () => {
    const modal = readFileSync(new URL("../components/canvas-page-modals.tsx", import.meta.url), "utf8");
    const overlays = readFileSync(new URL("../components/canvas-page-overlays.tsx", import.meta.url), "utf8");
    assert.match(modal, /CanvasMediaPreviewModal/);
    assert.match(modal, /node\?\.type === CanvasNodeType\.Video/);
    assert.match(modal, /<video/);
    assert.match(modal, /node\?\.type === CanvasNodeType\.Audio/);
    assert.match(modal, /<audio/);
    assert.match(overlays, /<CanvasMediaPreviewModal/);
});
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts"
```

Expected: FAIL，因为当前只有 `CanvasImagePreviewModal`。

- [ ] **Step 3: 扩展通用媒体弹窗**

把 `CanvasImagePreviewModal` 改名为 `CanvasMediaPreviewModal`，导入 `CanvasNodeType`，标题按类型返回“图片详情 / 视频详情 / 音频详情”，主体使用：

```tsx
{node?.type === CanvasNodeType.Image && content ? <img src={content} alt={node.title || "图片"} className="max-h-[80vh] max-w-full object-contain" /> : null}
{node?.type === CanvasNodeType.Video && content ? <video src={content} className="max-h-[80vh] max-w-full" controls controlsList="nodownload" playsInline /> : null}
{node?.type === CanvasNodeType.Audio && content ? <audio src={content} className="w-[min(640px,80vw)]" controls /> : null}
```

同步更新 `canvas-page-overlays.tsx` 的 import 和 JSX 名称，不改变 `previewNodeId` 状态结构。

- [ ] **Step 4: 运行专项测试和类型检查**

Run:

```bash
cd web
node --experimental-strip-types --test "src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts"
npm run typecheck
```

Expected: 专项测试通过，TypeScript 0 error。

- [ ] **Step 5: 提交媒体预览**

```bash
git add "web/src/app/(user)/canvas/components/canvas-page-modals.tsx" "web/src/app/(user)/canvas/components/canvas-page-overlays.tsx" "web/src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts"
git commit -m "feat: preview connected canvas media"
```

### Task 4: 文档、完整验证与页面验收

**Files:**
- Modify: `docs/pending-test.md`

- [ ] **Step 1: 更新待验收文档**

在“画布交互可靠性、批量连线与提示词内嵌图片引用”实现项中增加：

```md
12. 图片、视频、文本和生成配置节点会在提示词区域展示直接上游媒体；点击素材可预览，点击 `×` 只断开对应连线。断线不会删除素材节点或自动删除提示词中的 `@` 标签，失效引用继续阻止生成并可通过撤销恢复。
```

增加待验收项：

```md
12. 给同一节点连接图片、视频、音频后打开提示词区域，确认三类素材均显示；分别点击预览和 `×`，确认只有目标连线被删除，素材节点及其连接到其他节点的连线保留；提示词中的旧 `@` 标签显示失效，执行撤销后连线恢复。
```

- [ ] **Step 2: 运行完整专项验证**

Run:

```bash
cd web
node --experimental-strip-types --test \
  "src/app/(user)/canvas/utils/canvas-connected-media.test.mts" \
  "src/app/(user)/canvas/utils/canvas-prompt-editor-wiring.test.mts" \
  "src/app/(user)/canvas/utils/canvas-reference-mentions.test.mts" \
  "src/app/(user)/canvas/utils/canvas-media-preview-wiring.test.mts"
npm run typecheck
cd ..
git diff --check
```

Expected: 全部测试通过、TypeScript 0 error、`git diff --check` 0 output。

- [ ] **Step 3: Chrome 页面验收**

在现有本地画布中：

1. 打开一个已连接图片、视频或音频的普通节点提示词面板，确认“已连接素材”显示缩略预览、类型序号和节点名。
2. 打开生成配置节点，确认相同素材条出现。
3. 点击图片、视频、音频主体，确认分别打开对应媒体预览。
4. 点击一个素材的 `×`，确认只减少一条目标连线，素材节点仍存在。
5. 若提示词含该素材的 `@`，确认出现失效提示并禁用生成。
6. 点击撤销，确认连线和素材条恢复。
7. 检查浏览器控制台没有新增 error。

- [ ] **Step 4: 提交文档与最终修复**

```bash
git add docs/pending-test.md
git commit -m "docs: add canvas quick unlink acceptance"
```

