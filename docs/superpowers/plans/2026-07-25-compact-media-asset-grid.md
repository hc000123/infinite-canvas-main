# 素材库图片与视频统一紧凑网格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图片素材与视频素材使用同一套紧凑缩略图卡片和响应式网格，并统一画布生成素材的展示与下载名称。

**Architecture:** 把现有仅支持视频的布局判定与卡片泛化为媒体版本。抽取唯一的画布素材命名函数供归档和画布下载使用，并在素材页用画布与版本关联为可识别的旧素材恢复规范标题；结果页和下载接收同一个规范化素材对象。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、Node.js test runner

---

### Task 1: 泛化媒体分组判定

**Files:**
- Modify: `web/src/app/(user)/assets/asset-result-layout.test.mts`
- Modify: `web/src/app/(user)/assets/asset-result-layout.ts`

- [x] **Step 1: 写入图片媒体分组失败测试**

新增 `ImageAsset` 测试数据，并断言纯图片、纯视频及图片视频组合均返回 `true`，文本混入和空数组返回 `false`：

```ts
assert.equal(isCompactMediaAssetGroup([image("image-a"), image("image-b")]), true);
assert.equal(isCompactMediaAssetGroup([video("video-a"), image("image-a")]), true);
assert.equal(isCompactMediaAssetGroup([video("video-a"), textAsset]), false);
assert.equal(isCompactMediaAssetGroup([]), false);
```

- [x] **Step 2: 运行测试并确认失败**

Run: `cd web && node --test 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: FAIL，提示 `isCompactMediaAssetGroup` 尚未导出。

- [x] **Step 3: 实现最小媒体分组类型守卫**

```ts
export type CompactMediaAsset = ImageAsset | VideoAsset;

export function isCompactMediaAssetGroup(assets: Asset[]): assets is CompactMediaAsset[] {
    return assets.length > 0 && assets.every((asset) => asset.kind === "image" || asset.kind === "video");
}
```

- [x] **Step 4: 运行测试并确认通过**

Run: `cd web && node --test 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: PASS。

### Task 2: 统一紧凑媒体卡片

**Files:**
- Create: `web/src/app/(user)/assets/components/compact-media-asset-card.tsx`
- Delete: `web/src/app/(user)/assets/components/compact-video-asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`

- [x] **Step 1: 新增页面接线失败测试**

在结果布局测试中读取组件源码，断言结果页引用 `CompactMediaAssetCard` 和 `isCompactMediaAssetGroup`，且不再引用旧视频专用名称。

- [x] **Step 2: 运行测试并确认失败**

Run: `cd web && node --test 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: FAIL，结果页仍引用视频专用组件与判断函数。

- [x] **Step 3: 实现媒体卡片并接线**

卡片参数改为 `CompactMediaAsset`。图片预览使用：

```tsx
const previewUrl = asset.kind === "image" ? asset.coverUrl || asset.data.dataUrl : asset.coverUrl;

{asset.kind === "image" || previewUrl ? (
    <img src={previewUrl} alt={asset.title} className="size-full object-cover" />
) : (
    <video src={videoPreviewUrl(asset.data.url)} muted playsInline preload="metadata" className="size-full object-cover" />
)}
```

结果页对媒体分组统一使用响应式网格和 `CompactMediaAssetCard`；非媒体分组继续渲染 `AssetRow`。

- [x] **Step 4: 运行测试并确认通过**

Run: `cd web && node --test 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: PASS。

### Task 3: 统一画布生成素材名称

**Files:**
- Create: `web/src/app/(user)/canvas/utils/canvas-asset-name.ts`
- Create: `web/src/app/(user)/assets/asset-canvas-title.ts`
- Create: `web/src/app/(user)/assets/asset-canvas-title.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-generated-asset.test.mts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-media-download.ts`
- Modify: `web/src/app/(user)/canvas/utils/canvas-media-download.test.mts`
- Modify: `web/src/app/(user)/canvas/hooks/use-canvas-media-cache.ts`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`

- [x] **Step 1: 写入统一名称与旧素材恢复失败测试**

测试公共名称为 `毕业典礼画布-节点007-v3`，画布下载为 `毕业典礼画布-节点007-v3.mp4`；再构造带 `sourceAssetId` 的画布项目，断言旧提示词标题恢复为同一名称，无法关联的素材保持原名。

- [x] **Step 2: 运行测试并确认失败**

Run: `cd web && node --test 'src/app/(user)/canvas/utils/canvas-generated-asset.test.mts' 'src/app/(user)/canvas/utils/canvas-media-download.test.mts' 'src/app/(user)/assets/asset-canvas-title.test.mts'`

Expected: FAIL，公共命名模块与旧素材恢复函数尚不存在，画布下载仍使用内部节点 ID。

- [x] **Step 3: 实现唯一命名函数并接入**

公共函数返回清理过保留字符的 `画布名-节点NNN-vN`。归档、画布下载与素材页旧数据规范化都调用该函数；素材页把规范化后的素材数组传给查询、展示与下载动作。

- [x] **Step 4: 运行测试并确认通过**

Run: `cd web && node --test 'src/app/(user)/canvas/utils/canvas-generated-asset.test.mts' 'src/app/(user)/canvas/utils/canvas-media-download.test.mts' 'src/app/(user)/assets/asset-canvas-title.test.mts'`

Expected: PASS。

### Task 4: 文档与验证

**Files:**
- Modify: `docs/pending-test.md`
- Check: `docs/todo.md`

- [x] **Step 1: 更新待测试说明**

把“视频紧凑网格”扩展为“图片与视频统一紧凑网格”，加入竖图不撑高、图片操作完整的页面确认项。

- [x] **Step 2: 运行素材页相关回归测试**

Run: `cd web && node --test 'src/app/(user)/assets/asset-result-layout.test.mts' 'src/app/(user)/assets/asset-page-filters.test.mts' 'src/app/(user)/assets/asset-type-groups.test.mts'`

Expected: PASS。

- [x] **Step 3: 运行 TypeScript 检查**

Run: `cd web && npm run typecheck`

Expected: PASS，无 TypeScript 错误。

- [x] **Step 4: 检查改动范围并提交**

```bash
git diff --check
git status --short
git add web/src/app/\(user\)/assets web/src/app/\(user\)/canvas docs/pending-test.md docs/superpowers/plans/2026-07-25-compact-media-asset-grid.md
git commit -m "feat: unify compact image and video asset cards"
```
