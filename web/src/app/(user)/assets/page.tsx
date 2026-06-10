"use client";

import { Download, FolderPlus, Library, PencilLine, Plus, Search, Trash2, Upload } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { App, Button, Checkbox, Empty, Form, Input, Modal, Pagination, Select, Tag } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { readFileAsDataUrl } from "@/lib/image-utils";
import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { buildVolcengineMediaFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetFolder, type AssetKind, type ImageAsset, type VideoAsset, type VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { assetGenerationFilterOptions } from "./asset-generation";
import { buildProjectLibraryAssetPatch, buildRemoveProjectLibraryAssetPatch } from "./asset-project-library";
import { assetVersionRecords, buildAssetVersionedUpdatePatch, buildRestoreAssetVersionPatch, type AssetVersionRecord } from "./asset-version-history";
import {
    collectOutdatedAssetVersionUsages,
    outdatedUsageLabel,
    selectedOutdatedUsageSummary,
    updateCanvasProjectAssetReferenceToLatest,
    updateProductionBibleAssetReferenceToLatest,
    updateStoryboardShotAssetReferenceToLatest,
    type OutdatedAssetVersionUsage,
} from "./asset-version-outdated-references";
import { collectAssetVersionUsageReferences } from "./asset-version-references";
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
    type ProjectLibraryFilter,
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

type AssetPatch = Partial<Omit<Asset, "id" | "createdAt">>;
type ReferenceVersionFilter = "all" | "outdated";

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
    const updateCanvasProject = useCanvasStore((state) => state.updateProject);
    const updateStoryboardShot = useStoryboardStore((state) => state.updateShot);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const addAsset = useAssetStore((state) => state.addAsset);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const addFolder = useAssetStore((state) => state.addFolder);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
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
    const [projectLibraryFilter, setProjectLibraryFilter] = useState<ProjectLibraryFilter>("all");
    const canvasLibraryFilter = "";
    const [referenceVersionFilter, setReferenceVersionFilter] = useState<ReferenceVersionFilter>("all");
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
    const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
    const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string | undefined>();
    const [bulkTagOpen, setBulkTagOpen] = useState(false);
    const [bulkTags, setBulkTags] = useState<string[]>([]);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkReviewAction, setBulkReviewAction] = useState<"submit" | "refresh" | "">("");
    const [selectedOutdatedUsageIds, setSelectedOutdatedUsageIds] = useState<Set<string>>(() => new Set());
    const [bulkOutdatedOpen, setBulkOutdatedOpen] = useState(false);
    const activeFolderId = activeAssetFolderId(folderFilter);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => supportedAssetList(assets), [assets]);
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const folderCounts = useMemo(() => countFolderAssets(validAssets), [validAssets]);
    const regularFolders = useMemo(() => folders.filter((folder) => !folder.projectId), [folders]);
    const projectFolderRows = useMemo(
        () =>
            creativeProjects
                .map((project) => ({ project, folder: folders.find((folder) => folder.projectId === project.id) }))
                .filter((item): item is { project: (typeof creativeProjects)[number]; folder: AssetFolder } => Boolean(item.folder)),
        [creativeProjects, folders],
    );
    const folderOptions = useMemo(
        () => [
            { label: "未分组", value: "" },
            ...projectFolderRows.map(({ project, folder }) => ({ label: `项目 / ${project.title || folder.name}`, value: folder.id })),
            ...regularFolders.map((folder) => ({ label: folder.name, value: folder.id })),
        ],
        [projectFolderRows, regularFolders],
    );
    const canvasLibraryTitles = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.title || "未命名画布"])), [projects]);
    const projectContexts = useMemo(() => buildAssetProjectContexts(creativeProjects, projects), [creativeProjects, projects]);
    const projectLibraryProjectTitles = useMemo(() => Object.fromEntries(projectContexts.map((project) => [project.id, project.title])), [projectContexts]);
    const previewAssetUsageReferences = useMemo(() => {
        if (!previewAsset) return [];
        return collectAssetVersionUsageReferences(previewAsset, {
            canvasProjects: projects,
            storyboardGroups,
            storyboardShots,
            productionBibleItems,
            projectTitles: projectLibraryProjectTitles,
        });
    }, [previewAsset, productionBibleItems, projectLibraryProjectTitles, projects, storyboardGroups, storyboardShots]);
    const storyboardGroupOptions = useMemo(
        () =>
            storyboardGroups
                .filter((group) => !projectContextFilter || group.projectId === projectContextFilter)
                .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"))
                .map((group) => ({ label: group.title || "未命名分镜组", value: group.id })),
        [projectContextFilter, storyboardGroups],
    );
    const generationFilterOptions = useMemo(() => assetGenerationFilterOptions(validAssets), [validAssets]);
    const projectReferencedAssetIds = useMemo(() => {
        return collectProjectReferencedAssetIds(projectContextFilter, productionBibleItems, storyboardGroups, storyboardShots);
    }, [productionBibleItems, projectContextFilter, storyboardGroups, storyboardShots]);
    const storyboardGroupAssetIds = useMemo(() => collectStoryboardGroupReferencedAssetIds(storyboardGroupFilter, storyboardShots), [storyboardGroupFilter, storyboardShots]);
    const outdatedAssetVersionUsages = useMemo(
        () =>
            collectOutdatedAssetVersionUsages(
                validAssets,
                {
                    canvasProjects: projects,
                    storyboardGroups,
                    storyboardShots,
                    productionBibleItems,
                    projectTitles: projectLibraryProjectTitles,
                },
                projectContextFilter,
            ),
        [validAssets, projects, storyboardGroups, storyboardShots, productionBibleItems, projectLibraryProjectTitles, projectContextFilter],
    );
    const selectedOutdatedUsageItems = useMemo(() => outdatedAssetVersionUsages.filter((usage) => selectedOutdatedUsageIds.has(usage.id)), [outdatedAssetVersionUsages, selectedOutdatedUsageIds]);
    const selectedOutdatedUsageConfirmItems = useMemo(() => selectedOutdatedUsageSummary(outdatedAssetVersionUsages, selectedOutdatedUsageIds), [outdatedAssetVersionUsages, selectedOutdatedUsageIds]);

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
                projectLibraryFilter,
                canvasLibraryFilter,
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
        projectLibraryFilter,
        canvasLibraryFilter,
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
        creativeProjects.forEach((project) => ensureProjectFolder(project.id, project.title || "未命名项目"));
    }, [creativeProjects, ensureProjectFolder]);

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
        const projectFolder = projectFolderRows.find((item) => item.project.id === nextProjectId)?.folder;
        setProjectContextFilter(nextProjectId);
        if (projectFolder) setFolderFilter(projectFolder.id);
    }, [projectFolderRows, searchParams]);

    useEffect(() => {
        if (storyboardGroupFilter && !storyboardGroupOptions.some((option) => option.value === storyboardGroupFilter)) setStoryboardGroupFilter("");
    }, [storyboardGroupFilter, storyboardGroupOptions]);

    useEffect(() => {
        if (!projectContextFilter && projectLibraryFilter !== "all") setProjectLibraryFilter("all");
    }, [projectContextFilter, projectLibraryFilter]);

    useEffect(() => {
        if (!projectContextFilter && referenceVersionFilter !== "all") setReferenceVersionFilter("all");
    }, [projectContextFilter, referenceVersionFilter]);

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

    useEffect(() => {
        const existingIds = new Set(outdatedAssetVersionUsages.map((usage) => usage.id));
        setSelectedOutdatedUsageIds((current) => {
            let changed = false;
            const next = new Set<string>();
            current.forEach((id) => {
                if (existingIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : current;
        });
    }, [outdatedAssetVersionUsages]);

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
            editingAsset ? updateEditedAsset(editingAsset, asset) : addAsset(asset);
        } else if (values.kind === "image") {
            if (!imageDraft) {
                message.error("请选择图片文件");
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            editingAsset ? updateEditedAsset(editingAsset, asset) : await addAssetOnce(asset);
        } else {
            if (!mediaDraft) {
                message.error(values.kind === "video" ? "请选择视频文件" : "请选择音频文件");
                return;
            }
            const asset = { ...base, kind: values.kind, data: mediaDraft } as Parameters<typeof addAsset>[0];
            editingAsset ? updateEditedAsset(editingAsset, asset) : await addAssetOnce(asset);
        }

        message.success(editingAsset ? "素材已更新" : "素材已保存");
        setIsAssetOpen(false);
    };

    const updateEditedAsset = (current: Asset, patch: Parameters<typeof addAsset>[0]) => {
        updateAsset(current.id, buildAssetVersionedUpdatePatch(current, patch, new Date().toISOString()));
    };

    const restoreAssetVersion = async (asset: Asset, versionId: string) => {
        const now = new Date().toISOString();
        const patch = buildRestoreAssetVersionPatch(asset, versionId, now);
        if (!patch) {
            message.error("无法恢复该版本");
            return;
        }
        const resolvedPatch = await resolveRestoredAssetPatch(patch);
        updateAsset(asset.id, resolvedPatch);
        setPreviewAsset((current) => (current?.id === asset.id ? ({ ...current, ...resolvedPatch, metadata: { ...(current.metadata || {}), ...(resolvedPatch.metadata || {}) }, updatedAt: now } as Asset) : current));
        message.success("已恢复素材版本");
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

    const downloadAssetVersion = async (asset: Asset, versionId: string) => {
        const version = assetVersionRecords(asset).find((item) => item.id === versionId);
        if (!version) {
            message.error("没有找到该版本");
            return;
        }
        const target = await resolveAssetVersionDownloadTarget(version);
        if (!target) {
            message.error("该版本没有可下载的本地文件");
            return;
        }
        saveAs(target, assetVersionFileName(asset, version));
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

    const toggleOutdatedUsageSelected = (usageId: string) => {
        setSelectedOutdatedUsageIds((current) => {
            const next = new Set(current);
            if (next.has(usageId)) next.delete(usageId);
            else next.add(usageId);
            return next;
        });
    };

    const selectAllOutdatedUsages = () => {
        setSelectedOutdatedUsageIds(new Set(outdatedAssetVersionUsages.map((usage) => usage.id)));
    };

    const clearSelectedOutdatedUsages = () => {
        setSelectedOutdatedUsageIds(new Set());
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

    const addSelectedToProjectLibrary = () => {
        if (!projectContextFilter) return message.warning("请先选择项目文件夹");
        if (!selectedAssets.length) return message.warning("请先选择素材");
        const now = new Date().toISOString();
        selectedAssets.forEach((asset) => updateAsset(asset.id, buildProjectLibraryAssetPatch(asset, projectContextFilter, now)));
        message.success(`已加入项目共享库：${selectedAssets.length} 个素材`);
    };

    const removeSelectedFromProjectLibrary = () => {
        if (!projectContextFilter) return message.warning("请先选择项目文件夹");
        if (!selectedAssets.length) return message.warning("请先选择素材");
        selectedAssets.forEach((asset) => updateAsset(asset.id, buildRemoveProjectLibraryAssetPatch(asset, projectContextFilter)));
        message.success(`已移出项目共享库：${selectedAssets.length} 个素材`);
    };

    const updateOutdatedUsageToLatest = (usage: OutdatedAssetVersionUsage) => {
        const updated = applyOutdatedUsageUpdates([usage]);
        if (updated) message.success("已更新到素材最新版");
        else message.warning("没有可更新的引用");
    };

    const applySelectedOutdatedUsages = () => {
        const updated = applyOutdatedUsageUpdates(selectedOutdatedUsageItems);
        setBulkOutdatedOpen(false);
        if (updated) message.success(`已更新 ${updated} 处引用到最新版`);
        else message.warning("没有可更新的引用");
    };

    const applyOutdatedUsageUpdates = (usages: OutdatedAssetVersionUsage[]) => {
        const assetsById = new Map(validAssets.map((asset) => [asset.id, asset]));
        const now = new Date().toISOString();
        let updated = 0;
        for (const usage of usages) {
            const asset = assetsById.get(usage.assetId);
            if (!asset) continue;
            if (usage.kind === "canvas-node") {
                const canvasId = canvasProjectIdFromUsage(usage);
                const project = projects.find((item) => item.id === canvasId);
                if (!project) continue;
                const next = updateCanvasProjectAssetReferenceToLatest(project, usage, asset, now);
                if (next !== project) {
                    updateCanvasProject(project.id, { nodes: next.nodes });
                    updated += 1;
                }
            } else if (usage.kind === "storyboard-shot") {
                const shot = storyboardShots.find((item) => item.id === usage.objectId);
                if (!shot) continue;
                const next = updateStoryboardShotAssetReferenceToLatest(shot, usage, asset, now);
                if (next !== shot) {
                    updateStoryboardShot(shot.id, { assetRefs: next.assetRefs });
                    updated += 1;
                }
            } else {
                const item = productionBibleItems.find((entry) => entry.id === usage.objectId);
                if (!item) continue;
                const next = updateProductionBibleAssetReferenceToLatest(item, usage, asset, now);
                if (next !== item) {
                    updateProductionBibleItem(item.id, { assetRefs: next.assetRefs });
                    updated += 1;
                }
            }
        }
        if (updated) {
            setSelectedOutdatedUsageIds((current) => {
                const next = new Set(current);
                usages.forEach((usage) => next.delete(usage.id));
                return next;
            });
        }
        return updated;
    };

    const importAssetFiles = async (files?: FileList | File[]) => {
        const fileList = importableAssetFiles(files);
        if (!fileList.length) {
            message.warning("请选择图片、视频、音频或素材压缩包");
            return;
        }
        try {
            const result = await importAssetFileList(fileList, { folderId: activeFolderId, addAssetOnce });
            setPage(1);
            message.success(assetImportSuccessMessage(result.count, activeFolderId ? folderMap.get(activeFolderId)?.name || "当前文件夹" : ""));
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
        <div className="flex h-full flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <main
                className="studio-shell relative min-h-0 flex-1 overflow-y-auto px-6 py-8"
                onDragEnter={handleUploadDragEnter}
                onDragLeave={handleUploadDragLeave}
                onDragOver={handleUploadDragOver}
                onDrop={handleUploadDrop}
            >
                {isDraggingUpload ? (
                    <div className="pointer-events-none fixed inset-0 z-[1000] grid place-items-center bg-[rgba(15,17,23,.72)] backdrop-blur-sm">
                        <div className="studio-panel grid min-h-40 w-[min(420px,calc(100vw-48px))] place-items-center border-2 border-dashed border-[var(--studio-accent)] p-8 text-center">
                            <div>
                                <Upload className="mx-auto size-8 text-[var(--studio-accent)]" />
                                <div className="mt-3 text-sm font-medium text-[var(--studio-text-primary)]">松开上传{activeFolderId ? `到「${folderMap.get(activeFolderId)?.name || "当前文件夹"}」` : ""}</div>
                            </div>
                        </div>
                    </div>
                ) : null}
                <div className="mx-auto max-w-7xl pb-8">
                    <header className="flex flex-col gap-5 border-b border-[var(--studio-border-subtle)] pb-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-accent)]">Asset Library</div>
                            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">我的素材</h1>
                            <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[var(--studio-text-secondary)]">统一管理图片、视频、音频与文本资产，快速定位项目文件夹、引用关系和生成来源。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button className="studio-toolbar-button" icon={<Download className="size-4" />} onClick={() => void exportAllAssets()}>
                                导出全部
                            </Button>
                            <Button className="studio-toolbar-button" icon={<Upload className="size-4" />} onClick={() => assetInputRef.current?.click()}>
                                导入素材
                            </Button>
                            <Button className="studio-primary-action" type="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
                                新增素材
                            </Button>
                        </div>
                    </header>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center">
                        <Input
                            className="studio-command-input w-full"
                            size="large"
                            allowClear
                            prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                        />
                        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--studio-text-secondary)] lg:justify-end">
                            <span className="font-medium text-[var(--studio-text-primary)]">{filteredAssets.length}</span>
                            <span>个素材匹配当前条件</span>
                            <span className="h-4 w-px bg-[var(--studio-border-subtle)]" />
                            <span>{selectedAssets.length} 个已选</span>
                        </div>
                    </div>

                    <div className="studio-panel-muted mt-5 grid gap-4 p-5 text-left">
                        <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-center">
                            <div className="text-sm font-medium text-[var(--studio-text-secondary)]">类型</div>
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
                        <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-center">
                            <div className="text-sm font-medium text-[var(--studio-text-secondary)]">项目</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag.CheckableTag
                                    checked={!projectContextFilter && folderFilter === "all"}
                                    className={cn("prompt-filter-tag", !projectContextFilter && folderFilter === "all" && "is-active")}
                                    onChange={() => {
                                        setPage(1);
                                        setProjectContextFilter("");
                                        setFolderFilter("all");
                                        setStoryboardGroupFilter("");
                                        setProjectLibraryFilter("all");
                                        setReferenceVersionFilter("all");
                                        clearSelectedOutdatedUsages();
                                    }}
                                >
                                    全部项目 {validAssets.length}
                                </Tag.CheckableTag>
                                {projectFolderRows.map(({ project, folder }) => (
                                    <Tag.CheckableTag
                                        key={project.id}
                                        checked={folderFilter === folder.id}
                                        className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            setProjectContextFilter(project.id);
                                            setFolderFilter(folder.id);
                                            setStoryboardGroupFilter("");
                                            setProjectLibraryFilter("all");
                                            setReferenceVersionFilter("all");
                                            clearSelectedOutdatedUsages();
                                        }}
                                    >
                                        {project.title || folder.name} {folderCounts[folder.id] || 0}
                                    </Tag.CheckableTag>
                                ))}
                                <Select
                                    size="middle"
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
                                <Select
                                    size="middle"
                                    className="min-w-36"
                                    value={projectLibraryFilter}
                                    disabled={!projectContextFilter}
                                    options={[
                                        { label: "项目库：全部", value: "all" },
                                        { label: "仅项目库", value: "shared" },
                                        { label: "未入项目库", value: "not_shared" },
                                    ]}
                                    onChange={(value) => {
                                        setPage(1);
                                        setProjectLibraryFilter(value as ProjectLibraryFilter);
                                    }}
                                />
                                <Select
                                    size="middle"
                                    className="min-w-36"
                                    value={referenceVersionFilter}
                                    disabled={!projectContextFilter}
                                    options={[
                                        { label: "引用：全部", value: "all" },
                                        { label: `过期引用${outdatedAssetVersionUsages.length ? ` ${outdatedAssetVersionUsages.length}` : ""}`, value: "outdated" },
                                    ]}
                                    onChange={(value) => {
                                        setPage(1);
                                        setReferenceVersionFilter(value as ReferenceVersionFilter);
                                        clearSelectedOutdatedUsages();
                                    }}
                                />
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-1 text-sm font-medium text-[var(--studio-text-secondary)]">文件夹</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag.CheckableTag
                                    checked={folderFilter === "all"}
                                    className={cn("prompt-filter-tag", folderFilter === "all" && "is-active")}
                                    onChange={() => {
                                        setPage(1);
                                        setProjectContextFilter("");
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
                                        setProjectContextFilter("");
                                        setFolderFilter("root");
                                    }}
                                >
                                    未分组 {folderCounts.root || 0}
                                </Tag.CheckableTag>
                                {regularFolders.map((folder) => (
                                    <Tag.CheckableTag
                                        key={folder.id}
                                        checked={folderFilter === folder.id}
                                        className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                        onChange={() => {
                                            setPage(1);
                                            setProjectContextFilter("");
                                            setFolderFilter(folder.id);
                                        }}
                                    >
                                        {folder.name} {folderCounts[folder.id] || 0}
                                    </Tag.CheckableTag>
                                ))}
                                <Button size="middle" icon={<FolderPlus className="size-3.5" />} onClick={openCreateFolder}>
                                    新建文件夹
                                </Button>
                                {activeFolderId && regularFolders.some((folder) => folder.id === activeFolderId) ? (
                                    <>
                                        <AssetIconButton title="重命名文件夹" icon={<PencilLine className="size-3.5" />} onClick={() => openEditFolder(folderMap.get(activeFolderId)!)} />
                                        <AssetIconButton title="删除文件夹" icon={<Trash2 className="size-3.5" />} danger onClick={() => deleteFolder(folderMap.get(activeFolderId)!)} />
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
                            <div className="pt-1 text-sm font-medium text-[var(--studio-text-secondary)]">生成</div>
                            <div className="grid gap-2 md:grid-cols-4">
                                <Select
                                    size="middle"
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
                                    size="middle"
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
                                    size="middle"
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
                                    size="middle"
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
                    {referenceVersionFilter === "outdated" ? (
                        <OutdatedReferencesPanel
                            usages={outdatedAssetVersionUsages}
                            selectedIds={selectedOutdatedUsageIds}
                            onToggle={toggleOutdatedUsageSelected}
                            onSelectAll={selectAllOutdatedUsages}
                            onClear={clearSelectedOutdatedUsages}
                            onUpdateOne={updateOutdatedUsageToLatest}
                            onOpenBatch={() => setBulkOutdatedOpen(true)}
                        />
                    ) : null}
                    {referenceVersionFilter !== "outdated" ? (
                        <div className="grid gap-3">
                            <div className="studio-panel flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 text-sm text-[var(--studio-text-secondary)]">
                                    当前筛选 <span className="font-semibold text-[var(--studio-text-primary)]">{filteredAssets.length}</span> 个素材
                                    {selectedInFilteredCount ? <span className="ml-2 text-[var(--studio-text-muted)]">已选 {selectedInFilteredCount} 个</span> : null}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                    <Select
                                        size="middle"
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
                                    <Button size="middle" disabled={!filteredAssets.length || allFilteredSelected} onClick={selectFilteredAssets}>
                                        全选当前结果
                                    </Button>
                                </div>
                            </div>
                            {selectedAssets.length ? (
                                <div className="studio-panel flex flex-col gap-4 border-[var(--studio-accent-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-base font-semibold text-[var(--studio-text-primary)]">已选择 {selectedAssets.length} 个素材</div>
                                        <div className="mt-1 truncate text-[13px] text-[var(--studio-text-muted)]">{selectedAssetSummary}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <Button size="middle" icon={<Download className="size-3.5" />} onClick={() => void exportSelectedAssets()}>
                                            导出选中
                                        </Button>
                                        <Button size="middle" onClick={openBulkMove}>
                                            移动文件夹
                                        </Button>
                                        <Button size="middle" onClick={openBulkTag}>
                                            添加标签
                                        </Button>
                                        {projectContextFilter ? (
                                            <>
                                                <Button size="middle" icon={<Library className="size-3.5" />} onClick={addSelectedToProjectLibrary}>
                                                    发送到项目库
                                                </Button>
                                                <Button size="middle" onClick={removeSelectedFromProjectLibrary}>
                                                    移出项目库
                                                </Button>
                                            </>
                                        ) : null}
                                        <Button size="middle" disabled={!selectedVolcengineSubmitAssets.length || bulkReviewAction !== ""} loading={bulkReviewAction === "submit"} onClick={() => void submitSelectedVolcengineReviews()}>
                                            提交加白{selectedVolcengineSubmitAssets.length ? ` ${selectedVolcengineSubmitAssets.length}` : ""}
                                        </Button>
                                        <Button size="middle" disabled={!selectedVolcengineRefreshAssets.length || bulkReviewAction !== ""} loading={bulkReviewAction === "refresh"} onClick={() => void refreshSelectedVolcengineReviews()}>
                                            刷新加白{selectedVolcengineRefreshAssets.length ? ` ${selectedVolcengineRefreshAssets.length}` : ""}
                                        </Button>
                                        <Button size="middle" danger icon={<Trash2 className="size-3.5" />} onClick={openBulkDelete}>
                                            删除选中
                                        </Button>
                                        <Button size="middle" onClick={clearSelectedAssets}>
                                            清空选择
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {referenceVersionFilter !== "outdated" ? (
                        <>
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
                                        projectLibraryProjectId={projectContextFilter}
                                        canvasLibraryCanvasId={canvasLibraryFilter}
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
                        </>
                    ) : null}
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
                projectLibraryProjectTitles={projectLibraryProjectTitles}
                canvasLibraryTitles={canvasLibraryTitles}
                usageReferences={previewAssetUsageReferences}
                onDownloadVersion={(asset, versionId) => void downloadAssetVersion(asset, versionId)}
                onRestoreVersion={(asset, versionId) => void restoreAssetVersion(asset, versionId)}
            />

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

            <Modal title="批量更新过期引用" open={bulkOutdatedOpen} onCancel={() => setBulkOutdatedOpen(false)} onOk={applySelectedOutdatedUsages} okText="更新到最新版" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-600 dark:text-stone-300">将更新以下 {selectedOutdatedUsageConfirmItems.length} 处引用。更新只修改引用方记录，不修改素材本体。</div>
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                        {selectedOutdatedUsageConfirmItems.map((usage) => (
                            <div key={usage.id} className="rounded-md bg-stone-50 px-3 py-2 text-sm dark:bg-stone-900/70">
                                <div className="font-medium text-stone-900 dark:text-stone-100">{usage.label}</div>
                                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                    v{usage.currentVersionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </div>
    );
}

async function resolveRestoredAssetPatch(patch: AssetPatch): Promise<AssetPatch> {
    const data = patch.data as Record<string, unknown> | undefined;
    const storageKey = typeof data?.storageKey === "string" ? data.storageKey : "";
    if (patch.kind === "image" && storageKey) {
        const dataUrl = await resolveImageUrl(storageKey, typeof data?.dataUrl === "string" ? data.dataUrl : "");
        return { ...patch, coverUrl: patch.coverUrl || dataUrl, data: { ...data, dataUrl } } as AssetPatch;
    }
    if ((patch.kind === "video" || patch.kind === "audio") && storageKey) {
        const url = await resolveMediaUrl(storageKey, typeof data?.url === "string" ? data.url : "");
        return { ...patch, data: { ...data, url } } as AssetPatch;
    }
    return patch;
}

async function resolveAssetVersionDownloadTarget(version: AssetVersionRecord) {
    if (version.kind === "text") return new Blob([readVersionString(version.data.content)], { type: "text/plain;charset=utf-8" });
    const storageKey = readVersionString(version.data.storageKey);
    if (version.kind === "image") {
        if (storageKey) {
            const blob = await getImageBlob(storageKey);
            if (blob) return blob;
        }
        return readVersionString(version.data.dataUrl) || version.coverUrl;
    }
    if (storageKey) {
        const blob = await getMediaBlob(storageKey);
        if (blob) return blob;
    }
    return readVersionString(version.data.url);
}

function assetVersionFileName(asset: Asset, version: AssetVersionRecord) {
    const mimeType = readVersionString(version.data.mimeType);
    const extension = mimeType.split("/")[1] || (version.kind === "text" ? "txt" : "bin");
    return `${safeFileName(asset.title || version.title || "asset")}-v${version.versionNumber}.${extension}`;
}

function canvasProjectIdFromUsage(usage: OutdatedAssetVersionUsage) {
    return usage.id.startsWith("canvas:") ? usage.id.split(":")[1] || "" : "";
}

function readVersionString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]+/g, "_").trim() || "asset";
}

function OutdatedReferencesPanel({
    usages,
    selectedIds,
    onToggle,
    onSelectAll,
    onClear,
    onUpdateOne,
    onOpenBatch,
}: {
    usages: OutdatedAssetVersionUsage[];
    selectedIds: Set<string>;
    onToggle: (usageId: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onUpdateOne: (usage: OutdatedAssetVersionUsage) => void;
    onOpenBatch: () => void;
}) {
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">过期引用 {usages.length} 处</div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">只会更新画布节点、分镜条目或设定库绑定中的版本引用，不修改素材本体。</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="middle" disabled={!usages.length || selectedIds.size === usages.length} onClick={onSelectAll}>
                        全选
                    </Button>
                    <Button size="middle" disabled={!selectedIds.size} onClick={onClear}>
                        清空
                    </Button>
                    <Button size="middle" type="primary" disabled={!selectedIds.size} onClick={onOpenBatch}>
                        批量更新{selectedIds.size ? ` ${selectedIds.size}` : ""}
                    </Button>
                </div>
            </div>
            <div className="mt-3 space-y-2">
                {usages.map((usage) => (
                    <div key={usage.id} className="flex flex-col gap-3 rounded-md border border-stone-200 bg-background px-3 py-3 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Checkbox checked={selectedIds.has(usage.id)} onChange={() => onToggle(usage.id)} />
                                <Tag className="m-0">{outdatedUsageKindLabel(usage)}</Tag>
                                <span className="font-medium text-stone-900 dark:text-stone-100">{usage.objectTitle}</span>
                                <Tag color="gold">
                                    v{usage.assetVersion?.versionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </Tag>
                            </div>
                            <div className="mt-1 break-words pl-7 text-xs text-stone-500 dark:text-stone-400">{[usage.projectTitle, usage.contextTitle, outdatedUsageRoleLabel(usage), `素材：${usage.assetTitle}`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Button size="middle" onClick={() => onUpdateOne(usage)}>
                            更新到最新版
                        </Button>
                    </div>
                ))}
                {!usages.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目没有过期素材引用" className="py-10" /> : null}
            </div>
        </div>
    );
}

function outdatedUsageKindLabel(usage: OutdatedAssetVersionUsage) {
    if (usage.kind === "canvas-node") return "画布节点";
    if (usage.kind === "storyboard-shot") return "分镜条目";
    if (usage.objectType === "character") return "设定库角色";
    if (usage.objectType === "scene") return "设定库场景";
    if (usage.objectType === "prop") return "设定库道具";
    return "设定库";
}

function outdatedUsageRoleLabel(usage: OutdatedAssetVersionUsage) {
    if (usage.kind === "canvas-node") return usage.role ? `${usage.role} 节点` : "";
    return usage.role || usage.objectType || "";
}
