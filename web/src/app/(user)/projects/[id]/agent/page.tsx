"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { App, Button, Empty, Tag } from "antd";
import { nanoid } from "nanoid";
import { Archive, Bot, Check, Clapperboard, FileText, Tags, X } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { useProductionBibleStore } from "../../../canvas/stores/use-production-bible-store";
import { useScriptStore } from "../../../canvas/stores/use-script-store";
import { useStoryboardStore } from "../../../canvas/stores/use-storyboard-store";
import { agentActionLabel, agentKindLabel, agentRiskLabel, applyAgentSkillTaskActions, buildAgentTasksForKind, type AgentProposedAction, type AgentTask, type AgentTaskKind } from "../../agent-workbench";
import { useAgentTaskStore } from "../../use-agent-task-store";
import { useCreativeProjectStore } from "../../use-creative-project-store";

export default function ProjectAgentWorkbenchPage() {
    const params = useParams<{ id: string }>();
    const projectId = params.id;
    const { message } = App.useApp();
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const assets = useAssetStore((state) => state.assets);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const bibleItems = useProductionBibleStore((state) => state.items);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const updateScene = useScriptStore((state) => state.updateScene);
    const groups = useStoryboardStore((state) => state.groups);
    const shots = useStoryboardStore((state) => state.shots);
    const addGroup = useStoryboardStore((state) => state.addGroup);
    const addShot = useStoryboardStore((state) => state.addShot);
    const updateShot = useStoryboardStore((state) => state.updateShot);
    const tasks = useAgentTaskStore((state) => state.tasks);
    const addTask = useAgentTaskStore((state) => state.addTask);
    const updateTaskStatus = useAgentTaskStore((state) => state.updateTaskStatus);
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projectId, tasks]);

    useEffect(() => {
        void fetchPrompts({ pageSize: 80 })
            .then((data) => setPrompts(data.items))
            .catch(() => setPrompts([]));
    }, []);

    if (!project) {
        return (
            <main className="h-full overflow-auto bg-background px-6 py-10 text-stone-950 dark:text-stone-100">
                <Empty description="项目不存在或尚未加载">
                    <Button href="/projects">返回项目工作台</Button>
                </Empty>
            </main>
        );
    }

    const createAgentTask = (kind: AgentTaskKind) => {
        const input = {
            projectId,
            assets,
            productionBibleItems: bibleItems,
            prompts,
            scriptEpisodes: episodes,
            scriptScenes: scenes,
            storyboardGroups: groups,
            storyboardShots: shots,
            idFactory: () => `agent-task-${Date.now()}-${nanoid(5)}`,
            now: new Date().toISOString(),
        };
        const nextTasks = buildAgentTasksForKind(kind, input);
        nextTasks.forEach(addTask);
        message.success(`已生成 ${nextTasks.length} 个 Skill 任务预览`);
    };

    const applyTask = (task: AgentTask) => {
        applyAgentSkillTaskActions(task, { applyAction: (action) => applyAgentAction(action, task) });
        updateTaskStatus(task.id, "applied");
        message.success("已应用任务建议");
    };

    const applyAgentAction = (action: AgentProposedAction, task: AgentTask) => {
        if (action.type === "asset.add_tags") {
            const asset = assets.find((item) => item.id === action.assetId);
            if (!asset) return;
            updateAsset(action.assetId, {
                tags: Array.from(new Set([...asset.tags, ...action.tags])),
                metadata: {
                    ...asset.metadata,
                    agentTaskRefs: [...readAgentTaskRefs(asset.metadata?.agentTaskRefs), { taskId: task.id, skillId: task.skillId, skillVersion: task.skillVersion, actionType: action.type, appliedAt: new Date().toISOString() }],
                },
            });
            return;
        }
        if (action.type === "storyboard.update_shot_prompt") {
            updateShot(action.shotId, { prompt: action.prompt, effectivePrompt: action.effectivePrompt });
            return;
        }
        const groupId = addGroup({ projectId, title: action.title, description: action.reason, preset: { source: "agent", taskId: task.id, skillId: task.skillId, skillVersion: task.skillVersion } });
        action.shots.forEach((shot) => {
            addShot({
                groupId,
                title: shot.title,
                description: shot.description,
                prompt: shot.prompt,
                effectivePrompt: shot.effectivePrompt,
                assetRefs: [],
                nodeRefs: [],
                resultAssetIds: [],
                productionBibleRefs: [],
                status: "draft",
            });
            updateScene(shot.sceneId, { storyboardGroupId: groupId });
        });
    };

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="border-b border-stone-200 pb-6 dark:border-stone-800">
                    <Link href={`/projects/${project.id}`} className="text-xs text-stone-500 hover:text-stone-950 dark:hover:text-stone-100">
                        {project.title}
                    </Link>
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-semibold">短剧 Agent 工作台</h1>
                            <p className="mt-2 text-sm text-stone-500">第一版只做任务中心和受控建议，不接真实 LLM，不自动改画布，不自动生成视频。</p>
                        </div>
                    </div>
                </header>

                <section className="grid gap-4 md:grid-cols-3">
                    <AgentStarter icon={<Archive className="size-5" />} title="资产管理员 Agent" description="巡检素材、设定库和分镜引用，建议补标签和补素材。" onClick={() => createAgentTask("asset_manager")} />
                    <AgentStarter icon={<FileText className="size-5" />} title="提示词工程 Agent" description="读取提示词仓库、设定库和分镜，补全分镜提示词草案。" onClick={() => createAgentTask("prompt_engineer")} />
                    <AgentStarter icon={<Clapperboard className="size-5" />} title="分镜导演 Agent" description="从剧本分集和场次生成分镜条目草案，确认后再写入。" onClick={() => createAgentTask("storyboard_director")} />
                </section>

                <section className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">任务中心</h2>
                        <Tag className="m-0">{projectTasks.length} 个任务</Tag>
                    </div>
                    {projectTasks.length ? (
                        <div className="grid gap-4">
                            {projectTasks.map((task) => (
                                <AgentTaskCard key={task.id} task={task} onApply={() => applyTask(task)} onCancel={() => updateTaskStatus(task.id, "cancelled")} />
                            ))}
                        </div>
                    ) : (
                        <Empty description="还没有 Agent 任务，先从上方选择一个专职 Agent 生成预览。" />
                    )}
                </section>
            </div>
        </main>
    );
}

function AgentStarter({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
    return (
        <button type="button" className="rounded-xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-white/5" onClick={onClick}>
            <div className="flex items-center gap-2 text-base font-medium">
                {icon}
                {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
        </button>
    );
}

function AgentTaskCard({ task, onApply, onCancel }: { task: AgentTask; onApply: () => void; onCancel: () => void }) {
    const disabled = task.status !== "pending";
    return (
        <article className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Bot className="size-4 text-stone-500" />
                        <h3 className="font-semibold">{task.title}</h3>
                        <Tag className="m-0">{agentKindLabel(task.kind)}</Tag>
                        {task.skillName ? <Tag className="m-0">{task.skillName}</Tag> : null}
                        {task.skillVersion ? <Tag className="m-0">v{task.skillVersion}</Tag> : null}
                        <Tag className="m-0" color={task.riskLevel === "medium" ? "warning" : task.riskLevel === "high" ? "error" : "success"}>
                            {agentRiskLabel(task.riskLevel)}
                        </Tag>
                        <Tag className="m-0">{task.status}</Tag>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-600 dark:text-stone-400">{task.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button size="small" icon={<Check className="size-3.5" />} disabled={disabled || !task.proposedActions.length} onClick={onApply}>
                        确认
                    </Button>
                    <Button size="small" icon={<X className="size-3.5" />} disabled={disabled} onClick={onCancel}>
                        取消
                    </Button>
                </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-500">
                        <Tags className="size-3.5" />
                        影响对象
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {task.targetRefs.length ? (
                            task.targetRefs.slice(0, 12).map((ref) => (
                                <Tag key={`${ref.kind}:${ref.id}`} className="m-0">
                                    {ref.label}
                                </Tag>
                            ))
                        ) : (
                            <span className="text-sm text-stone-500">暂无影响对象</span>
                        )}
                    </div>
                </div>
                <div>
                    <div className="mb-2 text-xs font-medium text-stone-500">动作预览</div>
                    <div className="grid gap-1.5">
                        {task.proposedActions.length ? (
                            task.proposedActions.map((action, index) => (
                                <div key={index} className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-white/5">
                                    {agentActionLabel(action)}
                                </div>
                            ))
                        ) : (
                            <span className="text-sm text-stone-500">本任务只给出只读建议，没有写入动作。</span>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function readAgentTaskRefs(value: unknown) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}
