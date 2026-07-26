"use client";

import { Alert, App, Button, Descriptions, Drawer, Empty, Select, Spin, Tag } from "antd";
import { Check, CircleStop, FileCheck2, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { capabilityRouteIssueLabel, preferredCapabilityOutputText } from "./capability-run-model";
import { useCapabilityRun, type UseCapabilityRunOptions } from "./use-capability-run";

export type CapabilityRunDrawerProps = Omit<UseCapabilityRunOptions, "enabled"> & {
    open: boolean;
    onClose: () => void;
    title?: string;
};

const statusLabels: Record<string, string> = {
    draft: "待预检",
    preflight: "预检中",
    awaiting_confirmation: "待确认",
    queued: "已排队",
    running: "执行中",
    cancel_requested: "正在取消",
    needs_review: "待审核",
    approved: "已批准",
    applied: "已使用",
    blocked: "已阻断",
    failed: "失败",
    partial: "部分完成",
    rejected: "已拒绝",
    cancelled: "已取消",
};

function statusColor(status: string) {
    if (status === "applied" || status === "approved") return "success";
    if (status === "failed" || status === "blocked" || status === "cancelled" || status === "rejected") return "error";
    if (status === "awaiting_confirmation" || status === "needs_review" || status === "partial") return "warning";
    if (status === "draft") return "default";
    return "processing";
}

const shortHash = (value: string) => value ? `${value.slice(0, 18)}${value.length > 18 ? "…" : ""}` : "—";

export function CapabilityRunDrawer({ open, onClose, title = "Skill 能力", ...options }: CapabilityRunDrawerProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const run = useCapabilityRun({ ...options, enabled: open });
    const candidate = run.preflight?.routeTrace.candidates.find((item) => item.skillVersionId === run.selectedSkill?.skillVersionId);
    const routeIssues = [...(candidate?.reasons || []), ...(run.preflight?.blockReasons.map((item) => item.code) || [])].filter((code, index, values) => values.indexOf(code) === index);

    const execute = async (action: () => Promise<unknown>, success: string) => {
        try {
            await action();
            message.success(success);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        }
    };

    return (
        <Drawer
            rootClassName="studio-modal"
            title={<div className="flex items-center gap-2"><Sparkles className="size-4 text-[var(--studio-accent)]" /><span>{title}</span></div>}
            placement="right"
            size="large"
            open={open}
            onClose={onClose}
            styles={{ body: { background: theme.canvas.background, color: theme.node.text, padding: 0 } }}
        >
            <div className="min-h-full" style={{ background: theme.canvas.background, color: theme.node.text }}>
                <header className="border-b px-5 py-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-[11px] font-semibold tracking-[0.18em]" style={{ color: theme.node.faint }}>VERSIONED ARTIFACT RUN</div>
                            <div className="mt-1 text-sm" style={{ color: theme.node.muted }}>选择已发布 Skill，冻结输入与版本，审核后再写回当前页面。</div>
                        </div>
                        <Tag color={statusColor(run.status)}>{statusLabels[run.status] || run.status}</Tag>
                    </div>
                </header>

                <div className="space-y-4 p-5">
                    {run.error ? <Alert type="error" showIcon title={run.error} /> : null}
                    {!run.fingerprintMatches && run.frozenLocalFingerprint ? <Alert type="warning" showIcon title="当前文本或 Skill 已与预检快照不同" description="确认已锁定；请重新预检生成新的 Invocation。" /> : null}

                    <section className="rounded-lg border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <div className="mb-2 flex items-center justify-between gap-3"><div className="text-sm font-semibold">Skill 版本</div><Tag>{run.skillOptions.length} 个可见版本</Tag></div>
                        <Select
                            className="w-full"
                            value={run.selectedSkillVersionId || undefined}
                            loading={run.loading}
                            disabled={Boolean(run.preflight) || run.busy}
                            placeholder="选择 Skill"
                            onChange={run.setSelectedSkillVersionId}
                            options={run.skillOptions.map((skill) => {
                                const compatibility = run.compatibilities.get(skill.skillVersionId);
                                const suffix = compatibility?.compatible ? "可运行" : `缺少 ${compatibility?.missingBindings.join("/") || "输入"}`;
                                return { value: skill.skillVersionId, label: `${skill.skillName} v${skill.version}${skill.isRecommended ? " · 推荐" : ""} · ${suffix}` };
                            })}
                        />
                        {run.selectedSkill ? <div className="mt-3 space-y-2 text-xs" style={{ color: theme.node.muted }}>
                            <p>{run.selectedSkill.summary || "无说明"}</p>
                            <div className="flex flex-wrap gap-1.5">{run.selectedSkill.inputBindings.map((binding) => <Tag key={binding.bindingName}>{binding.bindingName}: {binding.artifactType}{binding.required || binding.min ? " *" : ""}</Tag>)}</div>
                            <div className="flex flex-wrap gap-1.5">{run.selectedSkill.outputBindings.map((binding) => <Tag color="blue" key={binding.bindingName}>{binding.bindingName} → {binding.artifactType}</Tag>)}</div>
                            {run.compatibility?.missingBindings.length ? <div className="text-[var(--studio-danger)]">缺少 Binding：{run.compatibility.missingBindings.join("、")}</div> : <div>输入已匹配：{Object.entries(run.compatibility?.selectedArtifactIdsByBinding || {}).map(([binding, id]) => `${binding}=${shortHash(id)}`).concat(run.compatibility?.pendingSourceTextBindings.map((binding) => `${binding}=当前文本`) || []).join("；") || "无输入"}</div>}
                        </div> : null}
                    </section>

                    {run.preflight ? <section className="rounded-lg border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">冻结预检</div><ShieldCheck className="size-4" style={{ color: theme.node.muted }} /></div>
                        <Descriptions size="small" column={1} items={[
                            { key: "version", label: "Skill", children: `${run.selectedSkill?.skillName || run.preflight.revision.skillId} v${run.preflight.revision.skillVersion}` },
                            { key: "hash", label: "Content Hash", children: shortHash(run.preflight.revision.skillContentHash) },
                            { key: "model", label: "执行模型", children: run.preflight.executionPolicy.model || "未配置" },
                            { key: "cost", label: "预估额度", children: `${run.preflight.executionPolicy.estimatedCredits} Credits` },
                            { key: "artifact", label: "本次 source_text", children: run.sourceArtifact ? shortHash(run.sourceArtifact.artifact.id) : "使用已批准 Artifact" },
                        ]} />
                        {routeIssues.length ? <div className="mt-3 space-y-1 rounded-md border p-3 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>{routeIssues.map((code) => <div key={code}>{capabilityRouteIssueLabel(code)}</div>)}</div> : null}
                    </section> : null}

                    {run.detail?.outputArtifacts.length ? <section className="rounded-lg border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Artifact 预览</div><Tag>{run.detail.outputArtifacts.length}</Tag></div>
                        <div className="space-y-3">{run.detail.outputArtifacts.map((artifact) => <article key={artifact.artifact.id} className="rounded-md border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><Tag color="blue">{artifact.artifact.artifactType}</Tag><span style={{ color: theme.node.faint }}>{shortHash(artifact.artifact.id)}</span></div>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-5" style={{ color: theme.node.text }}>{preferredCapabilityOutputText(artifact)}</pre>
                            {artifact.parentArtifactIds.length ? <div className="mt-2 text-[11px]" style={{ color: theme.node.faint }}>父链：{artifact.parentArtifactIds.map(shortHash).join("、")}</div> : null}
                        </article>)}</div>
                    </section> : run.status === "needs_review" || run.status === "approved" ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前 Artifact-set 为空，不能使用" /> : null}

                    {run.loading ? <div className="grid min-h-32 place-items-center"><Spin /></div> : null}

                    <footer className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t px-5 py-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <Button icon={<RotateCcw className="size-4" />} disabled={run.busy} onClick={run.reset}>新运行</Button>
                        <Button type="primary" icon={<Play className="size-4" />} loading={run.busy && run.actions.canPreflight} disabled={run.busy || !run.actions.canPreflight || !run.compatibility?.compatible} onClick={() => void execute(run.preflightRun, "预检已冻结") }>预检</Button>
                        <Button icon={<ShieldCheck className="size-4" />} disabled={run.busy || !run.actions.canConfirm} onClick={() => void execute(run.confirm, "已确认版本与额度") }>确认</Button>
                        <Button icon={<RefreshCw className="size-4" />} disabled={run.busy || !run.preflight} onClick={() => void execute(run.refresh, "状态已刷新") }>刷新</Button>
                        <Button danger icon={<CircleStop className="size-4" />} disabled={run.busy || !run.actions.canCancel} onClick={() => void execute(run.cancel, "已请求取消") }>取消</Button>
                        <Button icon={<Check className="size-4" />} disabled={run.busy || !run.actions.canApprove} onClick={() => void execute(() => run.review("approved"), "Artifact-set 已批准") }>批准</Button>
                        <Button danger icon={<X className="size-4" />} disabled={run.busy || !run.actions.canReject} onClick={() => void execute(() => run.review("rejected"), "Artifact-set 已拒绝") }>拒绝</Button>
                        <Button icon={<RefreshCw className="size-4" />} disabled={run.busy || !run.actions.canRetry} onClick={() => void execute(run.retry, "已创建重试 Attempt") }>重试</Button>
                        <Button type="primary" icon={<FileCheck2 className="size-4" />} disabled={run.busy || !run.actions.canApply || !run.detail?.outputArtifacts.length} onClick={() => void execute(run.apply, "产物已写入当前页面并记录回执") }>使用此产物</Button>
                    </footer>
                </div>
            </div>
        </Drawer>
    );
}
