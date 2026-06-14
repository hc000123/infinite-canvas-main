"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Empty, Input, Spin, Tag } from "antd";
import { CheckCircle2, ChevronRight, Clipboard, Download, FileText, FolderOpen, PackagePlus, Play, RefreshCw, Save, ShieldCheck, Square, TerminalSquare, TriangleAlert, Video, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCopyText } from "@/hooks/use-copy-text";
import { createRemoteAgentRun, type CreateRemoteAgentRunInput } from "@/services/api/agent-runs";
import { preflightVideoGeneration } from "@/services/api/video";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { defaultAgentConfigs, mergeAgentConfigs, type AgentConfig, type AgentConfigKind } from "../projects/agent-settings";
import { useAgentSettingsStore } from "../projects/use-agent-settings-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { formatVideoGenerationError } from "../video/video-generation-errors";
import { buildImportedVideoPackage, useVideoPackageStore } from "../video/use-video-package-store";
import { buildOriginalWorkflowChainHealth, type OriginalWorkflowChainHealthItem, type OriginalWorkflowEnterprisePreflight } from "./original-workflow-chain-health";
import { buildWorkflowTextAssetInput, parseWorkflowAssetPrompts, parseWorkflowCopyOnlyPrompts, parseWorkflowImageReferenceTable } from "./original-workflow-imports";
import { getOriginalWorkflowNextStep, type OriginalWorkflowNextStep } from "./original-workflow-next-step";
import { getCopyOnlySyncState } from "./original-workflow-readiness";
import { useOriginalWorkflowStore } from "./use-original-workflow-store";

type WorkflowFile = {
    content: string;
    exists: boolean;
    key: string;
    label: string;
    path: string;
    size: number;
    updatedAt: string;
};

type CommandResult = {
    command: string;
    exitCode?: string;
    jobHealth?: string;
    jobId?: string;
    jobStatus?: string;
    launchInstruction?: string;
    launchStatus?: string;
    logIdleSeconds?: string;
    logPath?: string;
    logTail?: string;
    logUpdatedAt?: string;
    promptPath?: string;
    reusedRunningJob?: string;
    runnerAgent?: string;
    runnerCommand?: string;
    runnerPid?: string;
    stderr: string;
    statusPath?: string;
    stdout: string;
};

type WorkflowSnapshot = {
    commandResult?: CommandResult;
    episode: string;
    episodes: string[];
    files: WorkflowFile[];
    latestJob?: CommandResult;
    projectSlug: string;
    rootExists: boolean;
    rootPath: string;
    validations?: Partial<Record<"stage1" | "stage2" | "stage3", WorkflowValidation>>;
};

type WorkflowValidation = CommandResult & {
    latestFileUpdatedAt?: string;
    state: "failed" | "passed" | "stale";
    updatedAt: string;
};

type ApiEnvelope<T> = {
    code: number;
    data: T;
    msg: string;
};

type WorkflowTab = "script" | "stage1" | "stage2" | "stage3" | "copy" | "quality";

const tabOptions: { key: WorkflowTab; label: string }[] = [
    { key: "script", label: "剧本" },
    { key: "stage1", label: "Stage 1 导演分析" },
    { key: "stage2", label: "Stage 2 资产提示词" },
    { key: "stage3", label: "Stage 3 Seedance" },
    { key: "copy", label: "Copy-only" },
    { key: "quality", label: "运行报告" },
];

const tabFileKeys: Record<Exclude<WorkflowTab, "quality">, string[]> = {
    copy: ["copyOnly"],
    script: ["script"],
    stage1: ["stage1A", "stage1B", "stage1C", "stage1D"],
    stage2: ["characters", "scenes"],
    stage3: ["stage3"],
};

const editableFileKeys = new Set(["script", "stage1D", "stage3"]);

export default function OriginalWorkflowPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const router = useRouter();
    const searchParams = useSearchParams();
    const codexApiBaseUrl = useOriginalWorkflowStore((state) => state.codexApiBaseUrl);
    const codexApiKey = useOriginalWorkflowStore((state) => state.codexApiKey);
    const codexModel = useOriginalWorkflowStore((state) => state.codexModel);
    const rootPath = useOriginalWorkflowStore((state) => state.rootPath);
    const episode = useOriginalWorkflowStore((state) => state.episode);
    const projectSlug = useOriginalWorkflowStore((state) => state.projectSlug);
    const setCodexModel = useOriginalWorkflowStore((state) => state.setCodexModel);
    const setRootPath = useOriginalWorkflowStore((state) => state.setRootPath);
    const setEpisode = useOriginalWorkflowStore((state) => state.setEpisode);
    const setProjectSlug = useOriginalWorkflowStore((state) => state.setProjectSlug);
    const addAsset = useAssetStore((state) => state.addAsset);
    const assets = useAssetStore((state) => state.assets);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const sourceEpisodes = useScriptStore((state) => state.episodes);
    const sourceProjects = useCreativeProjectStore((state) => state.projects);
    const effectiveConfig = useEffectiveConfig();
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const importedPackages = useVideoPackageStore((state) => state.importedPackages);
    const upsertImportedPackages = useVideoPackageStore((state) => state.upsertImportedPackages);
    const [snapshot, setSnapshot] = useState<WorkflowSnapshot>();
    const [activeTab, setActiveTab] = useState<WorkflowTab>("script");
    const [activeFileKey, setActiveFileKey] = useState("script");
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(false);
    const [enterprisePreflight, setEnterprisePreflight] = useState<OriginalWorkflowEnterprisePreflight | null>(null);
    const [isEnterprisePreflightChecking, setIsEnterprisePreflightChecking] = useState(false);
    const [runningAction, setRunningAction] = useState("");
    const [syncedSourceScriptKey, setSyncedSourceScriptKey] = useState("");
    const sourceProjectId = searchParams.get("sourceProjectId") || "";
    const sourceEpisodeId = searchParams.get("sourceEpisodeId") || "";
    const sourceProject = useMemo(() => sourceProjects.find((item) => item.id === sourceProjectId), [sourceProjectId, sourceProjects]);
    const sourceEpisode = useMemo(() => sourceEpisodes.find((item) => item.id === sourceEpisodeId), [sourceEpisodeId, sourceEpisodes]);
    const resolvedAgentConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentConfigs[sourceProjectId] || projectAgentConfigs[projectSlug] || []), [globalAgentConfigs, projectAgentConfigs, projectSlug, sourceProjectId]);
    const sourceScopeLabel = sourceProject || sourceEpisode ? `${sourceProject?.title || "未命名项目"} / ${sourceEpisode ? `第 ${String(sourceEpisode.order || 1).padStart(2, "0")} 集 · ${sourceEpisode.title}` : "未绑定分集"}` : "";
    const filesByKey = useMemo(() => new Map(snapshot?.files.map((file) => [file.key, file]) || []), [snapshot?.files]);
    const currentFile = filesByKey.get(activeFileKey);
    const visibleFileKeys = activeTab === "quality" ? [] : tabFileKeys[activeTab];
    const visibleFiles = visibleFileKeys.map((key) => filesByKey.get(key)).filter(Boolean) as WorkflowFile[];
    const editable = currentFile ? editableFileKeys.has(currentFile.key) : false;
    const currentReport = snapshot?.commandResult || snapshot?.latestJob;
    const copyOnlySyncState = useMemo(() => getCopyOnlySyncState(snapshot?.files || [], snapshot?.validations?.stage3), [snapshot?.files, snapshot?.validations?.stage3]);
    const workflowVideoPackageCount = useMemo(() => importedPackages.filter((item) => item.sourceEpisode === episode).length, [episode, importedPackages]);
    const chainHealth = useMemo(
        () =>
            buildOriginalWorkflowChainHealth({
                enterprisePreflight,
                files: snapshot?.files || [],
                isPublicSettingsLoading,
                validations: snapshot?.validations,
                videoPackageCount: workflowVideoPackageCount,
                videoProtocol: effectiveConfig.videoProtocol,
            }),
        [effectiveConfig.videoProtocol, enterprisePreflight, isPublicSettingsLoading, snapshot?.files, snapshot?.validations, workflowVideoPackageCount],
    );
    const nextStep = useMemo(() => getOriginalWorkflowNextStep({ files: snapshot?.files || [], job: currentReport, rootExists: snapshot?.rootExists, validations: snapshot?.validations }), [currentReport, snapshot?.files, snapshot?.rootExists, snapshot?.validations]);
    const stage2StartNotice = stageStartGateNotice("stage2", snapshot?.validations);
    const stage3StartNotice = stageStartGateNotice("stage3", snapshot?.validations);
    const stageStats = useMemo(
        () => [
            { label: "Stage 1", ok: ["stage1A", "stage1B", "stage1C", "stage1D"].every((key) => filesByKey.get(key)?.exists), stage: "stage1" as const, value: fileCount(filesByKey, ["stage1A", "stage1B", "stage1C", "stage1D"]) },
            { label: "Stage 2", ok: ["characters", "scenes"].every((key) => filesByKey.get(key)?.exists), stage: "stage2" as const, value: fileCount(filesByKey, ["characters", "scenes"]) },
            { label: "Stage 3", ok: Boolean(filesByKey.get("stage3")?.exists), stage: "stage3" as const, value: fileCount(filesByKey, ["stage3"]) },
            { label: "Copy-only", ok: Boolean(filesByKey.get("copyOnly")?.exists), stage: null, value: fileCount(filesByKey, ["copyOnly"]) },
        ],
        [filesByKey],
    );

    useEffect(() => {
        const requestedEpisode = searchParams.get("episode");
        const requestedProjectSlug = searchParams.get("projectSlug");
        if (requestedEpisode && requestedEpisode !== episode) setEpisode(requestedEpisode);
        if (requestedProjectSlug && requestedProjectSlug !== projectSlug) setProjectSlug(requestedProjectSlug);
    }, [episode, projectSlug, searchParams, setEpisode, setProjectSlug]);

    useEffect(() => {
        if (!sourceEpisodeId) return;
        if (!sourceEpisode?.summary.trim()) return;
        const syncKey = `${sourceEpisode.id}:${sourceEpisode.updatedAt}:${episode}:${projectSlug}:${rootPath}`;
        if (syncKey === syncedSourceScriptKey) return;
        setSyncedSourceScriptKey(syncKey);
        void requestWorkflow<WorkflowSnapshot>("/api/original-workflow", {
            action: "save-script",
            content: sourceEpisode.summary,
            episode,
            projectSlug,
            rootPath,
        })
            .then((data) => {
                setSnapshot(data);
                message.success("已同步项目里的最新剧本到视频工作流");
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "同步项目剧本失败"));
    }, [episode, message, projectSlug, rootPath, sourceEpisode, sourceEpisodeId, syncedSourceScriptKey]);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await requestWorkflow<WorkflowSnapshot>(`/api/original-workflow?${new URLSearchParams({ episode, projectSlug, rootPath }).toString()}`);
            setSnapshot(data);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取工作流失败");
        } finally {
            setLoading(false);
        }
    }, [episode, message, projectSlug, rootPath]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (activeTab !== "quality") return;
        if ((currentReport?.jobStatus || "") !== "running") return;
        const timer = window.setInterval(() => {
            void requestWorkflow<WorkflowSnapshot>(`/api/original-workflow?${new URLSearchParams({ episode, projectSlug, rootPath }).toString()}`)
                .then(setSnapshot)
                .catch(() => undefined);
        }, 3000);
        return () => window.clearInterval(timer);
    }, [activeTab, currentReport?.jobStatus, episode, projectSlug, rootPath]);

    useEffect(() => {
        const firstKey = activeTab === "quality" ? "" : tabFileKeys[activeTab][0];
        setActiveFileKey(firstKey);
    }, [activeTab]);

    useEffect(() => {
        setDraft(currentFile?.content || "");
    }, [currentFile?.content, currentFile?.key]);

    const runAction = async (action: "cancel-latest-job" | "export-copy-only" | "save-file" | "save-script" | "start-stage" | "validate", options?: { fileKey?: string; stage?: "stage1" | "stage2" | "stage3" }) => {
        const actionKey = `${action}-${options?.stage || options?.fileKey || ""}`;
        setRunningAction(actionKey);
        try {
            const data = await requestWorkflow<WorkflowSnapshot>("/api/original-workflow", {
                action,
                content: draft,
                episode,
                fileKey: options?.fileKey,
                ...(action === "start-stage"
                    ? {
                          agent: {
                              apiBaseUrl: codexApiBaseUrl,
                              apiKey: codexApiKey,
                              model: codexModel,
                          },
                      }
                    : {}),
                projectSlug,
                rootPath,
                stage: options?.stage,
            });
            setSnapshot(data);
            if (action === "validate" || action === "export-copy-only" || action === "start-stage" || action === "cancel-latest-job") setActiveTab("quality");
            if (isFailedCommand(data.commandResult)) message.error(failedActionLabel(action, options?.stage, data.commandResult));
            else message.success(actionLabel(action, options?.stage, data.commandResult));
            return data;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
            return undefined;
        } finally {
            setRunningAction("");
        }
    };

    const startCloudStage = async (stage: "stage1" | "stage2" | "stage3") => {
        const notice = stageStartGateNotice(stage, snapshot?.validations);
        if (notice) {
            message.warning(notice);
            setActiveTab("quality");
            return;
        }
        const input = buildCloudStageRunInput(stage, {
            agentConfig: resolvedAgentConfigs.find((config) => config.kind === workflowStageAgentKind(stage)),
            episode,
            filesByKey,
            modelPreference: codexModel,
            projectId: sourceProjectId || projectSlug,
            projectSlug,
            sourceEpisodeId,
            sourceProjectId,
        });
        if (!input.userPrompt.trim()) {
            message.warning("缺少可提交给云端 Agent 的阶段输入");
            return;
        }
        setRunningAction(`cloud-stage-${stage}`);
        try {
            const run = await createRemoteAgentRun(input);
            const result: CommandResult = {
                command: "后端 Agent Run API",
                exitCode: run.status === "failed" ? "1" : "0",
                jobId: run.id,
                jobStatus: run.status,
                runnerAgent: `${run.provider || "后台模型渠道"}${run.channelId ? `(${run.channelId})` : ""} / ${run.model || "默认文本模型"}${run.fallbackUsed ? " / fallback" : ""}`,
                stderr: run.errorMessage || "",
                stdout: run.rawOutput || `云端 Agent Run 已创建，原始输出和结构化草案已保存到后端，等待人工确认后再写入资产 / 分镜 / 视频生产包。耗时 ${run.durationMs || 0}ms。`,
            };
            setSnapshot((current) => (current ? { ...current, commandResult: result } : current));
            setActiveTab("quality");
            if (run.status === "failed") message.error(run.errorMessage || "云端 Agent Run 失败");
            else message.success("云端 Agent Run 已完成，等待审核确认");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "云端 Agent Run 创建失败");
        } finally {
            setRunningAction("");
        }
    };

    const saveCurrentFile = () => {
        if (!currentFile) return;
        void runAction(currentFile.key === "script" ? "save-script" : "save-file", { fileKey: currentFile.key });
    };

    const startStage = (stage: "stage1" | "stage2" | "stage3") => {
        void startCloudStage(stage);
    };

    const importAssetPromptCards = () => {
        if (snapshot?.validations?.stage2?.state !== "passed") {
            message.warning(validationRequiredNotice("stage2"));
            setActiveTab("quality");
            return;
        }
        const characters = filesByKey.get("characters");
        const scenes = filesByKey.get("scenes");
        const parsed = [
            ...(characters?.content ? parseWorkflowAssetPrompts(characters.content, { episode, projectSlug, sourcePath: characters.path }) : []),
            ...(scenes?.content ? parseWorkflowAssetPrompts(scenes.content, { episode, projectSlug, sourcePath: scenes.path }) : []),
        ];
        if (!parsed.length) {
            message.warning("没有找到可导入的资产提示词，请先生成 Stage 2");
            return;
        }
        let created = 0;
        let updated = 0;
        for (const item of parsed) {
            const input = buildWorkflowTextAssetInput(item);
            const existing = assets.find((asset) => workflowAssetImportKey(asset) === item.importKey);
            if (existing) {
                updateAsset(existing.id, input as Partial<Omit<Asset, "createdAt" | "id">>);
                updated += 1;
            } else {
                addAsset(input);
                created += 1;
            }
        }
        message.success(`已写入我的素材待生图卡：新增 ${created} 张，更新 ${updated} 张`);
    };

    const syncCopyOnlyToVideo = (data?: WorkflowSnapshot, options?: { navigate?: boolean; quietMissing?: boolean }) => {
        const navigate = options?.navigate ?? true;
        const copyOnly = data?.files.find((file) => file.key === "copyOnly") || filesByKey.get("copyOnly");
        const stage3 = data?.files.find((file) => file.key === "stage3") || filesByKey.get("stage3");
        const references = stage3?.content ? parseWorkflowImageReferenceTable(stage3.content) : [];
        const parsed = copyOnly?.content ? parseWorkflowCopyOnlyPrompts(copyOnly.content, { episode, projectSlug, sourcePath: copyOnly.path }) : [];
        if (!parsed.length) {
            if (!options?.quietMissing) message.warning("没有找到 Copy-only 提示词，请先完成 Stage 3 并导出 Copy-only");
            return 0;
        }
        const count = upsertImportedPackages(parsed.map((item) => buildImportedVideoPackage({ ...item, references })));
        message.success(`已同步 ${count} 条视频生产包`);
        if (navigate) router.push(videoHref(episode, projectSlug));
        return count;
    };

    const importCopyOnlyToVideo = () => {
        if (copyOnlySyncState.mode === "needs-stage3-validation") {
            message.warning(copyOnlySyncState.notice);
            setActiveTab("quality");
            return;
        }
        syncCopyOnlyToVideo(snapshot);
    };

    const checkEnterpriseVideoApi = async () => {
        if (isPublicSettingsLoading) {
            message.info("正在读取企业视频配置，请稍后再试");
            return;
        }
        if (effectiveConfig.videoProtocol !== "volcengine-ark") {
            const errorMessage = "当前视频通道不是企业 Ark / Seedance，请先确认后台系统设置已把视频模型映射到 volcengine-ark。";
            setEnterprisePreflight({ checkedAt: new Date().toISOString(), message: errorMessage, status: "failed" });
            message.error(errorMessage);
            return;
        }
        setIsEnterprisePreflightChecking(true);
        try {
            const result = await preflightVideoGeneration(effectiveConfig);
            const model = result?.model || effectiveConfig.seedanceEndpointId || effectiveConfig.seedanceModel || effectiveConfig.videoModel || effectiveConfig.model;
            const channel = result?.channelName || "企业 Ark / Seedance";
            const endpoint = result?.endpointId ? `，EP ${result.endpointId}` : "";
            const successMessage = `${channel} 已通过预检，模型 ${model || "未返回"}${endpoint} 可用于提交视频任务。`;
            setEnterprisePreflight({ checkedAt: new Date().toISOString(), message: successMessage, status: "passed" });
            message.success("企业视频 API 预检通过");
        } catch (error) {
            const errorMessage = formatVideoGenerationError(error);
            setEnterprisePreflight({ checkedAt: new Date().toISOString(), message: errorMessage, status: "failed" });
            message.error(errorMessage);
        } finally {
            setIsEnterprisePreflightChecking(false);
        }
    };

    const exportCopyOnlyToVideo = async () => {
        if (copyOnlySyncState.mode === "needs-stage3-validation") {
            message.warning(copyOnlySyncState.notice);
            setActiveTab("quality");
            return;
        }
        if (copyOnlySyncState.mode === "blocked") {
            message.warning(copyOnlySyncState.notice);
            setActiveTab("stage3");
            return;
        }
        if (copyOnlySyncState.mode === "sync-existing") {
            message.info(copyOnlySyncState.notice);
            syncCopyOnlyToVideo(snapshot);
            return;
        }
        const data = await runAction("export-copy-only");
        if (!data) return;
        const failed = isFailedCommand(data.commandResult);
        const count = syncCopyOnlyToVideo(data, { navigate: !failed, quietMissing: failed });
        if (failed && count > 0) {
            message.warning("导出脚本失败，但已使用现有 Copy-only 同步到视频生产包");
            router.push(videoHref(episode, projectSlug));
        }
    };

    const runNextStep = () => {
        if (nextStep.kind === "connect") {
            void refresh();
            return;
        }
        if (nextStep.kind === "edit-script") {
            setActiveTab("script");
            return;
        }
        if (nextStep.kind === "wait-runner") {
            setActiveTab("quality");
            return;
        }
        if (nextStep.kind === "start-stage") {
            startStage(nextStep.stage);
            return;
        }
        if (nextStep.kind === "validate-stage") {
            void runAction("validate", { stage: nextStep.stage });
            return;
        }
        if (nextStep.kind === "export-copy") {
            void exportCopyOnlyToVideo();
            return;
        }
        syncCopyOnlyToVideo(snapshot);
    };

    return (
        <main className="studio-workspace studio-shell h-full overflow-hidden text-[var(--studio-text-primary)]">
            <div className="mx-auto flex h-full w-full max-w-[1540px] flex-col gap-4 px-5 py-4 xl:px-8">
                <header className="shrink-0">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-normal text-[var(--studio-accent)]">
                            <Wand2 className="size-4" />
                            Seedance Video Workflow
                        </div>
                        <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[var(--studio-text-primary)]">视频工作流控制台</h1>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--studio-text-secondary)]">连接本地三阶段目录，保留 markdown 文件、格式锁、质量门和 Copy-only 导出。</p>
                        {sourceScopeLabel ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--studio-text-muted)]">
                                <Tag color="blue">来源项目</Tag>
                                <span className="min-w-0 break-words">{sourceScopeLabel}</span>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>
                            刷新
                        </Button>
                        <Button danger icon={<Square className="size-4" />} disabled={currentReport?.jobStatus !== "running"} loading={runningAction === "cancel-latest-job-"} onClick={() => void runAction("cancel-latest-job")}>
                            停止 Runner
                        </Button>
                        <Button type="primary" icon={<Save className="size-4" />} disabled={!editable || !currentFile} loading={runningAction.startsWith("save")} onClick={saveCurrentFile}>
                            保存当前稿
                        </Button>
                    </div>
                    </div>
                </header>

                <section className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[340px_1fr]">
                    <aside className="thin-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                        <div className="studio-panel p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                                <FolderOpen className="size-4 text-[var(--studio-accent)]" />
                                工作流目录
                            </div>
                            <div className="mt-4 grid gap-3">
                                <LabeledInput label="根目录" value={rootPath} onChange={setRootPath} />
                                <div className="grid grid-cols-2 gap-3">
                                    <LabeledInput label="项目目录" value={projectSlug} onChange={setProjectSlug} />
                                    <LabeledInput label="集数" value={episode} onChange={setEpisode} />
                                </div>
                                {sourceScopeLabel ? <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-xs leading-5 text-[var(--studio-text-secondary)]">当前绑定：{sourceScopeLabel}</div> : null}
                                {snapshot?.episodes.length ? <div className="truncate text-xs text-[var(--studio-text-muted)]">已有集数：{snapshot.episodes.join(" / ")}</div> : null}
                            </div>
                            <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-sm">
                                <span className="text-[var(--studio-text-secondary)]">目录状态</span>
                                <Tag color={snapshot?.rootExists ? "success" : "error"}>{snapshot?.rootExists ? "已连接" : "未找到"}</Tag>
                            </div>
                        </div>

                        <WorkflowNextStepCard loading={loading || runningAction !== ""} onClick={runNextStep} step={nextStep} />

                        <WorkflowChainHealthCard
                            health={chainHealth}
                            onOpenConfig={() => router.push("/admin/settings?focus=enterprise-video")}
                            onOpenVideo={() => router.push(videoHref(episode, projectSlug))}
                            onPreflight={() => void checkEnterpriseVideoApi()}
                            onSync={() => void exportCopyOnlyToVideo()}
                            preflightLoading={isEnterprisePreflightChecking}
                        />

                        <WorkflowDisclosure icon={<Wand2 className="size-4 text-[var(--studio-accent)]" />} title="云端 Agent Run API">
                            <div className="p-4">
                                <p className="text-xs leading-5 text-[var(--studio-text-muted)]">阶段启动走后端 Agent Run API；API Key、Base URL 和企业模型渠道请在后台系统设置维护。这里仅可指定文本模型偏好。</p>
                                <div className="mt-4 grid gap-3">
                                    <LabeledInput label="文本模型偏好" value={codexModel} onChange={setCodexModel} placeholder="留空使用后台默认文本模型" />
                                    {codexApiBaseUrl || codexApiKey ? (
                                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                            旧版浏览器内 Agent API Key 已不再作为云端主链路使用，请迁移到后台系统设置的私有模型渠道。
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </WorkflowDisclosure>

                        <WorkflowDisclosure icon={<ShieldCheck className="size-4 text-[var(--studio-accent)]" />} title="阶段状态">
                            <div className="p-4">
                                <div className="grid gap-2">
                                    {stageStats.map((item) => (
                                        <div key={item.label} className="flex items-center justify-between rounded-lg border border-[var(--studio-border-subtle)] px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                {item.ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <FileText className="size-4 text-[var(--studio-text-muted)]" />}
                                                <div>
                                                    <div className="text-sm text-[var(--studio-text-secondary)]">{item.label}</div>
                                                    {item.stage ? <div className="mt-0.5 text-xs text-[var(--studio-text-muted)]">{validationLabel(snapshot?.validations?.[item.stage])}</div> : null}
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-[var(--studio-text-primary)]">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </WorkflowDisclosure>

                        <WorkflowDisclosure icon={<Play className="size-4 text-[var(--studio-accent)]" />} title="启动阶段">
                            <div className="grid gap-2 p-4">
                                <CommandButton label="启动 Stage 1" icon={<Play className="size-4" />} loading={runningAction === "cloud-stage-stage1"} primary onClick={() => startStage("stage1")} />
                                {stage2StartNotice ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">{stage2StartNotice}</div> : null}
                                <CommandButton disabled={Boolean(stage2StartNotice)} label="启动 Stage 2" icon={<Play className="size-4" />} loading={runningAction === "cloud-stage-stage2"} primary onClick={() => startStage("stage2")} />
                                {stage3StartNotice ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">{stage3StartNotice}</div> : null}
                                <CommandButton disabled={Boolean(stage3StartNotice)} label="启动 Stage 3" icon={<Play className="size-4" />} loading={runningAction === "cloud-stage-stage3"} primary onClick={() => startStage("stage3")} />
                            </div>
                        </WorkflowDisclosure>

                        <WorkflowDisclosure icon={<TerminalSquare className="size-4 text-[var(--studio-accent)]" />} title="校验与导出">
                            <div className="grid gap-2 p-4">
                                <CommandButton label="校验 Stage 1" icon={<Play className="size-4" />} loading={runningAction === "validate-stage1"} onClick={() => void runAction("validate", { stage: "stage1" })} />
                                <CommandButton label="校验 Stage 2" icon={<Play className="size-4" />} loading={runningAction === "validate-stage2"} onClick={() => void runAction("validate", { stage: "stage2" })} />
                                <CommandButton label="校验 Stage 3" icon={<Play className="size-4" />} loading={runningAction === "validate-stage3"} onClick={() => void runAction("validate", { stage: "stage3" })} />
                                {copyOnlySyncState.notice ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">{copyOnlySyncState.notice.replace("{episode}", episode)}</div> : null}
                                <CommandButton disabled={copyOnlySyncState.disabled} label={copyOnlySyncState.label} icon={<Download className="size-4" />} loading={runningAction === "export-copy-only-"} onClick={() => void exportCopyOnlyToVideo()} />
                            </div>
                        </WorkflowDisclosure>

                        <WorkflowDisclosure icon={<PackagePlus className="size-4 text-[var(--studio-accent)]" />} title="导入到工具">
                            <div className="grid gap-2 p-4">
                                {snapshot?.validations?.stage2?.state !== "passed" ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">{validationRequiredNotice("stage2")}</div> : null}
                                <CommandButton disabled={snapshot?.validations?.stage2?.state !== "passed"} label="资产提示词 → 我的素材待生图卡" icon={<PackagePlus className="size-4" />} loading={false} onClick={importAssetPromptCards} />
                                <CommandButton label="Copy-only → 视频生产包" icon={<Video className="size-4" />} loading={false} onClick={importCopyOnlyToVideo} />
                            </div>
                        </WorkflowDisclosure>
                    </aside>

                    <section className="studio-panel flex min-h-0 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-[var(--studio-border-subtle)] p-3">
                            <div className="thin-scrollbar flex gap-1 overflow-x-auto">
                                {tabOptions.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        className={`h-10 shrink-0 rounded-lg px-3 text-sm font-medium transition ${activeTab === tab.key ? "bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-panel-muted-bg)] hover:text-[var(--studio-text-primary)]"}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading && !snapshot ? (
                            <div className="grid flex-1 place-items-center">
                                <Spin />
                            </div>
                        ) : activeTab === "quality" ? (
                            <QualityPanel result={currentReport} />
                        ) : visibleFiles.length ? (
                            <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_1fr]">
                                <div className="thin-scrollbar overflow-y-auto border-b border-[var(--studio-border-subtle)] p-3 lg:border-b-0 lg:border-r">
                                    <div className="grid gap-2">
                                        {visibleFiles.map((file) => (
                                            <button
                                                key={file.key}
                                                type="button"
                                                className={`rounded-lg border px-3 py-3 text-left transition ${activeFileKey === file.key ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-panel-muted-bg)]"}`}
                                                onClick={() => setActiveFileKey(file.key)}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="min-w-0 truncate text-sm font-semibold text-[var(--studio-text-primary)]">{file.label}</span>
                                                    <Tag color={file.exists ? "success" : "default"}>{file.exists ? "有文件" : "空"}</Tag>
                                                </div>
                                                <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{file.path}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex min-h-0 min-w-0 flex-col">
                                    <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{currentFile?.label || "未选择文件"}</div>
                                            <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{currentFile?.path || "-"}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button icon={<Clipboard className="size-4" />} disabled={!draft} onClick={() => copyText(draft, "已复制当前内容")}>
                                                复制
                                            </Button>
                                            <Button type="primary" icon={<Save className="size-4" />} disabled={!editable || !currentFile} loading={runningAction.startsWith("save")} onClick={saveCurrentFile}>
                                                保存
                                            </Button>
                                        </div>
                                    </div>
                                    {currentFile ? (
                                        <Input.TextArea
                                            value={draft}
                                            readOnly={!editable}
                                            onChange={(event) => setDraft(event.target.value)}
                                            className="min-h-0 flex-1 resize-none rounded-none border-0 !bg-transparent p-4 font-mono text-sm leading-6 text-[var(--studio-text-primary)] shadow-none focus:shadow-none"
                                            placeholder={editable ? "在这里编辑当前 markdown 文件" : "当前文件暂未生成"}
                                        />
                                    ) : (
                                        <Empty className="m-auto" description="没有可预览的文件" />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <Empty className="py-24" description="暂无阶段文件" />
                        )}
                    </section>
                </section>
            </div>
        </main>
    );
}

function LabeledInput({ label, onChange, password, placeholder, value }: { label: string; onChange: (value: string) => void; password?: boolean; placeholder?: string; value: string }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-xs text-[var(--studio-text-muted)]">{label}</span>
            {password ? <Input.Password visibilityToggle={false} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}
        </label>
    );
}

function WorkflowDisclosure({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
    return (
        <details className="studio-panel group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--studio-text-primary)] [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                    {icon}
                    <span className="truncate">{title}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--studio-text-muted)] transition group-open:rotate-90" />
            </summary>
            <div className="border-t border-[var(--studio-border-subtle)]">{children}</div>
        </details>
    );
}

function CommandButton({ disabled, icon, label, loading, onClick, primary }: { disabled?: boolean; icon: ReactNode; label: string; loading: boolean; onClick: () => void; primary?: boolean }) {
    return (
        <Button type={primary ? "primary" : "default"} className="justify-start" disabled={disabled} icon={icon} loading={loading} onClick={onClick}>
            {label}
        </Button>
    );
}

function WorkflowNextStepCard({ loading, onClick, step }: { loading: boolean; onClick: () => void; step: OriginalWorkflowNextStep }) {
    return (
        <div className="studio-panel border-[var(--studio-accent)]/40 bg-[var(--studio-accent-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                        <ChevronRight className="size-4 text-[var(--studio-accent)]" />
                        {step.title}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{step.description}</p>
                </div>
            </div>
            <Button className="mt-4 w-full justify-center" type="primary" icon={<Play className="size-4" />} loading={loading} onClick={onClick}>
                {step.actionLabel}
            </Button>
        </div>
    );
}

function WorkflowChainHealthCard({
    health,
    onOpenConfig,
    onOpenVideo,
    onPreflight,
    onSync,
    preflightLoading,
}: {
    health: OriginalWorkflowChainHealthItem[];
    onOpenConfig: () => void;
    onOpenVideo: () => void;
    onPreflight: () => void;
    onSync: () => void;
    preflightLoading: boolean;
}) {
    const blocked = health.filter((item) => item.status === "blocked").length;
    const checking = health.filter((item) => item.status === "checking").length;
    const ready = health.length - blocked - checking;
    return (
        <div className="studio-panel p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                        <ShieldCheck className="size-4 text-[var(--studio-accent)]" />
                        链路自检
                    </div>
                    <p className="mt-1 text-xs text-[var(--studio-text-muted)]">
                        已就绪 {ready}/{health.length}
                        {blocked ? `，阻断 ${blocked}` : ""}
                        {checking ? `，检查中 ${checking}` : ""}
                    </p>
                </div>
                {blocked ? <Tag color="warning">未完成</Tag> : checking ? <Tag color="processing">检查中</Tag> : <Tag color="success">可生成</Tag>}
            </div>
            <div className="thin-scrollbar mt-4 grid max-h-[300px] gap-2 overflow-y-auto pr-1">
                {health.map((item) => (
                    <div key={item.key} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                        <div className="flex items-center gap-2">
                            {item.status === "ready" ? <CheckCircle2 className="size-4 text-emerald-500" /> : item.status === "checking" ? <RefreshCw className="size-4 text-sky-400" /> : <TriangleAlert className="size-4 text-amber-500" />}
                            <span className="text-sm font-medium text-[var(--studio-text-primary)]">{item.title}</span>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">{item.detail}</div>
                    </div>
                ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
                <Button icon={<Video className="size-4" />} onClick={onOpenVideo}>
                    视频生成
                </Button>
                <Button icon={<PackagePlus className="size-4" />} onClick={onSync}>
                    同步生产包
                </Button>
                <Button icon={<ShieldCheck className="size-4" />} loading={preflightLoading} onClick={onPreflight}>
                    预检企业 API
                </Button>
                <Button icon={<ShieldCheck className="size-4" />} onClick={onOpenConfig}>
                    企业视频配置
                </Button>
            </div>
        </div>
    );
}

function workflowAssetImportKey(asset: Asset) {
    const originalWorkflow = asset.metadata?.originalWorkflow;
    if (!originalWorkflow || typeof originalWorkflow !== "object" || Array.isArray(originalWorkflow)) return "";
    const value = (originalWorkflow as { importKey?: unknown }).importKey;
    return typeof value === "string" ? value : "";
}

function QualityPanel({ result }: { result?: CommandResult }) {
    if (!result) {
        return (
            <div className="grid flex-1 place-items-center p-8">
                <Empty description="还没有本次质量门输出" />
            </div>
        );
    }
    return (
        <div className="thin-scrollbar grid flex-1 gap-4 overflow-y-auto p-4">
            <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                <div className="text-xs text-[var(--studio-text-muted)]">执行命令</div>
                <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--studio-text-primary)]">{result.command}</pre>
            </div>
            {result.jobId ? (
                <div className={`rounded-lg border p-3 ${runnerStatusClass(result.jobStatus, result.jobHealth)}`}>
                    <div className={`text-xs font-semibold ${runnerStatusTextClass(result.jobStatus, result.jobHealth)}`}>{runnerStatusTitle(result.jobStatus, result.reusedRunningJob === "true", result.jobHealth)}</div>
                    <div className="mt-2 grid gap-1 text-sm text-[var(--studio-text-primary)]">
                        <InfoLine label="任务 ID" value={result.jobId} />
                        <InfoLine label="任务状态" value={result.jobStatus || "running"} />
                        <InfoLine label="日志状态" value={result.jobHealth === "stalled" ? `可能卡住，${result.logIdleSeconds || "-"} 秒无更新` : result.logIdleSeconds ? `${result.logIdleSeconds} 秒前更新` : "-"} />
                        <InfoLine label="Agent" value={result.runnerAgent || "当前 Codex 登录态"} />
                        <InfoLine label="进程 PID" value={result.runnerPid || "-"} />
                        <InfoLine label="状态文件" value={result.statusPath || "-"} />
                        <InfoLine label="运行日志" value={result.logPath || "-"} />
                    </div>
                </div>
            ) : result.launchStatus === "guard_checked" ? (
                <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm leading-6 text-[var(--studio-text-primary)]">
                    只完成了启动护栏检查，没有启动后台 Runner。通常是内容执行被锁定，或本机 runner 未接入。
                </div>
            ) : null}
            {result.launchInstruction ? (
                <div className="rounded-lg border border-[var(--studio-accent)] bg-[var(--studio-accent-soft)] p-3">
                    <div className="text-xs font-semibold text-[var(--studio-accent)]">下一步 Runner 指令</div>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--studio-text-primary)]">{result.launchInstruction}</pre>
                </div>
            ) : null}
            <LogBlock title="stdout" value={result.stdout} />
            <LogBlock title="stderr" value={result.stderr} />
            {result.logTail ? <LogBlock title="run.log 最新内容" value={result.logTail} /> : null}
        </div>
    );
}

function InfoLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-1 sm:grid-cols-[80px_1fr]">
            <span className="text-[var(--studio-text-muted)]">{label}</span>
            <span className="min-w-0 break-all font-mono text-xs">{value}</span>
        </div>
    );
}

function runnerStatusTitle(status?: string, reused?: boolean, health?: string) {
    if (status === "failed") return "Agent Run 运行失败";
    if (status === "success" || status === "needs_review") return "Agent Run 已完成，待审核";
    if (status === "approved") return "Agent Run 已审核";
    if (status === "applied") return "Agent Run 已写入";
    if (status === "cancelled") return "Agent Run 已取消";
    if (health === "stalled") return "本地 Runner 可能卡住";
    if (reused) return "已有本地 Runner 正在运行";
    if (status === "running") return "Agent Run 正在运行";
    return "Agent Run 已启动";
}

function runnerStatusClass(status?: string, health?: string) {
    if (status === "failed") return "border-rose-500/60 bg-rose-500/10";
    if (status === "cancelled") return "border-amber-500/60 bg-amber-500/10";
    if (health === "stalled") return "border-amber-500/60 bg-amber-500/10";
    return "border-emerald-500/60 bg-emerald-500/10";
}

function runnerStatusTextClass(status?: string, health?: string) {
    if (status === "failed") return "text-rose-500";
    if (status === "cancelled") return "text-amber-500";
    if (health === "stalled") return "text-amber-500";
    return "text-emerald-500";
}

function LogBlock({ title, value }: { title: string; value: string }) {
    return (
        <section className="overflow-hidden rounded-lg border border-[var(--studio-border-subtle)]">
            <div className="border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-xs font-semibold text-[var(--studio-text-muted)]">{title}</div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-[var(--studio-text-primary)]">{value || "-"}</pre>
        </section>
    );
}

function fileCount(filesByKey: Map<string, WorkflowFile>, keys: string[]) {
    return keys.filter((key) => filesByKey.get(key)?.exists).length;
}

function validationLabel(validation?: WorkflowValidation) {
    if (!validation) return "质量门：未校验";
    if (validation.state === "passed") return "质量门：已通过";
    if (validation.state === "stale") return "质量门：已过期";
    return "质量门：未通过";
}

function stageStartGateNotice(stage: "stage1" | "stage2" | "stage3", validations?: WorkflowSnapshot["validations"]) {
    if (stage === "stage2" && validations?.stage1?.state !== "passed") return validationRequiredNotice("stage1");
    if (stage === "stage3" && validations?.stage2?.state !== "passed") return validationRequiredNotice("stage2");
    return "";
}

function validationRequiredNotice(stage: "stage1" | "stage2" | "stage3") {
    const label = stage.replace("stage", "Stage ");
    return `${label} 尚未通过质量门，请先校验通过后再继续下一步。`;
}

function buildCloudStageRunInput(
    stage: "stage1" | "stage2" | "stage3",
    {
        agentConfig,
        episode,
        filesByKey,
        modelPreference,
        projectId,
        projectSlug,
        sourceEpisodeId,
        sourceProjectId,
    }: {
        agentConfig?: AgentConfig;
        episode: string;
        filesByKey: Map<string, WorkflowFile>;
        modelPreference: string;
        projectId: string;
        projectSlug: string;
        sourceEpisodeId: string;
        sourceProjectId: string;
    },
): CreateRemoteAgentRunInput {
    const script = filesByKey.get("script")?.content || "";
    const stage1 = ["stage1A", "stage1B", "stage1C", "stage1D"].map((key) => filePromptBlock(filesByKey.get(key))).filter(Boolean).join("\n\n");
    const stage2 = ["characters", "scenes"].map((key) => filePromptBlock(filesByKey.get(key))).filter(Boolean).join("\n\n");
    const systemPrompt = cloudStageSystemPrompt(stage);
    const userPrompt = cloudStageUserPrompt(stage, { episode, projectSlug, script, stage1, stage2 });
    const preferredModel = agentConfig?.modelPreference?.trim();
    return {
        agentKind: workflowStageAgentKind(stage),
        allowBatch: agentConfig?.allowBatch === true,
        allowFallback: agentConfig?.allowFallback === true,
        channelId: agentConfig?.channelId || "",
        concurrencyLimit: agentConfig?.concurrencyLimit || 1,
        episodeId: sourceEpisodeId || episode,
        estimatedCredits: agentConfig?.estimatedCredits || 0,
        fallbackChannelIds: agentConfig?.fallbackChannelIds || [],
        maxOutputTokens: agentConfig?.maxOutputTokens || (stage === "stage3" ? 12000 : 9000),
        modelPreference: preferredModel && preferredModel !== "default" ? preferredModel : modelPreference || "default",
        projectId,
        sourceSnapshot: { episode, projectSlug, sourceEpisodeId, sourceProjectId },
        stageId: stage,
        systemPrompt,
        temperature: agentConfig?.temperature ?? 0.4,
        timeoutSeconds: agentConfig?.timeoutSeconds || (stage === "stage3" ? 900 : 600),
        userPrompt,
        variables: { episode, projectSlug, stage },
        workflowRunId: `video-workflow:${projectSlug}:${episode}`,
        writePolicy: agentConfig?.writePolicy || "confirm_before_write",
    };
}

function workflowStageAgentKind(stage: "stage1" | "stage2" | "stage3"): AgentConfigKind {
    if (stage === "stage1") return "script_analyzer";
    if (stage === "stage2") return "asset_extractor";
    return "storyboard_director";
}

function filePromptBlock(file?: WorkflowFile) {
    if (!file?.content.trim()) return "";
    return `## ${file.label}\n路径：${file.path}\n\n${file.content.trim()}`;
}

function cloudStageSystemPrompt(stage: "stage1" | "stage2" | "stage3") {
    if (stage === "stage1") return "你是云端视频工作流的导演分析 Agent。只基于用户提供的本集剧本生成导演分析草案，保存为待审核结果；不得写入本地文件，不得触发图片或视频生成。";
    if (stage === "stage2") return "你是云端视频工作流的资产提示词 Agent。只基于剧本和导演分析生成角色、场景、道具等资产空壳与生图提示词草案；不得自动写入素材库或触发扣费生图。";
    return "你是云端视频工作流的 Seedance 分镜与视频提示词 Agent。只生成逐条视频节点草案，每条包含编号、剧情、参考资产占位、提示词和建议生成设置；不得自动创建视频任务。";
}

function cloudStageUserPrompt(stage: "stage1" | "stage2" | "stage3", input: { episode: string; projectSlug: string; script: string; stage1: string; stage2: string }) {
    const header = `项目目录：${input.projectSlug}\n集数：${input.episode}\n\n`;
    if (stage === "stage1") {
        return `${header}请执行 Stage 1 导演分析，输出可人工审核的导演分析草案和结构化 JSON 摘要。\n\n## 剧本\n${input.script}`;
    }
    if (stage === "stage2") {
        return `${header}请执行 Stage 2 资产提示词生成，输出 assets JSON 草案。资产只作为项目共享资产库空壳和补图提示词，不要直接写入素材库。\n\n## 剧本\n${input.script}\n\n${input.stage1}`;
    }
    return `${header}请执行 Stage 3 Seedance 视频提示词生成。每条提示词必须等价一条视频节点记录，包含编号、对应剧情、引用资产占位、最终提示词、建议时长、画幅和状态字段。输出 JSON，等待用户确认后再写入视频生产包。\n\n## 剧本\n${input.script}\n\n${input.stage1}\n\n${input.stage2}`;
}

function actionLabel(action: string, stage?: string, result?: CommandResult) {
    if (action === "start-stage") return result?.jobStatus === "failed" ? `${stage?.toUpperCase()} 后台 Runner 启动失败` : result?.jobId ? `${stage?.toUpperCase()} 后台 Runner 已启动` : `${stage?.toUpperCase()} 启动被护栏阻断`;
    if (action === "validate") return `${stage?.toUpperCase()} 校验完成`;
    if (action === "export-copy-only") return "Copy-only 已导出，正在同步视频生产包";
    return "已保存";
}

function failedActionLabel(action: string, stage?: string, result?: CommandResult) {
    if (action === "export-copy-only") {
        if ((result?.stderr || "").includes("missing source")) return "缺少 Stage 3 标准输出，先启动 Stage 3，再导出到视频生产包";
        return "Copy-only 导出失败，已保留运行报告";
    }
    if (action === "validate") return `${stage?.toUpperCase()} 校验未通过，已保留运行报告`;
    if (action === "start-stage") return `${stage?.toUpperCase()} 启动失败，已保留运行报告`;
    return "操作失败，已保留运行报告";
}

function isFailedCommand(result?: CommandResult) {
    return Boolean(result?.exitCode && result.exitCode !== "0");
}

function videoHref(episode: string, projectSlug?: string) {
    const params = new URLSearchParams({ episode });
    if (projectSlug) params.set("projectSlug", projectSlug);
    return `/video?${params.toString()}`;
}

async function requestWorkflow<T>(url: string, body?: unknown) {
    const response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        method: body ? "POST" : "GET",
    });
    const envelope = (await response.json()) as ApiEnvelope<T | { error?: string }>;
    if (!response.ok || envelope.code !== 0) {
        const data = envelope.data as { error?: string };
        throw new Error(data?.error || envelope.msg || "请求失败");
    }
    return envelope.data as T;
}
