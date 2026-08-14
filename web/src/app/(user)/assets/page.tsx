"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { App, Empty, Form, Input, Modal } from "antd";

import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { workspaceProjectId } from "@/components/layout/workspace-project-context";
import { useAssetStore, type Asset, type AssetCategory, type AssetKind, type AssetSubject } from "@/stores/use-asset-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import type { ProductionBibleItem } from "../canvas/utils/production-bible";
import { normalizeCanvasAssetTitles } from "./asset-canvas-title";
import { buildAssetCenterSubjects, unorganizedAssets, type AssetCenterSubjectSummary } from "./asset-gallery";
import { assetSubjectHref } from "./asset-navigation";
import { assetEpisodeTitle } from "./asset-episode";
import { buildAssetImageRevisionHref } from "./asset-image-revision";
import type { AssetFormValues } from "./components/asset-editor-modal";
import { AssetCenterNav, type AssetCenterView } from "./components/asset-center-nav";
import { AssetFilterPanel } from "./components/asset-filter-panel";
import { AssetInboxSection } from "./components/asset-inbox-section";
import { AssetOrganizeModal } from "./components/asset-organize-modal";
import { AssetPageHeader } from "./components/asset-page-header";
import { AssetSubjectCreateModal } from "./components/asset-subject-create-modal";
import { AssetVoiceMatchModal } from "./components/asset-voice-match-modal";
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
import { useAssetOrganizeActions } from "./use-asset-organize-actions";
import { useAssetPageQuery } from "./use-asset-page-query";
import { useAssetPageStores } from "./use-asset-page-stores";
import { useAssetSelection } from "./use-asset-selection";
import { useVolcengineAssetReview } from "./use-volcengine-asset-review";
import { useWorkflowAssetImageActions } from "./use-workflow-asset-image-actions";
import { buildWorkflowMatchedImagePatch, buildWorkflowUploadedImagePatch, workflowAssetInfo } from "./workflow-asset-image";
import { subjectCandidateImageInput, subjectVoiceBinding } from "./asset-subject-actions";
import { assetInProjectLibrary } from "./asset-project-library";

export default function AssetsPage() {
    return (
        <Suspense fallback={null}>
            <AssetsPageContent />
        </Suspense>
    );
}

function AssetsPageContent() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const scriptEpisodes = useScriptStore((state) => state.episodes);
    const requestedAssetId = searchParams.get("assetId") || "";
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const workflowUploadInputRef = useRef<HTMLInputElement>(null);
    const subjectUploadInputRef = useRef<HTMLInputElement>(null);
    const workflowUploadTargetRef = useRef<Asset | null>(null);
    const {
        addAsset,
        addAssetOnce,
        addFolder,
        addWorkbenchImage,
        assets: storedAssets,
        creativeProjects,
        ensureProjectFolder,
        ensureSubject,
        folders,
        workbenchImages,
        organizeAsset,
        createSubjectFromAsset,
        productionBibleItems,
        projects,
        removeAsset,
        removeFolder,
        removeProductionBibleItem,
        shotGroups,
        storyboardGroups,
        storyboardShots,
        storyboardTableShots,
        subjects,
        variants,
        token,
        updateAsset,
        updateSubject,
        updateCanvasProject,
        updateFolder,
        updateProductionBibleItem,
        updateShotGroup,
        updateStoryboardShot,
        updateStoryboardTableShot,
        volcengineAssetEnabled,
    } = useAssetPageStores();
    const assets = useMemo(() => normalizeCanvasAssetTitles(storedAssets, projects), [projects, storedAssets]);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [openedRequestedAssetId, setOpenedRequestedAssetId] = useState("");
    const [bulkOutdatedOpen, setBulkOutdatedOpen] = useState(false);
    const [deletingProductionBibleItem, setDeletingProductionBibleItem] = useState<ProductionBibleItem | null>(null);
    const [bulkProductionBibleDeleteOpen, setBulkProductionBibleDeleteOpen] = useState(false);
    const [uploadingWorkflowAssetId, setUploadingWorkflowAssetId] = useState<string | null>(null);
    const [matchingWorkflowAsset, setMatchingWorkflowAsset] = useState<Asset | null>(null);
    const [matchKeyword, setMatchKeyword] = useState("");
    const [pendingClassificationIds, setPendingClassificationIds] = useState<string[]>([]);
    const [subjectCreateCategory, setSubjectCreateCategory] = useState<AssetCategory | null>(null);
    const [centerView, setCenterView] = useState<AssetCenterView>("all");
    const [subjectUploadTarget, setSubjectUploadTarget] = useState<AssetCenterSubjectSummary | null>(null);
    const [voiceSubject, setVoiceSubject] = useState<AssetSubject | null>(null);
    const [voiceUploading, setVoiceUploading] = useState(false);

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
        assetAliasIdsByCanonicalId,
        canvasLibraryFilter,
        canvasLibraryTitles,
        canvasProjectOptions,
        episodeFilter,
        episodeOptions,
        episodeTitleMap,
        favoriteOnly,
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
        hasScopedAssetFilter,
        kindFilter,
        keyword,
        outdatedAssetVersionUsages,
        page,
        pageCount,
        previewAssetUsageReferences,
        projectContextFilter,
        projectOptions,
        projectLibraryFilter,
        projectLibraryProjectTitles,
        referenceVersionFilter,
        regularFolders,
        setEpisodeFilter,
        setCanvasLibraryFilter,
        setFavoriteOnly,
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
        setSourceScope,
        setStoryboardGroupFilter,
        sortMode,
        sourceScope,
        storyboardGroupFilter,
        storyboardGroupOptions,
        validAssets,
        visibleAssetGroups,
        visibleProductionBibleItems,
    } = useAssetPageQuery({
        assets,
        creativeProjects,
        folders,
        initialProjectId: workspaceProjectId("/assets", searchParams),
        previewAsset,
        productionBibleItems,
        projects,
        scriptEpisodes,
        shotGroups,
        storyboardGroups,
        storyboardShots,
        storyboardTableShots,
        subjects,
    });
    const subjectSummaries = useMemo(() => buildAssetCenterSubjects({ subjects, variants, assets, workbenchImages, projectId: projectContextFilter }), [assets, projectContextFilter, subjects, variants, workbenchImages]);
    const inboxAssets = useMemo(() => {
        const filteredIds = new Set(filteredAssets.map((asset) => asset.id));
        return unorganizedAssets(assets, projectContextFilter).filter((asset) => filteredIds.has(asset.id));
    }, [assets, filteredAssets, projectContextFilter]);
    const visibleSubjectSummaries = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return subjectSummaries.filter((summary) => (centerView === "all" || centerView === "inbox" || summary.subject.category === centerView) && (!query || [summary.subject.name, summary.subject.code, ...summary.subject.tags].join(" ").toLowerCase().includes(query)));
    }, [centerView, keyword, subjectSummaries]);
    const subjectCounts = useMemo(() => ({
        all: subjectSummaries.length,
        character: subjectSummaries.filter((summary) => summary.subject.category === "character").length,
        scene: subjectSummaries.filter((summary) => summary.subject.category === "scene").length,
        prop: subjectSummaries.filter((summary) => summary.subject.category === "prop").length,
        blocking: subjectSummaries.filter((summary) => summary.subject.category === "blocking").length,
        other: subjectSummaries.filter((summary) => summary.subject.category === "other").length,
    }), [subjectSummaries]);
    const voiceProjectId = voiceSubject?.projectId || "";
    const projectVoiceAssets = useMemo(() => assets.filter((asset): asset is Extract<Asset, { kind: "audio" }> => asset.kind === "audio" && Boolean(voiceProjectId) && (asset.assetBinding?.projectId === voiceProjectId || assetInProjectLibrary(asset, voiceProjectId))), [assets, voiceProjectId]);
    const { organizingAsset, openOrganize, closeOrganize, submitOrganize } = useAssetOrganizeActions({ projectId: projectContextFilter, organizeAsset, createSubjectFromAsset });
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
    const { content, coverUrl, editingAsset, formKind, imageDraft, isAssetOpen, mediaDraft, tags, title, openCreate, openEdit, readCoverFile, readImageFile, readMediaFile, saveAsset, setIsAssetOpen, updateFormKind } = useAssetEditorActions({
        activeFolderId: activeFolderId || undefined,
        activeProjectId: projectContextFilter || undefined,
        addAsset,
        addAssetOnce,
        ensureSubject,
        form,
        message,
        updateAsset,
    });
    const createProjectAsset = (kind: AssetKind, category?: AssetCategory) => {
        if (!projectContextFilter) return message.warning("请先选择资产所属项目");
        if (category && category !== "other") {
            setSubjectCreateCategory(category);
            return;
        }
        openCreate({ kind, category });
    };
    const createSubject = (values: { name: string; projectId: string; note?: string }) => {
        if (!subjectCreateCategory) return;
        const subjectId = ensureSubject({ projectId: values.projectId, category: subjectCreateCategory, name: values.name, note: values.note?.trim(), tags: [] });
        setSubjectCreateCategory(null);
        router.push(assetSubjectHref(subjectId, pathname, searchParams.toString()));
    };
    const createProjectFolder = () => {
        if (!projectContextFilter) return message.warning("请先选择资产所属项目");
        openCreateFolder();
    };
    const openProjectImport = () => {
        if (!projectContextFilter) return message.warning("请先选择资产所属项目");
        assetInputRef.current?.click();
    };
    const openSubjectUpload = (summary: AssetCenterSubjectSummary) => {
        setSubjectUploadTarget(summary);
        if (subjectUploadInputRef.current) subjectUploadInputRef.current.value = "";
        subjectUploadInputRef.current?.click();
    };
    const uploadSubjectImage = async (files?: FileList | null) => {
        const file = files?.[0];
        const target = subjectUploadTarget;
        setSubjectUploadTarget(null);
        if (!file || !target) return;
        try {
            const image = await uploadImage(file);
            addWorkbenchImage(subjectCandidateImageInput({ subjectId: target.subject.id, variantId: target.primaryVariant.id }, image, file.name));
            message.success(`已上传到「${target.subject.name}」待选结果`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片上传失败");
        }
    };
    const bindSubjectVoice = (audioAssetId: string) => {
        if (!voiceSubject) return;
        const patches = subjectVoiceBinding(voiceSubject, audioAssetId);
        updateSubject(voiceSubject.id, patches.subjectPatch);
        updateAsset(audioAssetId, patches.assetPatch);
        setVoiceSubject({ ...voiceSubject, ...patches.subjectPatch });
        message.success(`已为「${voiceSubject.name}」匹配声音`);
    };
    const uploadSubjectVoice = async (file: File) => {
        if (!voiceSubject) return;
        setVoiceUploading(true);
        try {
            const media = await uploadMediaFile(file, "asset-audio");
            const binding = subjectVoiceBinding(voiceSubject, "").assetPatch.assetBinding;
            const audioAssetId = await addAssetOnce({ kind: "audio", title: file.name.replace(/\.[^.]+$/, "") || "角色声音", coverUrl: "", tags: [], source: "本地上传", note: "", assetBinding: binding, metadata: { projectId: voiceSubject.projectId }, data: { url: media.url, storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType } }, { blob: file });
            bindSubjectVoice(audioAssetId);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "声音上传失败");
        } finally {
            setVoiceUploading(false);
        }
    };
    useEffect(() => {
        if (isAssetOpen || !pendingClassificationIds.length) return;
        const asset = useAssetStore.getState().assets.find((item) => item.id === pendingClassificationIds[0]);
        setPendingClassificationIds((ids) => ids.slice(1));
        if (asset?.kind === "image" && !asset.assetBinding) openEdit(asset);
    }, [isAssetOpen, openEdit, pendingClassificationIds]);
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
        setCanvasLibraryFilter,
        setEpisodeFilter,
        setFavoriteOnly,
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
        setSourceScope,
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
        assetAliasIdsByCanonicalId,
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
        activeProjectId: projectContextFilter || undefined,
        addAssetOnce,
        assetInputRef,
        message,
        onImported: (assetIds) => setPendingClassificationIds(assetIds),
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
        assetAliasIdsByCanonicalId,
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
    const toggleFavorite = (asset: Asset) => {
        const favorite = !asset.favorite;
        updateAsset(asset.id, { favorite });
        if (previewAsset?.id === asset.id) setPreviewAsset({ ...previewAsset, favorite });
    };
    const reviseImageAsset = (asset: Extract<Asset, { kind: "image" }>) => {
        router.push(buildAssetImageRevisionHref(asset, `${window.location.pathname}${window.location.search}`));
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
            <main className="studio-shell relative min-h-0 flex-1 overflow-y-auto px-4 py-4 xl:px-6" onDragEnter={handleUploadDragEnter} onDragLeave={handleUploadDragLeave} onDragOver={handleUploadDragOver} onDrop={handleUploadDrop}>
                {isDraggingUpload ? <AssetUploadDropOverlay activeFolderName={activeFolderName} /> : null}
                <div className="mx-auto max-w-[1680px] pb-5">
                    <AssetPageHeader
                        kindFilter={kindFilter}
                        keyword={keyword}
                        projectContextFilter={projectContextFilter}
                        projectOptions={projectOptions}
                        sortMode={sortMode}
                        onCreate={createProjectAsset}
                        onCreateFolder={createProjectFolder}
                        onExportAll={() => void exportAllAssets()}
                        onImportClick={openProjectImport}
                        onKindFilterChange={assetFilterActions.changeKindFilter}
                        onKeywordChange={assetFilterActions.changeKeyword}
                        onProjectChange={assetFilterActions.changeProjectContextFilter}
                        onSortModeChange={assetFilterActions.changeSortMode}
                    />

                    <AssetFilterPanel
                        actions={{
                            onCanvasLibraryFilterChange: assetFilterActions.changeCanvasLibraryFilter,
                            onClearSelectedOutdatedUsages: clearSelectedOutdatedUsages,
                            onCreateFolder: openCreateFolder,
                            onDeleteFolder: deleteFolder,
                            onEditFolder: openEditFolder,
                            onEpisodeFilterChange: assetFilterActions.changeEpisodeFilter,
                            onFolderFilterChange: assetFilterActions.changeFolderFilter,
                            onFavoriteOnlyChange: assetFilterActions.changeFavoriteOnly,
                            onGenerationActionFilterChange: assetFilterActions.changeGenerationActionFilter,
                            onGenerationModelProviderFilterChange: assetFilterActions.changeGenerationModelProviderFilter,
                            onGenerationSourceFilterChange: assetFilterActions.changeGenerationSourceFilter,
                            onGenerationTaskFilterChange: assetFilterActions.changeGenerationTaskFilter,
                            onKindFilterChange: assetFilterActions.changeKindFilter,
                            onKeywordChange: assetFilterActions.changeKeyword,
                            onProjectContextFilterChange: assetFilterActions.changeProjectContextFilter,
                            onProjectLibraryFilterChange: assetFilterActions.changeProjectLibraryFilter,
                            onReferenceVersionFilterChange: assetFilterActions.changeReferenceVersionFilter,
                            onSourceScopeChange: assetFilterActions.changeSourceScope,
                            onStoryboardGroupFilterChange: assetFilterActions.changeStoryboardGroupFilter,
                        }}
                        counts={{
                            folderCounts,
                            outdatedUsageCount: outdatedAssetVersionUsages.length,
                            validAssetCount: validAssets.length,
                        }}
                        options={{
                            canvasProjectOptions,
                            episodeOptions,
                            generationFilterOptions,
                            projectOptions,
                            regularFolders,
                            storyboardGroupOptions,
                        }}
                        values={{
                            activeFolderId,
                            canvasLibraryFilter,
                            episodeFilter,
                            folderFilter,
                            favoriteOnly,
                            generationActionFilter,
                            generationModelProviderFilter,
                            generationSourceFilter,
                            generationTaskFilter,
                            kindFilter,
                            keyword,
                            projectContextFilter,
                            projectLibraryFilter,
                            referenceVersionFilter,
                            sourceScope,
                            storyboardGroupFilter,
                        }}
                    />
                </div>

                <AssetCenterNav value={centerView} counts={subjectCounts} inboxCount={inboxAssets.length} onChange={setCenterView} />
                {centerView === "inbox" && referenceVersionFilter !== "outdated" ? (
                    <AssetInboxSection
                        assets={inboxAssets}
                        selectedIds={selectedAssetIds}
                        refreshingReviewId={refreshingReviewId}
                        submittingReviewId={submittingReviewId}
                        onOrganize={openOrganize}
                        onSelect={toggleAssetSelected}
                        onOpen={setPreviewAsset}
                        onEdit={openEdit}
                        onToggleFavorite={toggleFavorite}
                        onDownload={downloadMedia}
                        onDelete={setDeletingAsset}
                        onReview={(asset) => void submitImageReview(asset)}
                        onRefreshReview={(asset) => void refreshImageReview(asset)}
                        onReviseImage={reviseImageAsset}
                    />
                ) : (
                    <AssetResultsSection
                        summaries={visibleSubjectSummaries}
                        referenceVersionFilter={referenceVersionFilter}
                        usages={outdatedAssetVersionUsages}
                        selectedOutdatedUsageIds={selectedOutdatedUsageIds}
                        onToggleOutdatedUsage={toggleOutdatedUsageSelected}
                        onSelectOutdatedUsages={selectAllOutdatedUsages}
                        onClearOutdatedSelection={clearSelectedOutdatedUsages}
                        onUpdateOutdatedUsage={updateOutdatedUsageToLatest}
                        onOpenBulkOutdated={() => setBulkOutdatedOpen(true)}
                        onUpload={openSubjectUpload}
                        onMatchVoice={(summary) => setVoiceSubject(summary.subject)}
                    />
                )}
            </main>

            <AssetSubjectCreateModal
                category={subjectCreateCategory}
                initialProjectId={projectContextFilter}
                open={Boolean(subjectCreateCategory)}
                projects={creativeProjects}
                onCancel={() => setSubjectCreateCategory(null)}
                onCreate={createSubject}
            />
            <AssetVoiceMatchModal audios={projectVoiceAssets} open={Boolean(voiceSubject)} subject={voiceSubject} uploading={voiceUploading} onCancel={() => setVoiceSubject(null)} onSelect={bindSubjectVoice} onUpload={(file) => void uploadSubjectVoice(file)} />
            <input ref={subjectUploadInputRef} hidden type="file" accept="image/*" onChange={(event) => { void uploadSubjectImage(event.target.files); event.target.value = ""; }} />

            <AssetOrganizeModal
                asset={organizingAsset}
                projectId={projectContextFilter}
                subjects={subjects}
                variants={variants}
                open={Boolean(organizingAsset)}
                onCancel={closeOrganize}
                onSubmit={submitOrganize}
            />

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
                episodes={scriptEpisodes}
                projects={creativeProjects}
                subjects={subjects}
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
            <Modal rootClassName="studio-modal" title="匹配已有图片" open={Boolean(matchingWorkflowAsset)} width={900} footer={null} destroyOnHidden onCancel={() => setMatchingWorkflowAsset(null)}>
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
                                        <button
                                            key={asset.id}
                                            type="button"
                                            className="grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3 text-left transition hover:border-[var(--studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]"
                                            onClick={() => matchWorkflowImageAsset(asset)}
                                        >
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
