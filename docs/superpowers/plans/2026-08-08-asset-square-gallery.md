# 资产方形图库与生图版本联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有资产主体、形态、版本、项目/分集和引用能力的前提下，把 `/assets` 改为媒体优先的方形图库，并打通主体生产与已有图片继续生图的新版本回写。

**Architecture:** 继续使用现有 localforage Zustand 资产 Store，不迁移数据。资产页查询层只暴露图片、视频和音频；项目结果层把主体摘要和普通媒体装配为一个扁平方形图库。生图联动使用来源图片 ID 恢复参考图和生成配置，并通过独立纯函数创建继承绑定的新图片版本；视频工作流文本卡原地回写逻辑保持不变。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS、Zustand、localforage、Node test runner。

---

### Task 1: 定义图库媒体和主体摘要模型

**Files:**
- Create: `web/src/app/(user)/assets/asset-gallery.ts`
- Create: `web/src/app/(user)/assets/asset-gallery.test.mts`
- Modify: `web/src/app/(user)/assets/asset-result-layout.ts`
- Modify: `web/src/app/(user)/assets/asset-result-layout.test.mts`

- [ ] **Step 1: 写图库摘要失败测试**

覆盖媒体类型判断、主体当前封面优先级、形态数量和正式图片数量：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { Asset, AssetSubject, AssetVariant, ImageAsset } from "../../../stores/use-asset-store.ts";
import { buildAssetSubjectSummary, isGalleryMediaAsset } from "./asset-gallery.ts";

test("builds one subject summary from all formal versions", () => {
    const now = "2026-08-08T00:00:00.000Z";
    const subject: AssetSubject = { id: "subject-a", projectId: "project-a", category: "character", code: "CHAR-001", name: "林夏", tags: [], createdAt: now, updatedAt: now };
    const image = (id: string, updatedAt: string): ImageAsset => ({ id, kind: "image", title: id, coverUrl: `blob:${id}`, tags: [], createdAt: now, updatedAt, assetBinding: { projectId: "project-a", subjectId: subject.id, category: "character", variantId: "variant-a", variantName: "基础形象", allEpisodes: true, episodeIds: [] }, data: { dataUrl: `blob:${id}`, width: 1024, height: 1024, bytes: 1, mimeType: "image/png" } });
    const oldImage = image("old", now);
    const currentImage = image("current", "2026-08-08T01:00:00.000Z");
    const variants: AssetVariant[] = [
        { id: "variant-a", subjectId: subject.id, name: "基础形象", prompt: "", referenceImageIds: [], currentAssetId: "current", createdAt: now, updatedAt: now },
        { id: "variant-b", subjectId: subject.id, name: "战损", prompt: "", referenceImageIds: [], createdAt: now, updatedAt: now },
    ];
    const summary = buildAssetSubjectSummary(subject, [oldImage, currentImage], variants);
    assert.equal(summary.coverAsset?.id, "current");
    assert.equal(summary.variantCount, 2);
    assert.equal(summary.formalImageCount, 2);
});

test("accepts image video and audio but rejects text", () => {
    const image = { kind: "image" } as Asset;
    const video = { kind: "video" } as Asset;
    const audio = { kind: "audio" } as Asset;
    const text = { kind: "text" } as Asset;
    assert.equal(isGalleryMediaAsset(image), true);
    assert.equal(isGalleryMediaAsset(video), true);
    assert.equal(isGalleryMediaAsset(audio), true);
    assert.equal(isGalleryMediaAsset(text), false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-gallery.test.mts' 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: FAIL，提示 `asset-gallery.ts` 或新导出不存在。

- [ ] **Step 3: 实现最小图库模型**

```ts
import type { Asset, AssetSubject, AssetVariant, AudioAsset, ImageAsset, VideoAsset } from "../../../stores/use-asset-store.ts";

export type GalleryMediaAsset = ImageAsset | VideoAsset | AudioAsset;
export type AssetSubjectSummary = {
    subject: AssetSubject;
    coverAsset?: ImageAsset;
    variantCount: number;
    formalImageCount: number;
};

export function isGalleryMediaAsset(asset: Asset): asset is GalleryMediaAsset {
    return asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";
}

export function buildAssetSubjectSummary(subject: AssetSubject, assets: Asset[], variants: AssetVariant[]): AssetSubjectSummary {
    const subjectVariants = variants.filter((variant) => variant.subjectId === subject.id);
    const formalImages = assets.filter((asset): asset is ImageAsset => asset.kind === "image" && asset.assetBinding?.subjectId === subject.id);
    const currentIds = new Set(subjectVariants.map((variant) => variant.currentAssetId).filter(Boolean));
    return {
        subject,
        coverAsset: formalImages.find((asset) => currentIds.has(asset.id)) || formalImages.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
        variantCount: subjectVariants.length,
        formalImageCount: formalImages.length,
    };
}
```

把 `asset-result-layout.ts` 的媒体类型扩展为图片、视频和音频，并复用 `GalleryMediaAsset`，不再把音频降级为长列表行。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-gallery.test.mts' 'src/app/(user)/assets/asset-result-layout.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/asset-gallery.ts' 'web/src/app/(user)/assets/asset-gallery.test.mts' 'web/src/app/(user)/assets/asset-result-layout.ts' 'web/src/app/(user)/assets/asset-result-layout.test.mts'
git commit -m "feat: model square asset gallery items"
```

### Task 2: 从资产页隐藏文本并在导入时跳过文本

**Files:**
- Modify: `web/src/app/(user)/assets/asset-page-filters.ts`
- Modify: `web/src/app/(user)/assets/asset-page-filters.test.mts`
- Modify: `web/src/app/(user)/assets/components/asset-page-header.tsx`
- Modify: `web/src/app/(user)/assets/asset-import-actions.ts`
- Modify: `web/src/app/(user)/assets/asset-import-payloads.test.mts`
- Modify: `web/src/app/(user)/assets/use-asset-import-dropzone.ts`
- Modify: `web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/use-episode-production-assets.ts`

- [ ] **Step 1: 写媒体查询与导入失败测试**

在 `asset-page-filters.test.mts` 断言文本不会进入资产总览基础数据：

```ts
assert.deepEqual(supportedAssetList([text, image, video, audio]).map((asset) => asset.kind), ["image", "video", "audio"]);
```

在 `asset-import-payloads.test.mts` 构造包含一条文本和一条图片的资产包，直接测试导入分区纯函数：

```ts
const partition = partitionPackageAssets([textAsset, imageAsset]);
assert.deepEqual(partition.mediaAssets.map((asset) => asset.id), ["image-id"]);
assert.equal(partition.skippedTextCount, 1);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-page-filters.test.mts' 'src/app/(user)/assets/asset-import-payloads.test.mts'`

Expected: FAIL，文本仍被支持且导入分区函数不存在。

- [ ] **Step 3: 收口资产页媒体范围**

将 `supportedAssetList` 改为只返回三类媒体：

```ts
export function supportedAssetList(assets: Array<Asset | { kind?: string }>): Asset[] {
    return assets.filter((asset): asset is Asset => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio");
}
```

从 `AssetPageHeader` 删除文本新建项和文本筛选项；`AssetKind` 数据模型、Store 和其他页面不删除。

- [ ] **Step 4: 返回导入跳过统计**

新增 `partitionPackageAssets`，并统一单文件与文件列表返回结构：

```ts
export type AssetImportResult = { count: number; assetIds: string[]; skippedTextCount: number };

export function partitionPackageAssets(assets: Asset[]) {
    return {
        mediaAssets: assets.filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"),
        skippedTextCount: assets.filter((asset) => asset.kind === "text").length,
    };
}

export async function importAssetFile(file: File, options: { folderId?: string; projectId?: string; addAssetOnce: AddAssetOnce }): Promise<AssetImportResult> {
    const fileKind = assetFileKind(file);
    if (fileKind === "image" || fileKind === "video" || fileKind === "audio") {
        const assetId = await importSingleMedia(file, fileKind, options);
        return { count: 1, assetIds: [assetId], skippedTextCount: 0 };
    }
    const partition = partitionPackageAssets(await readAssetPackage(file));
    const assetIds: string[] = [];
    for (const asset of partition.mediaAssets) assetIds.push(await options.addAssetOnce(importedPackageAssetInput(asset, options.folderId, options.projectId)));
    const uniqueIds = uniqueImportedAssetIds(assetIds);
    return { count: uniqueIds.length, assetIds: uniqueIds, skippedTextCount: partition.skippedTextCount };
}
```

`importSingleMedia` 是当前图片/视频/音频三个分支的同目录私有函数，只负责上传文件并调用 `addAssetOnce`；`importAssetFileList` 汇总每个结果的 `assetIds` 和 `skippedTextCount` 后再去重。

`useAssetImportDropzone` 在 `count === 0 && skippedTextCount > 0` 时提示“没有可导入的媒体资产”；部分跳过时先显示成功数量，再提示“已跳过 N 个文本资产”。分集工作台上传图片改为读取 `result.assetIds`。

- [ ] **Step 5: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-page-filters.test.mts' 'src/app/(user)/assets/asset-import-payloads.test.mts'`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add 'web/src/app/(user)/assets/asset-page-filters.ts' 'web/src/app/(user)/assets/asset-page-filters.test.mts' 'web/src/app/(user)/assets/components/asset-page-header.tsx' 'web/src/app/(user)/assets/asset-import-actions.ts' 'web/src/app/(user)/assets/asset-import-payloads.test.mts' 'web/src/app/(user)/assets/use-asset-import-dropzone.ts' 'web/src/app/(user)/projects/[id]/episodes/[episodeId]/workbench/use-episode-production-assets.ts'
git commit -m "feat: keep asset gallery media only"
```

### Task 3: 把项目结果改成扁平方形图库

**Files:**
- Create: `web/src/app/(user)/assets/components/asset-subject-card.tsx`
- Modify: `web/src/app/(user)/assets/components/compact-media-asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Delete: `web/src/app/(user)/assets/components/asset-subject-section.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`
- Modify: `web/src/app/(user)/assets/asset-result-layout.test.mts`
- Modify: `web/src/app/(user)/assets/asset-subject-entry-wiring.test.mts`

- [ ] **Step 1: 写扁平图库接线失败测试**

静态接线测试断言：

```ts
assert.match(resultsSource, /AssetSubjectCard/);
assert.doesNotMatch(resultsSource, /AssetSubjectSection/);
assert.doesNotMatch(resultsSource, /buildAssetEpisodeGroups/);
assert.doesNotMatch(resultsSource, /buildAssetTypeGroups/);
assert.match(resultsSource, /grid-cols-2/);
assert.match(mediaCardSource, /aspect-square/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-result-layout.test.mts' 'src/app/(user)/assets/asset-subject-entry-wiring.test.mts'`

Expected: FAIL，结果页仍使用主体整行和类型/集数折叠面板。

- [ ] **Step 3: 实现主体方形卡**

`AssetSubjectCard` 接收 `AssetSubjectSummary`。整个卡片进入 `/assets/[subjectId]`；有封面显示裁切图片，无封面显示“待生产”；媒体区角标显示主体分类；信息区只显示名称、编号、形态数和正式图片数。

```tsx
<article className="group min-w-0 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)]">
    <Link href={`/assets/${summary.subject.id}`} className="relative block aspect-square overflow-hidden bg-[var(--studio-shell-bg)]">
        {summary.coverAsset ? <img src={summary.coverAsset.coverUrl || summary.coverAsset.data.dataUrl} className="size-full object-cover" alt={summary.subject.name} /> : <span className="flex size-full flex-col items-center justify-center gap-2 text-[var(--studio-text-muted)]"><ImageOff className="size-7" /><span className="text-xs">待生产</span></span>}
        <span className="absolute left-2 top-2 rounded bg-[var(--studio-media-overlay)] px-2 py-1 text-[10px] text-[var(--studio-on-media)]">{assetCategoryLabel(summary.subject.category)}</span>
    </Link>
    <Link href={`/assets/${summary.subject.id}`} className="block p-3">
        <div className="truncate text-sm font-semibold">{summary.subject.name}</div>
        <div className="mt-2 text-[11px] text-[var(--studio-text-muted)]">{summary.subject.code} · {summary.variantCount} 个形态 · {summary.formalImageCount} 张正式图</div>
    </Link>
</article>
```

- [ ] **Step 4: 扩展统一媒体卡**

`CompactMediaAssetCard` 改为接收 `GalleryMediaAsset`，媒体区使用 `aspect-square`。图片显示封面，视频显示封面或静音首帧，音频显示 `AudioLines` 图标和“音频”占位。保持选择、收藏、详情、编辑、下载、加白、删除动作，新增可选 `onReviseImage`，只在图片上显示“进入生图修改”。

- [ ] **Step 5: 扁平装配项目图库**

`AssetResultsSection` 每个项目保留项目标题和 Production Bible 摘要，在同一个响应式网格中先渲染主体摘要，再渲染未绑定到主体的媒体：

```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
    {subjectGroups.map(({ subject, assets }) => (
        <AssetSubjectCard key={subject.id} summary={buildAssetSubjectSummary(subject, assets, variants)} />
    ))}
    {ordinaryAssets.filter(isGalleryMediaAsset).map((asset) => (
        <CompactMediaAssetCard
            key={asset.id}
            asset={asset}
            selected={selectedAssetIds.has(asset.id)}
            refreshingReview={refreshingReviewId === asset.id}
            submittingReview={submittingReviewId === asset.id}
            onSelect={() => onToggleAsset(asset.id)}
            onOpen={() => onOpenAsset(asset)}
            onEdit={() => onEditAsset(asset)}
            onToggleFavorite={() => onToggleFavorite(asset)}
            onDownload={() => onDownloadAsset(asset)}
            onDelete={() => onDeleteAsset(asset)}
            onReview={() => onSubmitAssetReview(asset)}
            onRefreshReview={() => onRefreshAssetReview(asset)}
            onReviseImage={asset.kind === "image" ? () => onReviseImage(asset) : undefined}
        />
    ))}
</div>
```

删除视觉上的集数和类型二次分组，但保留顶部筛选、项目分页、批量选择、Production Bible 摘要、过期引用面板和所有媒体动作。

- [ ] **Step 6: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-result-layout.test.mts' 'src/app/(user)/assets/asset-subject-entry-wiring.test.mts'`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add 'web/src/app/(user)/assets/components/asset-subject-card.tsx' 'web/src/app/(user)/assets/components/compact-media-asset-card.tsx' 'web/src/app/(user)/assets/components/asset-results-section.tsx' 'web/src/app/(user)/assets/components/asset-subject-section.tsx' 'web/src/app/(user)/assets/page.tsx' 'web/src/app/(user)/assets/asset-result-layout.test.mts' 'web/src/app/(user)/assets/asset-subject-entry-wiring.test.mts'
git commit -m "feat: render assets as flat square gallery"
```

### Task 4: 定义图片继续生图的路由和版本输入

**Files:**
- Create: `web/src/app/(user)/assets/asset-image-revision.ts`
- Create: `web/src/app/(user)/assets/asset-image-revision.test.mts`

- [ ] **Step 1: 写路由、配置和新版本输入失败测试**

```ts
test("builds image revision href with source coordinates", () => {
    const href = buildAssetImageRevisionHref(sourceImage, "/assets?projectId=project-1");
    const params = new URL(href, "http://local").searchParams;
    assert.equal(params.get("source"), "asset-revision");
    assert.equal(params.get("libraryAssetId"), sourceImage.id);
    assert.equal(params.get("projectId"), "project-1");
});

test("creates a new bound image version without mutating the source", () => {
    const input = revisedImageAssetInput(sourceImage, storedImage, generation);
    assert.deepEqual(input.assetBinding, sourceImage.assetBinding);
    assert.equal(input.metadata?.sourceAssetId, sourceImage.id);
    assert.equal((input.metadata?.generation as { prompt: string }).prompt, generation.prompt);
    assert.equal(sourceImage.data.dataUrl, "blob:old");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯函数**

导出：

```ts
export type AssetImageGenerationSnapshot = { prompt: string; model: string; quality: string; size: string; capabilityTrace?: unknown };

export function buildAssetImageRevisionHref(asset: ImageAsset, returnTo?: string): string;
export function assetImageGenerationSnapshot(asset: ImageAsset): Partial<AssetImageGenerationSnapshot>;
export function assetImageReference(asset: ImageAsset): ReferenceImage;
export function revisedImageAssetInput(asset: ImageAsset, stored: UploadedImage, snapshot: AssetImageGenerationSnapshot): AssetWriteInput;
export function boundVariantId(asset: ImageAsset, variants: AssetVariant[]): string | undefined;
```

`revisedImageAssetInput` 复制 `folderId`、`tags`、`note`、`assetBinding` 和项目 metadata，替换图片文件，写入 `metadata.sourceAssetId` 与本次 generation；不得修改来源对象。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/assets/asset-image-revision.ts' 'web/src/app/(user)/assets/asset-image-revision.test.mts'
git commit -m "feat: define asset image revision contract"
```

### Task 5: 在生图工作台恢复来源图片和生成配置

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/assets/asset-image-revision.test.mts`

- [ ] **Step 1: 写初始化接线失败测试**

静态接线断言 `AssetImageWorkbench` 使用 `assetImageReference` 和 `assetImageGenerationSnapshot`，并且只对 `source === "asset-revision"` 的图片来源执行初始化。

```ts
assert.match(imagePageSource, /assetImageReference/);
assert.match(imagePageSource, /assetImageGenerationSnapshot/);
assert.match(imagePageSource, /asset-revision/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: FAIL，生图页尚未接入来源图片初始化。

- [ ] **Step 3: 接入来源资产订阅**

在 `AssetImageWorkbench` 订阅 `assets`，并用 ref 防止同一来源重复插入：

```ts
const assets = useAssetStore((state) => state.assets);
const importedRevisionAssetRef = useRef("");

useEffect(() => {
    if (sourceContext.source !== "asset-revision" || !sourceContext.libraryAssetId) return;
    const sourceAsset = assets.find((asset): asset is ImageAsset => asset.id === sourceContext.libraryAssetId && asset.kind === "image");
    if (!sourceAsset || importedRevisionAssetRef.current === sourceAsset.id) return;
    importedRevisionAssetRef.current = sourceAsset.id;
    const snapshot = assetImageGenerationSnapshot(sourceAsset);
    setReferences((current) => [assetImageReference(sourceAsset), ...current.filter((item) => item.id !== sourceAsset.id)]);
    if (snapshot.prompt) setPrompt(snapshot.prompt);
    if (snapshot.model) updateConfig("imageModel", snapshot.model);
    if (snapshot.quality) updateConfig("quality", snapshot.quality);
    if (snapshot.size) updateConfig("size", snapshot.size);
}, [assets, sourceContext, updateConfig]);
```

URL 显式传入的 prompt 优先于 metadata prompt；能力状态缓存仅在同一来源确实存在已应用记录时保持现有优先级。

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add 'web/src/app/(user)/image/page.tsx' 'web/src/app/(user)/assets/asset-image-revision.test.mts'
git commit -m "feat: preload asset images for revision"
```

### Task 6: 保存修改结果为新的正式版本

**Files:**
- Modify: `web/src/app/(user)/image/page.tsx`
- Modify: `web/src/app/(user)/assets/asset-image-revision.test.mts`

- [ ] **Step 1: 写版本回写失败测试**

测试 bound 图片能解析稳定形态 ID，legacy `variantName` 可回退匹配，普通图片不返回形态：

```ts
assert.equal(boundVariantId(boundImage, variants), "variant-a");
assert.equal(boundVariantId(legacyBoundImage, variants), "variant-a");
assert.equal(boundVariantId(plainImage, variants), undefined);
```

静态接线断言保存路径调用 `revisedImageAssetInput` 和 `setVariantCurrentAsset`，同时仍保留 `buildWorkflowGeneratedImagePatch` 的工作流文本原地回写分支。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: FAIL，图片来源仍走普通新资产分支且不会更新形态当前版本。

- [ ] **Step 3: 增加图片版本保存分支**

在现有工作流文本分支之后、普通结果分支之前增加：

```ts
if (sourceAsset?.kind === "image" && sourceContext.source === "asset-revision") {
    assetId = await addAssetOnce(revisedImageAssetInput(sourceAsset, stored, {
        prompt,
        model,
        quality: String(effectiveConfig.quality || ""),
        size: String(effectiveConfig.size || ""),
        capabilityTrace: resultTrace,
    }));
    const variantId = boundVariantId(sourceAsset, useAssetStore.getState().variants);
    if (variantId) setVariantCurrentAsset(variantId, assetId);
    savedAsset = useAssetStore.getState().assets.find((asset) => asset.id === assetId);
}
```

只有 `addAssetOnce` 成功后更新 `currentAssetId`。原图片、旧正式版本、固定版本引用和视频工作流文本卡原地回写均不修改。

- [ ] **Step 4: 调整成功提示**

主体绑定图片提示“已保存为新的正式版本并设为当前主图”；普通图片提示“已保存为新的图片资产，原图已保留”。如果保存失败，保持结果卡可再次点击保存。

- [ ] **Step 5: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add 'web/src/app/(user)/image/page.tsx' 'web/src/app/(user)/assets/asset-image-revision.test.mts'
git commit -m "feat: save revised asset image versions"
```

### Task 7: 把继续生图动作接入总览和主体版本区

**Files:**
- Modify: `web/src/app/(user)/assets/components/compact-media-asset-card.tsx`
- Modify: `web/src/app/(user)/assets/components/asset-results-section.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/components/asset-version-panel.tsx`
- Modify: `web/src/app/(user)/assets/[subjectId]/page.tsx`
- Modify: `web/src/app/(user)/assets/page.tsx`
- Modify: `web/src/app/(user)/assets/asset-image-revision.test.mts`

- [ ] **Step 1: 写入口接线失败测试**

```ts
assert.match(mediaCardSource, /进入生图修改/);
assert.match(versionPanelSource, /继续修改/);
assert.match(assetPageSource, /buildAssetImageRevisionHref/);
assert.match(subjectPageSource, /buildAssetImageRevisionHref/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: FAIL，图片卡和正式版本区没有继续生图入口。

- [ ] **Step 3: 接入资产总览图片动作**

`page.tsx` 提供：

```ts
const reviseImageAsset = (asset: Asset) => {
    if (asset.kind !== "image") return;
    router.push(buildAssetImageRevisionHref(asset, `${window.location.pathname}${window.location.search}`));
};
```

将其传给 `AssetResultsSection` 和 `CompactMediaAssetCard`。视频、音频不渲染该动作。主体卡仍以进入 `/assets/[subjectId]` 为主，空主体点击后直接在默认形态开始生产。

- [ ] **Step 4: 接入正式版本动作**

`AssetVersionPanel` 增加 `onRevise(asset)`，每个正式图片显示“继续修改”；主体工作台用 `buildAssetImageRevisionHref(asset, /assets/${subject.id})` 跳转。原“设为主图”动作继续保留。

- [ ] **Step 5: 运行测试并确认通过**

Run: `cd web && node --experimental-strip-types --test 'src/app/(user)/assets/asset-image-revision.test.mts'`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add 'web/src/app/(user)/assets/components/compact-media-asset-card.tsx' 'web/src/app/(user)/assets/components/asset-results-section.tsx' 'web/src/app/(user)/assets/[subjectId]/components/asset-version-panel.tsx' 'web/src/app/(user)/assets/[subjectId]/page.tsx' 'web/src/app/(user)/assets/page.tsx' 'web/src/app/(user)/assets/asset-image-revision.test.mts'
git commit -m "feat: link asset cards to image revision"
```

### Task 8: 文档和变更范围收口

**Files:**
- Modify: `docs/pending-test.md`
- Inspect: `docs/todo.md`
- Modify: `docs/superpowers/plans/2026-08-08-asset-square-gallery.md`

- [ ] **Step 1: 更新待验收清单**

在 `docs/pending-test.md` 记录：方形扁平图库、文本隐藏、三类媒体统一卡片、手动主体入口、图片参考图预载、生成配置恢复、新版本保存、主体绑定继承、旧版本保留、浅深主题与 390px 窄屏。

- [ ] **Step 2: 检查 todo**

确认 `docs/todo.md` 的 M7.4 已完成能力索引无需删除；如果存在本次对应待办，将其移动到 `docs/pending-test.md`。M10 云端资产规划保持不变，不把本地图库改造误写成云同步。

- [ ] **Step 3: 定向验证命令**

项目默认不自动执行测试、类型检查或构建。用户明确要求验收时运行：

```bash
cd web && node --experimental-strip-types --test \
  'src/app/(user)/assets/asset-gallery.test.mts' \
  'src/app/(user)/assets/asset-result-layout.test.mts' \
  'src/app/(user)/assets/asset-page-filters.test.mts' \
  'src/app/(user)/assets/asset-import-payloads.test.mts' \
  'src/app/(user)/assets/asset-subject-entry-wiring.test.mts' \
  'src/app/(user)/assets/asset-image-revision.test.mts'
```

Expected: 全部 PASS；不触发任何真实图片或视频生成。

- [ ] **Step 4: 检查变更范围**

Run: `git diff --check && git status --short`

Expected: 不覆盖用户已有改动；资产页、生图版本联动、定向测试和必要文档之外没有新增改动。

- [ ] **Step 5: 提交**

```bash
git add docs/pending-test.md docs/todo.md docs/superpowers/plans/2026-08-08-asset-square-gallery.md
git commit -m "docs: record square asset gallery acceptance"
```
