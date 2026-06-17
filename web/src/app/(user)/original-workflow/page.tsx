"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Empty, Input, Select, Spin, Tag } from "antd";
import { ArrowLeft, CheckCircle2, ChevronRight, Clipboard, Download, FileText, FolderOpen, PackagePlus, Play, RefreshCw, Save, ShieldCheck, Square, Video, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore, type Asset, type AssetWriteInput } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { assetProjectLibraryEntries, type AssetProjectLibraryEntry } from "../assets/asset-project-library";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { buildImportedVideoPackage, useVideoPackageStore } from "../video/use-video-package-store";
import { workflowPromptAuthoringIssue } from "../video/video-package-builders";
import { buildOriginalWorkflowChainHealth } from "./original-workflow-chain-health";
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

type WorkflowTab = "script" | "stage2" | "copy" | "quality";

const tabOptions: { key: WorkflowTab; label: string }[] = [
    { key: "script", label: "剧本优化" },
    { key: "stage2", label: "服化道" },
    { key: "copy", label: "Copy-only" },
    { key: "quality", label: "运行报告" },
];

const tabFileKeys: Record<Exclude<WorkflowTab, "quality">, string[]> = {
    copy: ["copyOnly"],
    script: ["script"],
    stage2: ["characters", "scenes", "props"],
};

const editableFileKeys = new Set(["script", "stage1D", "copyOnly"]);
const V5_SKILL_PRESET_ID = "seedance-original-format-director-method-v5";
const MX_SHELL_SKILL_PRESET_ID = "seedance-mx-shell-storyboard-v1-5";
const SKILL5_EMOTION_PRESET_ID = "seedance-original-format-emotion-director-v2-1";
const MX_SHELL_EMOTION_PRESET_ID = "seedance-mx-shell-emotion-director-v2-1";

const scriptSkillOptions = [{ label: "白皮书 AI 剧本母版适配包 v1.1", value: V5_SKILL_PRESET_ID }];
const artSkillOptions = [{ label: "导演方法 + 原格式服化道包 v5.2", value: V5_SKILL_PRESET_ID }];
const storyboardSkillOptions = [
    { label: "轻量镜头 Copy-only v5.2", value: V5_SKILL_PRESET_ID },
    { label: "清道夫 Copy-only v1.5", value: MX_SHELL_SKILL_PRESET_ID },
    { label: "情绪导演 Copy-only v2.1", value: SKILL5_EMOTION_PRESET_ID },
    { label: "情绪导演 + 清道夫 Copy-only v2.1", value: MX_SHELL_EMOTION_PRESET_ID },
];

export default function OriginalWorkflowPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const router = useRouter();
    const searchParams = useSearchParams();
    const codexApiBaseUrl = useOriginalWorkflowStore((state) => state.codexApiBaseUrl);
    const codexApiKey = useOriginalWorkflowStore((state) => state.codexApiKey);
    const codexModel = useOriginalWorkflowStore((state) => state.codexModel);
    const executionMode = useOriginalWorkflowStore((state) => state.executionMode);
    const rootPath = useOriginalWorkflowStore((state) => state.rootPath);
    const episode = useOriginalWorkflowStore((state) => state.episode);
    const projectSlug = useOriginalWorkflowStore((state) => state.projectSlug);
    const scriptSkillPresetId = useOriginalWorkflowStore((state) => state.scriptSkillPresetId);
    const artSkillPresetId = useOriginalWorkflowStore((state) => state.artSkillPresetId);
    const storyboardSkillPresetId = useOriginalWorkflowStore((state) => state.storyboardSkillPresetId);
    const setRootPath = useOriginalWorkflowStore((state) => state.setRootPath);
    const setEpisode = useOriginalWorkflowStore((state) => state.setEpisode);
    const setProjectSlug = useOriginalWorkflowStore((state) => state.setProjectSlug);
    const setScriptSkillPresetId = useOriginalWorkflowStore((state) => state.setScriptSkillPresetId);
    const setArtSkillPresetId = useOriginalWorkflowStore((state) => state.setArtSkillPresetId);
    const setStoryboardSkillPresetId = useOriginalWorkflowStore((state) => state.setStoryboardSkillPresetId);
    const addAsset = useAssetStore((state) => state.addAsset);
    const assets = useAssetStore((state) => state.assets);
    const ensureProjectFolder = useAssetStore((state) => state.ensureProjectFolder);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const sourceEpisodes = useScriptStore((state) => state.episodes);
    const sourceProjects = useCreativeProjectStore((state) => state.projects);
    const effectiveConfig = useEffectiveConfig();
    const hasLoadedPublicSettings = useConfigStore((state) => state.hasLoadedPublicSettings);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const importedPackages = useVideoPackageStore((state) => state.importedPackages);
    const upsertImportedPackages = useVideoPackageStore((state) => state.upsertImportedPackages);
    const [snapshot, setSnapshot] = useState<WorkflowSnapshot>();
    const [activeTab, setActiveTab] = useState<WorkflowTab>("script");
    const [activeFileKey, setActiveFileKey] = useState("script");
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(false);
    const [runningAction, setRunningAction] = useState("");
    const [syncedSourceScriptKey, setSyncedSourceScriptKey] = useState("");
    const latestSnapshotRequestKeyRef = useRef("");
    const requestedEpisode = searchParams.get("episode") || "";
    const requestedProjectSlug = searchParams.get("projectSlug") || "";
    const sourceProjectId = searchParams.get("sourceProjectId") || "";
    const sourceEpisodeId = searchParams.get("sourceEpisodeId") || "";
    const routeParamsPending = Boolean((requestedEpisode && requestedEpisode !== episode) || (requestedProjectSlug && requestedProjectSlug !== projectSlug));
    const sourceProject = useMemo(() => sourceProjects.find((item) => item.id === sourceProjectId), [sourceProjectId, sourceProjects]);
    const sourceEpisode = useMemo(() => sourceEpisodes.find((item) => item.id === sourceEpisodeId), [sourceEpisodeId, sourceEpisodes]);
    const sourceScopeLabel = sourceProject || sourceEpisode ? `${sourceProject?.title || "未命名项目"} / ${sourceEpisode ? `第 ${String(sourceEpisode.order || 1).padStart(2, "0")} 集 · ${sourceEpisode.title}` : "未绑定分集"}` : "";
    const sourceReturnHref = sourceProjectId ? `/projects/${encodeURIComponent(sourceProjectId)}` : "";
    const sourceReturnLabel = "返回来源项目";
    const filesByKey = useMemo(() => new Map(snapshot?.files.map((file) => [file.key, file]) || []), [snapshot?.files]);
    const currentFile = filesByKey.get(activeFileKey);
    const visibleFileKeys = activeTab === "quality" ? [] : tabFileKeys[activeTab];
    const visibleFiles = visibleFileKeys.map((key) => filesByKey.get(key)).filter(Boolean) as WorkflowFile[];
    const editable = currentFile ? editableFileKeys.has(currentFile.key) : false;
    const currentReport = snapshot?.commandResult || snapshot?.latestJob;
    const copyOnlySyncState = useMemo(() => getCopyOnlySyncState(snapshot?.files || [], snapshot?.validations?.stage3), [snapshot?.files, snapshot?.validations?.stage3]);
    const copyOnlySyncNotice = useMemo(() => copyOnlySyncState.notice.replace("{episode}", episode), [copyOnlySyncState.notice, episode]);
    const hasCopyOnlyFile = Boolean(filesByKey.get("copyOnly")?.exists);
    const canImportCopyOnly = hasCopyOnlyFile && !copyOnlySyncState.disabled;
    const workflowVideoPackageCount = useMemo(() => importedPackages.filter((item) => item.sourceEpisode === episode).length, [episode, importedPackages]);
    const isPublicSettingsPending = isPublicSettingsLoading || !hasLoadedPublicSettings;
    const chainHealth = useMemo(
        () =>
            buildOriginalWorkflowChainHealth({
                enterprisePreflight: null,
                files: snapshot?.files || [],
                isPublicSettingsLoading: isPublicSettingsPending,
                validations: snapshot?.validations,
                videoPackageCount: workflowVideoPackageCount,
                videoProtocol: effectiveConfig.videoProtocol,
            }),
        [effectiveConfig.videoProtocol, isPublicSettingsPending, snapshot?.files, snapshot?.validations, workflowVideoPackageCount],
    );
    const nextStep = useMemo(
        () => getOriginalWorkflowNextStep({ files: snapshot?.files || [], job: currentReport, rootExists: snapshot?.rootExists, validations: snapshot?.validations }),
        [currentReport, snapshot?.files, snapshot?.rootExists, snapshot?.validations],
    );
    const isWorkflowReading = routeParamsPending || (!snapshot && loading);
    const visibleNextStep: OriginalWorkflowNextStep = isWorkflowReading
        ? {
              actionLabel: "刷新状态",
              description: "正在加载当前项目和集数的剧本、流程产物和质量门结果。",
              kind: "connect",
              title: "正在读取工作流状态",
          }
        : nextStep;
    const copyOnlyStartNotice = stageStartGateNotice("stage3", snapshot?.validations);
    const stageStats = useMemo(
        () => [
            { label: "服化道", ok: ["characters", "scenes", "props"].every((key) => filesByKey.get(key)?.exists), stage: "stage2" as const, value: fileCount(filesByKey, ["characters", "scenes", "props"]) },
            { label: "Copy-only", ok: Boolean(filesByKey.get("copyOnly")?.exists), stage: "stage3" as const, value: fileCount(filesByKey, ["copyOnly"]) },
        ],
        [filesByKey],
    );
    const activeTabLabel = tabOptions.find((tab) => tab.key === activeTab)?.label || "当前阶段";
    const blockedHealthCount = chainHealth.filter((item) => item.status === "blocked").length;
    const readyHealthCount = chainHealth.filter((item) => item.status === "ready").length;
    const visibleNextStepActionKey = workflowNextStepActionKey(visibleNextStep);
    const visibleNextStepRunning = Boolean(visibleNextStepActionKey && runningAction === visibleNextStepActionKey);
    const otherActionRunning = Boolean(runningAction && runningAction !== visibleNextStepActionKey);

    useEffect(() => {
        let changed = false;
        if (requestedEpisode && requestedEpisode !== episode) setEpisode(requestedEpisode);
        if (requestedEpisode && requestedEpisode !== episode) changed = true;
        if (requestedProjectSlug && requestedProjectSlug !== projectSlug) setProjectSlug(requestedProjectSlug);
        if (requestedProjectSlug && requestedProjectSlug !== projectSlug) changed = true;
        if (!changed) return;
        setSnapshot(undefined);
        setActiveTab("script");
        setActiveFileKey("script");
        setDraft("");
    }, [episode, projectSlug, requestedEpisode, requestedProjectSlug, setEpisode, setProjectSlug]);

    useEffect(() => {
        if (!snapshot) return;
        if (workflowSnapshotKey(snapshot.rootPath, snapshot.projectSlug, snapshot.episode) === workflowSnapshotKey(rootPath, projectSlug, episode)) return;
        setSnapshot(undefined);
    }, [episode, projectSlug, rootPath, snapshot]);

    useEffect(() => {
        if (routeParamsPending) return;
        if (!sourceEpisodeId) return;
        if (!sourceEpisode?.summary.trim()) return;
        const syncKey = `${sourceEpisode.id}:${sourceEpisode.updatedAt}:${episode}:${projectSlug}:${rootPath}`;
        if (syncKey === syncedSourceScriptKey) return;
        const requestKey = workflowSnapshotKey(rootPath, projectSlug, episode);
        latestSnapshotRequestKeyRef.current = requestKey;
        setSyncedSourceScriptKey(syncKey);
        void requestWorkflow<WorkflowSnapshot>("/api/original-workflow", {
            action: "save-script",
            content: sourceEpisode.summary,
            episode,
            projectSlug,
            rootPath,
        })
            .then((data) => {
                if (latestSnapshotRequestKeyRef.current !== requestKey) return;
                setSnapshot(data);
                message.success("已同步项目里的最新剧本到视频工作流");
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "同步项目剧本失败"));
    }, [episode, message, projectSlug, rootPath, routeParamsPending, sourceEpisode, sourceEpisodeId, syncedSourceScriptKey]);

    const refresh = useCallback(async () => {
        if (routeParamsPending) return;
        const requestKey = workflowSnapshotKey(rootPath, projectSlug, episode);
        latestSnapshotRequestKeyRef.current = requestKey;
        setLoading(true);
        try {
            const data = await requestWorkflow<WorkflowSnapshot>(`/api/original-workflow?${new URLSearchParams({ episode, projectSlug, rootPath }).toString()}`);
            if (latestSnapshotRequestKeyRef.current !== requestKey) return;
            setSnapshot(data);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取工作流失败");
        } finally {
            if (latestSnapshotRequestKeyRef.current === requestKey) setLoading(false);
        }
    }, [episode, message, projectSlug, rootPath, routeParamsPending]);

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
        const requestKey = workflowSnapshotKey(rootPath, projectSlug, episode);
        latestSnapshotRequestKeyRef.current = requestKey;
        setRunningAction(actionKey);
        try {
            const data = await requestWorkflow<WorkflowSnapshot>("/api/original-workflow", {
                action,
                content: draft,
                episode,
                executionMode,
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
                skillPresetId: action === "start-stage" ? skillPresetIdForStage(options?.stage, { artSkillPresetId, scriptSkillPresetId, storyboardSkillPresetId }) : undefined,
                stage: options?.stage,
            });
            if (latestSnapshotRequestKeyRef.current !== requestKey) return data;
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

    const saveCurrentFile = () => {
        if (!currentFile) return;
        void runAction(currentFile.key === "script" ? "save-script" : "save-file", { fileKey: currentFile.key });
    };

    const startStage = (stage: "stage1" | "stage2" | "stage3") => {
        void runAction("start-stage", { stage });
    };

    const importAssetPromptCards = () => {
        if (snapshot?.validations?.stage2?.state !== "passed") {
            message.warning(validationRequiredNotice("stage2"));
            setActiveTab("quality");
            return;
        }
        const characters = filesByKey.get("characters");
        const scenes = filesByKey.get("scenes");
        const props = filesByKey.get("props");
        const parsed = [
            ...(characters?.content ? parseWorkflowAssetPrompts(characters.content, { episode, projectSlug, sourcePath: characters.path }) : []),
            ...(scenes?.content ? parseWorkflowAssetPrompts(scenes.content, { episode, projectSlug, sourcePath: scenes.path }) : []),
            ...(props?.content ? parseWorkflowAssetPrompts(props.content, { episode, projectSlug, sourcePath: props.path }) : []),
        ];
        if (!parsed.length) {
            message.warning("没有找到可导入的资产提示词，请先生成服化道");
            return;
        }
        const projectFolderId = sourceProjectId ? ensureProjectFolder(sourceProjectId, sourceProject?.title || projectSlug || sourceProjectId) : "";
        let created = 0;
        let updated = 0;
        for (const item of parsed) {
            const existing = assets.find((asset) => workflowAssetImportKey(asset) === item.importKey);
            const input = scopeWorkflowAssetToSourceProject(buildWorkflowTextAssetInput(item), {
                existing,
                folderId: projectFolderId,
                sourceEpisodeId,
                sourceEpisodeTitle: sourceEpisode?.title || "",
                sourceProjectId,
                sourceProjectTitle: sourceProject?.title || "",
            });
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
            if (!options?.quietMissing) message.warning("没有找到 Copy-only 提示词，请先生成 Copy-only");
            return 0;
        }
        const blocked = parsed.map((item) => ({ item, issue: workflowPromptAuthoringIssue(item.prompt, item.duration) })).find(({ issue }) => Boolean(issue));
        if (blocked) {
            message.error(`${blocked.item.id} 未通过视频提示词入库检查：${blocked.issue}`);
            setActiveTab("copy");
            return 0;
        }
        const count = upsertImportedPackages(parsed.map((item) => buildImportedVideoPackage({ ...item, references, sourceProjectId })));
        message.success(`已同步 ${count} 条视频生产包`);
        if (navigate) router.push(videoHref(episode, { projectSlug, sourceEpisodeId, sourceProjectId }));
        return count;
    };

    const importCopyOnlyToVideo = () => {
        if (copyOnlySyncState.mode === "needs-stage3-validation") {
            message.warning(copyOnlySyncNotice);
            setActiveTab("quality");
            return;
        }
        syncCopyOnlyToVideo(snapshot);
    };

    const exportCopyOnlyToVideo = async () => {
        if (copyOnlySyncState.mode === "needs-stage3-validation") {
            message.warning(copyOnlySyncNotice);
            setActiveTab("quality");
            return;
        }
        if (copyOnlySyncState.mode === "blocked") {
            message.warning(copyOnlySyncNotice);
            setActiveTab("copy");
            return;
        }
        if (copyOnlySyncState.mode === "sync-existing") {
            if (copyOnlySyncNotice) message.info(copyOnlySyncNotice);
            syncCopyOnlyToVideo(snapshot);
            return;
        }
        const data = await runAction("export-copy-only");
        if (!data) return;
        const failed = isFailedCommand(data.commandResult);
        const count = syncCopyOnlyToVideo(data, { navigate: !failed, quietMissing: failed });
        if (failed && count > 0) {
            message.warning("导出脚本失败，但已使用现有 Copy-only 同步到视频生产包");
            router.push(videoHref(episode, { projectSlug, sourceEpisodeId, sourceProjectId }));
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
            <div className="mx-auto flex h-full w-full max-w-[1680px] flex-col gap-3 px-4 py-3 xl:px-6">
                <header className="studio-page-header shrink-0 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="flex items-center gap-2 text-xs font-semibold tracking-normal text-[var(--studio-accent)]">
                                    <Wand2 className="size-4" />
                                    Seedance 视频工作流
                                </span>
                                {sourceScopeLabel ? <span className="min-w-0 truncate text-xs text-[var(--studio-text-muted)]">来源：{sourceScopeLabel}</span> : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                                <h1 className="text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">视频工作流控制台</h1>
                                <p className="text-xs leading-5 text-[var(--studio-text-muted)]">剧本优化、服化道、Copy-only、质量门</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {sourceReturnHref ? (
                                <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.push(sourceReturnHref)}>
                                    {sourceReturnLabel}
                                </Button>
                            ) : null}
                            <Button icon={<Video className="size-4" />} onClick={() => router.push(videoHref(episode, { projectSlug, sourceEpisodeId, sourceProjectId }))}>
                                视频生产台
                            </Button>
                            <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>
                                刷新
                            </Button>
                            <Button danger icon={<Square className="size-4" />} disabled={currentReport?.jobStatus !== "running"} loading={runningAction === "cancel-latest-job-"} onClick={() => void runAction("cancel-latest-job")}>
                                停止 Runner
                            </Button>
                        </div>
                    </div>
                </header>

                <section className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[232px_minmax(0,1fr)]">
                    <aside className="studio-rail flex min-h-0 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-[var(--studio-border-subtle)] p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-[var(--studio-accent)]">项目</div>
                                    <div className="mt-1 truncate text-sm font-semibold text-[var(--studio-text-primary)]">{sourceScopeLabel || projectSlug}</div>
                                    <div className="mt-1 truncate font-mono text-xs text-[var(--studio-text-muted)]">{episode}</div>
                                </div>
                                <Tag className="m-0 shrink-0" color={isWorkflowReading ? "processing" : snapshot?.rootExists ? "success" : "error"}>
                                    {isWorkflowReading ? "读取中" : snapshot?.rootExists ? "就绪" : "未连接"}
                                </Tag>
                            </div>

                            <div className="mt-3 grid gap-2">
                                <div className="text-xs font-semibold text-[var(--studio-text-muted)]">阶段 Skill</div>
                                <StageSkillSelect label="剧本优化" options={scriptSkillOptions} value={scriptSkillPresetId || V5_SKILL_PRESET_ID} onChange={setScriptSkillPresetId} />
                                <StageSkillSelect label="服化道" options={artSkillOptions} value={artSkillPresetId || V5_SKILL_PRESET_ID} onChange={setArtSkillPresetId} />
                                <StageSkillSelect label="Copy-only" options={storyboardSkillOptions} value={storyboardSkillPresetId || V5_SKILL_PRESET_ID} onChange={setStoryboardSkillPresetId} />
                            </div>
                        </div>

                        <nav className="grid shrink-0 gap-1 border-b border-[var(--studio-border-subtle)] bg-[var(--studio-section-bg)] p-2">
                            {tabOptions.map((tab) => {
                                const count =
                                    tab.key === "quality"
                                        ? currentReport
                                            ? 1
                                            : 0
                                        : tab.key === "script"
                                          ? fileCount(filesByKey, ["script"])
                                          : tab.key === "stage2"
                                            ? fileCount(filesByKey, ["characters", "scenes", "props"])
                                            : fileCount(filesByKey, ["copyOnly"]);
                                const done = tab.key === "quality" ? Boolean(currentReport) : count > 0;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        className={`flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition ${activeTab === tab.key ? "bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-panel-muted-bg)] hover:text-[var(--studio-text-primary)]"}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            {done ? <CheckCircle2 className="size-4 shrink-0 text-[var(--studio-success)]" /> : <FileText className="size-4 shrink-0 text-[var(--studio-text-muted)]" />}
                                            <span className="truncate">{tab.label}</span>
                                        </span>
                                        <span className="font-mono text-xs text-[var(--studio-text-muted)]">{count}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                            <div className="studio-section p-2.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                                        <ShieldCheck className="size-4 text-[var(--studio-accent)]" />
                                        链路状态
                                    </div>
                                    <Tag color={blockedHealthCount ? "warning" : isWorkflowReading ? "processing" : "success"}>{isWorkflowReading ? "读取中" : blockedHealthCount ? "未完成" : "可继续"}</Tag>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">
                                    就绪 {readyHealthCount}/{chainHealth.length} · 阻断 {blockedHealthCount}
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2">
                                {stageStats.map((item) => (
                                    <div key={item.label} className="studio-section px-2.5 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-xs text-[var(--studio-text-secondary)]">{item.label}</span>
                                            <span className="font-mono text-sm text-[var(--studio-text-primary)]">{item.value}</span>
                                        </div>
                                        {item.stage ? <div className="mt-1 truncate text-[11px] text-[var(--studio-text-muted)]">{validationLabel(snapshot?.validations?.[item.stage]).replace("质量门：", "")}</div> : null}
                                    </div>
                                ))}
                            </div>

                            <WorkflowDisclosure icon={<FolderOpen className="size-4 text-[var(--studio-accent)]" />} title="本地缓存目录">
                                <div className="grid gap-3 p-4">
                                    <p className="text-xs leading-5 text-[var(--studio-text-muted)]">仅用于当前本地版兼容 markdown 工作流。上云后这里会由后端项目存储和对象存储替代。</p>
                                    <LabeledInput label="根目录" value={rootPath} onChange={setRootPath} />
                                    <div className="grid grid-cols-2 gap-3">
                                        <LabeledInput label="项目目录" value={projectSlug} onChange={setProjectSlug} />
                                        <LabeledInput label="集数" value={episode} onChange={setEpisode} />
                                    </div>
                                </div>
                            </WorkflowDisclosure>
                        </div>
                    </aside>

                    <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
                        <section className="studio-toolbar shrink-0 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-[var(--studio-accent)]">当前步骤</span>
                                        <h2 className="text-lg font-semibold text-[var(--studio-text-primary)]">{activeTabLabel}</h2>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">
                                        {visibleNextStep.title}：{visibleNextStep.description}
                                    </p>
                                </div>
                                <Button type="primary" icon={<Play className="size-4" />} disabled={otherActionRunning} loading={isWorkflowReading || loading || visibleNextStepRunning} onClick={isWorkflowReading ? () => void refresh() : runNextStep}>
                                    {visibleNextStep.actionLabel}
                                </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {activeTab === "stage2" ? (
                                    <>
                                        <Button icon={<ShieldCheck className="size-4" />} loading={runningAction === "validate-stage2"} onClick={() => void runAction("validate", { stage: "stage2" })}>
                                            校验服化道
                                        </Button>
                                        <Button icon={<PackagePlus className="size-4" />} disabled={snapshot?.validations?.stage2?.state !== "passed"} onClick={importAssetPromptCards}>
                                            资产写入素材
                                        </Button>
                                    </>
                                ) : null}
                                {activeTab === "copy" ? (
                                    <>
                                        <Button
                                            icon={<Play className="size-4" />}
                                            disabled={isWorkflowReading || Boolean(copyOnlyStartNotice) || Boolean(runningAction && runningAction !== "start-stage-stage3")}
                                            loading={runningAction === "start-stage-stage3"}
                                            onClick={() => startStage("stage3")}
                                        >
                                            生成 Copy-only
                                        </Button>
                                        <Button icon={<ShieldCheck className="size-4" />} loading={runningAction === "validate-stage3"} onClick={() => void runAction("validate", { stage: "stage3" })}>
                                            校验 Copy-only
                                        </Button>
                                        <Button type="primary" icon={<Download className="size-4" />} disabled={copyOnlySyncState.disabled} loading={runningAction === "export-copy-only-"} onClick={() => void exportCopyOnlyToVideo()}>
                                            {copyOnlySyncState.label}
                                        </Button>
                                        <Button icon={<Video className="size-4" />} disabled={!canImportCopyOnly} onClick={importCopyOnlyToVideo}>
                                            同步到视频生成
                                        </Button>
                                        <Button icon={<Video className="size-4" />} onClick={() => router.push(videoHref(episode, { projectSlug, sourceEpisodeId, sourceProjectId }))}>
                                            进入视频生成
                                        </Button>
                                        {copyOnlyStartNotice ? <span className="self-center text-xs text-[var(--studio-text-muted)]">{copyOnlyStartNotice}</span> : null}
                                    </>
                                ) : null}
                                {activeTab === "quality" ? (
                                    <Button danger icon={<Square className="size-4" />} disabled={currentReport?.jobStatus !== "running"} loading={runningAction === "cancel-latest-job-"} onClick={() => void runAction("cancel-latest-job")}>
                                        停止 Runner
                                    </Button>
                                ) : null}
                            </div>
                        </section>

                        <section className="studio-panel flex min-h-0 flex-1 flex-col overflow-hidden">
                            {isWorkflowReading ? (
                                <div className="grid flex-1 place-items-center">
                                    <Spin />
                                </div>
                            ) : activeTab === "quality" ? (
                                <QualityPanel result={currentReport} />
                            ) : visibleFiles.length ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {visibleFiles.length > 1 ? (
                                        <div className="thin-scrollbar shrink-0 overflow-x-auto border-b border-[var(--studio-border-subtle)] px-3 py-2">
                                            <div className="flex min-w-max gap-1.5">
                                                {visibleFiles.map((file) => (
                                                    <button
                                                        key={file.key}
                                                        type="button"
                                                        className={`w-[150px] shrink-0 rounded-md border px-2.5 py-2 text-left transition ${activeFileKey === file.key ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-panel-muted-bg)]"}`}
                                                        onClick={() => setActiveFileKey(file.key)}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="min-w-0 truncate text-xs font-semibold text-[var(--studio-text-primary)]">{file.label}</span>
                                                            <Tag className="m-0 shrink-0" color={file.exists ? "success" : "default"}>
                                                                {file.exists ? "有文件" : "空"}
                                                            </Tag>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                                        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{currentFile?.label || "未选择文件"}</div>
                                                <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{currentFile?.path || "-"}</div>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                                <Button icon={<Clipboard className="size-4" />} disabled={!draft} onClick={() => copyText(draft, "已复制当前内容")}>
                                                    复制
                                                </Button>
                                                <Button type="primary" icon={<Save className="size-4" />} disabled={!editable || !currentFile} loading={runningAction.startsWith("save")} onClick={saveCurrentFile}>
                                                    保存
                                                </Button>
                                            </div>
                                        </div>
                                        {currentFile ? (
                                            <div className="min-h-0 flex-1">
                                                <textarea
                                                    key={currentFile.key}
                                                    value={draft}
                                                    readOnly={!editable}
                                                    onChange={(event) => setDraft(event.target.value)}
                                                    className="thin-scrollbar h-full w-full resize-none overflow-auto border-0 bg-transparent p-4 font-mono text-sm leading-6 text-[var(--studio-text-primary)] outline-none"
                                                    placeholder={editable ? "在这里编辑当前 markdown 文件" : "当前文件暂未生成"}
                                                />
                                            </div>
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
                </section>
            </div>
        </main>
    );
}

function workflowSnapshotKey(rootPath: string, projectSlug: string, episode: string) {
    return `${rootPath}\n${projectSlug}\n${episode}`;
}

function workflowNextStepActionKey(step: OriginalWorkflowNextStep) {
    if (step.kind === "start-stage") return `start-stage-${step.stage}`;
    if (step.kind === "validate-stage") return `validate-${step.stage}`;
    if (step.kind === "export-copy") return "export-copy-only-";
    return "";
}

function skillPresetIdForStage(stage: "stage1" | "stage2" | "stage3" | undefined, input: { artSkillPresetId: string; scriptSkillPresetId: string; storyboardSkillPresetId: string }) {
    if (stage === "stage2") return input.artSkillPresetId || V5_SKILL_PRESET_ID;
    if (stage === "stage3") return input.storyboardSkillPresetId || V5_SKILL_PRESET_ID;
    return input.scriptSkillPresetId || V5_SKILL_PRESET_ID;
}

function StageSkillSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }>; value: string }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
            <div className="mb-1.5 text-[11px] font-semibold text-[var(--studio-text-muted)]">{label}</div>
            <Select size="small" className="w-full" options={options} value={value} onChange={onChange} />
        </div>
    );
}

function LabeledInput({ label, onChange, password, placeholder, value }: { label: string; onChange: (value: string) => void; password?: boolean; placeholder?: string; value: string }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-xs text-[var(--studio-text-muted)]">{label}</span>
            {password ? (
                <Input.Password visibilityToggle={false} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
            ) : (
                <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
            )}
        </label>
    );
}

function WorkflowDisclosure({ children, defaultOpen, icon, title }: { children: ReactNode; defaultOpen?: boolean; icon: ReactNode; title: string }) {
    return (
        <details className="studio-panel group overflow-hidden" open={defaultOpen}>
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

function workflowAssetImportKey(asset: Asset) {
    const originalWorkflow = asset.metadata?.originalWorkflow;
    if (!originalWorkflow || typeof originalWorkflow !== "object" || Array.isArray(originalWorkflow)) return "";
    const value = (originalWorkflow as { importKey?: unknown }).importKey;
    return typeof value === "string" ? value : "";
}

function scopeWorkflowAssetToSourceProject(
    input: AssetWriteInput,
    options: {
        existing?: Asset;
        folderId: string;
        sourceEpisodeId: string;
        sourceEpisodeTitle: string;
        sourceProjectId: string;
        sourceProjectTitle: string;
    },
) {
    if (!options.sourceProjectId) return input;
    const now = new Date().toISOString();
    const metadata = { ...input.metadata };
    metadata.projectId = options.sourceProjectId;
    if (options.sourceProjectTitle) metadata.projectTitle = options.sourceProjectTitle;
    if (options.sourceEpisodeId) metadata.episodeId = options.sourceEpisodeId;
    if (options.sourceEpisodeTitle) metadata.episodeTitle = options.sourceEpisodeTitle;
    metadata.projectLibraries = mergeWorkflowProjectLibraries(options.existing, options.sourceProjectId, now);
    metadata.originalWorkflow = {
        ...readWorkflowMetadataRecord(metadata.originalWorkflow),
        sourceEpisodeId: options.sourceEpisodeId,
        sourceProjectId: options.sourceProjectId,
    };
    return {
        ...input,
        folderId: options.folderId || input.folderId,
        metadata,
    } as AssetWriteInput;
}

function mergeWorkflowProjectLibraries(existing: Asset | undefined, projectId: string, now: string): AssetProjectLibraryEntry[] {
    const entries = assetProjectLibraryEntries(existing);
    const current = entries.find((entry) => entry.projectId === projectId);
    const nextEntry: AssetProjectLibraryEntry = current ? { ...current, role: "editor", syncStatus: current.syncStatus || "local", updatedAt: now } : { addedAt: now, projectId, role: "editor", syncStatus: "local", updatedAt: now, visibility: "project" };
    return current ? entries.map((entry) => (entry.projectId === projectId ? nextEntry : entry)) : [...entries, nextEntry];
}

function readWorkflowMetadataRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function QualityPanel({ result }: { result?: CommandResult }) {
    if (!result) {
        return (
            <div className="grid flex-1 place-items-center p-8">
                <Empty description="还没有本次本地 Runner 或质量门输出" />
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
                <div className="studio-semantic-warning studio-semantic-notice rounded-lg border p-3 text-sm leading-6">只完成了启动护栏检查，没有启动后台 Runner。通常是内容执行被锁定，或本机 runner 未接入。</div>
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
    if (status === "failed") return "本地 Runner 运行失败";
    if (status === "success") return "本地 Runner 已完成";
    if (status === "cancelled") return "本地 Runner 已取消";
    if (health === "stalled") return "本地 Runner 可能卡住";
    if (reused) return "已有本地 Runner 正在运行";
    if (status === "running") return "本地 Runner 正在运行";
    return "本地 Runner 已启动";
}

function runnerStatusClass(status?: string, health?: string) {
    if (status === "failed") return "studio-semantic-danger studio-semantic-notice";
    if (status === "cancelled") return "studio-semantic-warning studio-semantic-notice";
    if (health === "stalled") return "studio-semantic-warning studio-semantic-notice";
    return "studio-semantic-success studio-semantic-notice";
}

function runnerStatusTextClass(status?: string, health?: string) {
    if (status === "failed") return "text-[var(--studio-danger)]";
    if (status === "cancelled") return "text-[var(--studio-warning)]";
    if (health === "stalled") return "text-[var(--studio-warning)]";
    return "text-[var(--studio-success)]";
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
    if (stage === "stage3" && validations?.stage2?.state !== "passed") return validationRequiredNotice("stage2");
    return "";
}

function validationRequiredNotice(stage: "stage1" | "stage2" | "stage3") {
    const label = workflowStageLabel(stage);
    return `${label} 尚未通过质量门，请先校验通过后再继续下一步。`;
}

function actionLabel(action: string, stage?: string, result?: CommandResult) {
    const label = workflowStageLabel(stage);
    if (action === "start-stage") return result?.jobStatus === "failed" ? `${label} 后台 Runner 启动失败` : result?.jobId ? `${label} 后台 Runner 已启动` : `${label}启动被护栏阻断`;
    if (action === "validate") return `${label} 校验完成`;
    if (action === "export-copy-only") return "Copy-only 已导出，正在同步视频生产包";
    return "已保存";
}

function failedActionLabel(action: string, stage?: string, result?: CommandResult) {
    if (action === "export-copy-only") {
        if ((result?.stderr || "").includes("missing source")) return "缺少 Copy-only 输出，先启动 Copy-only，再同步到视频生产包";
        return "Copy-only 导出失败，已保留运行报告";
    }
    const label = workflowStageLabel(stage);
    if (action === "validate") return `${label}校验未通过，已保留运行报告`;
    if (action === "start-stage") return `${label}启动失败，已保留运行报告`;
    return "操作失败，已保留运行报告";
}

function workflowStageLabel(stage?: string) {
    if (stage === "stage2") return "服化道";
    if (stage === "stage3") return "Copy-only";
    if (stage === "stage1") return "剧本优化";
    return "阶段";
}

function isFailedCommand(result?: CommandResult) {
    return Boolean(result?.exitCode && result.exitCode !== "0");
}

function videoHref(episode: string, options: { projectSlug?: string; sourceEpisodeId?: string; sourceProjectId?: string } = {}) {
    const params = new URLSearchParams({ episode });
    if (options.projectSlug) params.set("projectSlug", options.projectSlug);
    if (options.sourceProjectId) params.set("sourceProjectId", options.sourceProjectId);
    if (options.sourceEpisodeId) params.set("sourceEpisodeId", options.sourceEpisodeId);
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
