"use client";

import { PackageCheck } from "lucide-react";
import type { ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { workflowShotNarrative } from "../workflow-shot-narrative";

export function WorkflowProductionPackages({ packages, selectedId, onSelect, selectedContent }: { packages: ProductionPackage[]; selectedId: string; onSelect: (id: string) => void; selectedContent: React.ReactNode }) {
    return <div className="space-y-2">{packages.map((item, index) => {
        const active = item.id === selectedId;
        return <article key={item.id} className={`overflow-hidden rounded-md border bg-[var(--studio-panel-bg)] ${active ? "border-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)]"}`}>
            <button type="button" className="grid w-full gap-3 px-4 py-3 text-left md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center" onClick={() => onSelect(item.id)}>
                <span className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="size-4 text-[var(--studio-accent)]" />{item.id}</span>
                <span className="line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.shotDraft ? workflowShotNarrative(item.shotDraft) : item.segment}</span>
                <span className="text-[10px] text-[var(--studio-text-muted)]">{index + 1}/{packages.length} · {item.referenceBindings?.length || 0} 张参考 · {item.promptStatus}</span>
            </button>
            {active ? <div className="border-t border-[var(--studio-border-subtle)] p-3">{selectedContent}</div> : null}
        </article>;
    })}</div>;
}
