"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Empty, Image, Segmented, Spin } from "antd";
import { CheckCircle2, Library, RefreshCw, TriangleAlert, WandSparkles } from "lucide-react";

import { workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";
import { useAssetStore, type Asset, type AssetBinding, type AssetCategory } from "@/stores/use-asset-store";

import type { useWorkflowAssetAutomation } from "../use-workflow-asset-automation";
import { useWorkflowAssetImageActions } from "../use-workflow-asset-image-actions";
import {
    buildWorkflowAssetCards,
    clearWorkflowAssetFailures,
    defaultWorkflowAssetSelection,
    workflowAssetCategoryCounts,
    workflowAssetEditPatch,
    workflowAssetGenerationProgress,
    workflowAssetSelectionPatch,
    type WorkflowAssetCategory,
} from "../workflow-asset-card-model";
import { startBackgroundTask } from "../workflow-background-task";
import { mapAssetDesignArtifactToAssets } from "../workflow-artifact-mapping";
import { WorkflowAssetCard } from "./workflow-asset-card";
import { workflowAssetFileImportPatch, workflowAssetLibraryImportPatch, workflowAssetRemoteImportPatch } from "../workflow-asset-import";

export function WorkflowAssetPanel(props: {
    artifact: RemoteWorkflowArtifact | null;
    automation: ReturnType<typeof useWorkflowAssetAutomation>;
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
    const [importTarget, setImportTarget] = useState<{ asset: Asset; logicalAssetId: string } | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const selectionForArtifact = useRef("");
    const assets = useAssetStore((state) => state.assets);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const ensureSubject = useAssetStore((state) => state.ensureSubject);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const mapping = useMemo(() => mapAssetDesignArtifactToAssets(props.artifact?.contentJson || "", assets, { episodeId: props.episodeId, projectId: props.projectId }), [assets, props.artifact?.contentJson, props.episodeId, props.projectId]);
    const cards = useMemo(() => buildWorkflowAssetCards(mapping.items, assets), [assets, mapping.items]);
    const counts = useMemo(() => workflowAssetCategoryCounts(cards), [cards]);
    const generationProgress = useMemo(() => workflowAssetGenerationProgress(cards), [cards]);
    const visible = cards.filter((card) => filter === "all" || card.category === filter);
    const variants = cards.flatMap((card) => card.variants);
    const imageActions = useWorkflowAssetImageActions();
    const automation = props.automation;

    const materialize = useCallback(async () => {
        if (!props.artifact || !props.stage || !["approved", "applied"].includes(props.stage.status) || applying) return;
        setApplying(true);
        try {
            const folderId = ensureProjectFolder(props.projectId, props.projectTitle);
            const subjectIds = new Map<string, string>();
            for (const item of mapping.items.filter((row) => row.kind !== "costume")) {
                const category = item.kind === "character" ? "character" : item.kind === "scene" ? "scene" : item.kind === "prop" ? "prop" : "other";
                subjectIds.set(item.logicalAssetId, ensureSubject({ projectId: props.projectId, category, sourceKey: item.logicalAssetId, name: item.name, tags: ["视频工作流"] }));
            }
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
                    projectSlug: props.projectTitle,
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
                const category: AssetCategory = item.kind === "character" || item.kind === "costume" ? "character" : item.kind === "scene" ? "scene" : item.kind === "prop" ? "prop" : "other";
                const parentItem = item.kind === "costume" ? mapping.items.find((row) => row.logicalAssetId === item.parentLogicalAssetId) : undefined;
                const subjectKey = item.kind === "costume" ? item.parentLogicalAssetId : item.logicalAssetId;
                const subjectId = subjectIds.get(subjectKey) || ensureSubject({ projectId: props.projectId, category, sourceKey: subjectKey, name: parentItem?.name || item.name, tags: ["视频工作流"] });
                const assetBinding: AssetBinding = { projectId: props.projectId, subjectId, category, variantName: item.variantName || (category === "character" ? "基础形象" : "基础状态"), allEpisodes: false, episodeIds: [props.episodeId] };
                if (current) {
                    updateAsset(current.id, {
                        assetBinding,
                        folderId,
                        metadata: { ...current.metadata, originalWorkflow },
                        note: imagePrompt,
                        source: "cloud-workflow-asset-design",
                        tags: Array.from(new Set([...(current.tags || []), "视频工作流", item.kind])),
                        title: item.name,
                        ...(current.kind === "text" ? { data: { content: imagePrompt } } : {}),
                    });
                    continue;
                }
                const libraryAssetId = await addAssetOnce({
                    assetBinding,
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
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产卡片同步失败，请重试");
        } finally {
            setApplying(false);
        }
    }, [addAssetOnce, applying, ensureProjectFolder, ensureSubject, mapping.items, message, props, updateAsset]);

    useEffect(() => {
        const needsSync = mapping.items.some((item) => {
            const asset = item.targetAssetId ? assets.find((entry) => entry.id === item.targetAssetId) : undefined;
            const workflow = readRecord(asset?.metadata?.originalWorkflow);
            return !asset || !readString(workflow.kind) || !readString(workflow.logicalAssetId) || !readString(workflow.sourceEpisodeId) || !readString(workflow.sourceProjectId);
        });
        if (["approved", "applied"].includes(props.stage?.status || "") && needsSync) void materialize();
    }, [assets, mapping.items, materialize, props.stage?.status]);

    useEffect(() => {
        if (!props.artifact || !props.stage || props.stage.status !== "approved" || !generationProgress.ready || applying) return;
        setApplying(true);
        void applyWorkflowStage(props.stage.id, {
            appliedCount: generationProgress.generated,
            artifactHash: props.artifact.contentHash,
            skippedCount: mapping.warnings.length,
            target: "asset_store",
            targetIds: mapping.items.flatMap((item) => (item.targetAssetId ? [item.targetAssetId] : [])),
            version: String(props.artifact.version),
        })
            .then(() => props.onApplied())
            .catch((error) => message.error(error instanceof Error ? error.message : "资产图片绑定完成，但阶段状态更新失败"))
            .finally(() => setApplying(false));
    }, [applying, generationProgress.generated, generationProgress.ready, mapping.items, mapping.warnings.length, message, props]);

    useEffect(() => {
        const key = props.artifact?.contentHash || "";
        if (!key || selectionForArtifact.current === key || !cards.length) return;
        selectionForArtifact.current = key;
        setSelectedIds(defaultWorkflowAssetSelection(cards));
    }, [cards, props.artifact?.contentHash]);

    const setVariantSelected = (logicalAssetId: string, checked: boolean) => {
        const asset = variants.find((variant) => variant.logicalAssetId === logicalAssetId)?.asset;
        if (asset) updateAsset(asset.id, workflowAssetSelectionPatch(asset, checked));
        setSelectedIds((ids) => (checked ? [...new Set([...ids, logicalAssetId])] : ids.filter((id) => id !== logicalAssetId)));
    };
    const saveVariant = (asset: Asset, input: { description: string; imagePrompt: string }) => {
        updateAsset(asset.id, workflowAssetEditPatch(asset, input));
        message.success("资产卡片已更新");
    };
    const runGeneration = async (targets: Asset[]) => {
        const logicalByAsset = new Map(variants.filter((variant) => variant.asset).map((variant) => [variant.asset!.id, variant.logicalAssetId]));
        setFailed((current) =>
            clearWorkflowAssetFailures(
                current,
                targets.map((asset) => logicalByAsset.get(asset.id) || asset.id),
            ),
        );
        const result = await imageActions.generate(targets);
        const errors = Object.fromEntries(result.failed.map((item) => [logicalByAsset.get(item.id) || item.id, item.message]));
        setFailed((current) => ({ ...current, ...errors }));
        if (result.succeededIds.length) {
            setSelectedIds((ids) => ids.filter((id) => !result.succeededIds.some((assetId) => logicalByAsset.get(assetId) === id)));
            message.success(`已生成并绑定 ${result.succeededIds.length} 张资产图`);
        }
        if (result.failed.length) message.warning(`${result.failed.length} 张资产图生成失败，可在卡片中直接重试`);
    };
    const confirmGenerate = (targets: Asset[]) => {
        if (!targets.length) return;
        modal.confirm({
            title: `生成 ${targets.length} 张资产草图？`,
            content: `将使用 ${imageActions.model}，确认后转入后台生成、归档版本并绑定资产编号。你可以继续编辑或切换页面；全部有效资产图完成后自动解锁镜头生产。`,
            okText: "转入后台生成",
            cancelText: "取消",
            onOk: () => {
                message.info(`已提交 ${targets.length} 张资产草图，可继续其他操作`);
                startBackgroundTask(
                    () => runGeneration(targets),
                    (error) => message.error(error instanceof Error ? error.message : "资产草图任务启动失败"),
                );
            },
        });
    };
    const selectedAssets = variants.flatMap((variant) => (variant.asset && selectedIds.includes(variant.logicalAssetId) && workflowAssetPrompt(variant.asset) ? [variant.asset] : []));
    const finishImport = (patch: Parameters<typeof updateAsset>[1]) => {
        if (!importTarget) return;
        updateAsset(importTarget.asset.id, patch);
        setSelectedIds((ids) => ids.filter((id) => id !== importTarget.logicalAssetId));
        message.success(`已导入并绑定 ${importTarget.logicalAssetId}`);
        setImportTarget(null);
        setPickerOpen(false);
    };
    const startImport = (asset: Asset, logicalAssetId: string, source: "local" | "library") => {
        setImportTarget({ asset, logicalAssetId });
        if (source === "local") fileInput.current?.click();
        else setPickerOpen(true);
    };
    const importFile = async (file?: File) => {
        if (!file || !importTarget) return;
        setImporting(true);
        try {
            finishImport(await workflowAssetFileImportPatch(importTarget.asset, file, file.name));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片导入失败");
        } finally {
            setImporting(false);
            if (fileInput.current) fileInput.current.value = "";
        }
    };
    const importPicked = async (payload: InsertAssetPayload) => {
        if (!importTarget || payload.kind !== "image") return message.warning("请选择图片素材");
        setImporting(true);
        try {
            const source = payload.sourceAssetId ? useAssetStore.getState().assets.find((item): item is Extract<Asset, { kind: "image" }> => item.id === payload.sourceAssetId && item.kind === "image") : undefined;
            finishImport(source ? workflowAssetLibraryImportPatch(importTarget.asset, source) : await workflowAssetRemoteImportPatch(importTarget.asset, payload.dataUrl, payload.title));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材导入失败");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Library className="size-4 text-[var(--studio-accent)]" />
                            资产设计台
                        </div>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">系统自动提取资产并生成提示词；你只需修改有误的卡片，并在真实生图时确认一次。</p>
                        <div className={`mt-2 flex items-center gap-1.5 text-xs ${automation.status === "error" ? "text-[var(--studio-warning)]" : automation.status === "ready" ? "text-[var(--studio-success)]" : "text-[var(--studio-accent)]"}`}>
                            {automation.status === "ready" ? <CheckCircle2 className="size-3.5" /> : <RefreshCw className={`size-3.5 ${automation.status === "organizing" ? "animate-spin" : ""}`} />}
                            {applying
                                ? "正在绑定资产结果"
                                : imageActions.generatingIds.length
                                  ? `${imageActions.generatingIds.length} 张草图后台生成中，可继续操作`
                                  : generationProgress.required && automation.status === "ready"
                                    ? generationProgress.ready
                                        ? "全部资产图已绑定"
                                        : `${generationProgress.pending} 张资产草图待生成`
                                    : automation.message}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {automation.status === "error" ? (
                            <Button icon={<RefreshCw className="size-4" />} loading={automation.busy} onClick={() => void automation.retry()}>
                                重新整理
                            </Button>
                        ) : null}
                        <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!selectedAssets.length} loading={Boolean(imageActions.generatingIds.length)} onClick={() => confirmGenerate(selectedAssets)}>
                            确认生成 {selectedAssets.length} 张草图
                        </Button>
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
                                onImport={startImport}
                                onSave={saveVariant}
                                onSelectionChange={setVariantSelected}
                                selectedIds={selectedIds}
                            />
                        ))}
                    </section>
                </Image.PreviewGroup>
            )}
            {mapping.warnings.length ? (
                <div className="flex gap-2 rounded-md border border-[var(--studio-warning)]/40 p-3 text-xs text-[var(--studio-warning)]">
                    <TriangleAlert className="size-4 shrink-0" />
                    请先修正有警告的资产，再开始生成。
                </div>
            ) : null}
            <input ref={fileInput} className="hidden" type="file" accept="image/*" disabled={importing} onChange={(event) => void importFile(event.target.files?.[0])} />
            <AssetPickerModal
                open={pickerOpen}
                title={`导入并绑定 ${importTarget?.logicalAssetId || "资产"}`}
                defaultKind="image"
                allowedKinds={["image"]}
                onInsert={(payload) => void importPicked(payload)}
                onClose={() => {
                    setPickerOpen(false);
                    setImportTarget(null);
                }}
            />
        </div>
    );
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
