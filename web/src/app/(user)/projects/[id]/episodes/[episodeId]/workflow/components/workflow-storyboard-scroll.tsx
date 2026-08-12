"use client";

import { useEffect, useState } from "react";
import { Input } from "antd";
import { Clock3 } from "lucide-react";

import { useVideoPackageStore, type ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { updateShotDraft } from "../workflow-production-state";
import { workflowShotNarrative } from "../workflow-shot-narrative";

export function WorkflowStoryboardScroll({ packages, selectedId, onSelect }: { packages: ProductionPackage[]; selectedId?: string; onSelect: (id: string) => void }) {
    return <section className="space-y-2" aria-label="自然语言分镜长卷">{packages.map((item, index) => <StoryboardRow key={item.id} item={item} index={index} active={item.id === selectedId} onSelect={onSelect} />)}</section>;
}

function StoryboardRow({ active, index, item, onSelect }: { active: boolean; index: number; item: ProductionPackage; onSelect: (id: string) => void }) {
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const initial = workflowShotNarrative(item.shotDraft || fallbackDraft(item));
    const [narrative, setNarrative] = useState(initial);
    useEffect(() => setNarrative(initial), [initial, item.id]);
    const save = () => {
        const value = narrative.trim();
        if (!value || value === initial || !item.shotDraft) return;
        updatePackage(item, updateShotDraft(item, { narrative: value }));
    };
    return <article className={`grid gap-3 rounded-md border bg-[var(--studio-panel-bg)] p-3 transition lg:grid-cols-[108px_minmax(0,1fr)] ${active ? "border-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)]"}`} onFocus={() => onSelect(item.id)}>
        <button type="button" className="flex min-w-0 flex-row items-center justify-between gap-3 text-left lg:flex-col lg:items-start" onClick={() => onSelect(item.id)}>
            <span><span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--studio-text-muted)]">Shot {String(index + 1).padStart(2, "0")}</span><span className="mt-1 block text-sm font-semibold">{item.id}</span></span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--studio-text-muted)]"><Clock3 className="size-3" />{item.shotDraft?.durationSeconds || Number.parseFloat(item.duration) || 6} 秒</span>
        </button>
        <div className="min-w-0">
            <div className="mb-2 line-clamp-2 text-xs leading-5 text-[var(--studio-text-muted)]"><span className="mr-2 font-medium text-[var(--studio-text-secondary)]">原剧本</span>{item.sourceScript || item.segment}</div>
            <Input.TextArea aria-label={`${item.id} 自然语言分镜`} autoSize={{ minRows: 2, maxRows: 7 }} value={narrative} onChange={(event) => setNarrative(event.target.value)} onBlur={save} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--studio-text-muted)]"><span>{item.shotDraft?.continuityMode === "continuous" ? "承接上一镜" : "独立切镜"}</span><span>修改后自动保存</span><span>{storyboardPromptLabel(item.promptStatus)}</span></div>
        </div>
    </article>;
}

function fallbackDraft(item: ProductionPackage) {
    return { shotSize: "中景", camera: "平视", movement: "固定机位", action: item.segment, performance: "", dialogue: "", durationSeconds: Number.parseFloat(item.duration) || 6, continuityMode: "cut" as const };
}

function storyboardPromptLabel(status: ProductionPackage["promptStatus"]) {
    if (status === "需修改") return "提示词需重新生成";
    if (status === "已确认") return "提示词已就绪";
    return "提示词待生成";
}
