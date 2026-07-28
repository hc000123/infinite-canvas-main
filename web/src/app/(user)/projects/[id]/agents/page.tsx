"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Spin, Tabs, Tag } from "antd";
import { ArrowLeft, Bot, Boxes, Play, Workflow } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { fetchSkillOptions } from "@/services/api/admin-skills";
import { createAgent, fetchAgents, type AgentRegistryItem } from "@/services/api/agent-registry";
import { useUserStore } from "@/stores/use-user-store";
import { useCreativeProjectStore } from "../../use-creative-project-store";
import { loadAgentCenterSession, saveAgentCenterSession } from "./agent-center-session";
import { agentCenterSessionStorage } from "./agent-center-session-storage";
import { AgentRegistryList } from "./components/agent-registry-list";
import { AgentRunConsole } from "./components/agent-run-console";
import { AgentVersionEditor } from "./components/agent-version-editor";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "操作失败");

export default function ProjectAgentCenterPage() {
    const params = useParams<{ id: string }>();
    const projectId = params.id;
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const [selectedAgentId, setSelectedAgentId] = useState("");
    const [activeTab, setActiveTab] = useState<"definition" | "run">("definition");
    const [sessionLoaded, setSessionLoaded] = useState(false);

    const agentsQuery = useQuery({
        queryKey: ["agent-registry", projectId],
        queryFn: () => fetchAgents(projectId),
        enabled: hydrated && Boolean(project),
        retry: false,
    });
    const skillOptionsQuery = useQuery({
        queryKey: ["skill-options", projectId],
        queryFn: () => fetchSkillOptions(token, { projectId }),
        enabled: hydrated && Boolean(project) && Boolean(token),
        retry: false,
    });
    const agents = useMemo(() => agentsQuery.data || [], [agentsQuery.data]);
    const selectedAgent = agents.find((item) => item.agent.id === selectedAgentId);

    useEffect(() => {
        let active = true;
        setSessionLoaded(false);
        void loadAgentCenterSession(agentCenterSessionStorage, projectId).then((session) => {
            if (!active) return;
            if (session) {
                setSelectedAgentId(session.selectedAgentId);
                setActiveTab(session.activeTab);
            }
            setSessionLoaded(true);
        }).catch(() => { if (active) setSessionLoaded(true); });
        return () => { active = false; };
    }, [projectId]);
    useEffect(() => {
        if (!sessionLoaded) return;
        if (!agents.length) {
            setSelectedAgentId("");
            return;
        }
        if (!agents.some((item) => item.agent.id === selectedAgentId)) {
            setSelectedAgentId(agents.find((item) => item.agent.ownerType === "project")?.agent.id || agents[0].agent.id);
        }
    }, [agents, selectedAgentId, sessionLoaded]);
    useEffect(() => {
        if (!sessionLoaded || !selectedAgentId) return;
        void saveAgentCenterSession(agentCenterSessionStorage, projectId, { selectedAgentId, activeTab }).catch(() => undefined);
    }, [activeTab, projectId, selectedAgentId, sessionLoaded]);
    useEffect(() => {
        const error = agentsQuery.error || skillOptionsQuery.error;
        if (error) message.error(errorText(error));
    }, [agentsQuery.error, message, skillOptionsQuery.error]);

    const copyMutation = useMutation({
        mutationFn: async (item: AgentRegistryItem) => {
            if (!item.recommendedPackage) throw new Error("该系统 Agent 暂无可复制的推荐版本");
            const name = nextCopyName(item.agent.name, agents);
            return createAgent({
                projectId,
                name,
                summary: item.agent.summary,
                tags: item.tags,
                version: "1.0.0",
                package: { ...structuredClone(item.recommendedPackage), contentHash: "" },
            });
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["agent-registry", projectId] });
            setSelectedAgentId(result.agent.id);
            setActiveTab("definition");
            message.success("已复制为项目 Agent 草稿，可独立调整 Skill 组合");
        },
        onError: (error) => message.error(errorText(error)),
    });

    if (!hydrated) {
        return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description="正在读取本地项目" /></main>;
    }
    if (!project) {
        return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Empty description="项目不存在或尚未加载"><Button href="/projects">返回项目中心</Button></Empty></main>;
    }

    return (
        <main className="studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-7 lg:px-8">
                <header className="border-b border-[var(--studio-border-subtle)] pb-5">
                    <div className="flex items-center gap-3"><Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--studio-text-secondary)] transition hover:text-[var(--studio-accent)]"><ArrowLeft className="size-4" />返回项目</Link><span className="text-xs text-[var(--studio-text-muted)]">{project.title}</span></div>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2"><Bot className="size-6 text-[var(--studio-accent)]" /><h1 className="text-3xl font-semibold">Agent 中心</h1></div>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--studio-text-secondary)]">Agent 负责规划、权限和 Skill 顺序；Skill 保持独立版本。定义一次后，可由工作流、画布、图片或 API 共用同一套运行时。</p>
                        </div>
                        <div className="flex flex-wrap gap-2"><Tag icon={<Workflow className="size-3.5" />}>{agents.length} 个 Agent</Tag><Tag icon={<Boxes className="size-3.5" />}>{skillOptionsQuery.data?.length || 0} 个可用 Skill 版本</Tag></div>
                    </div>
                </header>

                <div className="grid min-w-0 gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
                    <AgentRegistryList items={agents} loading={agentsQuery.isLoading} selectedAgentId={selectedAgentId} copying={copyMutation.isPending} onCopy={(item) => copyMutation.mutate(item)} onSelect={setSelectedAgentId} />
                    <div className="min-w-0">
                        <Tabs
                            activeKey={activeTab}
                            onChange={(key) => setActiveTab(key as "definition" | "run")}
                            items={[
                                { key: "definition", label: <span className="inline-flex items-center gap-2"><Boxes className="size-4" />定义与版本</span>, children: <AgentVersionEditor item={selectedAgent} projectId={projectId} skillOptions={skillOptionsQuery.data || []} /> },
                                { key: "run", label: <span className="inline-flex items-center gap-2"><Play className="size-4" />运行与产物</span>, children: <AgentRunConsole item={selectedAgent} projectId={projectId} skillOptions={skillOptionsQuery.data || []} /> },
                            ]}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}

function nextCopyName(sourceName: string, items: AgentRegistryItem[]) {
    const used = new Set(items.filter((item) => item.agent.ownerType === "project").map((item) => item.agent.name));
    const base = `${sourceName}（项目版）`;
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base} ${suffix}`)) suffix += 1;
    return `${base} ${suffix}`;
}
