"use client";

import { useQuery } from "@tanstack/react-query";
import { App, Empty, Skeleton, Tag } from "antd";
import { Bot, Boxes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchAdminAgents } from "@/services/api/admin-agents";
import { fetchSkillOptions } from "@/services/api/admin-skills";
import { useUserStore } from "@/stores/use-user-store";
import { AgentRegistryList } from "../../../(user)/projects/[id]/agents/components/agent-registry-list";
import { AgentVersionEditor } from "../../../(user)/projects/[id]/agents/components/agent-version-editor";

export default function AdminAgentsPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [selectedAgentId, setSelectedAgentId] = useState("");
    const agentsQuery = useQuery({ queryKey: ["admin", "agents", token], queryFn: () => fetchAdminAgents(token), enabled: Boolean(token), retry: false });
    const skillsQuery = useQuery({ queryKey: ["admin", "agent-skill-options", token], queryFn: () => fetchSkillOptions(token, {}), enabled: Boolean(token), retry: false });
    const agents = useMemo(() => agentsQuery.data || [], [agentsQuery.data]);
    const selected = agents.find((item) => item.agent.id === selectedAgentId) || agents[0];

    useEffect(() => {
        if (selected && selected.agent.id !== selectedAgentId) setSelectedAgentId(selected.agent.id);
    }, [selected, selectedAgentId]);
    useEffect(() => {
        const error = agentsQuery.error || skillsQuery.error;
        if (error) message.error(error instanceof Error ? error.message : "读取 Agent 中心失败");
    }, [agentsQuery.error, message, skillsQuery.error]);

    if (agentsQuery.isLoading) return <main className="p-6"><Skeleton active paragraph={{ rows: 14 }} /></main>;

    return (
        <main className="p-6 max-md:p-3">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
                <header className="studio-panel p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div><p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">SYSTEM ORCHESTRATION REGISTRY</p><h1 className="mt-2 text-3xl font-semibold">Agent 中心</h1><p className="mt-2 text-sm text-[var(--studio-text-secondary)]">管理员维护系统 Agent 的职责、Skill 权限与调度顺序；制作人员只使用推荐发布版。</p></div>
                        <div className="flex gap-2"><Tag icon={<Bot className="size-3.5" />}>{agents.length} 个系统 Agent</Tag><Tag icon={<Boxes className="size-3.5" />}>{skillsQuery.data?.length || 0} 个 Skill 版本</Tag></div>
                    </div>
                </header>
                {agents.length ? <div className="grid min-w-0 gap-5 xl:grid-cols-[310px_minmax(0,1fr)]"><AgentRegistryList items={agents} loading={false} selectedAgentId={selected?.agent.id || ""} copying={false} onCopy={() => undefined} onSelect={setSelectedAgentId} showSystemCopy={false} /><AgentVersionEditor item={selected} projectId="" skillOptions={skillsQuery.data || []} mode="system-admin" adminToken={token} /></div> : <section className="studio-panel grid min-h-72 place-items-center"><Empty description="尚无系统 Agent" /></section>}
            </div>
        </main>
    );
}
