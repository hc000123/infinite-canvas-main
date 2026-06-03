"use client";

import { CheckCircle, Copy, Download, Eye, PencilLine, RefreshCw, Search, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Card, Drawer, Empty, Form, Image, Input, Modal, Pagination, Select, Space, Tag, Tooltip, Typography } from "antd";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes, readFileAsDataUrl } from "@/lib/image-utils";
import { fetchVolcengineAssetStatus, submitVolcengineImageAsset } from "@/services/api/volcengine-assets";
import { uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { buildVolcengineImageFilename, isVolcengineReviewProcessing, mergeVolcengineReviewStatus, shouldShowVolcengineReviewAction, volcengineReviewMetadataFromSubmission, volcengineReviewPollingKey } from "@/services/volcengine-asset-metadata";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetKind, type AudioAsset, type ImageAsset, type VideoAsset, type VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";

type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
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
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const token = useUserStore((state) => state.token);
    const volcengineAssetEnabled = useConfigStore((state) => state.publicSettings?.volcengineAsset?.enabled === true);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
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
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const tags = Form.useWatch("tags", form) || [];
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"), [assets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);
    const processingReviewIds = useMemo(() => volcengineReviewPollingKey(validAssets), [validAssets]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setMediaDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", tags: [], source: "手动添加", note: "", content: "" });
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
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else {
            if (!mediaDraft) {
                message.error(values.kind === "video" ? "请选择视频文件" : "请选择音频文件");
                return;
            }
            const asset = { ...base, kind: values.kind, data: mediaDraft } as Parameters<typeof addAsset>[0];
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
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

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
    };

    const importAssetFile = async (file?: File) => {
        if (!file) return;
        try {
            if (file.type.startsWith("image/")) {
                const image = await uploadImage(file);
                addAsset({
                    kind: "image",
                    title: fileTitle(file.name),
                    coverUrl: image.url,
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
                message.success("图片已导入");
                return;
            }
            if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                const kind = file.type.startsWith("video/") ? "video" : "audio";
                const media = await uploadMediaFile(file, kind);
                const asset =
                    kind === "video"
                        ? {
                              kind,
                              title: fileTitle(file.name),
                              coverUrl: "",
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
                              kind,
                              title: fileTitle(file.name),
                              coverUrl: "",
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
                addAsset(asset as Parameters<typeof addAsset>[0]);
                message.success(kind === "video" ? "视频已导入" : "音频已导入");
                return;
            }
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(`已导入 ${importedAssets.length} 个素材`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包或媒体文件");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    const updateVolcengineMetadata = (asset: ImageAsset, volcengineAsset: VolcengineAssetMetadata) => {
        const metadata = {
            ...(asset.metadata || {}),
            volcengineAsset,
        };
        updateAsset(asset.id, { metadata });
        setPreviewAsset((current) => (current?.id === asset.id ? ({ ...current, metadata } as Asset) : current));
    };

    const submitImageReview = async (asset: Asset) => {
        if (asset.kind !== "image") return;
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
            const storedBlob = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
            const blob = storedBlob || (await fetchImageBlob(asset.data.dataUrl));
            if (!blob) {
                message.error("没有找到图片文件");
                return;
            }
            const saved = asset.metadata?.volcengineAsset;
            const result = await submitVolcengineImageAsset(token, {
                file: blob,
                filename: buildVolcengineImageFilename(asset.title, asset.id, asset.data.mimeType),
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
        if (asset.kind !== "image" || !asset.metadata?.volcengineAsset?.assetId) return;
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
                if (asset.kind === "image" && isVolcengineReviewProcessing(asset.metadata?.volcengineAsset)) {
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
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
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
                            <div className="flex flex-wrap gap-4">
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={() => void exportAllAssets()}
                                >
                                    导出素材
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300"
                                    onClick={() => assetInputRef.current?.click()}
                                >
                                    导入素材
                                </button>
                                <button type="button" className="cursor-pointer text-sm font-medium text-stone-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline dark:text-stone-300" onClick={openCreate}>
                                    新增素材
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex max-w-7xl flex-col gap-5">
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleAssets.map((asset) => (
                            <AssetCard
                                key={asset.id}
                                asset={asset}
                                refreshingReview={refreshingReviewId === asset.id}
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
                refreshingReview={previewAsset ? refreshingReviewId === previewAsset.id : false}
                onClose={() => setPreviewAsset(null)}
                onCopy={copyAssetText}
                onDownload={downloadMedia}
                submittingReview={previewAsset ? submittingReviewId === previewAsset.id : false}
                onReview={(asset) => void submitImageReview(asset)}
                onRefreshReview={(asset) => void refreshImageReview(asset)}
            />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip,image/*,video/*,audio/*" className="hidden" onChange={(event) => void importAssetFile(event.target.files?.[0])} />

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </div>
    );
}

function AssetCard({
    asset,
    refreshingReview,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    submittingReview,
    onReview,
    onRefreshReview,
}: {
    asset: Asset;
    refreshingReview: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    submittingReview: boolean;
    onReview: () => void;
    onRefreshReview: () => void;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);
    const openOnKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
    };
    return (
        <Card
            hoverable
            className="overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <div role="button" tabIndex={0} className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400" onClick={onOpen} onKeyDown={openOnKeyboard}>
                    {cover ? (
                        <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-stone-100 p-5 text-center text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                </div>
            }
        >
            <div role="button" tabIndex={0} className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400" onClick={onOpen} onKeyDown={openOnKeyboard}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{asset.title}</h2>
                            <Typography.Text type="secondary" className="mt-1 block text-xs">
                                {asset.source || "未标注来源"}
                            </Typography.Text>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <Tag className="m-0 text-[11px]">{assetKindLabel(asset.kind)}</Tag>
                            {asset.kind === "image" && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </div>
                    </div>
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 3 }} className="!mb-0 !mt-2 !text-xs !leading-5">
                        {summary}
                    </Typography.Paragraph>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {(asset.tags || []).slice(0, 3).map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                        {!asset.tags?.length ? <Tag className="m-0 text-[11px]">无标签</Tag> : null}
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-4">
                <div className="flex min-w-0 items-center gap-1">
                    <AssetIconButton title="查看" icon={<Eye className="size-3.5" />} onClick={onOpen} />
                    <AssetIconButton title="编辑" icon={<PencilLine className="size-3.5" />} onClick={onEdit} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {asset.kind === "text" ? <AssetIconButton title="复制" icon={<Copy className="size-3.5" />} onClick={() => void onCopy(asset)} /> : null}
                    {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? <AssetIconButton title="下载" icon={<Download className="size-3.5" />} onClick={() => onDownload(asset)} /> : null}
                    {shouldShowVolcengineReviewAction(asset.kind) ? (
                        asset.metadata?.volcengineAsset?.assetId ? (
                            <AssetIconButton
                                title={volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                icon={<RefreshCw className={`size-3.5 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />}
                                loading={refreshingReview}
                                onClick={onRefreshReview}
                            />
                        ) : (
                            <AssetIconButton title="加白" icon={<ShieldCheck className="size-3.5" />} loading={submittingReview} onClick={onReview} />
                        )
                    ) : null}
                    <AssetIconButton title="删除" icon={<Trash2 className="size-3.5" />} danger onClick={onDelete} />
                </div>
            </div>
        </Card>
    );
}

function AssetIconButton({ title, icon, danger, loading, onClick }: { title: string; icon: ReactNode; danger?: boolean; loading?: boolean; onClick: () => void }) {
    return (
        <Tooltip title={title}>
            <Button type="text" size="small" className="!h-8 !w-8 !min-w-8 !p-0" danger={danger} icon={icon} loading={loading} onClick={onClick} aria-label={title} />
        </Tooltip>
    );
}

function AssetDrawer({
    asset,
    refreshingReview,
    onClose,
    onCopy,
    onDownload,
    submittingReview,
    onReview,
    onRefreshReview,
}: {
    asset: Asset | null;
    refreshingReview: boolean;
    onClose: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    submittingReview: boolean;
    onReview: (asset: Asset) => void;
    onRefreshReview: (asset: Asset) => void;
}) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    return (
        <Drawer title="素材详情" open={Boolean(asset)} size="large" onClose={onClose}>
            {asset ? (
                <div className="space-y-5">
                    {cover ? (
                        <Image src={cover} alt={asset.title} className="rounded-lg" />
                    ) : (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{assetKindLabel(asset.kind)}</Tag>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                            {asset.kind === "image" && asset.metadata?.volcengineAsset ? <VolcengineAssetTag status={asset.metadata.volcengineAsset.status} /> : null}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <Typography.Text type="secondary" className="block text-xs">
                            内容
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "video" ? (
                            <video src={asset.data.url} controls className="mt-2 aspect-video w-full rounded-lg bg-black" />
                        ) : asset.kind === "audio" ? (
                            <audio src={asset.data.url} controls className="mt-2 w-full" />
                        ) : (
                            <Typography.Text className="mt-2 block">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text type="secondary">备注</Typography.Text>
                            <Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    <Space wrap>
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                复制文本
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {assetKindDownloadLabel(asset.kind)}
                            </Button>
                        ) : null}
                        {shouldShowVolcengineReviewAction(asset.kind) ? (
                            asset.metadata?.volcengineAsset?.assetId ? (
                                <Button icon={<RefreshCw className={`size-4 ${isVolcengineReviewProcessing(asset.metadata.volcengineAsset) && !refreshingReview ? "animate-spin" : ""}`} />} loading={refreshingReview} onClick={() => onRefreshReview(asset)}>
                                    {volcengineReviewActionLabel(asset.metadata.volcengineAsset.status)}
                                </Button>
                            ) : (
                                <Button icon={<ShieldCheck className="size-4" />} loading={submittingReview} onClick={() => onReview(asset)}>
                                    提交加白
                                </Button>
                            )
                        ) : null}
                    </Space>
                    {asset.kind === "image" && asset.metadata?.volcengineAsset ? (
                        <div className="rounded-lg border border-stone-200 p-4 text-sm dark:border-stone-800">
                            <Typography.Text type="secondary" className="block text-xs">
                                火山素材
                            </Typography.Text>
                            <Typography.Paragraph copyable className="!mb-0 !mt-2">
                                {asset.metadata.volcengineAsset.assetId}
                            </Typography.Paragraph>
                            <Typography.Text type="secondary" className="block text-xs">
                                素材组：{asset.metadata.volcengineAsset.groupId} · 项目：{asset.metadata.volcengineAsset.projectName}
                            </Typography.Text>
                            {asset.metadata.volcengineAsset.error ? (
                                <Typography.Text type="danger" className="mt-2 block break-words text-xs">
                                    失败原因：{asset.metadata.volcengineAsset.error}
                                </Typography.Text>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </Drawer>
    );
}

function VolcengineAssetTag({ status }: { status: string }) {
    if (status === "Active")
        return (
            <Tag color="success" className="m-0 shrink-0 text-[11px]" icon={<CheckCircle className="size-3" />}>
                已加白
            </Tag>
        );
    if (status === "Failed")
        return (
            <Tag color="error" className="m-0 shrink-0 text-[11px]">
                审核失败
            </Tag>
        );
    return (
        <Tag color="processing" className="m-0 shrink-0 text-[11px]">
            审核中
        </Tag>
    );
}

function volcengineStatusLabel(status: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}

function volcengineReviewActionLabel(status: string) {
    if (status === "Processing") return "自动刷新中";
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    return "查看状态";
}

async function fetchImageBlob(url: string) {
    if (!url) return null;
    const response = await fetch(url);
    return response.blob();
}

function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "audio") return `${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

function assetKindLabel(kind: AssetKind) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "文本";
}

function assetKindDownloadLabel(kind: AssetKind) {
    if (kind === "video") return "下载视频";
    if (kind === "audio") return "下载音频";
    return "下载图片";
}

function fileTitle(filename: string) {
    return filename.replace(/\.[^.]+$/, "") || "未命名素材";
}
