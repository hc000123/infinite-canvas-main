"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Drawer, Empty, Segmented } from "antd";
import { Plus } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences, updateAssetRefListToLatest } from "../../assets/asset-version-references";
import {
    itemsForProductionBibleProject,
    productionBibleKindLabel,
    productionBibleKindOptions,
    type ProductionBibleItem,
    type ProductionBibleKind,
} from "../utils/production-bible";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import type { CanvasProject } from "../stores/use-canvas-store";
import { ProductionBibleCard } from "./production-bible-card";
import { ProductionBibleFormModal } from "./production-bible-form-modal";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases?: CanvasProject[];
    initialKind?: ProductionBibleKind;
    onClose: () => void;
};

export function ProductionBibleDrawer({ open, projectId, projectTitle, canvases = [], initialKind, onClose }: Props) {
    const { message } = App.useApp();
    const [kind, setKind] = useState<ProductionBibleKind>("character");
    const [editingItem, setEditingItem] = useState<ProductionBibleItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const items = useProductionBibleStore((state) => state.items);
    const addItem = useProductionBibleStore((state) => state.addItem);
    const updateItem = useProductionBibleStore((state) => state.updateItem);
    const removeItem = useProductionBibleStore((state) => state.removeItem);
    const createBriefFromProductionBible = useImageBriefStore((state) => state.createFromProductionBible);
    const assets = useAssetStore((state) => state.assets);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const visibleItems = useMemo(() => itemsForProductionBibleProject(items, projectId, kind), [items, kind, projectId]);

    useEffect(() => {
        if (open && initialKind) setKind(initialKind);
    }, [initialKind, open]);

    const startCreate = () => {
        setEditingItem(null);
        setFormOpen(true);
    };

    const startEdit = (item: ProductionBibleItem) => {
        setEditingItem(item);
        setFormOpen(true);
    };

    return (
        <Drawer
            title="项目设定库"
            open={open}
            onClose={onClose}
            size={680}
            destroyOnHidden
            extra={
                <Button icon={<Plus className="size-4" />} type="primary" onClick={startCreate}>
                    新增设定
                </Button>
            }
        >
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前项目：{projectTitle}</div>
            <Segmented className="mb-4" value={kind} onChange={(value) => setKind(value as ProductionBibleKind)} options={productionBibleKindOptions.map((option) => ({ label: option.label, value: option.value }))} />

            {visibleItems.length ? (
                <div className="space-y-3">
                    {visibleItems.map((item) => (
                        <ProductionBibleCard
                            key={item.id}
                            item={item}
                            assetsById={assetsById}
                            onUpdateAssetRef={(assetId) => {
                                const asset = assetsById.get(assetId);
                                if (!asset) return;
                                updateItem(item.id, { assetRefs: updateAssetRefListToLatest(item.assetRefs, asset) });
                            }}
                            onCreateBrief={() => {
                                const canvas = canvases.find((item) => item.episodeId) || canvases[0];
                                createBriefFromProductionBible(item, { canvasId: canvas?.id, episodeId: canvas?.episodeId, episodeTitle: canvas?.episodeTitle });
                                message.success("已生成 Brief 草案；主流程请到单集生图需求审核台确认");
                            }}
                            onEdit={() => startEdit(item)}
                            onDelete={() => removeItem(item.id)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${productionBibleKindLabel(kind)}设定`} className="py-16" />
            )}

            <ProductionBibleFormModal
                open={formOpen}
                projectId={projectId}
                defaultKind={kind}
                editingItem={editingItem}
                assets={assets}
                onCancel={() => setFormOpen(false)}
                onSubmit={(values, assetRefs) => {
                    const versionedAssetRefs = preserveOrCreateAssetVersionReferences(assetRefs, assets, editingItem?.assetRefs || []);
                    const payload = {
                        projectId,
                        kind: values.kind,
                        name: values.name,
                        description: values.description || "",
                        tags: values.tags || [],
                        assetRefs: versionedAssetRefs,
                        promptSnippets: {
                            positive: values.positive || "",
                            negative: values.negative || "",
                            consistency: values.consistency || "",
                        },
                    };
                    if (editingItem) {
                        updateItem(editingItem.id, payload);
                    } else {
                        addItem(payload);
                    }
                    setKind(values.kind);
                    setFormOpen(false);
                }}
            />
        </Drawer>
    );
}
