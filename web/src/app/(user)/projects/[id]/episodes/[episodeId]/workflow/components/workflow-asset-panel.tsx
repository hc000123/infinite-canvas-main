"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Empty, Image, Segmented, Spin } from "antd";
import { CheckCircle2, Library, RefreshCw, TriangleAlert, WandSparkles } from "lucide-react";

import { workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

import type { useWorkflowAssetAutomation } from "../use-workflow-asset-automation";
import { useWorkflowAssetImageActions } from "../use-workflow-asset-image-actions";
import { buildWorkflowAssetCards, defaultWorkflowAssetSelection, workflowAssetCategoryCounts, workflowAssetEditPatch, type WorkflowAssetCategory } from "../workflow-asset-card-model";
import { mapAssetDesignArtifactToAssets } from "../workflow-artifact-mapping";
import { WorkflowAssetCard } from "./workflow-asset-card";

export function WorkflowAssetPanel(props: {
    artifact: RemoteWorkflowArtifact | null;
    automation?: ReturnType<typeof useWorkflowAssetAutomation>;
    episodeId: string;
    onApplied: () => void | Promise<void>;
    projectId: string;
    projectTitle: string;
    stage: RemoteWorkflowStageRun | null;
}) {
    const { message, modal } = App.useApp();
    const [filter, setFilter] = useState<WorkflowAssetCategory>("all");
    const [applying, setApplying] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [failed, setFailed] = useState<Record<string, string>>({});
    const selectionForArtifact = useRef("");
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const mapping = useMemo(() => mapAssetDesignArtifactToAssets(props.artifact?.contentJson || "", assets, { episodeId: props.episodeId, projectId: props.projectId }), [assets, props.artifact?.contentJson, props.episodeId, props.projectId]);
    const cards = useMemo(() => buildWorkflowAssetCards(mapping.items, assets), [assets, mapping.items]);
    const counts = useMemo(() => workflowAssetCategoryCounts(cards), [cards]);
    const visible = cards.filter((card) => filter === "all" || card.category === filter);
    const variants = cards.flatMap((card) => card.variants);
    const pendingCount = variants.filter((variant) => variant.asset?.kind !== "image").length;
    const imageActions = useWorkflowAssetImageActions();
    const automation = props.automation || { busy: false, message: cards.length ? "资产卡片已准备完成" : "正在准备资产卡片", retry: async () => undefined, status: cards.length ? ("ready" as const) : ("organizing" as const) };

    const materialize = useCallback(async () => {
        if (!props.artifact || !props.stage || props.stage.status !== "approved" || applying) return;
        setApplying(true);
        try {
            const folderId = ensureProjectFolder(props.projectId, props.projectTitle);
            const targetIds: string[] = [];
            for (const item of mapping.items) {
                const current = item.targetAssetId ? useAssetStore.getState().assets.find((asset) => asset.id === item.targetAssetId) : undefined;
                const currentWorkflow = readRecord(current?.metadata?.originalWorkflow);
                const manuallyEdited = currentWorkflow.manuallyEdited === true;
                const description = manuallyEdited ? readString(currentWorkflow.description) || item.description : item.description;
                const imagePrompt = manuallyEdited ? readString(currentWorkflow.imagePrompt) || workflowAssetPrompt(current) || item.imagePrompt : item.imagePrompt;
                const originalWorkflow = {
                    ...currentWorkflow,
                    assetId: item.logicalAssetId,
                    description,
                    episode: props.episodeId,
                    imagePrompt,
                    importKey: item.importKey,
                    kind: item.kind,
                    libraryAssetId: item.targetAssetId || "",
                    logicalAssetId: item.logicalAssetId,
                    name: item.name,
                    parentLogicalAssetId: item.parentLogicalAssetId,
                    projectId: props.projectId,
                    prompt: imagePrompt,
                    scriptEvidence: item.scriptEvidence,
                    sourceEpisodeId: props.episodeId,
                    sourceProjectId: props.projectId,
                    sourceStage: "asset-image-prompt",
                    status: item.preserveImage ? "image_generated" : "text_ready",
                    variantName: item.variantName,
                    variantType: item.variantType,
                    version: String(props.artifact.version),
                };
                if (current) {
                    updateAsset(current.id, {
                        folderId,
                        metadata: { ...current.metadata, originalWorkflow },
                        note: imagePrompt,
                        source: "cloud-workflow-asset-design",
                        tags: Array.from(new Set([...(current.tags || []), "视频工作流", item.kind])),
                        title: item.name,
                        ...(current.kind === "text" ? { data: { content: imagePrompt } } : {}),
                    });
                    targetIds.push(current.id);
                    continue;
                }
                const libraryAssetId = addAsset({
                    coverUrl: "",
                    data: { content: imagePrompt },
                    folderId,
                    kind: "text",
                    metadata: { originalWorkflow },
                    note: imagePrompt,
                    source: "cloud-workflow-asset-design",
                    tags: ["视频工作流", item.kind, "待生图"],
                    title: item.name,
                });
                const created = useAssetStore.getState().assets.find((asset) => asset.id === libraryAssetId);
                updateAsset(libraryAssetId, { metadata: { ...created?.metadata, originalWorkflow: { ...originalWorkflow, libraryAssetId } } });
                targetIds.push(libraryAssetId);
            }
            await applyWorkflowStage(props.stage.id, { appliedCount: targetIds.length, artifactHash: props.artifact.contentHash, skippedCount: mapping.warnings.length, target: "asset_store", targetIds, version: String(props.artifact.version) });
            await props.onApplied();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产卡片同步失败，请重试");
        } finally {
            setApplying(false);
        }
    }, [addAsset, applying, ensureProjectFolder, mapping.items, mapping.warnings.length, message, props, updateAsset]);

    useEffect(() => {
        if (props.stage?.status === "approved") void materialize();
    }, [materialize, props.stage?.status]);

    useEffect(() => {
        const key = props.artifact?.contentHash || "";
        if (!key || selectionForArtifact.current === key || !cards.length) return;
        selectionForArtifact.current = key;
        setSelectedIds(defaultWorkflowAssetSelection(cards));
    }, [cards, props.artifact?.contentHash]);

    const setVariantSelected = (logicalAssetId: string, checked: boolean) => setSelectedIds((ids) => checked ? [...new Set([...ids, logicalAssetId])] : ids.filter((id) => id !== logicalAssetId));
    const saveVariant = (asset: Asset, input: { description: string; imagePrompt: string }) => {
        updateAsset(asset.id, workflowAssetEditPatch(asset, input));
        message.success("资产卡片已更新");
    };
    const confirmGenerate = (targets: Asset[]) => {
        if (!targets.length) return;
        modal.confirm({
            title: `生成 ${targets.length} 张资产图？`,
            content: `将使用 ${imageActions.model}，确认后自动生成、归档版本并绑定资产编号。单张失败不会取消其他任务。`,
            okText: "确认生成",
            cancelText: "取消",
            onOk: async () => {
                const logicalByAsset = new Map(variants.filter((variant) => variant.asset).map((variant) => [variant.asset!.id, variant.logicalAssetId]));
                const result = await imageActions.generate(targets);
                const errors = Object.fromEntries(result.failed.map((item) => [logicalByAsset.get(item.id) || item.id, item.message]));
                setFailed((current) => ({ ...current, ...errors }));
                if (result.succeededIds.length) {
                    setSelectedIds((ids) => ids.filter((id) => !result.succeededIds.some((assetId) => logicalByAsset.get(assetId) === id)));
                    message.success(`已生成并绑定 ${result.succeededIds.length} 张资产图`);
                }
                if (result.failed.length) message.warning(`${result.failed.length} 张资产图生成失败，可在卡片中直接重试`);
            },
        });
    };
    const selectedAssets = variants.flatMap((variant) => variant.asset && selectedIds.includes(variant.logicalAssetId) && workflowAssetPrompt(variant.asset) ? [variant.asset] : []);

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold"><Library className="size-4 text-[var(--studio-accent)]" />资产设计台</div>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">系统自动提取资产并生成提示词；你只需修改有误的卡片，并在真实生图时确认一次。</p>
                        <div className={`mt-2 flex items-center gap-1.5 text-xs ${automation.status === "error" ? "text-[var(--studio-warning)]" : automation.status === "ready" ? "text-[var(--studio-success)]" : "text-[var(--studio-accent)]"}`}>
                            {automation.status === "ready" ? <CheckCircle2 className="size-3.5" /> : <RefreshCw className={`size-3.5 ${automation.status === "organizing" ? "animate-spin" : ""}`} />}
                            {applying ? "正在绑定资产卡片" : automation.message}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {automation.status === "error" ? <Button icon={<RefreshCw className="size-4" />} loading={automation.busy} onClick={() => void automation.retry()}>重新整理</Button> : null}
                        <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!selectedAssets.length} loading={Boolean(imageActions.generatingIds.length)} onClick={() => confirmGenerate(selectedAssets)}>确认生成 {selectedAssets.length || pendingCount} 项</Button>
                    </div>
                </div>
                {cards.length ? (
                    <Segmented
                        className="mt-4"
                        size="small"
                        value={filter}
                        options={[
                            { label: `全部 ${counts.all}`, value: "all" },
                            { label: `角色 ${counts.character}`, value: "character" },
                            { label: `场景 ${counts.scene}`, value: "scene" },
                            { label: `道具 ${counts.prop}`, value: "prop" },
                        ]}
                        onChange={(value) => setFilter(value as WorkflowAssetCategory)}
                    />
                ) : null}
            </section>

            {mapping.warnings.length ? <Alert showIcon type="warning" title="部分资产卡片需要处理" description={mapping.warnings.join("；")} /> : null}
            {!cards.length ? (
                <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
                    {automation.status === "organizing" || applying ? <Spin description="正在自动整理资产卡片" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用资产卡片" />}
                </div>
            ) : (
                <Image.PreviewGroup>
                    <section className="grid gap-3 md:grid-cols-2">
                        {visible.map((card) => (
                            <WorkflowAssetCard
                                key={card.logicalAssetId}
                                card={card}
                                failed={failed}
                                generatingIds={imageActions.generatingIds}
                                onGenerate={(asset) => confirmGenerate([asset])}
                                onSave={saveVariant}
                                onSelectionChange={setVariantSelected}
                                selectedIds={selectedIds}
                            />
                        ))}
                    </section>
                </Image.PreviewGroup>
            )}
            {mapping.warnings.length ? <div className="flex gap-2 rounded-md border border-[var(--studio-warning)]/40 p-3 text-xs text-[var(--studio-warning)]"><TriangleAlert className="size-4 shrink-0" />请先修正有警告的资产，再开始生成。</div> : null}
        </div>
    );
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
