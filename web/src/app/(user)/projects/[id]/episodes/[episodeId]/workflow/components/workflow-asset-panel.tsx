"use client";

import { useMemo, useState } from "react";
import { App, Button, Segmented } from "antd";
import { Check, ImageIcon, Library, TriangleAlert } from "lucide-react";

import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";
import { useAssetStore } from "@/stores/use-asset-store";

import { mapArtArtifactToAssets } from "../workflow-artifact-mapping";

export function WorkflowAssetPanel(props: { artifact: RemoteWorkflowArtifact | null; episodeId: string; onApplied: () => void | Promise<void>; projectId: string; projectTitle: string; stage: RemoteWorkflowStageRun | null }) {
    const { message, modal } = App.useApp();
    const [filter, setFilter] = useState("全部");
    const [applying, setApplying] = useState(false);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const mapping = useMemo(() => mapArtArtifactToAssets(props.artifact?.contentJson || "", assets, { episodeId: props.episodeId, projectId: props.projectId }), [assets, props.artifact?.contentJson, props.episodeId, props.projectId]);
    const visible = mapping.items.filter((item) => filter === "全部" || item.kind === filter);
    const canApply = Boolean(props.artifact && props.stage && ["approved", "applied"].includes(props.stage.status));

    const apply = async () => {
        if (!props.artifact || !props.stage || !canApply || applying) return;
        setApplying(true);
        try {
            const folderId = ensureProjectFolder(props.projectId, props.projectTitle);
            const targetIds: string[] = [];
            for (const item of mapping.items) {
                const originalWorkflow = { assetId: item.id, episode: props.episodeId, importKey: item.importKey, kind: item.kind, name: item.name, prompt: item.prompt, projectId: props.projectId, sourceStage: "art-design", status: item.preserveImage ? "image_generated" : "text_ready" };
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
                    targetIds.push(addAsset({ coverUrl: "", data: { content: item.prompt }, folderId, kind: "text", metadata: { originalWorkflow }, note: item.prompt, source: "cloud-workflow-art-design", tags: ["视频工作流", item.kind], title: item.name }));
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
    return <div className="space-y-3"><section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Library className="size-4 text-[var(--studio-accent)]" />资产写入预览</div><p className="mt-1 text-xs text-[var(--studio-text-muted)]">只更新文本与来源元数据；已存在的图片、版本记录和审核状态不会被覆盖。</p></div><Button type="primary" icon={<Check className="size-4" />} disabled={!canApply || !mapping.items.length || props.stage?.status === "applied"} loading={applying} onClick={() => modal.confirm({ title: "写入当前项目资产？", content: `将创建或更新 ${mapping.items.length} 条资产设定。现有图片会保留。`, okText: "确认写入", cancelText: "取消", onOk: apply })}>{props.stage?.status === "applied" ? "已写入" : "确认写入"}</Button></div><Segmented className="mt-4" size="small" value={filter} options={["全部", ...Array.from(new Set(mapping.items.map((item) => item.kind)))]} onChange={(value) => setFilter(String(value))} /></section><section className="grid gap-2 sm:grid-cols-2">{visible.map((item) => <div key={item.importKey} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--studio-panel-muted-bg)]"><ImageIcon className="size-4" /></span><div className="min-w-0"><div className="truncate text-xs font-semibold">{item.name}</div><div className="mt-0.5 text-[10px] text-[var(--studio-text-muted)]">{item.kind} · {item.action === "create" ? "新建" : item.preserveImage ? "保留图片并更新" : "更新设定"}</div></div></div>{item.preserveImage ? <span className="shrink-0 text-[10px] text-[var(--studio-success)]">图片已保护</span> : null}</div><p className="mt-3 line-clamp-4 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.prompt}</p></div>)}</section>{mapping.warnings.length ? <div className="flex gap-2 rounded-md border border-[var(--studio-warning)]/40 p-3 text-xs text-[var(--studio-warning)]"><TriangleAlert className="size-4 shrink-0" />{mapping.warnings.join("；")}</div> : null}</div>;
}
