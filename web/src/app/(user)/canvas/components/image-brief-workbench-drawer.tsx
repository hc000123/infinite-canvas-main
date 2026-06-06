"use client";

import { useMemo, useState } from "react";
import { App, Button, Drawer, Empty, Modal, Select, Segmented } from "antd";
import { Download, Plus } from "lucide-react";
import { saveAs } from "file-saver";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { buildImageBriefExportCsv, buildImageBriefExportJson, imageBriefExportFileName, imageBriefExportViewLabel, type ImageBriefExportView } from "../utils/image-brief-export";
import {
    buildImageBriefPrimaryAssetBreakdownPatch,
    buildImageBriefPrimaryAssetPatch,
    buildProductionBibleBriefPrimaryAssetRefs,
    imageBriefGenerationGate,
    type ImageBrief,
    type ImageBriefKind,
    type ImageBriefReferenceAsset,
    type ImageBriefWriteInput,
} from "../utils/image-brief";
import type { CanvasProject } from "../stores/use-canvas-store";
import { ImageBriefCard, ImageBriefFormModal, imageBriefKindOptions, type ImageBriefFormValues, valuesForImageBriefFields } from "./image-brief-workbench-components";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases?: CanvasProject[];
    onCreateImageConfig?: (brief: ImageBrief, canvasId?: string) => void;
    onOpenAsset?: (asset: Asset) => void;
    onClose: () => void;
};

export function ImageBriefWorkbenchDrawer({ open, projectId, projectTitle, canvases = [], onCreateImageConfig, onOpenAsset, onClose }: Props) {
    const { message } = App.useApp();
    const briefs = useImageBriefStore((state) => state.briefs);
    const addBrief = useImageBriefStore((state) => state.addBrief);
    const updateBrief = useImageBriefStore((state) => state.updateBrief);
    const removeBrief = useImageBriefStore((state) => state.removeBrief);
    const assetBreakdownItems = useAssetBreakdownStore((state) => state.items);
    const updateAssetBreakdownItem = useAssetBreakdownStore((state) => state.updateItem);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const updateProductionBibleItem = useProductionBibleStore((state) => state.updateItem);
    const assets = useAssetStore((state) => state.assets);
    const [kindFilter, setKindFilter] = useState<ImageBriefKind | "all">("all");
    const [editingBrief, setEditingBrief] = useState<ImageBrief | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [targetCanvasId, setTargetCanvasId] = useState("");
    const [exportView, setExportView] = useState<ImageBriefExportView>("art_direction");
    const projectBriefs = useMemo(() => briefs.filter((brief) => brief.projectId === projectId && (kindFilter === "all" || brief.kind === kindFilter)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [briefs, kindFilter, projectId]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

    const startCreate = () => {
        setEditingBrief(null);
        setFormOpen(true);
    };

    const copyPrompt = async (brief: ImageBrief) => {
        await navigator.clipboard.writeText(brief.finalPrompt || brief.prompt);
        message.success("已复制最终提示词");
    };

    const createImageConfig = (brief: ImageBrief) => {
        const gate = imageBriefGenerationGate(brief);
        if (!gate.allowed) {
            message.error(gate.messages.join(" / ") || "Brief 校验未通过，无法用于生图");
            return;
        }
        const run = () => {
            onCreateImageConfig?.(brief, targetCanvasId || brief.canvasId || canvases[0]?.id);
            message.success("已创建图片生成配置节点");
        };
        if (gate.needsConfirmation) {
            Modal.confirm({
                title: "Brief 仍有提醒项，继续用于生图？",
                content: gate.messages.join(" / ") || "当前 Brief 未完全补齐，但提醒模式允许继续。",
                okText: "继续",
                cancelText: "取消",
                onOk: run,
            });
            return;
        }
        run();
    };

    const submitBrief = (values: ImageBriefFormValues) => {
        const canvas = canvases.find((item) => item.id === values.canvasId);
        const fields = valuesForImageBriefFields(values, values.kind);
        const referenceAssets = (values.referenceAssetIds || []).flatMap((assetId): ImageBriefReferenceAsset[] => {
            const asset = assetsById.get(assetId);
            if (!asset) return [];
            return [{ assetId, kind: asset.kind, role: "reference" }];
        });
        const payload: ImageBriefWriteInput = {
            projectId,
            canvasId: canvas?.id || editingBrief?.canvasId || "",
            episodeId: canvas?.episodeId || editingBrief?.episodeId || "",
            episodeTitle: canvas?.episodeTitle || editingBrief?.episodeTitle || "",
            sourceType: editingBrief?.sourceType || "manual",
            sourceId: editingBrief?.sourceId || "",
            kind: values.kind,
            mode: values.mode,
            title: values.title,
            scriptText: values.scriptText || "",
            fields,
            referenceAssets,
            finalPrompt: values.finalPrompt || "",
            resultAssetIds: editingBrief?.resultAssetIds || [],
            metadata: editingBrief?.metadata,
        };
        if (editingBrief) updateBrief(editingBrief.id, payload);
        else addBrief(payload);
        setFormOpen(false);
        message.success("Brief 已保存");
    };

    const setPrimaryAsset = (brief: ImageBrief, assetId: string) => {
        updateBrief(brief.id, buildImageBriefPrimaryAssetPatch(brief, assetId));
        message.success("已更新主参考图");
    };

    const syncPrimaryAsset = (brief: ImageBrief, assetId: string) => {
        const assetBreakdownItemId = brief.metadata?.assetBreakdownItemId;
        const productionBibleItemId = brief.metadata?.productionBibleItemId;
        if (assetBreakdownItemId) {
            const item = assetBreakdownItems.find((entry) => entry.id === assetBreakdownItemId);
            if (item) updateAssetBreakdownItem(item.id, buildImageBriefPrimaryAssetBreakdownPatch(item, assetId));
        }
        if (productionBibleItemId) {
            const item = productionBibleItems.find((entry) => entry.id === productionBibleItemId);
            if (item) {
                const refs = buildProductionBibleBriefPrimaryAssetRefs(item, assetId).assetRefs;
                updateProductionBibleItem(item.id, { assetRefs: preserveOrCreateAssetVersionReferences(refs, assets, item.assetRefs) });
            }
        }
        if (!assetBreakdownItemId && !productionBibleItemId) {
            message.info("这个 Brief 没有关联资产拆解或设定库来源");
            return;
        }
        message.success("已同步主参考到来源");
    };

    const downloadBriefExport = (format: "csv" | "json") => {
        if (!projectBriefs.length) {
            message.warning("当前没有可导出的 Brief");
            return;
        }
        const content = format === "csv" ? buildImageBriefExportCsv(projectBriefs, assets, exportView) : buildImageBriefExportJson(projectBriefs, assets, exportView);
        const type = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
        saveAs(new Blob([content], { type }), imageBriefExportFileName(projectTitle, exportView, format));
        message.success(`已导出${imageBriefExportViewLabel(exportView)}`);
    };

    return (
        <Drawer
            title="生图 Brief 工作台"
            open={open}
            onClose={onClose}
            size={920}
            destroyOnHidden
            extra={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={startCreate}>
                    新增 Brief
                </Button>
            }
        >
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前项目：{projectTitle}</div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Segmented value={kindFilter} onChange={(value) => setKindFilter(value as ImageBriefKind | "all")} options={[{ label: "全部", value: "all" }, ...imageBriefKindOptions]} />
                {onCreateImageConfig ? (
                    <Select
                        className="min-w-60"
                        allowClear
                        placeholder="配置节点目标画布"
                        value={targetCanvasId || undefined}
                        options={canvases.map((canvas) => ({ label: canvas.title, value: canvas.id }))}
                        onChange={(value) => setTargetCanvasId(value || "")}
                    />
                ) : null}
                <Select
                    className="min-w-44"
                    value={exportView}
                    options={[
                        { label: "美术设定表", value: "art_direction" },
                        { label: "生图提示词表", value: "prompt_sheet" },
                        { label: "分镜资产表", value: "storyboard_assets" },
                    ]}
                    onChange={(value) => setExportView(value)}
                />
                <Button icon={<Download className="size-4" />} onClick={() => downloadBriefExport("csv")}>
                    导出 CSV
                </Button>
                <Button onClick={() => downloadBriefExport("json")}>导出 JSON</Button>
            </div>
            {projectBriefs.length ? (
                <div className="space-y-3">
                    {projectBriefs.map((brief) => (
                        <ImageBriefCard
                            key={brief.id}
                            brief={brief}
                            assetsById={assetsById}
                            onCopy={() => void copyPrompt(brief)}
                            onCreateImageConfig={onCreateImageConfig ? () => createImageConfig(brief) : undefined}
                            onOpenAsset={onOpenAsset}
                            onSetPrimary={(assetId) => setPrimaryAsset(brief, assetId)}
                            onSyncPrimary={(assetId) => syncPrimaryAsset(brief, assetId)}
                            onEdit={() => {
                                setEditingBrief(brief);
                                setFormOpen(true);
                            }}
                            onDelete={() => removeBrief(brief.id)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生图 Brief，可从资产拆解、设定库、分镜组或手动新增。" className="py-20" />
            )}
            <ImageBriefFormModal open={formOpen} editingBrief={editingBrief} canvases={canvases} assets={assets} onCancel={() => setFormOpen(false)} onSubmit={submitBrief} />
        </Drawer>
    );
}
