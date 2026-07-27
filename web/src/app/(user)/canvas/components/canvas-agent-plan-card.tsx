"use client";

import { ArrowDown, ArrowUp, Check, CircleStop, Play, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { App, Button, Select, Spin, Tag } from "antd";

import { preferredCapabilityOutputText } from "@/components/capability-runtime/capability-run-model";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasAgentPlanRun } from "../types";
import { useCanvasAgentPlan } from "../hooks/use-canvas-agent-plan";

export function CanvasAgentPlanCard({ run, projectId, onRunPatch }: { run: CanvasAgentPlanRun; projectId: string; onRunPatch: (patch: Partial<CanvasAgentPlanRun>) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { message } = App.useApp();
    const runtime = useCanvasAgentPlan({ run, projectId, enabled: true, onRunPatch });
    const status = runtime.plan?.plan.status || "draft";
    const execute = async (action: () => Promise<unknown>, success: string) => {
        try {
            await action();
            message.success(success);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        }
    };

    return (
        <div className="w-[310px] rounded-lg border p-3 text-sm" style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-xs font-medium opacity-60">AGENT TEMPORARY PLAN</div>
                    <div className="mt-1 font-medium">{run.agentName}</div>
                </div>
                <Tag>{statusLabel(status)}</Tag>
            </div>
            {runtime.loading && !runtime.plan ? <div className="grid h-24 place-items-center"><Spin size="small" /></div> : null}
            <div className="mt-3 space-y-2">
                {runtime.draftSkillRefs.map((ref, index) => {
                    const frozen = runtime.plan?.steps.find((step) => step.step.stepKey === ref.stepKey)?.step;
                    return (
                        <div key={ref.stepKey} className="rounded-md border p-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs font-medium">{index + 1}. {frozen?.label || ref.label}</span>
                                <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>{frozen?.status || "draft"}</span>
                            </div>
                            {runtime.actions.canEdit && runtime.allowRuntimeSkillOverride ? (
                                <div className="mt-2 flex items-center gap-1">
                                    <Select size="small" className="min-w-0 flex-1" value={ref.skillVersionId} options={runtime.allowedSkillOptions.map((option) => ({ value: option.skillVersionId, label: `${option.skillName} v${option.version}` }))} onChange={(value) => runtime.replaceSkill(index, value)} />
                                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} disabled={index === 0} onClick={() => runtime.moveSkill(index, -1)} aria-label="上移 Skill" />
                                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} disabled={index === runtime.draftSkillRefs.length - 1} onClick={() => runtime.moveSkill(index, 1)} aria-label="下移 Skill" />
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} disabled={runtime.draftSkillRefs.length === 1} onClick={() => runtime.removeSkill(index)} aria-label="删除 Skill" />
                                </div>
                            ) : (
                                <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>{frozen?.skillVersion ? `v${frozen.skillVersion}` : ref.skillVersionId}</div>
                            )}
                            {frozen?.errorMessage ? <div className="mt-1 text-xs text-red-500">{frozen.errorMessage}</div> : null}
                        </div>
                    );
                })}
            </div>

            {runtime.plan ? (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]" style={{ color: theme.node.muted }}>
                    <span>Revision {runtime.plan.plan.currentRevision}</span>
                    <span>·</span>
                    <span>{runtime.plan.plan.estimatedCredits} Credits 上限</span>
                    {runtime.plan.plan.confirmationFingerprint ? <><span>·</span><span>{runtime.plan.plan.confirmationFingerprint.slice(0, 10)}…</span></> : null}
                </div>
            ) : null}

            {runtime.artifacts.length ? (
                <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium opacity-60">Artifact 预览</div>
                    {runtime.artifacts.map((artifact) => <pre key={artifact.artifact.id} className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>{preferredCapabilityOutputText(artifact)}</pre>)}
                </div>
            ) : null}

            {runtime.error ? <div className="mt-3 rounded-md border border-red-400/40 p-2 text-xs text-red-500">{runtime.error}</div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
                {runtime.actions.canEdit && runtime.allowRuntimeSkillOverride ? <Button size="small" icon={<Save className="size-3.5" />} loading={runtime.busy} onClick={() => void execute(runtime.saveRevision, "计划修订已保存")}>保存计划修订</Button> : null}
                {runtime.actions.canPreflight ? <Button size="small" type="primary" icon={<ShieldCheck className="size-3.5" />} loading={runtime.busy} onClick={() => void execute(runtime.preflight, "预检完成")}>预检并冻结</Button> : null}
                {runtime.actions.canConfirm ? <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={runtime.busy} onClick={() => void execute(runtime.confirm, "版本与额度已确认")}>确认版本与额度</Button> : null}
                {runtime.actions.canContinue ? <Button size="small" type="primary" icon={<Play className="size-3.5" />} loading={runtime.busy} onClick={() => void execute(runtime.continuePlan, "Plan 已推进")}>推进 / 同步</Button> : null}
                {runtime.actions.canReview ? <Button size="small" type="primary" icon={<Check className="size-3.5" />} loading={runtime.busy} disabled={!runtime.invocation?.artifactSetHash} onClick={() => void execute(runtime.review, "批准当前产物并完成交接")}>批准当前产物</Button> : null}
                <Button size="small" icon={<RefreshCw className="size-3.5" />} disabled={runtime.busy} onClick={() => void execute(runtime.refresh, "状态已刷新")}>刷新</Button>
                {runtime.actions.canCancel ? <Button size="small" danger icon={<CircleStop className="size-3.5" />} loading={runtime.busy} onClick={() => void execute(runtime.cancel, "Plan 已取消")}>取消</Button> : null}
            </div>
            {runtime.actions.canApply ? <div className="mt-3 text-xs" style={{ color: theme.node.muted }}>最终 Artifact 已就绪，可选择写入对话或画布。</div> : null}
        </div>
    );
}

function statusLabel(status: string) {
    const labels: Record<string, string> = { draft: "草稿", preflight: "预检中", awaiting_confirmation: "等待确认", running: "运行中", needs_review: "等待审核", completed: "已完成", blocked: "已阻断", failed: "失败", cancelled: "已取消" };
    return labels[status] || status;
}
