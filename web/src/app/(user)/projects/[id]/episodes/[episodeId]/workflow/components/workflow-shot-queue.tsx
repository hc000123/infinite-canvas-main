"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Select } from "antd";
import { CircleAlert, Search } from "lucide-react";

import type { ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { cn } from "@/lib/utils";

import { filterWorkflowShots, workflowVirtualWindow, type WorkflowShotPrimaryStatus } from "../workflow-shot-filter";

const rowHeight = 76;

export function WorkflowShotQueue(props: { onSelect: (id: string) => void; packages: ProductionPackage[]; selectedId: string }) {
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<WorkflowShotPrimaryStatus | "all">("all");
    const [scrollTop, setScrollTop] = useState(0);
    const [height, setHeight] = useState(600);
    const viewportRef = useRef<HTMLDivElement>(null);
    const shots = useMemo(() => props.packages.map((item) => ({ ...item, status: packagePrimaryStatus(item) })), [props.packages]);
    const filtered = useMemo(() => filterWorkflowShots(shots, { keyword, status }), [keyword, shots, status]);
    const window = workflowVirtualWindow(filtered.length, scrollTop, height, rowHeight);

    useEffect(() => {
        if (!viewportRef.current) return;
        const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
        observer.observe(viewportRef.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const index = filtered.findIndex((item) => item.id === props.selectedId);
        if (index < 0 || !viewportRef.current) return;
        const top = index * rowHeight;
        if (top < viewportRef.current.scrollTop || top + rowHeight > viewportRef.current.scrollTop + height) viewportRef.current.scrollTo({ top: Math.max(0, top - rowHeight), behavior: "smooth" });
    }, [filtered, height, props.selectedId]);

    const move = (direction: -1 | 1) => {
        const current = filtered.findIndex((item) => item.id === props.selectedId);
        const next = filtered[Math.min(filtered.length - 1, Math.max(0, current + direction))];
        if (next) props.onSelect(next.id);
    };

    return <aside className="hidden min-h-0 border-r border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] xl:flex xl:flex-col"><div className="shrink-0 border-b border-[var(--studio-border-subtle)] p-3"><div className="mb-3 flex items-center justify-between"><div><div className="text-xs font-semibold">分镜队列</div><div className="mt-1 text-[11px] text-[var(--studio-text-muted)]">{filtered.length}/{props.packages.length} 条</div></div></div><Input allowClear size="small" prefix={<Search className="size-3.5" />} placeholder="搜索编号、场次、剧情" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Select className="mt-2 w-full" size="small" value={status} onChange={setStatus} options={[{ label: "全部状态", value: "all" }, { label: "阻断", value: "blocked" }, { label: "待审核", value: "review" }, { label: "运行中", value: "running" }, { label: "可生成", value: "ready" }, { label: "已完成", value: "completed" }]} /></div><div ref={viewportRef} tabIndex={0} role="listbox" aria-label="分镜列表" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-focus-ring)]" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); move(1); } if (event.key === "ArrowUp") { event.preventDefault(); move(-1); } }}><div style={{ height: window.topSpacer }} />{filtered.slice(window.start, window.end).map((item) => <button key={`${item.projectId}:${item.episodeId}:${item.id}`} type="button" role="option" aria-selected={item.id === props.selectedId} className={cn("mb-1.5 h-[70px] w-full rounded-md border px-3 py-2 text-left transition", item.id === props.selectedId ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-transparent hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)]")} onClick={() => props.onSelect(item.id)}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.id}</span><ShotStatus status={item.status} /></div><div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--studio-text-secondary)]">{item.segment}</div></button>)}<div style={{ height: window.bottomSpacer }} /></div></aside>;
}

export function packagePrimaryStatus(item: ProductionPackage): WorkflowShotPrimaryStatus {
    if (item.generation?.status === "running" || item.generation?.status === "creating" || item.generation?.status === "checking") return "running";
    if (item.generation?.status === "queued") return "queued";
    if (item.assetStatus !== "完整" || item.risks.some((risk) => risk.level === "阻断")) return "blocked";
    if (item.generation?.status === "failed") return "failed";
    if (item.promptStatus !== "已确认") return "review";
    if (item.generation?.status === "succeeded" || item.canvasStatus === "已生成") return "completed";
    return "ready";
}

function ShotStatus({ status }: { status: WorkflowShotPrimaryStatus }) { const labels: Record<WorkflowShotPrimaryStatus, string> = { blocked: "阻断", completed: "完成", failed: "失败", queued: "排队", ready: "可生成", review: "待审核", running: "运行中" }; return <span className={cn("inline-flex items-center gap-1 text-[10px]", ["blocked", "failed"].includes(status) ? "text-[var(--studio-warning)]" : status === "completed" ? "text-[var(--studio-success)]" : "text-[var(--studio-text-muted)]")}>{["blocked", "failed"].includes(status) ? <CircleAlert className="size-3" /> : null}{labels[status]}</span>; }
