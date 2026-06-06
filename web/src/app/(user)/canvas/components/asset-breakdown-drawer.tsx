"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Empty, Form, Input, Modal, Popconfirm, Select, Segmented, Space, Tag } from "antd";
import { FileText, Link2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import type { CanvasProject } from "../stores/use-canvas-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import {
    assetBreakdownKindLabel,
    buildAssetBreakdownAssetMetadata,
    buildAssetBreakdownProductionBibleAssetRefs,
    matchProductionBibleItem,
    productionBibleKindForAssetBreakdown,
    type AssetBreakdownItem,
    type AssetBreakdownKind,
    type AssetBreakdownWriteInput,
} from "../utils/asset-breakdown";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { itemsForProductionBibleProject, productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases: CanvasProject[];
    onClose: () => void;
};

type FormValues = {
    kind: AssetBreakdownKind;
    name: string;
    description?: string;
    sourceText?: string;
    tags?: string[];
    productionBibleItemId?: string;
    assetIds?: string[];
};

const kindOptions: Array<{ label: string; value: AssetBreakdownKind }> = [
    { label: "角色", value: "character" },
    { label: "场景", value: "scene" },
    { label: "道具", value: "prop" },
    { label: "风格 / 光影", value: "style" },
];

export function AssetBreakdownDrawer({ open, projectId, projectTitle, canvases, onClose }: Props) {
    const { message } = App.useApp();
    const boundCanvases = useMemo(() => canvases.filter((canvas) => canvas.episodeId && canvas.scriptSnapshot), [canvases]);
    const [activeCanvasId, setActiveCanvasId] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetBreakdownKind | "all">("all");
    const [editingItem, setEditingItem] = useState<AssetBreakdownItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const breakdownItems = useAssetBreakdownStore((state) => state.items);
    const addItem = useAssetBreakdownStore((state) => state.addItem);
    const updateItem = useAssetBreakdownStore((state) => state.updateItem);
    const removeItem = useAssetBreakdownStore((state) => state.removeItem);
    const generateDraftsFromScript = useAssetBreakdownStore((state) => state.generateDraftsFromScript);
    const createBriefDraft = useAssetBreakdownStore((state) => state.createBriefDraft);
    const bindAssets = useAssetBreakdownStore((state) => state.bindAssets);
    const createImageBriefFromAssetBreakdown = useImageBriefStore((state) => state.createFromAssetBreakdown);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const assets = useAssetStore((state) => state.assets);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const activeCanvas = boundCanvases.find((canvas) => canvas.id === activeCanvasId) || boundCanvases[0];
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(productionBibleItems, projectId), [productionBibleItems, projectId]);
    const visibleItems = useMemo(
        () => breakdownItems.filter((item) => item.projectId === projectId && (!activeCanvas || item.episodeId === activeCanvas.episodeId) && (kindFilter === "all" || item.kind === kindFilter)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        [activeCanvas, breakdownItems, kindFilter, projectId],
    );

    useEffect(() => {
        if (!open) return;
        setActiveCanvasId((current) => (current && boundCanvases.some((canvas) => canvas.id === current) ? current : boundCanvases[0]?.id || ""));
    }, [boundCanvases, open]);

    const generateDrafts = () => {
        if (!activeCanvas?.episodeId || !activeCanvas.scriptSnapshot) return message.warning("请先选择已绑定本集剧本的画布");
        const count = generateDraftsFromScript({
            projectId,
            canvasId: activeCanvas.id,
            episodeId: activeCanvas.episodeId,
            episodeTitle: activeCanvas.episodeTitle || canvasEpisodeLabel(activeCanvas),
            scriptId: activeCanvas.scriptId || projectId,
            scriptText: activeCanvas.scriptSnapshot,
        });
        message.success(`已整理 ${count} 条资产草案`);
    };

    const startCreate = () => {
        if (!activeCanvas?.episodeId) return message.warning("请先选择已绑定本集剧本的画布");
        setEditingItem(null);
        setFormOpen(true);
    };

    const submitItem = (values: FormValues) => {
        if (!activeCanvas?.episodeId) return;
        const payload: AssetBreakdownWriteInput = {
            projectId,
            canvasId: activeCanvas.id,
            episodeId: activeCanvas.episodeId,
            episodeTitle: activeCanvas.episodeTitle || canvasEpisodeLabel(activeCanvas),
            scriptId: activeCanvas.scriptId || projectId,
            kind: values.kind,
            name: values.name,
            description: values.description || "",
            sourceText: values.sourceText || "",
            tags: values.tags || [],
            productionBibleItemId: values.productionBibleItemId,
            assetIds: values.assetIds || [],
            status: values.assetIds?.length ? "linked" : values.productionBibleItemId ? "linked" : editingItem?.status || "draft",
        };
        if (editingItem) updateItem(editingItem.id, payload);
        else addItem(payload);
        if (editingItem && values.assetIds?.length) syncAssetBindings({ item: { ...editingItem, ...payload }, assetIds: values.assetIds, assets, updateAsset, projectBibleItems, updateProductionBibleItem });
        setFormOpen(false);
    };

    const bindItemAssets = (item: AssetBreakdownItem, assetIds: string[]) => {
        bindAssets(item.id, assetIds);
        syncAssetBindings({ item, assetIds, assets, updateAsset, projectBibleItems, updateProductionBibleItem });
        message.success("已绑定素材并回写资产拆解");
    };

    return (
        <Drawer
            title="本集资产拆解"
            open={open}
            onClose={onClose}
            size={860}
            destroyOnHidden
            extra={
                <Space>
                    <Button icon={<Sparkles className="size-4" />} onClick={generateDrafts} disabled={!activeCanvas}>
                        从剧本整理草案
                    </Button>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={startCreate} disabled={!activeCanvas}>
                        新增资产
                    </Button>
                </Space>
            }
        >
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前项目：{projectTitle}</div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Select
                    className="min-w-72"
                    placeholder="选择已绑定本集剧本的画布"
                    value={activeCanvas?.id}
                    options={boundCanvases.map((canvas) => ({ label: `${canvasEpisodeLabel(canvas)} · ${canvas.title}`, value: canvas.id }))}
                    onChange={setActiveCanvasId}
                />
                <Segmented value={kindFilter} onChange={(value) => setKindFilter(value as AssetBreakdownKind | "all")} options={[{ label: "全部", value: "all" }, ...kindOptions]} />
            </div>

            {!boundCanvases.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目还没有绑定本集剧本的画布，请先新建画布并绑定或导入本集剧本。" className="py-20" />
            ) : visibleItems.length ? (
                <div className="space-y-3">
                    {visibleItems.map((item) => (
                        <AssetBreakdownCard
                            key={item.id}
                            item={item}
                            assets={assets}
                            bibleItems={projectBibleItems}
                            onEdit={() => {
                                setEditingItem(item);
                                setFormOpen(true);
                            }}
                            onDelete={() => removeItem(item.id)}
                            onMatchBible={() => {
                                const matched = matchProductionBibleItem(item, projectBibleItems);
                                if (!matched) return message.warning("没有找到同名设定库条目");
                                updateItem(item.id, { productionBibleItemId: matched.id, status: "linked" });
                            }}
                            onBrief={() => {
                                createBriefDraft(item.id);
                                const briefId = createImageBriefFromAssetBreakdown(item);
                                updateItem(item.id, { briefId, status: "brief_ready" });
                                message.success("已创建生图 Brief");
                            }}
                            onBindAssets={(assetIds) => bindItemAssets(item, assetIds)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资产拆解条目，可先从本集剧本整理草案。" className="py-20" />
            )}

            <AssetBreakdownFormModal open={formOpen} editingItem={editingItem} defaultKind={kindFilter === "all" ? "character" : kindFilter} assets={assets} bibleItems={projectBibleItems} onCancel={() => setFormOpen(false)} onSubmit={submitItem} />
        </Drawer>
    );
}

function AssetBreakdownCard({
    item,
    assets,
    bibleItems,
    onEdit,
    onDelete,
    onMatchBible,
    onBrief,
    onBindAssets,
}: {
    item: AssetBreakdownItem;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onEdit: () => void;
    onDelete: () => void;
    onMatchBible: () => void;
    onBrief: () => void;
    onBindAssets: (assetIds: string[]) => void;
}) {
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const bibleItem = bibleItems.find((bible) => bible.id === item.productionBibleItemId);
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Tag className="m-0">{kindOptions.find((option) => option.value === item.kind)?.label}</Tag>
                    <span className="truncate">{item.name}</span>
                    <Tag className="m-0">{statusLabel(item.status)}</Tag>
                </div>
            }
            extra={
                <Space size={4}>
                    <Button size="small" type="text" icon={<FileText className="size-4" />} onClick={onBrief} />
                    <Button size="small" type="text" icon={<Link2 className="size-4" />} onClick={onMatchBible} disabled={item.kind === "style"} />
                    <Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={onEdit} />
                    <Popconfirm title="删除这个资产条目？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-3 text-sm">
                <p className="m-0 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{item.description || item.sourceText || "暂无描述"}</p>
                <Space size={[4, 4]} wrap>
                    {item.tags.map((tag) => (
                        <Tag key={tag} className="m-0">
                            {tag}
                        </Tag>
                    ))}
                    {bibleItem ? (
                        <Tag color="blue" className="m-0">
                            设定库：{productionBibleKindLabel(bibleItem.kind)} · {bibleItem.name}
                        </Tag>
                    ) : null}
                    {item.briefDraft ? (
                        <Tag color="purple" className="m-0">
                            Brief：{item.briefDraft.title}
                        </Tag>
                    ) : null}
                    {item.assetIds.map((assetId) => (
                        <Tag key={assetId} color="green" className="m-0">
                            素材：{assets.find((asset) => asset.id === assetId)?.title || assetId}
                        </Tag>
                    ))}
                </Space>
                {item.briefDraft ? <pre className="max-h-32 overflow-auto rounded bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-stone-900 dark:text-stone-400">{item.briefDraft.prompt}</pre> : null}
                <div className="flex flex-wrap items-center gap-2">
                    <Select mode="tags" className="min-w-72 flex-1" placeholder="选择或粘贴素材 ID 绑定到该资产" value={selectedAssetIds} options={assets.map((asset) => ({ label: asset.title, value: asset.id }))} onChange={setSelectedAssetIds} />
                    <Button size="small" disabled={!selectedAssetIds.length} onClick={() => onBindAssets(selectedAssetIds)}>
                        绑定素材
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function AssetBreakdownFormModal({
    open,
    editingItem,
    defaultKind,
    assets,
    bibleItems,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    editingItem: AssetBreakdownItem | null;
    defaultKind: AssetBreakdownKind;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onCancel: () => void;
    onSubmit: (values: FormValues) => void;
}) {
    const [form] = Form.useForm<FormValues>();
    const kind = Form.useWatch("kind", form) || defaultKind;
    const bibleKind = productionBibleKindForAssetBreakdown(kind);
    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            kind: editingItem?.kind || defaultKind,
            name: editingItem?.name || "",
            description: editingItem?.description || "",
            sourceText: editingItem?.sourceText || "",
            tags: editingItem?.tags || [],
            productionBibleItemId: editingItem?.productionBibleItemId,
            assetIds: editingItem?.assetIds || [],
        });
    }, [defaultKind, editingItem, form, open]);
    return (
        <Modal title={editingItem ? "编辑资产条目" : "新增资产条目"} open={open} onCancel={onCancel} onOk={() => void form.validateFields().then(onSubmit)} okText="保存" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="kind" label="资产类型">
                    <Select options={kindOptions} />
                </Form.Item>
                <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入资产名称" }]}>
                    <Input placeholder="例如：魏梁 / 大学操场 / 话筒 / 白天自然光" />
                </Form.Item>
                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="人工整理资产特征、服化道、场景氛围或参考要求" />
                </Form.Item>
                <Form.Item name="sourceText" label="剧本依据">
                    <Input.TextArea rows={3} placeholder="从剧本中摘录该资产出现的原文" />
                </Form.Item>
                <Form.Item name="tags" label="标签">
                    <Select mode="tags" tokenSeparators={[",", "，"]} />
                </Form.Item>
                <Form.Item name="productionBibleItemId" label="关联设定库">
                    <Select
                        allowClear
                        disabled={!bibleKind}
                        placeholder={bibleKind ? "选择已有设定库条目" : "风格 / 光影资产暂不关联设定库"}
                        options={bibleItems.filter((item) => item.kind === bibleKind).map((item) => ({ label: item.name, value: item.id }))}
                    />
                </Form.Item>
                <Form.Item name="assetIds" label="绑定素材">
                    <Select mode="tags" options={assets.map((asset) => ({ label: asset.title, value: asset.id }))} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

function syncAssetBindings({
    item,
    assetIds,
    assets,
    updateAsset,
    projectBibleItems,
    updateProductionBibleItem,
}: {
    item: AssetBreakdownItem;
    assetIds: string[];
    assets: Asset[];
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    projectBibleItems: ProductionBibleItem[];
    updateProductionBibleItem: (id: string, patch: Partial<Omit<ProductionBibleItem, "id" | "createdAt" | "updatedAt">>) => void;
}) {
    assetIds.forEach((assetId) => {
        const asset = assets.find((entry) => entry.id === assetId);
        if (!asset) return;
        updateAsset(assetId, {
            metadata: buildAssetBreakdownAssetMetadata(asset.metadata, item),
        });
    });
    const bibleItem = projectBibleItems.find((entry) => entry.id === item.productionBibleItemId);
    if (!bibleItem || !assetIds.length) return;
    const refs = buildAssetBreakdownProductionBibleAssetRefs(item, assetIds);
    updateProductionBibleItem(bibleItem.id, { assetRefs: preserveOrCreateAssetVersionReferences([...bibleItem.assetRefs, ...refs], assets, bibleItem.assetRefs) });
}

function statusLabel(status: AssetBreakdownItem["status"]) {
    if (status === "brief_ready") return "Brief 草稿";
    if (status === "generated") return "已生成";
    if (status === "linked") return "已关联";
    return "草稿";
}
