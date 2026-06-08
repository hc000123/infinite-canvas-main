"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Drawer, Empty, Select, Segmented, Space } from "antd";
import { Plus, Sparkles } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import type { CanvasProject } from "../stores/use-canvas-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import {
    buildAssetBreakdownAssetMetadata,
    buildAssetBreakdownProductionBibleAssetRefs,
    matchProductionBibleItem,
    type AssetBreakdownItem,
    type AssetBreakdownKind,
    type AssetBreakdownWriteInput,
} from "../utils/asset-breakdown";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { itemsForProductionBibleProject, type ProductionBibleItem } from "../utils/production-bible";
import { AssetBreakdownCard } from "./asset-breakdown-card";
import { AssetBreakdownFormModal, assetBreakdownDefaultKind, assetBreakdownKindOptionsWithAll, type AssetBreakdownFormValues } from "./asset-breakdown-form-modal";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases: CanvasProject[];
    onClose: () => void;
};

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

    const submitItem = (values: AssetBreakdownFormValues) => {
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
                <Segmented value={kindFilter} onChange={(value) => setKindFilter(value as AssetBreakdownKind | "all")} options={assetBreakdownKindOptionsWithAll()} />
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
                                message.success("已生成 Brief 草案；主流程请到单集生图需求审核台确认");
                            }}
                            onBindAssets={(assetIds) => bindItemAssets(item, assetIds)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资产拆解条目，可先从本集剧本整理草案。" className="py-20" />
            )}

            <AssetBreakdownFormModal open={formOpen} editingItem={editingItem} defaultKind={assetBreakdownDefaultKind(kindFilter)} assets={assets} bibleItems={projectBibleItems} onCancel={() => setFormOpen(false)} onSubmit={submitItem} />
        </Drawer>
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
