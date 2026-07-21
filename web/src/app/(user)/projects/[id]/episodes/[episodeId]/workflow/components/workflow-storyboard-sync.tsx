"use client";

import { useMemo, useState } from "react";
import { App, Button } from "antd";
import { Download } from "lucide-react";

import { buildImportedVideoPackage } from "@/app/(user)/video/video-package-builders";
import { useVideoPackageStore } from "@/app/(user)/video/use-video-package-store";
import { applyWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";

export function WorkflowStoryboardSync(props: { artifact: RemoteWorkflowArtifact; episodeId: string; onApplied: () => void | Promise<void>; projectId: string; stage: RemoteWorkflowStageRun }) {
    const { message, modal } = App.useApp();
    const [syncing, setSyncing] = useState(false);
    const upsertPackages = useVideoPackageStore((state) => state.upsertImportedPackages);
    const shots = useMemo(() => parseStoryboardShots(props.artifact.contentJson), [props.artifact.contentJson]);
    const sync = async () => {
        if (!shots.length || syncing) return;
        setSyncing(true);
        try {
            const packages = shots.map((shot, index) => buildImportedVideoPackage({ duration: `${shot.duration || 8}秒`, episode: props.episodeId, episodeId: props.episodeId, id: shot.id, order: index + 1, projectId: props.projectId, prompt: shot.prompt, sceneKey: shot.sceneId, segment: shot.sceneId || `分镜 ${index + 1}`, sourcePath: `cloud-workflow/${props.artifact.id}` }));
            upsertPackages(packages);
            await applyWorkflowStage(props.stage.id, { appliedCount: packages.length, artifactHash: props.artifact.contentHash, skippedCount: 0, target: "video_package_store", targetIds: packages.map((item) => `${item.projectId}:${item.episodeId}:${item.id}`), version: String(props.artifact.version) });
            message.success(`已同步 ${packages.length} 条视频生产包`);
            await props.onApplied();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生产包同步失败，请重试");
        } finally {
            setSyncing(false);
        }
    };
    return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">同步到分镜生产队列</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">检测到 {shots.length} 条已审核分镜。同步按项目、分集和 P 编号更新，不会覆盖其他剧集。</p></div><Button type="primary" icon={<Download className="size-4" />} disabled={!shots.length} loading={syncing} onClick={() => modal.confirm({ title: "同步视频生产包？", content: `将同步 ${shots.length} 条分镜提示词到当前集。`, okText: "确认同步", cancelText: "取消", onOk: sync })}>{props.stage.status === "applied" ? "重新同步" : "同步生产包"}</Button></div></section>;
}

function parseStoryboardShots(contentJson: string) {
    try {
        const content = JSON.parse(contentJson) as { shots?: unknown[] };
        return (Array.isArray(content.shots) ? content.shots : []).flatMap((item): Array<{ duration: number; id: string; prompt: string; sceneId: string }> => {
            const shot = item && typeof item === "object" ? item as Record<string, unknown> : {};
            const id = readString(shot.id);
            const prompt = readString(shot.prompt);
            if (!id || !prompt) return [];
            return [{ duration: Number(shot.duration) || 8, id, prompt, sceneId: readString(shot.sceneId) }];
        });
    } catch { return []; }
}
function readString(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
