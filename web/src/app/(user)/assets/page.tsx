"use client";

import { BookOpen, Download, FolderPlus, PencilLine, Search, Trash2, Upload } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { App, Button, Empty, Form, Input, Modal, Pagination, Select, Tag } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { readFileAsDataUrl } from "@/lib/image-utils";
import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { buildVolcengineMediaFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetFolder, type AssetKind, type ImageAsset, type VideoAsset, type VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { ProductionBibleDrawer } from "../canvas/components/production-bible-drawer";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { assetGenerationFilterOptions } from "./asset-generation";
import { assetsForVolcengineRefresh, assetsForVolcengineSubmit, buildBulkMoveAssetPatches, buildBulkTagAssetPatches, normalizeTags } from "./asset-bulk-actions";
import { importableAssetFiles, importAssetFileList } from "./asset-import-actions";
import { assetImportSuccessMessage } from "./asset-import-payloads";
import {
    activeAssetFolderId,
    areAllAssetsSelected,
    buildAssetProjectContexts,
    filterAssetList,
    paginateAssetList,
    projectReferencedAssetIds as collectProjectReferencedAssetIds,
    selectedAssetSummary as formatSelectedAssetSummary,
    selectedAssetsFromIds,
    selectedCountInAssets,
    sortAssetList,
    storyboardGroupReferencedAssetIds as collectStoryboardGroupReferencedAssetIds,
    supportedAssetList,
    type AssetSortMode,
} from "./asset-page-filters";
import { assetSearchText, countFolderAssets, fetchImageBlob, hasImportableDragItems, volcengineStatusLabel } from "./asset-utils";
import { exportAssets } from "./asset-transfer";
import { AssetCard, AssetIconButton } from "./components/asset-card";
import { AssetDrawer } from "./components/asset-drawer";
import { AssetEditorModal, type AssetFormValues, type ImageDraft, type MediaDraft } from "./components/asset-editor-modal";

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function AssetsPage() {
    return (
        <Suspense fallback={null}>
            <AssetsPageContent />
        </Suspense>
    );
}

function AssetsPageContent() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const searchParams = useSearchParams();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const assets = useAssetStore((state) => state.assets);
    const folders = useAssetStore((state) => state.folders);
    const projects = useCanvasStore((state) => state.projects);
    const creativeProjects = useCreativeProjectStore((state) => state.projects);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const storyboardGroups = useStoryboardStore((state) => state.groups);
    const storyboardShots = useStoryboardStore((state) => state.shots);
    const addAsset = useAssetStore((state) => state.addAsset);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const addFolder = useAssetStore((state) => state.addFolder);
    const updateFolder = useAssetStore((state) => state.updateFolder);
    const removeFolder = useAssetStore((state) => state.removeFolder);
    const token = useUserStore((state) => state.token);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [folderFilter, setFolderFilter] = useState<string | "all" | "root">("all");
    const [generationSourceFilter, setGenerationSourceFilter] = useState<string>();
    const [generationActionFilter, setGenerationActionFilter] = useState<string>();
    const [generationModelProviderFilter, setGenerationModelProviderFilter] = useState<string>();
    const [generationTaskFilter, setGenerationTaskFilter] = useState<"all" | "with" | "without">("all");
    const [projectContextFilter, setProjectContextFilter] = useState(searchParams.get("projectId") || "");
    const [storyboardGroupFilter, setStoryboardGroupFilter] = useState("");
    const [sortMode, setSortMode] = useState<AssetSortMode>("default");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);
    const [refreshingReviewId, setRefreshingReviewId] = useState<string | null>(null);
    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const [mediaDraft, setMediaDraft] = useState<MediaDraft>(null);
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
    const [folderName, setFolderName] = useState("");
    const [isDraggingUpload, setIsDraggingUpload] = useState(false);
    const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
    const [productionBibleProjectId, setProductionBibleProjectId] = useState("");
    const [productionBibleOpen, setProductionBibleOpen] = useState(false);
    const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
    const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string | undefined>();
    const [bulkTagOpen, setBulkTagOpen] = useState(false);
    const [bulkTags, setBulkTags] = useState<string[]>([]);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkReviewAction, setBulkReviewAction] = useState<"submit" | "refresh" | "">("");
    const activeFolderId = activeAssetFolderId(folderFilter);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => supportedAssetList(assets), [assets]);
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const folderCounts = useMemo(() => countFolderAssets(validAssets), [validAssets]);
    const folderOptions = useMemo(() => [{ label: "未分组", value: "" }, ...folders.map((folder) => ({ label: folder.name, value: folder.id }))], [folders]);
    const projectContexts = useMemo(() => buildAssetProjectContexts(creativeProjects, projects), [creativeProjects, projects]);
    const projectOptions = useMemo(() => projectContexts.map((project) => ({ label: project.title, value: project.id })), [projectContexts]);
    const storyboardGroupOptions = useMemo(
        () =>
            storyboardGroups
                .filter((group) => !projectContextFilter || group.projectId === projectContextFilter)
                .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"))
                .map((group) => ({ label: group.title || "未命名分镜组", value: group.id })),
        [projectContextFilter, storyboardGroups],
    );
    const selectedProductionBibleProject = useMemo(
        () => projectContexts.find((project) => project.id === (projectContextFilter || productionBibleProjectId)) || projectContexts[0] || null,
        [projectContexts, productionBibleProjectId, projectContextFilter],
    );
    const generationFilterOptions = useMemo(() => assetGenerationFilterOptions(validAssets), [validAssets]);
    const projectReferencedAssetIds = useMemo(() => {
        return collectProjectReferencedAssetIds(projectContextFilter, productionBibleItems, storyboardGroups, storyboardShots);
    }, [productionBibleItems, projectContextFilter, storyboardGroups, storyboardShots]);
    const storyboardGroupAssetIds = useMemo(() => collectStoryboardGroupReferencedAssetIds(storyboardGroupFilter, storyboardShots), [storyboardGroupFilter, storyboardShots]);

    const filteredAssets = useMemo(() => {
        return sortAssetList(
            filterAssetList(validAssets, {
                keyword,
                kindFilter,
                folderFilter,
                generationSourceFilter,
                generationActionFilter,
                generationModelProviderFilter,
                generationTaskFilter,
                projectContextFilter,
                projectReferencedAssetIds,
                storyboardGroupFilter,
                storyboardGroupAssetIds,
                searchText: assetSearchText,
            }),
            sortMode,
        );
    }, [
        validAssets,
        keyword,
        kindFilter,
        folderFilter,
        generationSourceFilter,
        generationActionFilter,
        generationModelProviderFilter,
        generationTaskFilter,
        projectContextFilter,
        projectReferencedAssetIds,
        storyboardGroupFilter,
        storyboardGroupAssetIds,
        sortMode,
    ]);

    const visibleAssets = useMemo(() => paginateAssetList(filteredAssets, page, pageSize), [filteredAssets, page, pageSize]);
    const selectedAssets = useMemo(() => selectedAssetsFromIds(validAssets, selectedAssetIds), [validAssets, selectedAssetIds]);
    const selectedVolcengineSubmitAssets = useMemo(() => assetsForVolcengineSubmit(selectedAssets), [selectedAssets]);
    const selectedVolcengineRefreshAssets = useMemo(() => assetsForVolcengineRefresh(selectedAssets), [selectedAssets]);
    const selectedInFilteredCount = useMemo(() => selectedCountInAssets(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const allFilteredSelected = useMemo(() => areAllAssetsSelected(filteredAssets, selectedAssetIds), [filteredAssets, selectedAssetIds]);
    const selectedAssetSummary = useMemo(() => formatSelectedAssetSummary(selectedAssets), [selectedAssets]);
    const processingReviewIds = useMemo(() => volcengineReviewPollingKey(validAssets), [validAssets]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    useEffect(() => {
        if (activeFolderId && !folderMap.has(activeFolderId)) setFolderFilter("all");
    }, [activeFolderId, folderMap]);

    useEffect(() => {
        const nextProjectId = searchParams.get("projectId") || "";
        if (!nextProjectId) return;
        setProjectContextFilter(nextProjectId);
        setProductionBibleProjectId(nextProjectId);
    }, [searchParams]);

    useEffect(() => {
        if (!projectContexts.length) {
            if (productionBibleProjectId) setProductionBibleProjectId("");
            return;
        }
        if (!productionBibleProjectId || !projectContexts.some((project) => project.id === productionBibleProjectId)) setProductionBibleProjectId(projectContexts[0]?.id || "");
    }, [projectContexts, productionBibleProjectId]);

    useEffect(() => {
        if (storyboardGroupFilter && !storyboardGroupOptions.some((option) => option.value === storyboardGroupFilter)) setStoryboardGroupFilter("");
    }, [storyboardGroupFilter, storyboardGroupOptions]);

    useEffect(() => {
        const existingIds = new Set(validAssets.map((asset) => asset.id));
        setSelectedAssetIds((current) => {
            let changed = false;
            const next = new Set<string>();
            current.forEach((id) => {
                if (existingIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : current;
        });
    }, [validAssets]);

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setMediaDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", folderId: activeFolderId || "", tags: [], source: "手动添加", note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        setMediaDraft(asset.kind === "video" || asset.kind === "audio" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            title: asset.title,
            coverUrl: asset.coverUrl,
            folderId: asset.folderId || "",
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        const values = await form.validateFields();
        const base = {
            title: values.title.trim(),
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageDraft ? imageDraft.dataUrl : ""),
            folderId: values.folderId || undefined,
            tags: values.tags || [],
            source: values.source?.trim(),
            note: values.note?.trim(),
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else if (values.kind === "image") {
            if (!imageDraft) {
                message.error("请选择图片文件");
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            editingAsset ? updateAsset(editingAsset.id, asset) : await addAssetOnce(asset);
        } else {
            if (!mediaDraft) {
                message.error(values.kind === "video" ? "请选择视频文件" : "请选择音频文件");
                return;
            }
            const asset = { ...base, kind: values.kind, data: mediaDraft } as Parameters<typeof addAsset>[0];
            editingAsset ? updateAsset(editingAsset.id, asset) : await addAssetOnce(asset);
        }

        message.success(editingAsset ? "素材已更新" : "素材已保存");
        setIsAssetOpen(false);
    };

    const updateFormKind = (value: AssetKind) => {
        setFormKind(value);
        if (value === "text") {
            setImageDraft(null);
            setMediaDraft(null);
        }
        if (value === "image") setMediaDraft(null);
        if (value === "video" || value === "audio") {
            setImageDraft(null);
            setMediaDraft(null);
        }
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        form.setFieldValue("coverUrl", dataUrl);
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        const image = await uploadImage(file);
        const draft = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
        setImageDraft(draft);
        if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", draft.dataUrl);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
    };

    const readMediaFile = async (file?: File) => {
        if (!file || (!file.type.startsWith("video/") && !file.type.startsWith("audio/"))) return;
        const kind = file.type.startsWith("video/") ? "video" : "audio";
        const media = await uploadMediaFile(file, kind);
        const draft =
            kind === "video"
                ? { url: media.url, storageKey: media.storageKey, width: media.width || 1280, height: media.height || 720, bytes: media.bytes, mimeType: media.mimeType }
                : { url: media.url, storageKey: media.storageKey, bytes: media.bytes, mimeType: media.mimeType };
        setMediaDraft(draft);
        setFormKind(kind);
        form.setFieldValue("kind", kind);
        if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadMedia = (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
        saveAs(asset.kind === "image" ? asset.data.dataUrl : asset.data.url, `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || "bin"}`);
    };

    const exportSelectedAssets = async () => {
        if (!selectedAssets.length) {
            message.warning("请先选择要导出的素材");
            return;
        }
        await exportAssets(selectedAssets);
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
    };

    const toggleAssetSelected = (assetId: string) => {
        setSelectedAssetIds((current) => {
            const next = new Set(current);
            if (next.has(assetId)) next.delete(assetId);
            else next.add(assetId);
            return next;
        });
    };

    const selectFilteredAssets = () => {
        if (!filteredAssets.length) return;
        setSelectedAssetIds((current) => {
            const next = new Set(current);
            filteredAssets.forEach((asset) => next.add(asset.id));
            return next;
        });
    };

    const clearSelectedAssets = () => {
        setSelectedAssetIds(new Set());
    };

    const openBulkMove = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkMoveFolderId(activeFolderId || undefined);
        setBulkMoveOpen(true);
    };

    const applyBulkMove = () => {
        buildBulkMoveAssetPatches(selectedAssets, bulkMoveFolderId).forEach((item) => updateAsset(item.id, item.patch));
        message.success(`已移动 ${selectedAssets.length} 个素材`);
        setBulkMoveOpen(false);
    };

    const openBulkTag = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkTags([]);
        setBulkTagOpen(true);
    };

    const applyBulkTags = () => {
        const tags = normalizeTags(bulkTags);
        if (!tags.length) return message.warning("请填写要添加的标签");
        buildBulkTagAssetPatches(selectedAssets, tags).forEach((item) => updateAsset(item.id, item.patch));
        message.success(`已为 ${selectedAssets.length} 个素材添加标签`);
        setBulkTagOpen(false);
    };

    const openBulkDelete = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkDeleteOpen(true);
    };

    const applyBulkDelete = () => {
        const count = selectedAssets.length;
        selectedAssets.forEach((asset) => removeAsset(asset.id));
        clearSelectedAssets();
        setBulkDeleteOpen(false);
        message.success(`已删除 ${count} 个素材`);
    };

    const importAssetFiles = async (files?: FileList | File[]) => {
        const fileList = importableAssetFiles(files);
        if (!fileList.length) {
            message.warning("请选择图片、视频、音频或素材压缩包");
            return;
        }
        try {
            const count = await importAssetFileList(fileList, { folderId: activeFolderId, addAssetOnce });
            setPage(1);
            message.success(assetImportSuccessMessage(count, activeFolderId ? folderMap.get(activeFolderId)?.name || "当前文件夹" : ""));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败，请选择有效的素材压缩包或媒体文件");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const openCreateFolder = () => {
        setEditingFolder(null);
        setFolderName("");
        setFolderDialogOpen(true);
    };

    const openEditFolder = (folder: AssetFolder) => {
        setEditingFolder(folder);
        setFolderName(folder.name);
        setFolderDialogOpen(true);
    };

    const saveFolder = () => {
        const name = folderName.trim();
        if (!name) {
            message.error("请输入文件夹名称");
            return;
        }
        if (editingFolder) {
            updateFolder(editingFolder.id, name);
            message.success("文件夹已更新");
        } else {
            const id = addFolder(name);
            setFolderFilter(id);
            message.success("文件夹已创建");
        }
        setFolderDialogOpen(false);
    };

    const deleteFolder = (folder: AssetFolder) => {
        removeFolder(folder.id);
        setFolderFilter("all");
        message.success("文件夹已删除，素材已移到未分组");
    };

    const handleUploadDragEnter = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingUpload(true);
    };

    const handleUploadDragOver = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };

    const handleUploadDragLeave = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingUpload(false);
    };

    const handleUploadDrop = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingUpload(false);
        void importAssetFiles(event.dataTransfer.files);
    };

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    const updateVolcengineMetadata = (asset: ImageAsset | VideoAsset, volcengineAsset: VolcengineAssetMetadata) => {
        const metadata = {
            ...(asset.metadata || {}),
            volcengineAsset,
        };
        updateAsset(asset.id, { metadata });
        setPreviewAsset((current) => (current?.id === asset.id ? ({ ...current, metadata } as Asset) : current));
    };

    const submitVolcengineReviewAsset = async (asset: ImageAsset | VideoAsset) => {
        const storedBlob = asset.data.storageKey ? (asset.kind === "image" ? await getImageBlob(asset.data.storageKey) : await getMediaBlob(asset.data.storageKey)) : null;
        const blob = storedBlob || (await fetchImageBlob(asset.kind === "image" ? asset.data.dataUrl : asset.data.url));
        if (!blob) throw new Error(asset.kind === "image" ? "没有找到图片文件" : "没有找到视频文件");
        const saved = asset.metadata?.volcengineAsset;
        const result = await submitVolcengineMediaAsset(token!, {
            file: blob,
            filename: buildVolcengineMediaFilename(asset.title, asset.id, asset.data.mimeType, asset.kind),
            assetTitle: asset.title,
            groupId: saved?.groupId,
            groupName: asset.title || "我的素材",
        });
        updateVolcengineMetadata(asset, volcengineReviewMetadataFromSubmission(result));
    };

    const submitImageReview = async (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return;
        if (!volcengineAssetEnabled) {
            message.warning("请先在配置里开启火山人像加白");
            return;
        }
        if (!token) {
            message.error("请先登录");
            return;
        }
        setSubmittingReviewId(asset.id);
        try {
            await submitVolcengineReviewAsset(asset);
            message.success("已提交火山审核");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交失败");
        } finally {
            setSubmittingReviewId(null);
        }
    };

    const submitSelectedVolcengineReviews = async () => {
        if (!volcengineAssetEnabled) return message.warning("请先在配置里开启火山人像加白");
        if (!token) return message.error("请先登录");
        if (!selectedVolcengineSubmitAssets.length) return message.warning("当前选择中没有可提交加白的图片或视频");
        setBulkReviewAction("submit");
        let success = 0;
        let failed = 0;
        try {
            for (const asset of selectedVolcengineSubmitAssets) {
                setSubmittingReviewId(asset.id);
                try {
                    await submitVolcengineReviewAsset(asset);
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            if (failed) message.warning(`已提交 ${success} 个，失败 ${failed} 个`);
            else message.success(`已提交 ${success} 个素材加白`);
        } finally {
            setSubmittingReviewId(null);
            setBulkReviewAction("");
        }
    };

    const refreshSelectedVolcengineReviews = async () => {
        if (!token) return message.error("请先登录");
        if (!selectedVolcengineRefreshAssets.length) return message.warning("当前选择中没有可刷新的火山素材");
        setBulkReviewAction("refresh");
        let success = 0;
        let failed = 0;
        try {
            for (const asset of selectedVolcengineRefreshAssets) {
                try {
                    await refreshImageReview(asset, { silent: true, showProgress: true });
                    success += 1;
                } catch {
                    failed += 1;
                }
            }
            if (failed) message.warning(`已刷新 ${success} 个，失败 ${failed} 个`);
            else message.success(`已刷新 ${success} 个火山素材状态`);
        } finally {
            setBulkReviewAction("");
        }
    };

    const refreshImageReview = async (asset: Asset, options: { silent?: boolean; showProgress?: boolean } = {}) => {
        if ((asset.kind !== "image" && asset.kind !== "video") || !asset.metadata?.volcengineAsset?.assetId) return;
        if (!token) {
            if (!options.silent) message.error("请先登录");
            return;
        }
        const showProgress = options.showProgress || !options.silent;
        if (showProgress) setRefreshingReviewId(asset.id);
        try {
            const saved = asset.metadata.volcengineAsset;
            const status = await fetchVolcengineAssetStatus(token, {
                assetId: saved.assetId,
                projectName: saved.projectName,
            });
            const next: VolcengineAssetMetadata = mergeVolcengineReviewStatus(saved, status);
            updateVolcengineMetadata(asset, next);
            const statusText = `当前状态：${volcengineStatusLabel(next.status)}${next.error ? `：${next.error}` : ""}`;
            if (!options.silent) {
                if (next.status === "Failed") message.error(statusText);
                else message.success(statusText);
            }
        } catch (error) {
            if (!options.silent) message.error(error instanceof Error ? error.message : "刷新失败");
        } finally {
            if (showProgress) setRefreshingReviewId((current) => (current === asset.id ? null : current));
        }
    };

    useEffect(() => {
        if (!token || !volcengineAssetEnabled || !processingReviewIds) return;
        let cancelled = false;
        let polling = false;
        const pollProcessingReviews = async () => {
            if (polling || cancelled) return;
            polling = true;
            for (const asset of validAssets) {
                if (cancelled) break;
                if ((asset.kind === "image" || asset.kind === "video") && isVolcengineReviewProcessing(asset.metadata?.volcengineAsset)) {
                    await refreshImageReview(asset, { silent: true, showProgress: true });
                }
            }
            polling = false;
        };
        void pollProcessingReviews();
        const timer = window.setInterval(() => void pollProcessingReviews(), 3000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [processingReviewIds, token, volcengineAssetEnabled, validAssets]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main
                className="relative min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]"
                onDragEnter={handleUploadDragEnter}
                onDragLeave={handleUploadDragLeave}
                onDragOver={handleUploadDragOver}
                onDrop={handleUploadDrop}
            >
                {isDraggingUpload ? (
                    <div className="pointer-events-none fixed inset-0 z-[1000] grid place-items-center bg-background/70 backdrop-blur-sm">
                        <div className="grid min-h-40 w-[min(420px,calc(100vw-48px))] place-items-center rounded-xl border-2 border-dashed border-stone-400 bg-background/95 p-8 text-center shadow-2xl dark:border-stone-600">
                            <div>
                                <Upload className="mx-auto size-8 text-stone-500" />
                                <div className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-100">松开上传{activeFolderId ? `到「${folderMap.get(activeFolderId)?.name || "当前文件夹"}」` : ""}</div>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">我的素材</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">收藏常用文本、图片、视频和音频，按类型、标题和标签快速查找。</p>
                    </div>

                    <div className="mx-auto mt-8 w-full max-w-2xl">
                        <Input.Search
                            className="w-full"
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            onSearch={(value) => {
                                setPage(1);
                                setKeyword(value);
                            }}
                        />
                    </div>

                    <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-center">
                                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">类型</div>
                                <div className="flex flex-wrap gap-2">
                                    {kindOptions.map((option) => (
                                        <Tag.CheckableTag
                                            key={option.value}
                                            checked={kindFilter === option.value}
                                            className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
                                            onChange={() => {
                                                setPage(1);
                                                setKindFilter(option.value as AssetKind | "all");
                                            }}
                                        >
                                            {option.label}
                                        </Tag.CheckableTag>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="small" icon={<Download className="size-3.5" />} disabled={!selectedAssets.length} onClick={() => void exportSelectedAssets()}>
                                    导出选中{selectedAssets.length ? ` ${selectedAssets.length}` : ""}
                                </Button>
                                <Button size="small" icon={<Download className="size-3.5" />} onClick={() => void exportAllAssets()}>
                                    导出全部
                                </Button>
                                <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => assetInputRef.current?.click()}>
                                    导入素材
                                </Button>
                                <Button size="small" type="primary" onClick={openCreate}>
                                    新增素材
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-center">
                            <div className="text-xs font-medium text-stone-500 dark:text-stone-400">项目</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Select
                                    size="small"
                                    allowClear
                                    showSearch
                                    className="min-w-48"
                                    placeholder="项目上下文筛选"
                                    value={projectContextFilter || undefined}
                                    options={projectOptions}
                                    optionFilterProp="label"
                                    disabled={!projectOptions.length}
                                    onChange={(value) => {
                                        setPage(1);
                                        setProjectContextFilter(value || "");
                                        if (value) setProductionBibleProjectId(value);
                                    }}
                                />
                                <Select
                                    size="small"
                                    allowClear
                                    showSearch
                                    className="min-w-48"
                                    placeholder="分镜组筛选"
                                    value={storyboardGroupFilter || undefined}
                                    options={storyboardGroupOptions}
                                    optionFilterProp="label"
                                    disabled={!storyboardGroupOptions.length}
                                    onChange={(value) => {
                                        setPage(1);
                                        setStoryboardGroupFilter(value || "");
                                    }}
                                />
                                <Button size="small" icon={<BookOpen className="size-3.5" />} disabled={!selectedProductionBibleProject} onClick={() => setProductionBibleOpen(true)}>
                                    项目设定库
                                </Button>
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-1 text-xs font-medium text-stone-500 dark:text-stone-400">文件夹</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag.CheckableTag
                                    checked={folderFilter === "all"}
                                    className={cn("prompt-filter-tag", folderFilter === "all" && "is-active")}
                                    onChange={() => {
                                        setPage(1);
                                        setFolderFilter("all");
                                    }}
                                >
                                    全部 {validAssets.length}
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={folderFilter === "root"}
                                    className={cn("prompt-filter-tag", folderFilter === "root" && "is-active")}
                                    onChange={() => {
                                        setPage(1);
                                        setFolderFilter("root");
                                    }}
                                >
                                    未分组 {folderCounts.root || 0}
                                </Tag.CheckableTag>
                                {folders.map((folder) => (
                                    <Tag.CheckableTag
                                        key={folder.id}
                                        checked={folderFilter === folder.id}
                                        className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            setFolderFilter(folder.id);
                                        }}
                                    >
                                        {folder.name} {folderCounts[folder.id] || 0}
                                    </Tag.CheckableTag>
                                ))}
                                <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={openCreateFolder}>
                                    新建文件夹
                                </Button>
                                {activeFolderId && folderMap.has(activeFolderId) ? (
                                    <>
                                        <AssetIconButton title="重命名文件夹" icon={<PencilLine className="size-3.5" />} onClick={() => openEditFolder(folderMap.get(activeFolderId)!)} />
                                        <AssetIconButton title="删除文件夹" icon={<Trash2 className="size-3.5" />} danger onClick={() => deleteFolder(folderMap.get(activeFolderId)!)} />
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-1 text-xs font-medium text-stone-500 dark:text-stone-400">生成</div>
                            <div className="grid gap-2 md:grid-cols-4">
                                <Select
                                    size="small"
                                    allowClear
                                    placeholder="来源"
                                    value={generationSourceFilter}
                                    options={generationFilterOptions.sources}
                                    onChange={(value) => {
                                        setPage(1);
                                        setGenerationSourceFilter(value);
                                    }}
                                />
                                <Select
                                    size="small"
                                    allowClear
                                    placeholder="生成方式"
                                    value={generationActionFilter}
                                    options={generationFilterOptions.actions}
                                    onChange={(value) => {
                                        setPage(1);
                                        setGenerationActionFilter(value);
                                    }}
                                />
                                <Select
                                    size="small"
                                    allowClear
                                    showSearch
                                    placeholder="模型 / 供应商"
                                    value={generationModelProviderFilter}
                                    options={generationFilterOptions.modelProviders}
                                    optionFilterProp="label"
                                    onChange={(value) => {
                                        setPage(1);
                                        setGenerationModelProviderFilter(value);
                                    }}
                                />
                                <Select
                                    size="small"
                                    value={generationTaskFilter}
                                    options={[
                                        { label: "全部任务", value: "all" },
                                        { label: "有 taskId", value: "with" },
                                        { label: "无 taskId", value: "without" },
                                    ]}
                                    onChange={(value) => {
                                        setPage(1);
                                        setGenerationTaskFilter(value);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex max-w-7xl flex-col gap-5">
                    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-background/95 px-4 py-3 shadow-sm dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-stone-900 dark:text-stone-100">已选择 {selectedAssets.length} 个</div>
                            <div className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
                                {selectedAssetSummary} · 当前筛选 {filteredAssets.length} 个，已选 {selectedInFilteredCount} 个
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <Select
                                size="small"
                                className="w-32"
                                value={sortMode}
                                options={[
                                    { label: "默认排序", value: "default" },
                                    { label: "最近更新", value: "updated_desc" },
                                    { label: "最近生成", value: "generation_desc" },
                                    { label: "创建时间", value: "created_desc" },
                                    { label: "标题 A-Z", value: "title_asc" },
                                ]}
                                onChange={(value) => {
                                    setPage(1);
                                    setSortMode(value);
                                }}
                            />
                            <Button size="small" disabled={!filteredAssets.length || allFilteredSelected} onClick={selectFilteredAssets}>
                                全选当前结果
                            </Button>
                            <Button size="small" disabled={!selectedAssets.length} onClick={openBulkMove}>
                                移动文件夹
                            </Button>
                            <Button size="small" disabled={!selectedAssets.length} onClick={openBulkTag}>
                                添加标签
                            </Button>
                            <Button size="small" disabled={!selectedVolcengineSubmitAssets.length || bulkReviewAction !== ""} loading={bulkReviewAction === "submit"} onClick={() => void submitSelectedVolcengineReviews()}>
                                批量加白{selectedVolcengineSubmitAssets.length ? ` ${selectedVolcengineSubmitAssets.length}` : ""}
                            </Button>
                            <Button size="small" disabled={!selectedVolcengineRefreshAssets.length || bulkReviewAction !== ""} loading={bulkReviewAction === "refresh"} onClick={() => void refreshSelectedVolcengineReviews()}>
                                批量刷新{selectedVolcengineRefreshAssets.length ? ` ${selectedVolcengineRefreshAssets.length}` : ""}
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedAssets.length} onClick={openBulkDelete}>
                                删除选中
                            </Button>
                            <Button size="small" disabled={!selectedAssets.length} onClick={clearSelectedAssets}>
                                清空选择
                            </Button>
                        </div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleAssets.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                folderName={asset.folderId ? folderMap.get(asset.folderId)?.name : ""}
                                selected={selectedAssetIds.has(asset.id)}
                                refreshingReview={refreshingReviewId === asset.id}
                                onSelect={() => toggleAssetSelected(asset.id)}
                                onOpen={() => setPreviewAsset(asset)}
                                onEdit={() => openEdit(asset)}
                                onCopy={copyAssetText}
                                onDownload={downloadMedia}
                                onDelete={() => setDeletingAsset(asset)}
                                submittingReview={submittingReviewId === asset.id}
                                onReview={() => void submitImageReview(asset)}
                                onRefreshReview={() => void refreshImageReview(asset)}
                            />
                        ))}
                    </div>

                    {!visibleAssets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到素材" className="py-20" /> : null}

                    <div className="flex justify-center">
                        <Pagination
                            current={page}
                            pageSize={pageSize}
                            total={filteredAssets.length}
                            showSizeChanger
                            pageSizeOptions={[10, 20, 50, 100]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    </div>
                </div>
            </main>

            <AssetEditorModal
                open={isAssetOpen}
                editingAsset={editingAsset}
                form={form}
                formKind={formKind}
                folderOptions={folderOptions}
                coverUrl={coverUrl}
                title={title}
                tags={tags}
                content={content}
                imageDraft={imageDraft}
                mediaDraft={mediaDraft}
                coverInputRef={coverInputRef}
                imageInputRef={imageInputRef}
                mediaInputRef={mediaInputRef}
                onCancel={() => setIsAssetOpen(false)}
                onSave={saveAsset}
                onKindChange={updateFormKind}
                onReadCoverFile={readCoverFile}
                onReadImageFile={readImageFile}
                onReadMediaFile={readMediaFile}
            />

            <AssetDrawer
                asset={previewAsset}
                folderName={previewAsset?.folderId ? folderMap.get(previewAsset.folderId)?.name : ""}
                refreshingReview={previewAsset ? refreshingReviewId === previewAsset.id : false}
                onClose={() => setPreviewAsset(null)}
                onCopy={copyAssetText}
                onDownload={downloadMedia}
                submittingReview={previewAsset ? submittingReviewId === previewAsset.id : false}
                onReview={(asset) => void submitImageReview(asset)}
                onRefreshReview={(asset) => void refreshImageReview(asset)}
            />

            {selectedProductionBibleProject ? (
                <ProductionBibleDrawer open={productionBibleOpen} projectId={selectedProductionBibleProject.id} projectTitle={selectedProductionBibleProject.title || "未命名画布"} onClose={() => setProductionBibleOpen(false)} />
            ) : null}

            <input ref={assetInputRef} type="file" multiple accept="application/zip,.zip,image/*,video/*,audio/*" className="hidden" onChange={(event) => void importAssetFiles(event.target.files || undefined)} />

            <Modal title={editingFolder ? "重命名文件夹" : "新建文件夹"} open={folderDialogOpen} onCancel={() => setFolderDialogOpen(false)} onOk={saveFolder} okText="保存" cancelText="取消" destroyOnHidden>
                <Input value={folderName} autoFocus placeholder="输入文件夹名称" onChange={(event) => setFolderName(event.target.value)} onPressEnter={saveFolder} />
            </Modal>

            <Modal title="批量移动文件夹" open={bulkMoveOpen} onCancel={() => setBulkMoveOpen(false)} onOk={applyBulkMove} okText="移动" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-500">将 {selectedAssets.length} 个素材移动到：</div>
                    <Select className="w-full" allowClear placeholder="未分组" value={bulkMoveFolderId} options={folderOptions} onChange={(value) => setBulkMoveFolderId(value || undefined)} />
                </div>
            </Modal>

            <Modal title="批量添加标签" open={bulkTagOpen} onCancel={() => setBulkTagOpen(false)} onOk={applyBulkTags} okText="添加" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-500">为 {selectedAssets.length} 个素材追加标签，已有标签会保留并自动去重。</div>
                    <Select mode="tags" className="w-full" placeholder="输入标签后回车" value={bulkTags} onChange={(value) => setBulkTags(value)} />
                </div>
            </Modal>

            <Modal title="批量删除素材" open={bulkDeleteOpen} onCancel={() => setBulkDeleteOpen(false)} onOk={applyBulkDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消" destroyOnHidden>
                确定删除已选择的 {selectedAssets.length} 个素材吗？删除后会从我的素材中移除。
            </Modal>

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </div>
    );
}
