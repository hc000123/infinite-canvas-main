"use client";

import { useMemo, useState } from "react";
import { App, Button } from "antd";
import { Check, Download, RotateCcw, X } from "lucide-react";

import { useVideoPackageStore, type ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { applyWorkflowStage } from "@/services/api/workflow-runs";

import type { useWorkflowStageActions } from "../use-workflow-stage-actions";
import { isShotPromptOutputCurrent, promptInputHash } from "../workflow-production-state";

export function WorkflowShotPromptReview({ item, onApplied, state }: { item: ProductionPackage; onApplied: () => void | Promise<void>; state: ReturnType<typeof useWorkflowStageActions> }) {
    const { message } = App.useApp();
    const [applying, setApplying] = useState(false);
    const updatePackage = useVideoPackageStore((store) => store.updateImportedPackage);
    const output = useMemo(() => parseShotPrompt(state.artifact?.contentJson || ""), [state.artifact?.contentJson]);
    if (!state.artifact || !state.stage || output.shotId !== item.id) return null;
    const stale = !isShotPromptOutputCurrent(item, output.promptInputHash);
    const write = async () => {
        if (!output.prompt || !state.artifact || !state.stage) return;
        if (stale) {
            message.warning("分镜或参考图已变更，请重新生成提示词");
            return;
        }
        setApplying(true);
        try {
            updatePackage(item, { prompt: output.prompt, promptInputHash: promptInputHash(item), promptStatus: "待审核" });
            await applyWorkflowStage(state.stage.id, { artifactHash: state.artifact.contentHash, target: "video_package_store", targetIds: [`${item.projectId}:${item.episodeId}:${item.id}`], appliedCount: 1, skippedCount: 0, version: String(state.artifact.version), metadata: { shotId: item.id, promptInputHash: promptInputHash(item) } });
            message.success("提示词已写入当前镜头，请检查修改后确认");
            await onApplied();
        } catch (error) { message.error(error instanceof Error ? error.message : "提示词写入失败"); }
        finally { setApplying(false); }
    };
    return <div className="mt-4 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold">Codex 生成结果 · {output.shotId}</div><div className={`mt-1 text-[10px] ${stale || !state.gate?.passed ? "text-[var(--studio-warning)]" : "text-[var(--studio-success)]"}`}>{stale ? "当前分镜或参考图已变更，需重新生成" : state.gate?.passed ? "质量门通过，与当前输入一致" : "质量门未通过"}</div></div><div className="flex gap-2">{state.stage.status === "needs_review" ? <><Button size="small" icon={<X className="size-3.5" />} onClick={state.reject}>退回</Button><Button size="small" type="primary" icon={<Check className="size-3.5" />} disabled={!state.gate?.passed || stale} onClick={state.approve}>批准</Button></> : null}{["approved", "applied"].includes(state.stage.status) ? <Button size="small" type="primary" icon={<Download className="size-3.5" />} disabled={stale} loading={applying} onClick={() => void write()}>写入本镜</Button> : null}{["failed", "rejected", "cancelled"].includes(state.stage.status) ? <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={state.retry}>重试</Button> : null}</div></div><pre className="thin-scrollbar mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[var(--studio-text-secondary)]">{output.prompt}</pre></div>;
}

export function parseShotPrompt(contentJson: string) {
    try { const value = JSON.parse(contentJson) as Record<string, unknown>; return { shotId: typeof value.shotId === "string" ? value.shotId : "", prompt: typeof value.prompt === "string" ? value.prompt : "", promptInputHash: typeof value.promptInputHash === "string" ? value.promptInputHash : "" }; }
    catch { return { shotId: "", prompt: "", promptInputHash: "" }; }
}
