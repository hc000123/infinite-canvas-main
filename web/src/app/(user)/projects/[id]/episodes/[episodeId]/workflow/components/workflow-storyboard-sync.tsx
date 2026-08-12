"use client";

import { useMemo, useState } from "react";
import { App, Button } from "antd";
import { Download } from "lucide-react";

import { buildImportedVideoPackage } from "@/app/(user)/video/video-package-builders";
import { useVideoPackageStore } from "@/app/(user)/video/use-video-package-store";
import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";
import { parseShotBreakdown, prepareWorkflowShotPackage } from "../workflow-shot-draft";

export function WorkflowStoryboardSync(props: { artifact: RemoteWorkflowArtifact; episodeId: string; onApplied: () => void | Promise<void>; projectId: string; stage: RemoteWorkflowStageRun }) {
    const { message, modal } = App.useApp();
    const [syncing, setSyncing] = useState(false);
    const upsertPackages = useVideoPackageStore((state) => state.upsertImportedPackages);
    const shots = useMemo(() => parseShotBreakdown(props.artifact.contentJson), [props.artifact.contentJson]);
    const sync = async () => {
        if (!shots.length || syncing) return;
        setSyncing(true);
        try {
            const packages = shots.map((shot, index) => prepareWorkflowShotPackage(buildImportedVideoPackage({ duration: `${shot.shotDraft.durationSeconds}秒`, episode: props.episodeId, episodeId: props.episodeId, id: shot.shotId, order: index + 1, projectId: props.projectId, prompt: "", sceneKey: shot.sceneKey, segment: shot.shotDraft.action || `分镜 ${index + 1}`, sourcePath: `cloud-workflow/${props.artifact.id}`, sourceScript: shot.sourceScript, shotDraft: shot.shotDraft })));
            upsertPackages(packages);
            await applyWorkflowStage(props.stage.id, { appliedCount: packages.length, artifactHash: props.artifact.contentHash, skippedCount: 0, target: "video_package_store", targetIds: packages.map((item) => `${item.projectId}:${item.episodeId}:${item.id}`), version: String(props.artifact.version) });
            message.success(`已同步 ${packages.length} 条可编辑分镜，请逐条确认后生成提示词`);
            await props.onApplied();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生产包同步失败，请重试");
        } finally {
            setSyncing(false);
        }
    };
    return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">载入镜头生产队列</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">检测到 {shots.length} 条结构化分镜。这里先载入原剧本和镜头草案，不会提前生成最终提示词。</p></div><Button type="primary" icon={<Download className="size-4" />} disabled={!shots.length} loading={syncing} onClick={() => modal.confirm({ title: "载入可编辑分镜？", content: `将载入 ${shots.length} 条分镜草案。后续需要逐条确认后才可生成提示词。`, okText: "确认载入", cancelText: "取消", onOk: sync })}>{props.stage.status === "applied" ? "重新载入" : "载入分镜"}</Button></div></section>;
}
