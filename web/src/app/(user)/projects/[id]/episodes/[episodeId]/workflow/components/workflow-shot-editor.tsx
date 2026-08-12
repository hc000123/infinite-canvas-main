"use client";

import { Button, Input } from "antd";
import { PackageCheck, WandSparkles } from "lucide-react";

import type { ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { useShotPromptDraft } from "../use-shot-prompt-draft";
import { workflowShotNarrative } from "../workflow-shot-narrative";

export function WorkflowShotEditor(props: { canGeneratePrompt?: boolean; generatingPrompt?: boolean; item: ProductionPackage; mode?: "storyboard" | "prompt" | "video"; onGeneratePrompt?: (item: ProductionPackage) => void; packages: ProductionPackage[]; promptReview?: React.ReactNode; referencePanel?: React.ReactNode }) {
    const promptDraft = useShotPromptDraft(props.item);
    const promptStatusLabels = { clean: "未修改", dirty: "等待自动保存", failed: "自动保存失败", saved: "已自动保存", saving: "自动保存中" };
    const narrative = props.item.shotDraft ? workflowShotNarrative(props.item.shotDraft) : props.item.segment;

    return <div className="space-y-3">
        {props.mode !== "video" ? <section className="rounded-md bg-[var(--studio-panel-muted-bg)] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><PackageCheck className="size-4 text-[var(--studio-accent)]" />镜头生产包</div>
            <p className="text-sm leading-7 text-[var(--studio-text-secondary)]">{narrative}</p>
            <div className="mt-2 border-t border-[var(--studio-border-subtle)] pt-2 text-xs leading-5 text-[var(--studio-text-muted)]"><span className="mr-2 font-medium">原剧本</span>{props.item.sourceScript || props.item.segment}</div>
        </section> : null}
        {props.mode === "prompt" ? props.referencePanel : null}
        {props.mode !== "storyboard" ? <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">最终视频提示词</h3><p className="mt-1 text-xs text-[var(--studio-text-muted)]">基于当前分镜、参考图和连续性组合生成。</p>{props.canGeneratePrompt === false ? <p className="mt-1 text-xs text-[var(--studio-warning)]">请先处理当前正在执行或待审核的提示词任务。</p> : null}</div><Button type="primary" icon={<WandSparkles className="size-4" />} loading={props.generatingPrompt} disabled={props.canGeneratePrompt === false} onClick={() => props.onGeneratePrompt?.(props.item)}>生成提示词</Button></div>
            {props.promptReview}
            <div className="mb-2 mt-4 flex items-center justify-between"><label htmlFor="workflow-shot-prompt" className="text-xs font-semibold">最终提示词</label><span className="text-[10px] text-[var(--studio-text-muted)]">{promptStatusLabels[promptDraft.status]} · {promptDraft.prompt.length} 字</span></div>
            <Input.TextArea id="workflow-shot-prompt" autoSize={{ minRows: 10, maxRows: 24 }} placeholder="生成镜头提示词" value={promptDraft.prompt} onChange={(event) => promptDraft.setPrompt(event.target.value)} />
            <div className="mt-3 flex justify-end"><Button type="primary" disabled={!promptDraft.prompt.trim()} onClick={() => void promptDraft.confirm()}>确认提示词</Button></div>
        </section> : null}
    </div>;
}
