"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { App, Form } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
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

export default function AssetsPage() {
    return (
        <Suspense fallback={null}>
            <AssetsPageContent />
        </Suspense>
    );
}

function AssetsPageContent() {
    const { message } = App.useApp();
    const searchParams = useSearchParams();
    const returnTarget = buildAssetsPageReturnTarget(searchParams);
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
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
        storyboardGroups,
        storyboardShots,
        token,
        updateAsset,
        updateCanvasProject,
        updateFolder,
        updateProductionBibleItem,
        updateStoryboardShot,
        volcengineAssetEnabled,
    } = useAssetPageStores();
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [bulkOutdatedOpen, setBulkOutdatedOpen] = useState(false);
    const [deletingProductionBibleItem, setDeletingProductionBibleItem] = useState<ProductionBibleItem | null>(null);
    const [bulkProductionBibleDeleteOpen, setBulkProductionBibleDeleteOpen] = useState(false);
    const {
        activeFolderId,
        activeFolderName,
        canvasLibraryFilter,
        canvasLibraryTitles,
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
        storyboardGroups,
        storyboardShots,
    });
    const { deleteFolder, editingFolder, folderDialogOpen, folderName, openCreateFolder, openEditFolder, saveFolder, setFolderDialogOpen, setFolderName } = useAssetFolderActions({
        addFolder,
        creativeProjects,
        ensureProjectFolder,
        message,
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
        storyboardShots,
        updateCanvasProject,
        updateProductionBibleItem,
        updateStoryboardShot,
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
                <div className="mx-auto max-w-7xl pb-8">
                    <AssetPageHeader returnHref={returnTarget.href} returnLabel={returnTarget.label} onCreate={openCreate} onExportAll={() => void exportAllAssets()} onImportClick={() => assetInputRef.current?.click()} />

                    <AssetFilterPanel
                        activeFolderId={activeFolderId}
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
                    bulkReviewAction={bulkReviewAction}
                    canvasLibraryFilter={canvasLibraryFilter}
                    filteredCount={filteredAssets.length}
                    folderMap={folderMap}
                    page={page}
                    pageSize={pageSize}
                    productionBibleCount={visibleProductionBibleItems.length}
                    projectContextFilter={projectContextFilter}
                    referenceVersionFilter={referenceVersionFilter}
                    refreshingReviewId={refreshingReviewId}
                    generatingWorkflowAssetId={generatingWorkflowAssetId}
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
        </div>
    );
}

type SearchParamReader = {
    get: (name: string) => string | null;
};

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
