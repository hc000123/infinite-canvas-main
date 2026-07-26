"use client";

import { Bot, Copy, GitBranch, Search } from "lucide-react";
import { Button, Empty, Input, Skeleton, Tag } from "antd";
import { useMemo, useState } from "react";

import type { AgentRegistryItem } from "@/services/api/agent-registry";
import { agentRegistrySkillLabel } from "../agent-center-utils";

export function AgentRegistryList({ items, loading, selectedAgentId, copying, onCopy, onSelect }: { items: AgentRegistryItem[]; loading: boolean; selectedAgentId: string; copying: boolean; onCopy: (item: AgentRegistryItem) => void; onSelect: (id: string) => void }) {
    const [keyword, setKeyword] = useState("");
    const visibleItems = useMemo(() => {
        const value = keyword.trim().toLowerCase();
        return value ? items.filter((item) => [item.agent.name, item.agent.summary, ...item.tags].some((text) => text.toLowerCase().includes(value))) : items;
    }, [items, keyword]);

    return (
        <aside className="studio-panel h-fit min-w-0 p-4 xl:sticky xl:top-5">
            <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]"><Bot className="size-5" /></div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">AGENT REGISTRY</p>
                    <h2 className="mt-1 text-lg font-semibold">独立 Agent</h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">负责规划与串联，不复制 Skill 内容。</p>
                </div>
            </div>
            <Input prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} placeholder="搜索名称、职责或标签" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="mt-4" allowClear />

            <div className="mt-4 space-y-2">
                {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
                {!loading && !visibleItems.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可用 Agent" /> : null}
                {visibleItems.map((item) => {
                    const active = item.agent.id === selectedAgentId;
                    const recommended = item.versions.find((version) => version.id === item.agent.recommendedVersionId);
                    return (
                        <div key={item.agent.id} className={`rounded-lg border transition ${active ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}>
                            <button type="button" aria-pressed={active} className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-accent)]" onClick={() => onSelect(item.agent.id)}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{item.agent.name}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.agent.summary || "暂无职责说明"}</div></div>
                                    <Tag color={item.agent.ownerType === "system" ? "blue" : "gold"} className="m-0 shrink-0">{item.agent.ownerType === "system" ? "系统" : "项目"}</Tag>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--studio-text-muted)]">
                                    <span className="inline-flex items-center gap-1"><GitBranch className="size-3.5" />{agentRegistrySkillLabel(item.recommendedPackage)}</span>
                                    <span>{recommended ? `v${recommended.version}` : `${item.versions.length} 个版本`}</span>
                                </div>
                            </button>
                            {item.agent.ownerType === "system" ? <div className="border-t border-[var(--studio-border-subtle)] px-3 py-2"><Button type="text" size="small" icon={<Copy className="size-3.5" />} loading={copying} onClick={() => onCopy(item)}>复制到本项目</Button></div> : null}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
