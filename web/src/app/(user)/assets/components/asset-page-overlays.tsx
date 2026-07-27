"use client";

import type { RefObject } from "react";
import type { FormInstance } from "antd";

import type { Asset, AssetFolder, AssetKind, AssetSubject } from "@/stores/use-asset-store";
import type { ScriptEpisode } from "../../canvas/utils/script-management";
import type { CreativeProject } from "../../projects/creative-projects";
import type { ProductionBibleItem } from "../../canvas/utils/production-bible";
import type { AssetVersionUsageReference } from "../asset-version-references";
import { AssetDrawer } from "./asset-drawer";
import { AssetEditorModal, type AssetFormValues, type ImageDraft, type MediaDraft } from "./asset-editor-modal";
import { AssetPageModals } from "./asset-page-modals";

type FolderOption = { label: string; value: string };
type OutdatedUsageConfirmItem = {
    id: string;
    label: string;
    currentVersionNumber?: number;
    latestVersionNumber?: number;
};

export function AssetPageOverlays({
    assetInputRef,
    bulkDeleteOpen,
    bulkMoveFolderId,
    bulkMoveOpen,
    bulkOutdatedOpen,
    bulkProductionBibleDeleteOpen,
    bulkTagOpen,
    bulkTags,
    canvasLibraryTitles,
    content,
    coverInputRef,
    coverUrl,
    deletingAsset,
    deletingProductionBibleItem,
    editingAsset,
    editingFolder,
    folderDialogOpen,
    folderName,
    folderOptions,
    episodes,
    projects,
    subjects,
    form,
    formKind,
    imageDraft,
    imageInputRef,
    isAssetOpen,
    mediaDraft,
    mediaInputRef,
    previewAsset,
    previewAssetFolderName,
    generatingWorkflowImage,
    projectLibraryProjectTitles,
    refreshingReview,
    selectedCount,
    selectedOutdatedUsageConfirmItems,
    selectedProductionBibleCount,
    selectedProductionBibleSummary,
    submittingReview,
    tags,
    title,
    usageReferences,
    onApplyBulkDelete,
    onApplyBulkMove,
    onApplyBulkProductionBibleDelete,
    onApplyBulkTags,
    onApplySelectedOutdatedUsages,
    onBulkMoveFolderChange,
    onBulkTagsChange,
    onCancelBulkDelete,
    onCancelBulkMove,
    onCancelBulkOutdated,
    onCancelBulkProductionBibleDelete,
    onCancelBulkTag,
    onCancelDeleteAsset,
    onCancelDeleteProductionBibleItem,
    onCancelFolder,
    onCloseAssetDrawer,
    onCloseEditor,
    onConfirmDeleteAsset,
    onConfirmDeleteProductionBibleItem,
    onCopyAsset,
    onDownloadAsset,
    onDownloadVersion,
    onFolderNameChange,
    onImportAssetFiles,
    onKindChange,
    onReadCoverFile,
    onReadImageFile,
    onReadMediaFile,
    onRefreshReview,
    onGenerateWorkflowImage,
    onRestoreVersion,
    onReview,
    onSaveAsset,
    onSaveFolder,
}: {
    assetInputRef: RefObject<HTMLInputElement | null>;
    bulkDeleteOpen: boolean;
    bulkMoveFolderId?: string;
    bulkMoveOpen: boolean;
    bulkOutdatedOpen: boolean;
    bulkProductionBibleDeleteOpen: boolean;
    bulkTagOpen: boolean;
    bulkTags: string[];
    canvasLibraryTitles: Record<string, string>;
    content: string;
    coverInputRef: RefObject<HTMLInputElement | null>;
    coverUrl: string;
    deletingAsset: Asset | null;
    deletingProductionBibleItem: ProductionBibleItem | null;
    editingAsset: Asset | null;
    editingFolder: AssetFolder | null;
    folderDialogOpen: boolean;
    folderName: string;
    folderOptions: FolderOption[];
    episodes: ScriptEpisode[];
    projects: CreativeProject[];
    subjects: AssetSubject[];
    form: FormInstance<AssetFormValues>;
    formKind: AssetKind;
    imageDraft: ImageDraft;
    imageInputRef: RefObject<HTMLInputElement | null>;
    isAssetOpen: boolean;
    mediaDraft: MediaDraft;
    mediaInputRef: RefObject<HTMLInputElement | null>;
    previewAsset: Asset | null;
    previewAssetFolderName?: string;
    generatingWorkflowImage: boolean;
    projectLibraryProjectTitles: Record<string, string>;
    refreshingReview: boolean;
    selectedCount: number;
    selectedOutdatedUsageConfirmItems: OutdatedUsageConfirmItem[];
    selectedProductionBibleCount: number;
    selectedProductionBibleSummary: string;
    submittingReview: boolean;
    tags: string[];
    title: string;
    usageReferences: AssetVersionUsageReference[];
    onApplyBulkDelete: () => void;
    onApplyBulkMove: () => void;
    onApplyBulkProductionBibleDelete: () => void;
    onApplyBulkTags: () => void;
    onApplySelectedOutdatedUsages: () => void;
    onBulkMoveFolderChange: (value?: string) => void;
    onBulkTagsChange: (value: string[]) => void;
    onCancelBulkDelete: () => void;
    onCancelBulkMove: () => void;
    onCancelBulkOutdated: () => void;
    onCancelBulkProductionBibleDelete: () => void;
    onCancelBulkTag: () => void;
    onCancelDeleteAsset: () => void;
    onCancelDeleteProductionBibleItem: () => void;
    onCancelFolder: () => void;
    onCloseAssetDrawer: () => void;
    onCloseEditor: () => void;
    onConfirmDeleteAsset: () => void;
    onConfirmDeleteProductionBibleItem: () => void;
    onCopyAsset: (asset: Asset) => void;
    onDownloadAsset: (asset: Asset) => void;
    onDownloadVersion: (asset: Asset, versionId: string) => void;
    onFolderNameChange: (value: string) => void;
    onImportAssetFiles: (files?: FileList) => void | Promise<void>;
    onKindChange: (kind: AssetKind) => void;
    onReadCoverFile: (file?: File) => void | Promise<void>;
    onReadImageFile: (file?: File) => void | Promise<void>;
    onReadMediaFile: (file?: File) => void | Promise<void>;
    onRefreshReview: (asset: Asset) => void;
    onGenerateWorkflowImage: (asset: Asset) => void;
    onRestoreVersion: (asset: Asset, versionId: string) => void;
    onReview: (asset: Asset) => void;
    onSaveAsset: () => void | Promise<void>;
    onSaveFolder: () => void;
}) {
    return (
        <>
            <AssetEditorModal
                open={isAssetOpen}
                editingAsset={editingAsset}
                form={form}
                formKind={formKind}
                folderOptions={folderOptions}
                episodes={episodes}
                projects={projects}
                subjects={subjects}
                coverUrl={coverUrl}
                title={title}
                tags={tags}
                content={content}
                imageDraft={imageDraft}
                mediaDraft={mediaDraft}
                coverInputRef={coverInputRef}
                imageInputRef={imageInputRef}
                mediaInputRef={mediaInputRef}
                onCancel={onCloseEditor}
                onSave={onSaveAsset}
                onKindChange={onKindChange}
                onReadCoverFile={onReadCoverFile}
                onReadImageFile={onReadImageFile}
                onReadMediaFile={onReadMediaFile}
            />

            <AssetDrawer
                asset={previewAsset}
                folderName={previewAssetFolderName}
                refreshingReview={refreshingReview}
                generatingWorkflowImage={generatingWorkflowImage}
                onClose={onCloseAssetDrawer}
                onCopy={onCopyAsset}
                onDownload={onDownloadAsset}
                submittingReview={submittingReview}
                onReview={onReview}
                onRefreshReview={onRefreshReview}
                onGenerateWorkflowImage={onGenerateWorkflowImage}
                projectLibraryProjectTitles={projectLibraryProjectTitles}
                canvasLibraryTitles={canvasLibraryTitles}
                usageReferences={usageReferences}
                onDownloadVersion={onDownloadVersion}
                onRestoreVersion={onRestoreVersion}
            />

            <input ref={assetInputRef} type="file" multiple accept="application/zip,.zip,image/*,video/*,audio/*" className="hidden" onChange={(event) => void onImportAssetFiles(event.target.files || undefined)} />

            <AssetPageModals
                bulkDeleteOpen={bulkDeleteOpen}
                bulkMoveFolderId={bulkMoveFolderId}
                bulkMoveOpen={bulkMoveOpen}
                bulkOutdatedOpen={bulkOutdatedOpen}
                bulkProductionBibleDeleteOpen={bulkProductionBibleDeleteOpen}
                bulkTagOpen={bulkTagOpen}
                bulkTags={bulkTags}
                deletingAsset={deletingAsset}
                deletingProductionBibleItem={deletingProductionBibleItem}
                editingFolder={editingFolder}
                folderDialogOpen={folderDialogOpen}
                folderName={folderName}
                folderOptions={folderOptions}
                selectedCount={selectedCount}
                selectedOutdatedUsageConfirmItems={selectedOutdatedUsageConfirmItems}
                selectedProductionBibleCount={selectedProductionBibleCount}
                selectedProductionBibleSummary={selectedProductionBibleSummary}
                onApplyBulkDelete={onApplyBulkDelete}
                onApplyBulkMove={onApplyBulkMove}
                onApplyBulkProductionBibleDelete={onApplyBulkProductionBibleDelete}
                onApplyBulkTags={onApplyBulkTags}
                onApplySelectedOutdatedUsages={onApplySelectedOutdatedUsages}
                onBulkMoveFolderChange={onBulkMoveFolderChange}
                onBulkTagsChange={onBulkTagsChange}
                onCancelBulkDelete={onCancelBulkDelete}
                onCancelBulkMove={onCancelBulkMove}
                onCancelBulkOutdated={onCancelBulkOutdated}
                onCancelBulkProductionBibleDelete={onCancelBulkProductionBibleDelete}
                onCancelBulkTag={onCancelBulkTag}
                onCancelDeleteAsset={onCancelDeleteAsset}
                onCancelDeleteProductionBibleItem={onCancelDeleteProductionBibleItem}
                onCancelFolder={onCancelFolder}
                onConfirmDeleteAsset={onConfirmDeleteAsset}
                onConfirmDeleteProductionBibleItem={onConfirmDeleteProductionBibleItem}
                onFolderNameChange={onFolderNameChange}
                onSaveFolder={onSaveFolder}
            />
        </>
    );
}
