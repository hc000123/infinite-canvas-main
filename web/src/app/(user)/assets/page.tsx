"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { App, Empty, Form, Input, Modal } from "antd";

import { uploadImage } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import { assetEpisodeTitle } from "./asset-episode";
import type { AssetFormValues } from "./components/asset-editor-modal";
import { AssetFilterPanel } from "./components/asset-filter-panel";
import { AssetPageHeader } from "./components/asset-page-header";
import { AssetPageOverlays } from "./components/asset-page-overlays";
import { AssetResultsSection } from "./components/asset-results-section";
import { AssetUploadDropOverlay } from "./components/asset-upload-drop-overlay";
import { useAssetBulkActions } from "./use-asset-bulk-actions";
import { useAssetEditorActions } from "./use-asset-editor-actions";
import { useAssetFilterActions } from "./use-asset-filter-actions";
import { useAssetFolderActions } from "./use-asset-folder-actions";
import { useAssetImportDropzone } from "./use-asset-import-dropzone";
import { useAssetMediaActions } from "./use-asset-media-actions";
import { useAssetOutdatedReferenceActions } from "./use-asset-outdated-reference-actions";
import { useAssetPageQuery } from "./use-asset-page-query";
import { useAssetPageStores } from "./use-asset-page-stores";
import { useAssetSelection } from "./use-asset-selection";
import { useVolcengineAssetReview } from "./use-volcengine-asset-review";
import { useWorkflowAssetImageActions } from "./use-workflow-asset-image-actions";
import { buildWorkflowMatchedImagePatch, buildWorkflowUploadedImagePatch, workflowAssetInfo } from "./workflow-asset-image";

export default function AssetsPage() {
    return (
        <Suspense fallback={null}>
            <AssetsPageContent />
        </Suspense>
    );
}

function AssetsPageContent() {
    const { message, modal } = App.useApp();
    const searchParams = useSearchParams();
    const scriptEpisodes = useScriptStore((state) => state.episodes);
    const returnTarget = buildAssetsPageReturnTarget(searchParams);
    const requestedAssetId = searchParams.get("assetId") || "";
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const workflowUploadInputRef = useRef<HTMLInputElement>(null);
    const workflowUploadTargetRef = useRef<Asset | null>(null);
    const {
        addAsset,
        addAssetOnce,
        addFolder,
        assets,
        creativeProjects,
        ensureProjectFolder,
        folders,
        productionBibleItems,
        projects,
        removeAsset,
        removeFolder,
        removeProductionBibleItem,
        shotGroups,
        storyboardGroups,
        storyboardShots,
        storyboardTableShots,
        token,
        updateAsset,
        updateCanvasProject,
        updateFolder,
        updateProductionBibleItem,
        updateShotGroup,
        updateStoryboardShot,
        updateStoryboardTableShot,
        volcengineAssetEnabled,
    } = useAssetPageStores();
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [openedRequestedAssetId, setOpenedRequestedAssetId] = useState("");
    const [bulkOutdatedOpen, setBulkOutdatedOpen] = useState(false);
    const [deletingProductionBibleItem, setDeletingProductionBibleItem] = useState<ProductionBibleItem | null>(null);
    const [bulkProductionBibleDeleteOpen, setBulkProductionBibleDeleteOpen] = useState(false);
    const [uploadingWorkflowAssetId, setUploadingWorkflowAssetId] = useState<string | null>(null);
    const [matchingWorkflowAsset, setMatchingWorkflowAsset] = useState<Asset | null>(null);
    const [matchKeyword, setMatchKeyword] = useState("");

    useEffect(() => {
        if (!requestedAssetId || openedRequestedAssetId === requestedAssetId) return;
        const asset = assets.find((item) => item.id === requestedAssetId);
        if (!asset) return;
        setPreviewAsset(asset);
        setOpenedRequestedAssetId(requestedAssetId);
    }, [assets, openedRequestedAssetId, requestedAssetId]);

    const {
        activeFolderId,
        activeFolderName,
        assetPaginationEnabled,
        canvasLibraryTitles,
        episodeFilter,
        episodeOptions,
        episodeTitleMap,
        filteredAssets,
        folderCounts,
        folderFilter,
        folderMap,
        folderOptions,
        generationActionFilter,
        generationFilterOptions,
        generationModelProviderFilter,
        generationSourceFilter,
        generationTaskFilter,
        kindFilter,
        keyword,
        outdatedAssetVersionUsages,
        page,
        pageSize,
        previewAssetUsageReferences,
        projectContextFilter,
        projectFolderRows,
        projectLibraryFilter,
        projectLibraryProjectTitles,
        referenceVersionFilter,
        regularFolders,
        setEpisodeFilter,
        setFolderFilter,
        setGenerationActionFilter,
        setGenerationModelProviderFilter,
        setGenerationSourceFilter,
        setGenerationTaskFilter,
        setKindFilter,
        setKeyword,
        setPage,
        setPageSize,
        setProjectContextFilter,
        setProjectLibraryFilter,
        setReferenceVersionFilter,
        setSortMode,
        setStoryboardGroupFilter,
        sortMode,
        storyboardGroupFilter,
        storyboardGroupOptions,
        validAssets,
        visibleAssetGroups,
        visibleProductionBibleItems,
    } = useAssetPageQuery({
        assets,
        creativeProjects,
        folders,
        initialProjectId: searchParams.get("projectId") || "",
        previewAsset,
        productionBibleItems,
        projects,
        scriptEpisodes,
        shotGroups,
        storyboardGroups,
        storyboardShots,
        storyboardTableShots,
    });
    const { deleteFolder, editingFolder, folderDialogOpen, folderName, openCreateFolder, openEditFolder, saveFolder, setFolderDialogOpen, setFolderName } = useAssetFolderActions({
        addFolder,
        creativeProjects,
        ensureProjectFolder,
        message,
        modal,
        removeFolder,
        setFolderFilter,
        updateFolder,
    });
    const {
        content,
        coverUrl,
        editingAsset,
        formKind,
        imageDraft,
        isAssetOpen,
        mediaDraft,
        tags,
        title,
        openCreate,
        openEdit,
        readCoverFile,
        readImageFile,
        readMediaFile,
        saveAsset,
        setIsAssetOpen,
        updateFormKind,
    } = useAssetEditorActions({
        activeFolderId: activeFolderId || undefined,
        addAsset,
        addAssetOnce,
        form,
        message,
        updateAsset,
    });
    const {
        allFilteredSelected,
        allVisibleProductionBibleSelected,
        clearSelectedAssets,
        clearSelectedOutdatedUsages,
        clearSelectedProductionBibleItems,
        removeOutdatedUsageIds,
        selectAllOutdatedUsages,
        selectFilteredAssets,
        selectVisibleProductionBibleItems,
        selectedAssetIds,
        selectedAssets,
        selectedAssetSummary,
        selectedInFilteredCount,
        selectedOutdatedUsageConfirmItems,
        selectedOutdatedUsageIds,
        selectedOutdatedUsageItems,
        selectedProductionBibleInVisibleCount,
        selectedProductionBibleItemIds,
        selectedProductionBibleItems,
        selectedProductionBibleItemSummary,
        selectedVolcengineRefreshAssets,
        selectedVolcengineSubmitAssets,
        toggleAssetSelected,
        toggleOutdatedUsageSelected,
        toggleProductionBibleItemSelected,
    } = useAssetSelection({ filteredAssets, outdatedAssetVersionUsages, productionBibleItems, validAssets, visibleProductionBibleItems });
    const assetFilterActions = useAssetFilterActions({
        setEpisodeFilter,
        setFolderFilter,
        setGenerationActionFilter,
        setGenerationModelProviderFilter,
        setGenerationSourceFilter,
        setGenerationTaskFilter,
        setKindFilter,
        setKeyword,
        setPage,
        setProjectContextFilter,
        setProjectLibraryFilter,
        setReferenceVersionFilter,
        setSortMode,
        setStoryboardGroupFilter,
    });
    const {
        addSelectedToProjectLibrary,
        applyBulkDelete,
        applyBulkMove,
        applyBulkTags,
        bulkDeleteOpen,
        bulkMoveFolderId,
        bulkMoveOpen,
        bulkTagOpen,
        bulkTags,
        openBulkDelete,
        openBulkMove,
        openBulkTag,
        removeSelectedFromProjectLibrary,
        setBulkDeleteOpen,
        setBulkMoveFolderId,
        setBulkMoveOpen,
        setBulkTagOpen,
        setBulkTags,
    } = useAssetBulkActions({
        activeFolderId,
        clearSelectedAssets,
        message,
        projectContextFilter,
        removeAsset,
        selectedAssets,
        updateAsset,
    });
    const { bulkReviewAction, refreshImageReview, refreshingReviewId, refreshSelectedVolcengineReviews, submitImageReview, submittingReviewId, submitSelectedVolcengineReviews } = useVolcengineAssetReview({
        message,
        selectedVolcengineRefreshAssets,
        selectedVolcengineSubmitAssets,
        setPreviewAsset,
        token,
        updateAsset,
        validAssets,
        volcengineAssetEnabled,
    });
    const { handleUploadDragEnter, handleUploadDragLeave, handleUploadDragOver, handleUploadDrop, importAssetFiles, isDraggingUpload } = useAssetImportDropzone({
        activeFolderId: activeFolderId || undefined,
        activeFolderName,
        addAssetOnce,
        assetInputRef,
        message,
        setPage,
    });
    const { applySelectedOutdatedUsages, updateOutdatedUsageToLatest } = useAssetOutdatedReferenceActions({
        message,
        productionBibleItems,
        projects,
        removeOutdatedUsageIds,
        selectedOutdatedUsageItems,
        setBulkOutdatedOpen,
        shotGroups,
        storyboardShots,
        storyboardTableShots,
        updateCanvasProject,
        updateProductionBibleItem,
        updateShotGroup,
        updateStoryboardShot,
        updateStoryboardTableShot,
        validAssets,
    });
    const { confirmDelete, copyAssetText, deletingAsset, downloadAssetVersion, downloadMedia, exportAllAssets, exportSelectedAssets, restoreAssetVersion, setDeletingAsset } = useAssetMediaActions({
        message,
        removeAsset,
        selectedAssets,
        setPreviewAsset,
        updateAsset,
        validAssets,
    });
    const { generateWorkflowAssetImage, generatingWorkflowAssetId } = useWorkflowAssetImageActions({
        message,
    });
    const openWorkflowImageUpload = (asset: Asset) => {
        if (!workflowAssetInfo(asset)) {
            message.warning("这不是视频工作流素材，不能直接匹配图片");
            return;
        }
        workflowUploadTargetRef.current = asset;
        if (workflowUploadInputRef.current) workflowUploadInputRef.current.value = "";
        workflowUploadInputRef.current?.click();
    };
    const uploadWorkflowImageFile = async (files?: FileList | null) => {
        const file = files?.[0];
        const target = workflowUploadTargetRef.current;
        workflowUploadTargetRef.current = null;
        if (workflowUploadInputRef.current) workflowUploadInputRef.current.value = "";
        if (!file || !target) return;
        if (!file.type.startsWith("image/")) {
            message.warning("请选择图片文件");
            return;
        }
        const current = assets.find((asset) => asset.id === target.id) || target;
        setUploadingWorkflowAssetId(current.id);
        try {
            const image = await uploadImage(file);
            const patch = buildWorkflowUploadedImagePatch(current, image, { fileName: file.name });
            updateAsset(current.id, patch);
            if (previewAsset?.id === current.id) setPreviewAsset({ ...current, ...patch } as Asset);
            message.success("已上传并匹配到这条素材");
        } catch (error) {
            console.error(error);
            message.error("上传匹配失败，请换一张图片重试");
        } finally {
            setUploadingWorkflowAssetId(null);
        }
    };
    const matchCandidateAssets = useMemo(() => {
        if (!matchingWorkflowAsset) return [];
        const query = matchKeyword.trim().toLowerCase();
        const targetInfo = workflowAssetInfo(matchingWorkflowAsset);
        const targetProjectId = assetMatchProjectId(matchingWorkflowAsset, targetInfo, projectContextFilter);
        return validAssets
            .filter((asset): asset is Extract<Asset, { kind: "image" }> => asset.kind === "image" && asset.id !== matchingWorkflowAsset.id)
            .filter((asset) => {
                const candidateProjectId = assetMatchProjectId(asset, workflowAssetInfo(asset), "");
                return !targetProjectId || !candidateProjectId || candidateProjectId === targetProjectId;
            })
            .filter((asset) => {
                if (!query) return true;
                return assetMatchSearchText(asset, episodeTitleMap).includes(query);
            })
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [episodeTitleMap, matchKeyword, matchingWorkflowAsset, projectContextFilter, validAssets]);
    const openWorkflowImageMatch = (asset: Asset) => {
        if (!workflowAssetInfo(asset)) {
            message.warning("这不是视频工作流素材，不能匹配已有图片");
            return;
        }
        setMatchingWorkflowAsset(asset);
        setMatchKeyword("");
    };
    const matchWorkflowImageAsset = (source: Extract<Asset, { kind: "image" }>) => {
        if (!matchingWorkflowAsset) return;
        const current = assets.find((asset) => asset.id === matchingWorkflowAsset.id) || matchingWorkflowAsset;
        const patch = buildWorkflowMatchedImagePatch(current, source);
        updateAsset(current.id, patch);
        if (previewAsset?.id === current.id) setPreviewAsset({ ...current, ...patch } as Asset);
        setMatchingWorkflowAsset(null);
        message.success("已匹配已有图片到这条素材");
    };
    const confirmDeleteProductionBibleItem = () => {
        if (!deletingProductionBibleItem) return;
        removeProductionBibleItem(deletingProductionBibleItem.id);
        message.success("设定已删除");
        setDeletingProductionBibleItem(null);
    };
    const openBulkProductionBibleDelete = () => {
        if (!selectedProductionBibleItems.length) return message.warning("请先选择设定");
        setBulkProductionBibleDeleteOpen(true);
    };
    const applyBulkProductionBibleDelete = () => {
        const count = selectedProductionBibleItems.length;
        selectedProductionBibleItems.forEach((item) => removeProductionBibleItem(item.id));
        clearSelectedProductionBibleItems();
        setBulkProductionBibleDeleteOpen(false);
        message.success(`已删除 ${count} 个设定`);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <main className="studio-shell relative min-h-0 flex-1 overflow-y-auto px-6 py-8" onDragEnter={handleUploadDragEnter} onDragLeave={handleUploadDragLeave} onDragOver={handleUploadDragOver} onDrop={handleUploadDrop}>
                {isDraggingUpload ? <AssetUploadDropOverlay activeFolderName={activeFolderName} /> : null}
                <div className="mx-auto max-w-[1680px] pb-8">
                    <AssetPageHeader returnHref={returnTarget.href} returnLabel={returnTarget.label} onCreate={openCreate} onExportAll={() => void exportAllAssets()} onImportClick={() => assetInputRef.current?.click()} />

                    <AssetFilterPanel
                        activeFolderId={activeFolderId}
                        episodeFilter={episodeFilter}
                        episodeOptions={episodeOptions}
                        filteredCount={filteredAssets.length}
                        folderCounts={folderCounts}
                        folderFilter={folderFilter}
                        generationActionFilter={generationActionFilter}
                        generationFilterOptions={generationFilterOptions}
                        generationModelProviderFilter={generationModelProviderFilter}
                        generationSourceFilter={generationSourceFilter}
                        generationTaskFilter={generationTaskFilter}
                        kindFilter={kindFilter}
                        keyword={keyword}
                        outdatedUsageCount={outdatedAssetVersionUsages.length}
                        projectContextFilter={projectContextFilter}
                        projectFolderRows={projectFolderRows}
                        projectLibraryFilter={projectLibraryFilter}
                        referenceVersionFilter={referenceVersionFilter}
                        regularFolders={regularFolders}
                        selectedCount={selectedAssets.length}
                        storyboardGroupFilter={storyboardGroupFilter}
                        storyboardGroupOptions={storyboardGroupOptions}
                        validAssetCount={validAssets.length}
                        onClearSelectedOutdatedUsages={clearSelectedOutdatedUsages}
                        onCreateFolder={openCreateFolder}
                        onDeleteFolder={deleteFolder}
                        onEpisodeFilterChange={assetFilterActions.changeEpisodeFilter}
                        onEditFolder={openEditFolder}
                        onFolderFilterChange={assetFilterActions.changeFolderFilter}
                        onGenerationActionFilterChange={assetFilterActions.changeGenerationActionFilter}
                        onGenerationModelProviderFilterChange={assetFilterActions.changeGenerationModelProviderFilter}
                        onGenerationSourceFilterChange={assetFilterActions.changeGenerationSourceFilter}
                        onGenerationTaskFilterChange={assetFilterActions.changeGenerationTaskFilter}
                        onKindFilterChange={assetFilterActions.changeKindFilter}
                        onKeywordChange={assetFilterActions.changeKeyword}
                        onProjectContextFilterChange={assetFilterActions.changeProjectContextFilter}
                        onProjectLibraryFilterChange={assetFilterActions.changeProjectLibraryFilter}
                        onReferenceVersionFilterChange={assetFilterActions.changeReferenceVersionFilter}
                        onStoryboardGroupFilterChange={assetFilterActions.changeStoryboardGroupFilter}
                    />
                </div>

                <AssetResultsSection
                    allFilteredSelected={allFilteredSelected}
                    allVisibleProductionBibleSelected={allVisibleProductionBibleSelected}
                    assetPaginationEnabled={assetPaginationEnabled}
                    bulkReviewAction={bulkReviewAction}
                    episodeTitleMap={episodeTitleMap}
                    filteredCount={filteredAssets.length}
                    page={page}
                    pageSize={pageSize}
                    productionBibleCount={visibleProductionBibleItems.length}
                    projectContextFilter={projectContextFilter}
                    referenceVersionFilter={referenceVersionFilter}
                    refreshingReviewId={refreshingReviewId}
                    generatingWorkflowAssetId={generatingWorkflowAssetId}
                    uploadingWorkflowAssetId={uploadingWorkflowAssetId}
                    selectedAssetIds={selectedAssetIds}
                    selectedAssetSummary={selectedAssetSummary}
                    selectedAssetsCount={selectedAssets.length}
                    selectedInFilteredCount={selectedInFilteredCount}
                    selectedOutdatedUsageIds={selectedOutdatedUsageIds}
                    selectedProductionBibleCount={selectedProductionBibleItems.length}
                    selectedProductionBibleInVisibleCount={selectedProductionBibleInVisibleCount}
                    selectedProductionBibleItemIds={selectedProductionBibleItemIds}
                    selectedProductionBibleSummary={selectedProductionBibleItemSummary}
                    selectedVolcengineRefreshCount={selectedVolcengineRefreshAssets.length}
                    selectedVolcengineSubmitCount={selectedVolcengineSubmitAssets.length}
                    showEpisodeGroups={Boolean(projectContextFilter)}
                    sortMode={sortMode}
                    submittingReviewId={submittingReviewId}
                    usages={outdatedAssetVersionUsages}
                    visibleAssetGroups={visibleAssetGroups}
                    onAddToProjectLibrary={addSelectedToProjectLibrary}
                    onBulkDelete={openBulkDelete}
                    onBulkDeleteProductionBibleItems={openBulkProductionBibleDelete}
                    onBulkMove={openBulkMove}
                    onBulkTag={openBulkTag}
                    onClearOutdatedSelection={clearSelectedOutdatedUsages}
                    onClearSelected={clearSelectedAssets}
                    onClearSelectedProductionBibleItems={clearSelectedProductionBibleItems}
                    onCopyAsset={copyAssetText}
                    onDeleteAsset={setDeletingAsset}
                    onDeleteProductionBibleItem={setDeletingProductionBibleItem}
                    onDownloadAsset={downloadMedia}
                    onEditAsset={openEdit}
                    onExportSelected={() => void exportSelectedAssets()}
                    onOpenAsset={setPreviewAsset}
                    onOpenBulkOutdated={() => setBulkOutdatedOpen(true)}
                    onPageChange={(nextPage, nextPageSize) => {
                        setPage(nextPage);
                        setPageSize(nextPageSize);
                    }}
                    onRefreshAssetReview={(asset) => void refreshImageReview(asset)}
                    onGenerateWorkflowImage={(asset) => void generateWorkflowAssetImage(asset)}
                    onMatchWorkflowImage={openWorkflowImageMatch}
                    onUploadWorkflowImage={openWorkflowImageUpload}
                    onRefreshSelectedReviews={() => void refreshSelectedVolcengineReviews()}
                    onRemoveFromProjectLibrary={removeSelectedFromProjectLibrary}
                    onSelectFiltered={selectFilteredAssets}
                    onSelectOutdatedUsages={selectAllOutdatedUsages}
                    onSelectVisibleProductionBibleItems={selectVisibleProductionBibleItems}
                    onSortModeChange={assetFilterActions.changeSortMode}
                    onSubmitAssetReview={(asset) => void submitImageReview(asset)}
                    onSubmitSelectedReviews={() => void submitSelectedVolcengineReviews()}
                    onToggleAsset={toggleAssetSelected}
                    onToggleOutdatedUsage={toggleOutdatedUsageSelected}
                    onToggleProductionBibleItem={toggleProductionBibleItemSelected}
                    onUpdateOutdatedUsage={updateOutdatedUsageToLatest}
                />
            </main>

            <AssetPageOverlays
                assetInputRef={assetInputRef}
                bulkDeleteOpen={bulkDeleteOpen}
                bulkMoveFolderId={bulkMoveFolderId}
                bulkMoveOpen={bulkMoveOpen}
                bulkOutdatedOpen={bulkOutdatedOpen}
                bulkProductionBibleDeleteOpen={bulkProductionBibleDeleteOpen}
                bulkTagOpen={bulkTagOpen}
                bulkTags={bulkTags}
                canvasLibraryTitles={canvasLibraryTitles}
                content={content}
                coverInputRef={coverInputRef}
                coverUrl={coverUrl}
                deletingAsset={deletingAsset}
                deletingProductionBibleItem={deletingProductionBibleItem}
                editingAsset={editingAsset}
                editingFolder={editingFolder}
                folderDialogOpen={folderDialogOpen}
                folderName={folderName}
                folderOptions={folderOptions}
                form={form}
                formKind={formKind}
                imageDraft={imageDraft}
                imageInputRef={imageInputRef}
                isAssetOpen={isAssetOpen}
                mediaDraft={mediaDraft}
                mediaInputRef={mediaInputRef}
                previewAsset={previewAsset}
                previewAssetFolderName={previewAsset?.folderId ? folderMap.get(previewAsset.folderId)?.name : ""}
                generatingWorkflowImage={previewAsset ? generatingWorkflowAssetId === previewAsset.id : false}
                projectLibraryProjectTitles={projectLibraryProjectTitles}
                refreshingReview={previewAsset ? refreshingReviewId === previewAsset.id : false}
                selectedCount={selectedAssets.length}
                selectedOutdatedUsageConfirmItems={selectedOutdatedUsageConfirmItems}
                selectedProductionBibleCount={selectedProductionBibleItems.length}
                selectedProductionBibleSummary={selectedProductionBibleItemSummary}
                submittingReview={previewAsset ? submittingReviewId === previewAsset.id : false}
                tags={tags}
                title={title}
                usageReferences={previewAssetUsageReferences}
                onApplyBulkDelete={applyBulkDelete}
                onApplyBulkMove={applyBulkMove}
                onApplyBulkProductionBibleDelete={applyBulkProductionBibleDelete}
                onApplyBulkTags={applyBulkTags}
                onApplySelectedOutdatedUsages={applySelectedOutdatedUsages}
                onBulkMoveFolderChange={setBulkMoveFolderId}
                onBulkTagsChange={setBulkTags}
                onCancelBulkDelete={() => setBulkDeleteOpen(false)}
                onCancelBulkMove={() => setBulkMoveOpen(false)}
                onCancelBulkOutdated={() => setBulkOutdatedOpen(false)}
                onCancelBulkProductionBibleDelete={() => setBulkProductionBibleDeleteOpen(false)}
                onCancelBulkTag={() => setBulkTagOpen(false)}
                onCancelDeleteAsset={() => setDeletingAsset(null)}
                onCancelDeleteProductionBibleItem={() => setDeletingProductionBibleItem(null)}
                onCancelFolder={() => setFolderDialogOpen(false)}
                onCloseAssetDrawer={() => setPreviewAsset(null)}
                onCloseEditor={() => setIsAssetOpen(false)}
                onConfirmDeleteAsset={confirmDelete}
                onConfirmDeleteProductionBibleItem={confirmDeleteProductionBibleItem}
                onCopyAsset={copyAssetText}
                onDownloadAsset={downloadMedia}
                onDownloadVersion={(asset, versionId) => void downloadAssetVersion(asset, versionId)}
                onFolderNameChange={setFolderName}
                onImportAssetFiles={importAssetFiles}
                onKindChange={updateFormKind}
                onReadCoverFile={readCoverFile}
                onReadImageFile={readImageFile}
                onReadMediaFile={readMediaFile}
                onRefreshReview={(asset) => void refreshImageReview(asset)}
                onGenerateWorkflowImage={(asset) => void generateWorkflowAssetImage(asset)}
                onRestoreVersion={(asset, versionId) => void restoreAssetVersion(asset, versionId)}
                onReview={(asset) => void submitImageReview(asset)}
                onSaveAsset={saveAsset}
                onSaveFolder={saveFolder}
            />
            <Modal className="studio-modal" title="匹配已有图片" open={Boolean(matchingWorkflowAsset)} width={900} footer={null} destroyOnHidden onCancel={() => setMatchingWorkflowAsset(null)}>
                {matchingWorkflowAsset ? (
                    <div className="grid gap-4">
                        <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <div className="text-xs text-[var(--studio-text-muted)]">目标素材</div>
                            <div className="mt-1 truncate text-sm font-semibold text-[var(--studio-text-primary)]">{matchingWorkflowAsset.title}</div>
                        </div>
                        <Input className="studio-command-input" allowClear value={matchKeyword} placeholder="搜索旧素材标题、来源、标签或集数" onChange={(event) => setMatchKeyword(event.target.value)} />
                        {matchCandidateAssets.length ? (
                            <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                                {matchCandidateAssets.map((asset) => {
                                    const cover = asset.coverUrl || asset.data.dataUrl;
                                    return (
                                        <button key={asset.id} type="button" className="grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3 text-left transition hover:border-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]" onClick={() => matchWorkflowImageAsset(asset)}>
                                            <div className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-shell-bg)]">
                                                {cover ? <img src={cover} alt={asset.title} className="h-32 w-full object-contain" /> : <div className="grid h-32 place-items-center text-xs text-[var(--studio-text-muted)]">暂无预览</div>}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{asset.title}</div>
                                                <div className="mt-1 text-xs text-[var(--studio-text-muted)]">{assetEpisodeTitle(asset, episodeTitleMap)}</div>
                                                <div className="mt-1 line-clamp-1 text-xs text-[var(--studio-text-secondary)]">{asset.source || "未标注来源"}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到可匹配的图片素材" className="py-10" />
                        )}
                    </div>
                ) : null}
            </Modal>
            <input ref={workflowUploadInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadWorkflowImageFile(event.target.files)} />
        </div>
    );
}

type SearchParamReader = {
    get: (name: string) => string | null;
};

function assetMatchProjectId(asset: Asset, info: ReturnType<typeof workflowAssetInfo>, fallback: string) {
    const metadata = asset.metadata || {};
    return readMetadataString(metadata.projectId) || info?.sourceProjectId || info?.projectSlug || fallback;
}

function assetMatchSearchText(asset: Asset, episodeTitleMap: Record<string, string>) {
    const metadata = asset.metadata || {};
    return [asset.title, asset.source, asset.note, (asset.tags || []).join(" "), readMetadataString(metadata.episodeId), readMetadataString(metadata.episodeTitle), assetEpisodeTitle(asset, episodeTitleMap)].join(" ").toLowerCase();
}

function readMetadataString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function buildAssetsPageReturnTarget(searchParams: SearchParamReader) {
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/")) return { href: returnTo, label: searchParams.get("returnLabel") || "返回上一步" };

    const source = searchParams.get("source") || "";
    const projectId = searchParams.get("projectId") || "";
    const episodeId = searchParams.get("episodeId") || "";
    if (source === "episode-workbench" && projectId && episodeId) {
        return {
            href: `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/workbench?module=assets`,
            label: "返回资产与生图",
        };
    }
    if (projectId) return { href: `/projects/${encodeURIComponent(projectId)}`, label: "返回项目" };

    return { href: "/projects", label: "返回项目工作台" };
}
