"use client";

import { Button, Empty, Input, Skeleton, Tag } from "antd";
import { Copy, GitFork, Plus, Search, Workflow } from "lucide-react";
import { useMemo, useState } from "react";

import type { WorkflowRegistryItem } from "@/services/api/workflow-registry";

export function WorkflowRegistryList({ items, loading, selectedWorkflowId, busy, onCopy, onCreate, onSelect }: { items: WorkflowRegistryItem[]; loading: boolean; selectedWorkflowId: string; busy: boolean; onCopy: (item: WorkflowRegistryItem) => void; onCreate: () => void; onSelect: (id: string) => void }) {
    const [keyword, setKeyword] = useState("");
    const visibleItems = useMemo(() => {
        const value = keyword.trim().toLowerCase();
        return value ? items.filter((item) => [item.workflow.name, item.workflow.summary, ...item.tags].some((text) => text.toLowerCase().includes(value))) : items;
    }, [items, keyword]);

    return (
        <aside className="studio-panel h-fit min-w-0 p-4 2xl:sticky 2xl:top-5">
            <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]"><Workflow className="size-5" /></div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">WORKFLOW REGISTRY</p>
                    <h2 className="mt-1 text-lg font-semibold">组合工作流</h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">只保存节点与引用，不复制 Skill 或 Agent 内容。</p>
                </div>
            </div>
            <Button className="mt-4 w-full" type="primary" icon={<Plus className="size-4" />} loading={busy} onClick={onCreate}>新建项目 Workflow</Button>
            <Input prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} placeholder="搜索名称、说明或标签" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="mt-3" allowClear />
            <div className="mt-4 space-y-2">
                {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
                {!loading && !visibleItems.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有 Workflow" /> : null}
                {visibleItems.map((item) => {
                    const active = item.workflow.id === selectedWorkflowId;
                    const recommended = item.versions.find((version) => version.id === item.workflow.recommendedVersionId);
                    return (
                        <div key={item.workflow.id} className={`rounded-lg border transition ${active ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}>
                            <button type="button" aria-pressed={active} className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]" onClick={() => onSelect(item.workflow.id)}>
                                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold">{item.workflow.name}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.workflow.summary || "暂无流程说明"}</div></div><Tag color={item.workflow.ownerType === "system" ? "blue" : "gold"} className="m-0 shrink-0">{item.workflow.ownerType === "system" ? "系统" : "项目"}</Tag></div>
                                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[var(--studio-text-muted)]"><span className="inline-flex items-center gap-1"><GitFork className="size-3.5" />{item.recommendedPackage ? `${item.recommendedPackage.nodes.length} 节点` : "待发布"}</span><span>{recommended ? `v${recommended.version}` : `${item.versions.length} 版本`}</span></div>
                            </button>
                            {item.workflow.ownerType === "system" ? <div className="border-t border-[var(--studio-border-subtle)] px-3 py-2"><Button type="text" size="small" icon={<Copy className="size-3.5" />} loading={busy} onClick={() => onCopy(item)}>复制到本项目</Button></div> : null}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
