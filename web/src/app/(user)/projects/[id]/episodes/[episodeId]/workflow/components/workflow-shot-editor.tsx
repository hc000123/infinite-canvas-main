"use client";

import { useEffect, useState } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import { Check, ChevronLeft, ChevronRight, FileText, Save, WandSparkles } from "lucide-react";

import { useVideoPackageStore, type ProductionPackage, type WorkflowShotDraft } from "@/app/(user)/video/use-video-package-store";

import { confirmShotDraft, refreshContinuityReference, updateShotDraft } from "../workflow-production-state";
import { useShotPromptDraft } from "../use-shot-prompt-draft";

export function WorkflowShotEditor(props: { canGeneratePrompt?: boolean; generatingPrompt?: boolean; item: ProductionPackage; onGeneratePrompt?: (item: ProductionPackage) => void; onSelect: (id: string) => void; packages: ProductionPackage[]; promptReview?: React.ReactNode }) {
    const promptDraft = useShotPromptDraft(props.item);
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const [shotDraft, setShotDraft] = useState<WorkflowShotDraft>(() => draftOf(props.item));
    const [shotDirty, setShotDirty] = useState(false);
    const index = props.packages.findIndex((item) => item.id === props.item.id);

    useEffect(() => { setShotDraft(draftOf(props.item)); setShotDirty(false); }, [props.item]);
    const change = <K extends keyof WorkflowShotDraft>(key: K, value: WorkflowShotDraft[K]) => { setShotDraft((current) => ({ ...current, [key]: value })); setShotDirty(true); };
    const saveShot = () => { updatePackage(props.item, updateShotDraft(props.item, shotDraft)); setShotDirty(false); };
    const confirmShot = () => { const next = shotDirty ? updateShotDraft(props.item, shotDraft) : props.item; updatePackage(props.item, confirmShotDraft(refreshContinuityReference(next, props.packages[index - 1]))); setShotDirty(false); };
    const move = async (direction: -1 | 1) => { if (!(await promptDraft.save())) return; const next = props.packages[index + direction]; if (next) props.onSelect(next.id); };
    const promptStatusLabels = { clean: "未修改", dirty: "未保存", failed: "保存失败", saved: "已保存", saving: "保存中" };

    return <div className="space-y-3">
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-medium text-[var(--studio-accent)]">{props.item.id} · {props.item.sceneKey}</div><h3 className="mt-1 text-lg font-semibold">{props.item.segment}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">镜头 {props.item.shotStatus === "confirmed" ? "已确认" : "待确认"} · 提示词 {props.item.promptStatus}</p></div><div className="flex gap-2"><Button icon={<ChevronLeft className="size-4" />} disabled={index <= 0} onClick={() => void move(-1)}>上一镜</Button><Button icon={<ChevronRight className="size-4" />} disabled={index < 0 || index >= props.packages.length - 1} onClick={() => void move(1)}>下一镜</Button></div></div>
        </section>
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><FileText className="size-4 text-[var(--studio-accent)]" />对应原剧本</div>
            <div className="whitespace-pre-wrap rounded-md bg-[var(--studio-panel-muted-bg)] p-3 text-sm leading-7 text-[var(--studio-text-secondary)]">{props.item.sourceScript || "暂无原剧本片段"}</div>
        </section>
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">结构化分镜</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">先修改并确认本镜，再结合资产图片生成最终提示词。</p></div><span className={`text-xs ${shotDirty ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-muted)]"}`}>{shotDirty ? "有未保存修改" : "已保存"}</span></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="景别"><Input value={shotDraft.shotSize} onChange={(event) => change("shotSize", event.target.value)} /></Field><Field label="机位"><Input value={shotDraft.camera} onChange={(event) => change("camera", event.target.value)} /></Field><Field label="运镜"><Input value={shotDraft.movement} onChange={(event) => change("movement", event.target.value)} /></Field><Field label="连续方式"><Select className="w-full" value={shotDraft.continuityMode} options={[{ label: "承接上一镜连续动作", value: "continuous" }, { label: "独立切镜", value: "cut" }]} onChange={(value) => change("continuityMode", value)} /></Field><Field label="主体动作" wide><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={shotDraft.action} onChange={(event) => change("action", event.target.value)} /></Field><Field label="表演与情绪" wide><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={shotDraft.performance} onChange={(event) => change("performance", event.target.value)} /></Field><Field label="台词 / 旁白" wide><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={shotDraft.dialogue} onChange={(event) => change("dialogue", event.target.value)} /></Field><Field label="时长（秒）"><InputNumber className="w-full" min={4} max={15} value={shotDraft.durationSeconds} onChange={(value) => change("durationSeconds", Number(value) || 6)} /></Field></div>
            {props.item.continuityReference ? <div className="mt-4 rounded-md border border-[var(--studio-accent)]/35 bg-[var(--studio-active-bg)] px-3 py-2 text-xs leading-5"><div className="font-semibold">上一镜尾帧 · 剧情连续性参考</div><div className="mt-1 text-[var(--studio-text-secondary)]">本镜从该画面之后继续发展，保持场景与角色一致；不会把它当作首帧，也不会要求复刻画面。</div>{props.item.continuityReference.updateAvailable ? <div className="mt-1 text-[var(--studio-warning)]">上一镜已有新版本，当前仍冻结旧参考；重新确认后再替换。</div> : null}</div> : null}
            <div className="mt-4 flex justify-end gap-2"><Button icon={<Save className="size-4" />} disabled={!shotDirty} onClick={saveShot}>保存分镜</Button><Button type="primary" icon={<Check className="size-4" />} onClick={confirmShot}>确认分镜</Button></div>
        </section>
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">多模态视频提示词</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">输入包含原剧本、已确认分镜、绑定资产图及连续性尾帧参考。</p>{props.canGeneratePrompt === false ? <p className="mt-1 text-xs text-[var(--studio-warning)]">请先处理当前正在执行或待审核的提示词任务。</p> : null}</div><Button type="primary" icon={<WandSparkles className="size-4" />} loading={props.generatingPrompt} disabled={props.canGeneratePrompt === false || props.item.shotStatus !== "confirmed" || shotDirty} onClick={() => props.onGeneratePrompt?.(props.item)}>生成提示词</Button></div>
            {props.promptReview}
            <div className="mt-4 mb-2 flex items-center justify-between"><label htmlFor="workflow-shot-prompt" className="text-xs font-semibold">最终提示词</label><span className="text-[10px] text-[var(--studio-text-muted)]">{promptStatusLabels[promptDraft.status]} · {promptDraft.prompt.length} 字</span></div><Input.TextArea id="workflow-shot-prompt" autoSize={{ minRows: 12, maxRows: 26 }} placeholder="确认分镜后生成提示词" value={promptDraft.prompt} onChange={(event) => promptDraft.setPrompt(event.target.value)} /><div className="mt-3 flex justify-end gap-2"><Button icon={<Save className="size-4" />} loading={promptDraft.status === "saving"} disabled={["clean", "saved"].includes(promptDraft.status)} onClick={() => void promptDraft.save()}>保存</Button><Button type="primary" icon={<Check className="size-4" />} disabled={!promptDraft.prompt.trim()} onClick={() => void promptDraft.confirm()}>确认提示词</Button></div>
        </section>
        <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="text-xs font-semibold">已绑定参考资产</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{props.item.assets.map((asset) => <div key={`${asset.kind}:${asset.name}`} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] px-3 py-2 text-xs"><span className="text-[var(--studio-text-muted)]">{asset.kind}</span><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate">{asset.name}</span><span className={asset.status === "已绑定" ? "text-[var(--studio-success)]" : "text-[var(--studio-warning)]"}>{asset.status}</span></div></div>)}</div></section>
    </div>;
}

function Field({ children, label, wide }: { children: React.ReactNode; label: string; wide?: boolean }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">{label}</span>{children}</label>; }
function draftOf(item: ProductionPackage): WorkflowShotDraft { return item.shotDraft || { shotSize: "中景", camera: "平视", movement: "固定机位", action: item.segment, performance: "自然克制", dialogue: "", durationSeconds: Number.parseFloat(item.duration) || 6, continuityMode: "cut" }; }
