"use client";

import { BookOpen, Download, FolderPlus, PencilLine, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { App, Button, Empty, Form, Input, Modal, Pagination, Select, Space, Tag, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes, readFileAsDataUrl } from "@/lib/image-utils";
import { fetchVolcengineAssetStatus, submitVolcengineMediaAsset } from "@/services/api/volcengine-assets";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { buildVolcengineMediaFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetFolder, type AssetKind, type AudioAsset, type ImageAsset, type VideoAsset, type VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { ProductionBibleDrawer } from "../canvas/components/production-bible-drawer";
import { useProductionBibleStore } from "../canvas/stores/use-production-bible-store";
import { useStoryboardStore } from "../canvas/stores/use-storyboard-store";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { assetGenerationFilterOptions, assetMatchesGenerationFilters } from "./asset-generation";
import { assetFileKind, assetSearchText, countFolderAssets, fetchImageBlob, fileTitle, hasImportableDragItems, isImportableAssetFile, volcengineStatusLabel } from "./asset-utils";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { AssetCard, AssetIconButton } from "./components/asset-card";
import { AssetDrawer } from "./components/asset-drawer";

type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    folderId?: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

type ImageDraft = ImageAsset["data"] | null;
type MediaDraft = VideoAsset["data"] | AudioAsset["data"] | null;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function AssetsPage() {
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
    const activeFolderId = folderFilter !== "all" && folderFilter !== "root" ? folderFilter : undefined;
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"), [assets]);
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const folderCounts = useMemo(() => countFolderAssets(validAssets), [validAssets]);
    const folderOptions = useMemo(() => [{ label: "未分组", value: "" }, ...folders.map((folder) => ({ label: folder.name, value: folder.id }))], [folders]);
    const projectContexts = useMemo(() => {
        const creativeIds = new Set(creativeProjects.map((project) => project.id));
        return [
            ...creativeProjects.map((project) => ({ id: project.id, title: project.title || "未命名项目" })),
            ...projects.filter((project) => !creativeIds.has(project.id)).map((project) => ({ id: project.id, title: `${project.title || "未命名画布"}（旧画布）` })),
        ];
    }, [creativeProjects, projects]);
    const projectOptions = useMemo(() => projectContexts.map((project) => ({ label: project.title, value: project.id })), [projectContexts]);
    const selectedProductionBibleProject = useMemo(
        () => projectContexts.find((project) => project.id === (projectContextFilter || productionBibleProjectId)) || projectContexts[0] || null,
        [projectContexts, productionBibleProjectId, projectContextFilter],
    );
    const generationFilterOptions = useMemo(() => assetGenerationFilterOptions(validAssets), [validAssets]);
    const projectReferencedAssetIds = useMemo(() => {
        if (!projectContextFilter) return new Set<string>();
        const groupIds = new Set(storyboardGroups.filter((group) => group.projectId === projectContextFilter).map((group) => group.id));
        return new Set<string>([
            ...productionBibleItems.filter((item) => item.projectId === projectContextFilter).flatMap((item) => item.assetRefs.map((ref) => ref.assetId)),
            ...storyboardShots.filter((shot) => groupIds.has(shot.groupId)).flatMap((shot) => shot.assetRefs.map((ref) => ref.assetId)),
        ]);
    }, [productionBibleItems, projectContextFilter, storyboardGroups, storyboardShots]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (folderFilter === "root" && asset.folderId) return false;
            if (activeFolderId && asset.folderId !== activeFolderId) return false;
            if (
                !assetMatchesGenerationFilters(asset, {
                    source: generationSourceFilter,
                    action: generationActionFilter,
                    modelProvider: generationModelProviderFilter,
                    taskId: generationTaskFilter,
                    projectId: projectContextFilter || undefined,
                    referencedAssetIds: projectReferencedAssetIds,
                })
            )
                return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter, folderFilter, activeFolderId, generationSourceFilter, generationActionFilter, generationModelProviderFilter, generationTaskFilter, projectContextFilter, projectReferencedAssetIds]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);
    const selectedAssets = useMemo(() => validAssets.filter((asset) => selectedAssetIds.has(asset.id)), [validAssets, selectedAssetIds]);
    const selectedInFilteredCount = useMemo(() => filteredAssets.filter((asset) => selectedAssetIds.has(asset.id)).length, [filteredAssets, selectedAssetIds]);
    const allFilteredSelected = filteredAssets.length > 0 && selectedInFilteredCount === filteredAssets.length;
    const selectedAssetSummary = useMemo(() => {
        if (!selectedAssets.length) return "未选择素材";
        const names = selectedAssets
            .slice(0, 3)
            .map((asset) => asset.title || "未命名素材")
            .join("、");
        return selectedAssets.length > 3 ? `${names} 等 ${selectedAssets.length} 个` : names;
    }, [selectedAssets]);
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

    const importAssetFiles = async (files?: FileList | File[]) => {
        const fileList = Array.from(files || []).filter((file) => isImportableAssetFile(file));
        if (!fileList.length) {
            message.warning("请选择图片、视频、音频或素材压缩包");
            return;
        }
        try {
            let count = 0;
            for (const file of fileList) {
                count += await importAssetFile(file, activeFolderId);
            }
            setPage(1);
            message.success(`已导入 ${count} 个素材${activeFolderId ? `到「${folderMap.get(activeFolderId)?.name || "当前文件夹"}」` : ""}`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包或媒体文件");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const importAssetFile = async (file: File, folderId?: string) => {
        const fileKind = assetFileKind(file);
        if (fileKind === "image") {
            const image = await uploadImage(file);
            await addAssetOnce({
                kind: "image",
                title: fileTitle(file.name),
                coverUrl: image.url,
                folderId,
                tags: [],
                source: "本地导入",
                note: "",
                metadata: { source: "import" },
                data: {
                    dataUrl: image.url,
                    storageKey: image.storageKey,
                    width: image.width,
                    height: image.height,
                    bytes: image.bytes,
                    mimeType: image.mimeType,
                },
            });
            return 1;
        }
        if (fileKind === "video" || fileKind === "audio") {
            const media = await uploadMediaFile(file, fileKind);
            const asset =
                fileKind === "video"
                    ? {
                          kind: fileKind,
                          title: fileTitle(file.name),
                          coverUrl: "",
                          folderId,
                          tags: [],
                          source: "本地导入",
                          note: "",
                          metadata: { source: "import" },
                          data: {
                              url: media.url,
                              storageKey: media.storageKey,
                              width: media.width || 1280,
                              height: media.height || 720,
                              bytes: media.bytes,
                              mimeType: media.mimeType,
                          },
                      }
                    : {
                          kind: fileKind,
                          title: fileTitle(file.name),
                          coverUrl: "",
                          folderId,
                          tags: [],
                          source: "本地导入",
                          note: "",
                          metadata: { source: "import" },
                          data: {
                              url: media.url,
                              storageKey: media.storageKey,
                              bytes: media.bytes,
                              mimeType: media.mimeType,
                          },
                      };
            await addAssetOnce(asset as Parameters<typeof addAssetOnce>[0]);
            return 1;
        }
        const importedAssets = await readAssetPackage(file);
        for (const asset of importedAssets) {
            const payload = { ...asset } as Record<string, unknown>;
            delete payload.id;
            delete payload.createdAt;
            delete payload.updatedAt;
            if (folderId) payload.folderId = folderId;
            else delete payload.folderId;
            await addAssetOnce(payload as Parameters<typeof addAssetOnce>[0]);
        }
        return importedAssets.length;
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
            const storedBlob = asset.data.storageKey ? (asset.kind === "image" ? await getImageBlob(asset.data.storageKey) : await getMediaBlob(asset.data.storageKey)) : null;
            const blob = storedBlob || (await fetchImageBlob(asset.kind === "image" ? asset.data.dataUrl : asset.data.url));
            if (!blob) {
                message.error(asset.kind === "image" ? "没有找到图片文件" : "没有找到视频文件");
                return;
            }
            const saved = asset.metadata?.volcengineAsset;
            const result = await submitVolcengineMediaAsset(token, {
                file: blob,
                filename: buildVolcengineMediaFilename(asset.title, asset.id, asset.data.mimeType, asset.kind),
                assetTitle: asset.title,
                groupId: saved?.groupId,
                groupName: asset.title || "我的素材",
            });
            updateVolcengineMetadata(asset, volcengineReviewMetadataFromSubmission(result));
            message.success("已提交火山审核");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交失败");
        } finally {
            setSubmittingReviewId(null);
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
                            <Button size="small" disabled={!filteredAssets.length || allFilteredSelected} onClick={selectFilteredAssets}>
                                全选当前结果
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

            <Modal title={editingAsset ? "编辑素材" : "新增素材"} open={isAssetOpen} width={980} onCancel={() => setIsAssetOpen(false)} onOk={() => void saveAsset()} okText="保存" cancelText="取消" destroyOnHidden>
                <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "text", tags: [] }}>
                        <Form.Item name="kind" label="类型">
                            <Select
                                options={[
                                    { label: "文本", value: "text" },
                                    { label: "图片", value: "image" },
                                    { label: "视频", value: "video" },
                                    { label: "音频", value: "audio" },
                                ]}
                                onChange={(value) => {
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
                                }}
                            />
                        </Form.Item>
                        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input size="large" placeholder="给素材起一个容易检索的名字" />
                        </Form.Item>
                        <Form.Item name="folderId" label="文件夹">
                            <Select options={folderOptions} />
                        </Form.Item>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Space.Compact className="w-full">
                                <Input placeholder="可粘贴图片 URL，也可以上传本地封面" />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    上传
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label="来源">
                                <Input placeholder="手动添加 / 画布 / 提示词库" />
                            </Form.Item>
                            <Form.Item name="note" label="备注">
                                <Input placeholder="可选" />
                            </Form.Item>
                        </div>
                        {formKind === "text" ? (
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
                            </Form.Item>
                        ) : formKind === "image" ? (
                            <Form.Item label="图片内容" required>
                                <div className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
                                    <Button icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        选择图片文件
                                    </Button>
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            未选择图片
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        ) : (
                            <Form.Item label={formKind === "video" ? "视频内容" : "音频内容"} required>
                                <div className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
                                    <Button icon={<Upload className="size-4" />} onClick={() => mediaInputRef.current?.click()}>
                                        {formKind === "video" ? "选择视频文件" : "选择音频文件"}
                                    </Button>
                                    {mediaDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {formatBytes(mediaDraft.bytes)} · {mediaDraft.mimeType}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {formKind === "video" ? "未选择视频" : "未选择音频"}
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950">
                        <Typography.Text strong>预览</Typography.Text>
                        <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
                            {formKind === "video" && mediaDraft ? (
                                <video src={mediaDraft.url} controls className="aspect-[4/3] w-full bg-black object-contain" />
                            ) : formKind === "audio" && mediaDraft ? (
                                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 dark:bg-stone-900">
                                    <audio src={mediaDraft.url} controls className="w-full" />
                                </div>
                            ) : coverUrl || imageDraft?.dataUrl ? (
                                <img src={coverUrl || imageDraft?.dataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                            ) : (
                                <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm text-stone-500 dark:bg-stone-900">{content || "暂无封面"}</div>
                            )}
                            <div className="p-4">
                                <Typography.Text strong ellipsis className="block">
                                    {title || "未命名素材"}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag) => (
                                            <Tag key={tag} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">未打标签</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={mediaInputRef}
                    type="file"
                    accept={formKind === "audio" ? "audio/*" : "video/*"}
                    className="hidden"
                    onChange={(event) => {
                        void readMediaFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>

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

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </div>
    );
}
