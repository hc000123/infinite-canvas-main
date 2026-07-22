"use client";

import { useMemo, useState } from "react";
import { App, Button, Checkbox, Segmented } from "antd";
import { Check, ExternalLink, ImageIcon, Library, TriangleAlert, WandSparkles } from "lucide-react";

import { buildImageWorkbenchHref } from "@/app/(user)/assets/use-workflow-asset-image-actions";
import { workflowAssetInfo, workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";
import { useAssetStore } from "@/stores/use-asset-store";

import { mapAssetDesignArtifactToAssets } from "../workflow-artifact-mapping";
import { useWorkflowAssetImageActions } from "../use-workflow-asset-image-actions";

export function WorkflowAssetPanel(props: { artifact: RemoteWorkflowArtifact | null; episodeId: string; onApplied: () => void | Promise<void>; projectId: string; projectTitle: string; stage: RemoteWorkflowStageRun | null }) {
    const { message, modal } = App.useApp();
    const [filter, setFilter] = useState("全部");
    const [applying, setApplying] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const mapping = useMemo(() => mapAssetDesignArtifactToAssets(props.artifact?.contentJson || "", assets, { episodeId: props.episodeId, projectId: props.projectId }), [assets, props.artifact?.contentJson, props.episodeId, props.projectId]);
    const visible = mapping.items.filter((item) => filter === "全部" || item.kind === filter);
    const canApply = Boolean(props.artifact && props.stage && ["approved", "applied"].includes(props.stage.status));
    const imageActions = useWorkflowAssetImageActions();
    const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id) && workflowAssetPrompt(asset));

    const batchGenerate = async () => {
        const result = await imageActions.generate(selectedAssets);
        if (result.succeededIds.length) message.success(`已生成并回写 ${result.succeededIds.length} 张资产图`);
        if (result.failed.length) message.warning(`${result.failed.length} 张失败：${result.failed.map((item) => item.message).join("；")}`);
    };

    const apply = async () => {
        if (!props.artifact || !props.stage || !canApply || applying) return;
        setApplying(true);
        try {
            const folderId = ensureProjectFolder(props.projectId, props.projectTitle);
            const targetIds: string[] = [];
            for (const item of mapping.items) {
                const originalWorkflow = { assetId: item.logicalAssetId, logicalAssetId: item.logicalAssetId, libraryAssetId: item.targetAssetId || "", episode: props.episodeId, sourceEpisodeId: props.episodeId, importKey: item.importKey, kind: item.kind, name: item.name, scriptEvidence: item.scriptEvidence, description: item.description, imagePrompt: item.imagePrompt, prompt: item.imagePrompt, projectId: props.projectId, sourceProjectId: props.projectId, sourceStage: "asset-image-prompt", status: item.preserveImage ? "image_generated" : "text_ready", version: String(props.artifact.version) };
                if (item.targetAssetId) {
                    const current = assets.find((asset) => asset.id === item.targetAssetId);
                    updateAsset(item.targetAssetId, {
                        folderId,
                        metadata: { ...current?.metadata, originalWorkflow },
                        note: item.prompt,
                        source: "cloud-workflow-art-design",
                        tags: Array.from(new Set([...(current?.tags || []), "视频工作流", item.kind])),
                        title: item.name,
                        ...(current?.kind === "text" ? { data: { content: item.prompt } } : {}),
                    });
                    targetIds.push(item.targetAssetId);
                } else {
                    const libraryAssetId = addAsset({ coverUrl: "", data: { content: item.imagePrompt }, folderId, kind: "text", metadata: { originalWorkflow }, note: item.imagePrompt, source: "cloud-workflow-asset-design", tags: ["视频工作流", item.kind], title: item.name });
                    const created = useAssetStore.getState().assets.find((asset) => asset.id === libraryAssetId);
                    updateAsset(libraryAssetId, { metadata: { ...created?.metadata, originalWorkflow: { ...originalWorkflow, libraryAssetId } } });
                    targetIds.push(libraryAssetId);
                }
            }
            await applyWorkflowStage(props.stage.id, { appliedCount: targetIds.length, artifactHash: props.artifact.contentHash, skippedCount: mapping.warnings.length, target: "asset_store", targetIds, version: String(props.artifact.version) });
            message.success(`已安全写入 ${targetIds.length} 条资产设定`);
            await props.onApplied();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产写入失败，请重试");
        } finally {
            setApplying(false);
        }
    };

    if (!props.artifact) return <div className="grid min-h-72 place-items-center rounded-md border border-dashed border-[var(--studio-border-subtle)] text-sm text-[var(--studio-text-muted)]">批准导演与美术产物后，可在这里预览资产映射</div>;
    return <div className="space-y-3"><section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Library className="size-4 text-[var(--studio-accent)]" />资产设计台</div><p className="mt-1 text-xs text-[var(--studio-text-muted)]">每个逻辑编号只绑定一条素材记录；修改提示词或生成新图都会写入同一资产的版本历史。</p></div><div className="flex gap-2"><Button icon={<WandSparkles className="size-4" />} disabled={!selectedAssets.length} loading={Boolean(imageActions.generatingIds.length)} onClick={() => modal.confirm({ title: `生成 ${selectedAssets.length} 张资产图？`, content: `将使用 ${imageActions.model} 逐张生成并产生实际图片算力费用；单张失败不会取消其他任务。`, okText: "确认生成", cancelText: "取消", onOk: batchGenerate })}>批量生图</Button><Button type="primary" icon={<Check className="size-4" />} disabled={!canApply || !mapping.items.length || props.stage?.status === "applied"} loading={applying} onClick={() => modal.confirm({ title: "写入当前项目资产？", content: `将创建或更新 ${mapping.items.length} 条资产设定。现有图片会保留。`, okText: "确认写入", cancelText: "取消", onOk: apply })}>{props.stage?.status === "applied" ? "已写入" : "确认写入"}</Button></div></div><Segmented className="mt-4" size="small" value={filter} options={["全部", ...Array.from(new Set(mapping.items.map((item) => item.kind)))]} onChange={(value) => setFilter(String(value))} /></section><section className="grid gap-2 sm:grid-cols-2">{visible.map((item) => { const asset = item.targetAssetId ? assets.find((entry) => entry.id === item.targetAssetId) : undefined; return <div key={item.importKey} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Checkbox disabled={!asset} checked={Boolean(asset && selectedIds.includes(asset.id))} onChange={(event) => asset && setSelectedIds((ids) => event.target.checked ? [...new Set([...ids, asset.id])] : ids.filter((id) => id !== asset.id))} /><span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--studio-panel-muted-bg)]"><ImageIcon className="size-4" /></span><div className="min-w-0"><div className="truncate text-xs font-semibold">{item.logicalAssetId} · {item.name}</div><div className="mt-0.5 text-[10px] text-[var(--studio-text-muted)]">{item.kind} · {item.action === "create" ? "待写入" : item.preserveImage ? "已有图片版本" : "已有文字资产"}</div></div></div>{item.preserveImage ? <span className="shrink-0 text-[10px] text-[var(--studio-success)]">图片已绑定</span> : null}</div><div className="mt-3 rounded bg-[var(--studio-panel-muted-bg)] px-2.5 py-2 text-[11px] leading-5 text-[var(--studio-text-secondary)]"><span className="text-[var(--studio-text-muted)]">剧本证据：</span>{item.scriptEvidence || "待补充"}</div><p className="mt-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.description}</p><p className="mt-2 line-clamp-4 text-xs leading-5 text-[var(--studio-text-muted)]">{item.imagePrompt}</p>{asset ? <Button className="mt-3" size="small" icon={<ExternalLink className="size-3.5" />} href={buildImageWorkbenchHref(asset, workflowAssetPrompt(asset), workflowAssetInfo(asset))}>图片工作台</Button> : <div className="mt-3 text-[10px] text-[var(--studio-warning)]">先确认写入，再生图或匹配图片</div>}</div>; })}</section>{mapping.warnings.length ? <div className="flex gap-2 rounded-md border border-[var(--studio-warning)]/40 p-3 text-xs text-[var(--studio-warning)]"><TriangleAlert className="size-4 shrink-0" />{mapping.warnings.join("；")}</div> : null}</div>;
}
