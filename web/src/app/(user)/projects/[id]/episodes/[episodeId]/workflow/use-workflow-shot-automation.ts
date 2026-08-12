"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";

import { buildImportedVideoPackage } from "@/app/(user)/video/video-package-builders";
import { useVideoPackageStore } from "@/app/(user)/video/use-video-package-store";
import { applyWorkflowStage, reviewWorkflowStage, type RemoteWorkflowArtifact, type RemoteWorkflowQualityGate, type RemoteWorkflowStageRun } from "@/services/api/workflow-runs";

import { parseShotBreakdown, prepareWorkflowShotPackage } from "./workflow-shot-draft";
import { nextWorkflowShotAction } from "./workflow-shot-automation";

export function useWorkflowShotAutomation(input: { artifact: RemoteWorkflowArtifact | null; episodeId: string; gate: RemoteWorkflowQualityGate | null; onApplied: () => void | Promise<void>; projectId: string; stage: RemoteWorkflowStageRun | null }) {
    const { message } = App.useApp();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handled = useRef(new Set<string>());
    const upsertPackages = useVideoPackageStore((state) => state.upsertImportedPackages);

    useEffect(() => {
        const { artifact, gate, stage } = input;
        const shots = parseShotBreakdown(artifact?.contentJson || "");
        const action = nextWorkflowShotAction({ stageStatus: stage?.status, gatePassed: gate?.passed, shotCount: shots.length });
        const key = `${action.type}:${artifact?.contentHash || ""}`;
        if (!artifact || !stage || action.type === "idle" || handled.current.has(key)) return;
        handled.current.add(key);
        setLoading(true);
        setError("");
        void (async () => {
            try {
                if (action.type === "approve") {
                    await reviewWorkflowStage(stage.id, { artifactHash: artifact.contentHash, decision: "approved" });
                    await input.onApplied();
                    return;
                }
                const packages = shots.map((shot, index) => prepareWorkflowShotPackage(buildImportedVideoPackage({
                    duration: `${shot.shotDraft.durationSeconds}秒`, episode: input.episodeId, episodeId: input.episodeId, id: shot.shotId, order: index + 1, projectId: input.projectId,
                    prompt: "", sceneKey: shot.sceneKey, segment: shot.shotDraft.action || `分镜 ${index + 1}`, sourcePath: `cloud-workflow/${artifact.id}`, sourceScript: shot.sourceScript, shotDraft: shot.shotDraft,
                })));
                upsertPackages(packages);
                await applyWorkflowStage(stage.id, { appliedCount: packages.length, artifactHash: artifact.contentHash, skippedCount: 0, target: "video_package_store", targetIds: packages.map((item) => `${item.projectId}:${item.episodeId}:${item.id}`), version: String(artifact.version) });
                message.success(`已自动载入 ${packages.length} 条可编辑分镜`);
                await input.onApplied();
            } catch (reason) {
                const text = reason instanceof Error ? reason.message : "分镜自动载入失败";
                setError(text);
                message.error(text);
            } finally {
                setLoading(false);
            }
        })();
    }, [input, message, upsertPackages]);

    return { error, loading };
}
