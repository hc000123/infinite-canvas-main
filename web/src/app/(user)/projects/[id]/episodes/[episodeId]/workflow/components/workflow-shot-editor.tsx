"use client";

import { Button, Input } from "antd";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";

import type { ProductionPackage } from "@/app/(user)/video/use-video-package-store";

import { useShotPromptDraft } from "../use-shot-prompt-draft";

export function WorkflowShotEditor(props: { item: ProductionPackage; onSelect: (id: string) => void; packages: ProductionPackage[] }) {
    const draft = useShotPromptDraft(props.item);
    const index = props.packages.findIndex((item) => item.id === props.item.id);
    const move = async (direction: -1 | 1) => {
        if (!(await draft.save())) return;
        const next = props.packages[index + direction];
        if (next) props.onSelect(next.id);
    };
    const statusLabels = { clean: "未修改", dirty: "未保存", failed: "保存失败", saved: "已保存", saving: "保存中" };
    return <div className="space-y-3"><section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-medium text-[var(--studio-accent)]">{props.item.id} · {props.item.sceneKey}</div><h3 className="mt-1 text-lg font-semibold">{props.item.segment}</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">{props.item.duration} · 当前状态 {props.item.promptStatus}</p></div><span className={`text-xs ${draft.status === "failed" ? "text-[var(--studio-danger)]" : draft.status === "dirty" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-muted)]"}`}>{statusLabels[draft.status]}</span></div></section><section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="mb-2 flex items-center justify-between"><label htmlFor="workflow-shot-prompt" className="text-xs font-semibold">Seedance 视频提示词</label><span className="text-[10px] tabular-nums text-[var(--studio-text-muted)]">{draft.prompt.length} 字</span></div><Input.TextArea id="workflow-shot-prompt" autoSize={{ minRows: 14, maxRows: 26 }} value={draft.prompt} onChange={(event) => draft.setPrompt(event.target.value)} /><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Button icon={<ChevronLeft className="size-4" />} disabled={index <= 0} onClick={() => void move(-1)}>上一条</Button><Button icon={<ChevronRight className="size-4" />} disabled={index < 0 || index >= props.packages.length - 1} onClick={() => void move(1)}>下一条</Button></div><div className="flex gap-2"><Button icon={<Save className="size-4" />} loading={draft.status === "saving"} disabled={draft.status === "clean" || draft.status === "saved"} onClick={() => void draft.save()}>保存</Button><Button type="primary" icon={<Check className="size-4" />} disabled={props.item.promptStatus === "已确认" && draft.status !== "dirty"} onClick={() => void draft.confirm()}>确认提示词</Button></div></div></section><section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4"><div className="text-xs font-semibold">参考资产</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{props.item.assets.map((asset) => <div key={`${asset.kind}:${asset.name}`} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] px-3 py-2 text-xs"><span className="text-[var(--studio-text-muted)]">{asset.kind}</span><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate">{asset.name}</span><span className={asset.status === "已绑定" ? "text-[var(--studio-success)]" : "text-[var(--studio-warning)]"}>{asset.status}</span></div></div>)}</div></section></div>;
}
