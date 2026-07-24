# Compact Video Asset Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace video asset rows with compact preview cards and make natural title order the default so related node outputs stay adjacent.

**Architecture:** Keep the existing asset query, project/episode/type grouping, pagination, and action callbacks. Add one page-private video card plus a pure type-group layout guard; switch only all-video groups to a responsive grid, while the shared sorting utility owns natural name comparison and the query hook consumes its exported default.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind CSS, Zustand, Node test runner.

---

### Task 1: Default natural name sorting

**Files:**
- Modify: `web/src/app/(user)/assets/asset-page-filters.ts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.test.mts`
- Modify: `web/src/app/(user)/assets/use-asset-page-query.ts`
- Modify: `web/src/app/(user)/assets/components/asset-list-toolbar.tsx`

- [ ] **Step 1: Write the failing natural-sort test**

Add `DEFAULT_ASSET_SORT_MODE` to the existing import and append this test:

```ts
test("uses natural title order as the asset page default", () => {
    const assets = [textAsset("node-10", "节点 10 · 成片"), textAsset("node-2", "节点 2 · 成片"), textAsset("node-1", "节点 1 · 成片")];

    assert.equal(DEFAULT_ASSET_SORT_MODE, "title_asc");
    assert.deepEqual(
        sortAssetList(assets, DEFAULT_ASSET_SORT_MODE).map((asset) => asset.id),
        ["node-1", "node-2", "node-10"],
    );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-page-filters.test.mts'
```

Expected: FAIL because `DEFAULT_ASSET_SORT_MODE` is not exported, or because locale comparison places `节点 10` before `节点 2`.

- [ ] **Step 3: Implement the natural comparator and default**

In `asset-page-filters.ts`, add the exported default and one shared collator:

```ts
export const DEFAULT_ASSET_SORT_MODE: AssetSortMode = "title_asc";

const assetTitleCollator = new Intl.Collator("zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
});
```

Use it in `sortAssetList`:

```ts
if (sortMode === "title_asc") return assetTitleCollator.compare(a.title || "", b.title || "");
```

In `use-asset-page-query.ts`, import the constant and initialize:

```ts
const [sortMode, setSortMode] = useState<AssetSortMode>(DEFAULT_ASSET_SORT_MODE);
```

In `asset-list-toolbar.tsx`, rename the title option to user-facing Chinese and keep the existing alternatives:

```ts
{ label: "名称升序", value: "title_asc" },
{ label: "原始顺序", value: "default" },
```

- [ ] **Step 4: Run the sorting test and verify GREEN**

Run the Step 2 command again.

Expected: all tests in `asset-page-filters.test.mts` pass, including `节点 1 → 节点 2 → 节点 10`.

- [ ] **Step 5: Commit the sorting change**

```bash
git add 'web/src/app/(user)/assets/asset-page-filters.ts' 'web/src/app/(user)/assets/asset-page-filters.test.mts' 'web/src/app/(user)/assets/use-asset-page-query.ts' 'web/src/app/(user)/assets/components/asset-list-toolbar.tsx'
git commit -m "feat: sort asset library naturally by name"
```

### Task 2: Pure video-group layout decision

**Files:**
- Create: `web/src/app/(user)/assets/asset-result-layout.ts`
- Create: `web/src/app/(user)/assets/asset-result-layout.test.mts`

- [ ] **Step 1: Write the failing layout-guard test**

Create `asset-result-layout.test.mts` with minimal video and text fixtures:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { Asset, VideoAsset } from "../../../stores/use-asset-store.ts";
import { isCompactVideoAssetGroup } from "./asset-result-layout.ts";

const video = (id: string): VideoAsset => ({
    id,
    kind: "video",
    title: id,
    coverUrl: "",
    tags: [],
    source: "Canvas",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { url: `blob:${id}`, width: 720, height: 1280, bytes: 1024, mimeType: "video/mp4" },
});

const text: Asset = {
    id: "text",
    kind: "text",
    title: "文本",
    coverUrl: "",
    tags: [],
    source: "",
    note: "",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    data: { content: "文本" },
};

test("uses compact grid only for non-empty all-video groups", () => {
    assert.equal(isCompactVideoAssetGroup([video("a"), video("b")]), true);
    assert.equal(isCompactVideoAssetGroup([video("a"), text]), false);
    assert.equal(isCompactVideoAssetGroup([]), false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-result-layout.test.mts'
```

Expected: FAIL because `asset-result-layout.ts` does not exist.

- [ ] **Step 3: Implement the type guard**

Create `asset-result-layout.ts`:

```ts
import type { Asset, VideoAsset } from "../../../stores/use-asset-store.ts";

export function isCompactVideoAssetGroup(assets: Asset[]): assets is VideoAsset[] {
    return assets.length > 0 && assets.every((asset) => asset.kind === "video");
}
```

- [ ] **Step 4: Run the layout test and verify GREEN**

Run the Step 2 command again.

Expected: 1 test passes.

- [ ] **Step 5: Commit the layout guard**

```bash
git add 'web/src/app/(user)/assets/asset-result-layout.ts' 'web/src/app/(user)/assets/asset-result-layout.test.mts'
git commit -m "test: define compact video group layout"
```

### Task 3: Compact video asset card

**Files:**
- Create: `web/src/app/(user)/assets/components/compact-video-asset-card.tsx`
- Modify: `web/src/app/(user)/assets/asset-utils.ts`
- Modify: `web/src/app/(user)/assets/components/asset-card.tsx`

- [ ] **Step 1: Move the shared video preview URL helper**

Add to `asset-utils.ts`:

```ts
export function videoPreviewUrl(url: string) {
    if (!url || url.includes("#")) return url;
    return `${url}#t=0.1`;
}
```

Import it in `asset-card.tsx`, replace both `videoCoverUrl(...)` calls with `videoPreviewUrl(...)`, and delete the private `videoCoverUrl` function.

- [ ] **Step 2: Implement the page-private compact card**

Create `compact-video-asset-card.tsx` with `VideoAsset` props and the existing callbacks:

```tsx
"use client";

import { CheckSquare, Download, Eye, PencilLine, RefreshCw, ShieldCheck, Square, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { canSubmitVolcengineReview, isVolcengineReviewProcessing, shouldShowVolcengineReviewAction } from "@/services/volcengine-asset-metadata";
import type { VideoAsset } from "@/stores/use-asset-store";
import { cn } from "@/lib/utils";
import { assetMediaInfo, videoPreviewUrl, volcengineReviewActionLabel } from "../asset-utils";
import { AssetIconButton, VolcengineAssetTag } from "./asset-card";

export function CompactVideoAssetCard(props: {
    asset: VideoAsset;
    selected: boolean;
    refreshingReview: boolean;
    submittingReview: boolean;
    onSelect: () => void;
    onOpen: () => void;
    onEdit: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onReview: () => void;
    onRefreshReview: () => void;
}) {
    const { asset } = props;
    const previewUrl = videoPreviewUrl(asset.data.url);
    const openOnKeyboard = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onOpen();
    };

    return (
        <article className={cn("group min-w-0 overflow-hidden rounded-lg border bg-[var(--studio-elevated-bg)] transition", props.selected ? "border-[var(--studio-accent)] shadow-[0_0_0_1px_var(--studio-accent)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-accent)]")}>
            <div className="relative aspect-[4/3] overflow-hidden bg-[var(--studio-shell-bg)]">
                <button type="button" aria-label={props.selected ? `取消选择素材 ${asset.title}` : `选择素材 ${asset.title}`} aria-pressed={props.selected} className={cn("absolute left-2 top-2 z-10 grid size-7 place-items-center rounded-md border bg-[var(--studio-media-overlay)] text-[var(--studio-on-media)] backdrop-blur", props.selected && "border-[var(--studio-accent)] bg-[var(--studio-accent)]")} onClick={props.onSelect}>
                    {props.selected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                </button>
                <button type="button" className="size-full" aria-label={`查看素材详情：${asset.title}`} onClick={props.onOpen} onKeyDown={openOnKeyboard}>
                    {asset.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="size-full object-cover" /> : <video src={previewUrl} muted playsInline preload="metadata" className="size-full object-cover" />}
                </button>
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-[var(--studio-media-overlay)] p-1 opacity-100 backdrop-blur transition lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">
                    <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={props.onOpen} />
                    <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={props.onEdit} />
                    <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={props.onDownload} />
                    {shouldShowVolcengineReviewAction(asset.kind) ? asset.metadata?.volcengineAsset?.assetId && !canSubmitVolcengineReview(asset.metadata.volcengineAsset) ? <AssetIconButton title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)} icon={<RefreshCw className={cn("size-3.5", isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !props.refreshingReview && "animate-spin")} />} loading={props.refreshingReview} onClick={props.onRefreshReview} /> : <AssetIconButton title={asset.metadata?.volcengineAsset?.status === "Failed" ? "重新加白" : "加白"} icon={<ShieldCheck className="size-3.5" />} loading={props.submittingReview} onClick={props.onReview} /> : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={props.onDelete} />
                </div>
            </div>
            <button type="button" className="block w-full p-3 text-left" title={asset.title} onClick={props.onOpen} onKeyDown={openOnKeyboard}>
                <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[var(--studio-text-primary)]">{asset.title || "未命名视频"}</div>
                <div className="mt-2 truncate text-[11px] text-[var(--studio-text-muted)]">{assetMediaInfo(asset)}</div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-[var(--studio-text-secondary)]">
                    <span className="truncate">{asset.source || "未标注来源"}</span>
                    {asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                </div>
            </button>
        </article>
    );
}
```

Remove unused imports after formatting. Keep action behavior delegated through callbacks; do not add store access to the card.

- [ ] **Step 3: Format the changed component files**

Run:

```bash
cd web && npx prettier --write 'src/app/(user)/assets/asset-utils.ts' 'src/app/(user)/assets/components/asset-card.tsx' 'src/app/(user)/assets/components/compact-video-asset-card.tsx'
```

Expected: files format successfully with no parse errors.

- [ ] **Step 4: Commit the compact card**

```bash
git add 'web/src/app/(user)/assets/asset-utils.ts' 'web/src/app/(user)/assets/components/asset-card.tsx' 'web/src/app/(user)/assets/components/compact-video-asset-card.tsx'
git commit -m "feat: add compact video asset cards"
```

### Task 4: Render video groups as responsive grids

**Files:**
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`

- [ ] **Step 1: Add the video-grid branch**

Import `isCompactVideoAssetGroup` and `CompactVideoAssetCard`. In `renderAssetTypeGroups`, compute:

```ts
const compactVideos = isCompactVideoAssetGroup(typeGroup.assets);
```

Replace the open group body with a conditional that keeps the current `AssetRow` map unchanged for non-video groups and uses this grid for videos:

```tsx
<div className={cn("border-t border-[var(--studio-border-subtle)] p-3", compactVideos ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" : "grid gap-2.5")}>
    {compactVideos
        ? typeGroup.assets.map((asset) => (
              <CompactVideoAssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selectedAssetIds.has(asset.id)}
                  refreshingReview={refreshingReviewId === asset.id}
                  submittingReview={submittingReviewId === asset.id}
                  onSelect={() => onToggleAsset(asset.id)}
                  onOpen={() => onOpenAsset(asset)}
                  onEdit={() => onEditAsset(asset)}
                  onDownload={() => onDownloadAsset(asset)}
                  onDelete={() => onDeleteAsset(asset)}
                  onReview={() => onSubmitAssetReview(asset)}
                  onRefreshReview={() => onRefreshAssetReview(asset)}
              />
          ))
        : typeGroup.assets.map((asset) => (
              <AssetRow
                  key={asset.id}
                  asset={asset}
                  selected={selectedAssetIds.has(asset.id)}
                  refreshingReview={refreshingReviewId === asset.id}
                  generatingWorkflowImage={generatingWorkflowAssetId === asset.id}
                  uploadingWorkflowImage={uploadingWorkflowAssetId === asset.id}
                  onSelect={() => onToggleAsset(asset.id)}
                  onOpen={() => onOpenAsset(asset)}
                  onEdit={() => onEditAsset(asset)}
                  onCopy={onCopyAsset}
                  onDownload={onDownloadAsset}
                  onDelete={() => onDeleteAsset(asset)}
                  submittingReview={submittingReviewId === asset.id}
                  onReview={() => onSubmitAssetReview(asset)}
                  onRefreshReview={() => onRefreshAssetReview(asset)}
                  onGenerateWorkflowImage={onGenerateWorkflowImage}
                  onMatchWorkflowImage={onMatchWorkflowImage}
                  onUploadWorkflowImage={onUploadWorkflowImage}
              />
          ))}
</div>
```

- [ ] **Step 2: Format and run focused tests**

Run:

```bash
cd web && npx prettier --write 'src/app/(user)/assets/components/asset-results-section.tsx'
node --experimental-strip-types --test 'src/app/(user)/assets/asset-page-filters.test.mts' 'src/app/(user)/assets/asset-result-layout.test.mts'
```

Expected: formatting succeeds and both focused test files pass.

- [ ] **Step 3: Commit the results integration**

```bash
git add 'web/src/app/(user)/assets/components/asset-results-section.tsx'
git commit -m "feat: render video assets in compact grid"
```

### Task 5: Documentation and focused acceptance

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`

- [ ] **Step 1: Record the testable change**

Add a concise section near current asset-library items in `docs/pending-test.md`:

```md
#### 素材库视频紧凑网格

- 视频素材分组改为响应式预览卡片网格，只保留封面、名称、规格、来源和按需操作；图片、文本、音频布局不变。
- 素材页默认按名称自然升序排列，使同一节点产物相邻；仍可切换时间排序。
- 待页面确认：宽屏单行至少显示 5 张视频卡，窄屏正常降列；预览、选择、详情、编辑、下载、审核和删除动作保持可用。
```

Confirm `docs/todo.md` has no matching unfinished item; do not modify it when no item needs moving.

- [ ] **Step 2: Run the scoped automated checks**

Run:

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-page-filters.test.mts' 'src/app/(user)/assets/asset-result-layout.test.mts'
npx prettier --check 'src/app/(user)/assets/asset-page-filters.ts' 'src/app/(user)/assets/use-asset-page-query.ts' 'src/app/(user)/assets/asset-result-layout.ts' 'src/app/(user)/assets/components/asset-list-toolbar.tsx' 'src/app/(user)/assets/components/asset-card.tsx' 'src/app/(user)/assets/components/compact-video-asset-card.tsx' 'src/app/(user)/assets/components/asset-results-section.tsx'
```

Expected: focused tests and formatting checks pass.

- [ ] **Step 3: Perform real-page visual acceptance**

Open `/assets` with video fixtures and verify:

- default selector reads “名称升序”;
- `节点 1`, `节点 2`, `节点 10` appear in natural order before pagination;
- video group uses 2 / 3 / 4 / 5 / 6 responsive columns;
- image, text, and audio groups still render rows;
- hover, keyboard focus, selection, preview, download, review, edit, and delete controls remain reachable;
- browser console has no errors.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/pending-test.md
git commit -m "docs: add compact video grid acceptance"
```
