"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Spin, Tag } from "antd";
import { Boxes, Library, Workflow } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSkillOptions } from "@/services/api/admin-skills";
import { copyWorkflow, createWorkflow, fetchWorkflows, type WorkflowPackage, type WorkflowRegistryItem } from "@/services/api/workflow-registry";
import { useUserStore } from "@/stores/use-user-store";
import { useCreativeProjectStore } from "../../use-creative-project-store";
import { WorkflowExecutionConsole } from "./components/workflow-execution-console";
import { WorkflowRegistryList } from "./components/workflow-registry-list";
import { WorkflowRoutePreviewPanel, type WorkflowPreparedRun } from "./components/workflow-route-preview";
import { WorkflowVersionEditor } from "./components/workflow-version-editor";
import { selectWorkflowStarterSkill, workflowPackageFromSkillOption } from "./workflow-editor-model";

const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失败";

export default function ProjectWorkflowCenterPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const projectId = params.id;
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const isAdmin = user?.role === "admin" || user?.role === "superadmin";
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
    const [activeVersionId, setActiveVersionId] = useState("");
    const [activePackage, setActivePackage] = useState<WorkflowPackage>();
    const [prepared, setPrepared] = useState<WorkflowPreparedRun>();

    const workflowsQuery = useQuery({ queryKey: ["workflow-registry", projectId], queryFn: () => fetchWorkflows(projectId), enabled: isAdmin && hydrated && Boolean(project), retry: false });
    const skillsQuery = useQuery({ queryKey: ["skill-options", projectId], queryFn: () => fetchSkillOptions(token, { projectId }), enabled: isAdmin && hydrated && Boolean(project) && Boolean(token), retry: false });
    const workflows = useMemo(() => workflowsQuery.data || [], [workflowsQuery.data]);
    const selectedWorkflow = workflows.find((item) => item.workflow.id === selectedWorkflowId);

    useEffect(() => {
        if (isReady && !isAdmin) router.replace(`/projects/${projectId}`);
    }, [isAdmin, isReady, projectId, router]);
    useEffect(() => {
        if (!workflows.length) {
            setSelectedWorkflowId("");
            return;
        }
        if (!workflows.some((item) => item.workflow.id === selectedWorkflowId)) setSelectedWorkflowId(workflows.find((item) => item.workflow.ownerType === "project")?.workflow.id || workflows[0]!.workflow.id);
    }, [selectedWorkflowId, workflows]);
    useEffect(() => {
        const error = workflowsQuery.error || skillsQuery.error;
        if (error) message.error(errorText(error));
    }, [message, skillsQuery.error, workflowsQuery.error]);
    useEffect(() => {
        setPrepared(undefined);
        setActiveVersionId("");
        setActivePackage(undefined);
    }, [selectedWorkflowId]);

    const onVersionChange = useCallback((versionId: string, packageValue?: WorkflowPackage) => {
        setActiveVersionId(versionId);
        setActivePackage(packageValue);
        setPrepared(undefined);
    }, []);
    const onPrepared = useCallback((value?: WorkflowPreparedRun) => setPrepared(value), []);
    const createMutation = useMutation({
        mutationFn: async () => {
            const option = selectWorkflowStarterSkill(skillsQuery.data || []);
            if (!option) throw new Error("当前没有可用的已发布 Skill，无法创建首个节点");
            return createWorkflow({ projectId, name: nextWorkflowName(workflows), summary: "按项目需要自由组合独立 Skill。", tags: [], version: "1.0.0", package: workflowPackageFromSkillOption(option) });
        },
        onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["workflow-registry", projectId] }); setSelectedWorkflowId(result.workflow.id); message.success("已创建项目 Workflow 草稿"); },
        onError: (error) => message.error(errorText(error)),
    });
    const copyMutation = useMutation({
        mutationFn: (item: WorkflowRegistryItem) => copyWorkflow(item.workflow.id, projectId, nextCopyName(item.workflow.name, workflows)),
        onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["workflow-registry", projectId] }); setSelectedWorkflowId(result.workflow.id); message.success("已复制为项目 Workflow，可自由替换节点引用"); },
        onError: (error) => message.error(errorText(error)),
    });

    if (!isReady || !isAdmin) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description={isReady ? "正在返回项目" : "正在验证管理员权限"} /></main>;
    if (!hydrated) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description="正在读取本地项目" /></main>;
    if (!project) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Empty description="项目不存在或尚未加载"><Button href="/projects">返回项目中心</Button></Empty></main>;

    return (
        <main className="studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
            <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-6 px-5 py-7 lg:px-8">
                <header className="border-b border-[var(--studio-border-subtle)] pb-5">
                    <Link href={`/projects/${project.id}`} className="text-xs text-[var(--studio-text-muted)] transition hover:text-[var(--studio-accent)]">{project.title}</Link>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><Workflow className="size-6 text-[var(--studio-accent)]" /><h1 className="text-3xl font-semibold">Workflow 中心</h1></div><p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--studio-text-secondary)]">Workflow 只编排依赖、路由、条件和审批；每个生产节点由独立 Skill 执行，并通过统一 Invocation / Artifact Runtime 留痕和恢复。</p></div><div className="flex flex-wrap items-center gap-2"><Button type="text" icon={<Library className="size-4" />} href={`/projects/${projectId}/skills`}>管理 Skill</Button><Tag icon={<Workflow className="size-3.5" />}>{workflows.length} 个 Workflow</Tag><Tag icon={<Boxes className="size-3.5" />}>{skillsQuery.data?.length || 0} 个 Skill 版本</Tag></div></div>
                </header>
                <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[290px_minmax(600px,1fr)_minmax(420px,0.72fr)]">
                    <WorkflowRegistryList items={workflows} loading={workflowsQuery.isLoading} selectedWorkflowId={selectedWorkflowId} busy={createMutation.isPending || copyMutation.isPending} onCreate={() => createMutation.mutate()} onCopy={(item) => copyMutation.mutate(item)} onSelect={setSelectedWorkflowId} />
                    <WorkflowVersionEditor item={selectedWorkflow} projectId={projectId} skillOptions={skillsQuery.data || []} onVersionChange={onVersionChange} />
                    <div className="min-w-0 space-y-5"><WorkflowRoutePreviewPanel versionId={activeVersionId} packageValue={activePackage} projectId={projectId} skillOptions={skillsQuery.data || []} onPrepared={onPrepared} /><WorkflowExecutionConsole prepared={prepared} projectId={projectId} workflowId={selectedWorkflowId} versionId={activeVersionId} /></div>
                </div>
            </div>
        </main>
    );
}

function nextWorkflowName(items: WorkflowRegistryItem[]) {
    const used = new Set(items.filter((item) => item.workflow.ownerType === "project").map((item) => item.workflow.name));
    let index = 1;
    while (used.has(`项目制作流程 ${index}`)) index += 1;
    return `项目制作流程 ${index}`;
}

function nextCopyName(sourceName: string, items: WorkflowRegistryItem[]) {
    const used = new Set(items.filter((item) => item.workflow.ownerType === "project").map((item) => item.workflow.name));
    const base = `${sourceName}（项目版）`;
    if (!used.has(base)) return base;
    let index = 2;
    while (used.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
}
