"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Empty, Input, Segmented, Spin, Tag } from "antd";
import { ArrowLeft, CheckCircle2, ChevronRight, Clipboard, Download, FileText, FolderOpen, PackagePlus, Play, RefreshCw, Save, ShieldCheck, Square, Video, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCopyText } from "@/hooks/use-copy-text";
import { requestImageQuestion, type ChatCompletionMessage } from "@/services/api/image";
import { useAssetStore, type Asset, type AssetWriteInput } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useScriptStore } from "../canvas/stores/use-script-store";
import { assetProjectLibraryEntries, type AssetProjectLibraryEntry } from "../assets/asset-project-library";
import { canInvokeAgentConfig, defaultAgentConfigs, mergeAgentConfigs } from "../projects/agent-settings";
import { hasScriptOptimizerWhitePaperProductionNotes, isMeaningfullyOptimizedScript } from "../projects/script-optimizer-agent";
import { useAgentSettingsStore } from "../projects/use-agent-settings-store";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { buildImportedVideoPackage, useVideoPackageStore } from "../video/use-video-package-store";
import { workflowPromptAuthoringIssue } from "../video/video-package-builders";
import { buildOriginalWorkflowChainHealth } from "./original-workflow-chain-health";
import { buildWorkflowTextAssetInput, parseWorkflowAssetPrompts, parseWorkflowCopyOnlyPrompts, parseWorkflowImageReferenceTable } from "./original-workflow-imports";
import { getOriginalWorkflowNextStep, type OriginalWorkflowNextStep } from "./original-workflow-next-step";
import { findOriginalWorkflowPresetByRootPath } from "./original-workflow-presets";
import { getCopyOnlySyncState } from "./original-workflow-readiness";
import { buildOriginalWorkflowScriptOptimizerMessages, parseOriginalWorkflowScriptOptimizerResult } from "./original-workflow-script-optimizer";
import { useOriginalWorkflowStore, type OriginalWorkflowExecutionMode } from "./use-original-workflow-store";

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
    const executionMode = useOriginalWorkflowStore((state) => state.executionMode);
    const rootPath = useOriginalWorkflowStore((state) => state.rootPath);
    const episode = useOriginalWorkflowStore((state) => state.episode);
    const projectSlug = useOriginalWorkflowStore((state) => state.projectSlug);
    const setRootPath = useOriginalWorkflowStore((state) => state.setRootPath);
    const setEpisode = useOriginalWorkflowStore((state) => state.setEpisode);
    const setExecutionMode = useOriginalWorkflowStore((state) => state.setExecutionMode);
    const setProjectSlug = useOriginalWorkflowStore((state) => state.setProjectSlug);
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
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
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
    const sourceReturnHref = sourceProjectId ? (sourceEpisodeId ? `/projects/${encodeURIComponent(sourceProjectId)}/episodes/${encodeURIComponent(sourceEpisodeId)}/workbench` : `/projects/${encodeURIComponent(sourceProjectId)}`) : "";
    const sourceReturnLabel = sourceEpisodeId ? "返回本集生产台" : "返回来源项目";
    const scriptOptimizeHref = sourceEpisodeId && sourceReturnHref ? `${sourceReturnHref}?module=script` : "";
    const agentProjectId = sourceProjectId || projectSlug;
    const filesByKey = useMemo(() => new Map(snapshot?.files.map((file) => [file.key, file]) || []), [snapshot?.files]);
    const resolvedAgentConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentConfigs[agentProjectId] || []), [agentProjectId, globalAgentConfigs, projectAgentConfigs]);
    const scriptOptimizerConfig = resolvedAgentConfigs.find((config) => config.kind === "script_optimizer");
    const workflowPreset = useMemo(() => findOriginalWorkflowPresetByRootPath(rootPath), [rootPath]);
    const currentFile = filesByKey.get(activeFileKey);
    const visibleFileKeys = activeTab === "quality" ? [] : tabFileKeys[activeTab];
    const visibleFiles = visibleFileKeys.map((key) => filesByKey.get(key)).filter(Boolean) as WorkflowFile[];
    const editable = currentFile ? editableFileKeys.has(currentFile.key) : false;
    const currentReport = snapshot?.commandResult || snapshot?.latestJob;
    const copyOnlySyncState = useMemo(() => getCopyOnlySyncState(snapshot?.files || [], snapshot?.validations?.stage3), [snapshot?.files, snapshot?.validations?.stage3]);
    const copyOnlySyncNotice = useMemo(() => copyOnlySyncState.notice.replace("{episode}", episode), [copyOnlySyncState.notice, episode]);
    const hasCopyOnlyFile = Boolean(filesByKey.get("copyOnly")?.exists);
    const canImportCopyOnly = hasCopyOnlyFile && !copyOnlySyncState.disabled;
    const copyOnlyImportNotice = canImportCopyOnly ? "" : copyOnlySyncNotice;
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
              description: "正在加载当前项目和集数的剧本、阶段产物和质量门结果。",
              kind: "connect",
              title: "正在读取工作流状态",
          }
        : nextStep;
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
    const activeTabLabel = tabOptions.find((tab) => tab.key === activeTab)?.label || "当前阶段";
    const blockedHealthCount = chainHealth.filter((item) => item.status === "blocked").length;
    const readyHealthCount = chainHealth.filter((item) => item.status === "ready").length;

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

    const optimizeScriptWithAgent = async () => {
        const sourceScript = (activeFileKey === "script" ? draft : filesByKey.get("script")?.content || draft).trim();
        if (!sourceScript) {
            message.warning("请先导入或粘贴本集剧本。");
            setActiveTab("script");
            return;
        }
        const agentConfig = scriptOptimizerConfig;
        if (!agentConfig) {
            message.warning("未找到剧本优化 Agent 设定。");
            return;
        }
        const callable = canInvokeAgentConfig(agentConfig);
        if (!callable.callable) {
            message.warning(callable.reason || "剧本优化 Agent 不可用。");
            return;
        }
        const preferredModel = agentConfig.modelPreference.trim();
        const textModel = preferredModel && preferredModel !== "default" ? preferredModel : effectiveConfig.textModel || effectiveConfig.model;
        if (!checkAiConfigReady(effectiveConfig, textModel)) {
            message.warning("请先配置可用的文本模型。");
            return;
        }
        const requestKey = workflowSnapshotKey(rootPath, projectSlug, episode);
        latestSnapshotRequestKeyRef.current = requestKey;
        setRunningAction("optimize-script");
        try {
            const answer = await requestImageQuestion(
                { ...effectiveConfig, model: textModel },
                buildOriginalWorkflowScriptOptimizerMessages({
                    agentConfig,
                    episode,
                    projectSlug,
                    scriptSnapshot: sourceScript,
                }) as ChatCompletionMessage[],
            );
            if (latestSnapshotRequestKeyRef.current !== requestKey) return;
            const result = parseOriginalWorkflowScriptOptimizerResult(answer, episode);
            const optimized = result.productionScript.trim();
            if (!optimized) {
                message.warning("模型没有返回可用的优化稿。");
                return;
            }
            if (!isMeaningfullyOptimizedScript(sourceScript, optimized)) {
                message.warning("模型返回内容与原稿基本一致，未作为有效优化稿写入。请换更强的文本模型或调整剧本优化 Agent 后重试。");
                return;
            }
            if (!hasScriptOptimizerWhitePaperProductionNotes(optimized)) {
                message.warning("模型返回稿缺少白皮书要求的制作备注、视觉方向、连续性、风险提示或禁止项，未写入剧本。");
                return;
            }
            const data = await requestWorkflow<WorkflowSnapshot>("/api/original-workflow", {
                action: "save-script",
                content: optimized,
                episode,
                executionMode,
                projectSlug,
                requireScriptOptimizerNotes: true,
                rootPath,
            });
            if (latestSnapshotRequestKeyRef.current !== requestKey) return;
            setSnapshot(data);
            setActiveTab("script");
            setActiveFileKey("script");
            setDraft(optimized);
            message.success("剧本优化 Agent 已保存优化稿，可用 v5 继续跑 Stage 1。");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本优化失败");
        } finally {
            if (latestSnapshotRequestKeyRef.current === requestKey) setRunningAction("");
        }
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
        const parsed = [
            ...(characters?.content ? parseWorkflowAssetPrompts(characters.content, { episode, projectSlug, sourcePath: characters.path }) : []),
            ...(scenes?.content ? parseWorkflowAssetPrompts(scenes.content, { episode, projectSlug, sourcePath: scenes.path }) : []),
        ];
        if (!parsed.length) {
            message.warning("没有找到可导入的资产提示词，请先生成 Stage 2");
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
            if (!options?.quietMissing) message.warning("没有找到 Copy-only 提示词，请先完成 Stage 3 并导出 Copy-only");
            return 0;
        }
        const blocked = parsed
            .map((item) => ({ item, issue: workflowPromptAuthoringIssue(item.prompt, item.duration) }))
            .find(({ issue }) => Boolean(issue));
        if (blocked) {
            message.error(`${blocked.item.id} 未通过视频提示词入库检查：${blocked.issue}`);
            setActiveTab("stage3");
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
            setActiveTab("stage3");
            return;
        }
        if (copyOnlySyncState.mode === "sync-existing") {
            message.info(copyOnlySyncNotice);
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
            <div className="mx-auto flex h-full w-full max-w-[1540px] flex-col gap-4 px-5 py-4 xl:px-8">
                <header className="shrink-0">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-normal text-[var(--studio-accent)]">
                                <Wand2 className="size-4" />
                                Seedance 视频工作流
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

                <section className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="studio-panel flex min-h-0 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-[var(--studio-border-subtle)] p-4">
                            <div className="text-xs font-semibold text-[var(--studio-accent)]">PROJECT</div>
                            <div className="mt-2 truncate text-sm font-semibold text-[var(--studio-text-primary)]">{sourceScopeLabel || projectSlug}</div>
                            <div className="mt-2 flex items-center justify-between rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                                <span className="truncate font-mono text-xs text-[var(--studio-text-muted)]">{episode}</span>
                                <Tag color={isWorkflowReading ? "processing" : snapshot?.rootExists ? "success" : "error"}>{isWorkflowReading ? "读取中" : snapshot?.rootExists ? "缓存就绪" : "未连接"}</Tag>
                            </div>
                            <div className="mt-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2">
                                <div className="text-xs font-semibold text-[var(--studio-text-muted)]">工作流包 / 预设</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-[var(--studio-text-primary)]">{workflowPreset?.name || "自定义本地工作流目录"}</span>
                                    {workflowPreset ? <Tag color="blue">v{workflowPreset.version}</Tag> : null}
                                </div>
                                <div className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">{workflowPreset?.description || "当前根目录不在内置预设清单中。"}</div>
                            </div>
                            <div className="mt-3 grid gap-2">
                                <div className="text-xs font-semibold text-[var(--studio-text-muted)]">执行模式</div>
                                <Segmented
                                    block
                                    options={[
                                        { label: "本地 Runner", value: "local-runner" },
                                        { label: "云端 Worker", value: "cloud-worker" },
                                    ]}
                                    value={executionMode}
                                    onChange={(value) => setExecutionMode(value as OriginalWorkflowExecutionMode)}
                                />
                                {executionMode === "cloud-worker" ? (
                                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                                        上线前测试模式：阶段启动、质量门和导出会走后端 Worker 门禁；Worker 未接入时会阻断，不回退本地 Codex CLI。
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-xs leading-5 text-[var(--studio-text-muted)]">
                                        桌面 / 本地调试模式：使用 Codex CLI 和本地 markdown 缓存。
                                    </div>
                                )}
                            </div>
                        </div>

                        <nav className="grid shrink-0 gap-1 border-b border-[var(--studio-border-subtle)] p-3">
                            {tabOptions.map((tab) => {
                                const count = tab.key === "quality" ? (currentReport ? 1 : 0) : tab.key === "script" ? fileCount(filesByKey, ["script"]) : tab.key === "stage1" ? fileCount(filesByKey, ["stage1A", "stage1B", "stage1C", "stage1D"]) : tab.key === "stage2" ? fileCount(filesByKey, ["characters", "scenes"]) : tab.key === "stage3" ? fileCount(filesByKey, ["stage3"]) : fileCount(filesByKey, ["copyOnly"]);
                                const done = tab.key === "quality" ? Boolean(currentReport) : count > 0;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${activeTab === tab.key ? "bg-[var(--studio-accent-soft)] text-[var(--studio-text-primary)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-panel-muted-bg)] hover:text-[var(--studio-text-primary)]"}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            {done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <FileText className="size-4 shrink-0 text-[var(--studio-text-muted)]" />}
                                            <span className="truncate">{tab.label}</span>
                                        </span>
                                        <span className="font-mono text-xs text-[var(--studio-text-muted)]">{count}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                            <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">
                                        <ShieldCheck className="size-4 text-[var(--studio-accent)]" />
                                        链路状态
                                    </div>
                                    <Tag color={blockedHealthCount ? "warning" : isWorkflowReading ? "processing" : "success"}>{isWorkflowReading ? "读取中" : blockedHealthCount ? "未完成" : "可继续"}</Tag>
                                </div>
                                <div className="mt-2 text-xs leading-5 text-[var(--studio-text-muted)]">已就绪 {readyHealthCount}/{chainHealth.length}，阻断 {blockedHealthCount}</div>
                            </div>

                            <div className="mt-3 grid gap-2">
                                {stageStats.map((item) => (
                                    <div key={item.label} className="rounded-md border border-[var(--studio-border-subtle)] px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm text-[var(--studio-text-secondary)]">{item.label}</span>
                                            <span className="font-mono text-sm text-[var(--studio-text-primary)]">{item.value}</span>
                                        </div>
                                        {item.stage ? <div className="mt-1 text-xs text-[var(--studio-text-muted)]">{validationLabel(snapshot?.validations?.[item.stage])}</div> : null}
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

                    <section className="flex min-h-0 flex-col gap-4 overflow-hidden">
                        <section className="studio-panel shrink-0 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-[var(--studio-accent)]">CURRENT STEP</div>
                                    <h2 className="mt-1 text-xl font-semibold text-[var(--studio-text-primary)]">{activeTabLabel}</h2>
                                    <p className="mt-1 text-sm leading-6 text-[var(--studio-text-secondary)]">{visibleNextStep.title}：{visibleNextStep.description}</p>
                                </div>
                                <Button type="primary" icon={<Play className="size-4" />} loading={isWorkflowReading || loading || runningAction !== ""} onClick={isWorkflowReading ? () => void refresh() : runNextStep}>
                                    {visibleNextStep.actionLabel}
                                </Button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                {activeTab === "script" ? (
                                    <>
                                        <Button icon={<Wand2 className="size-4" />} loading={runningAction === "optimize-script"} disabled={isWorkflowReading || Boolean(runningAction && runningAction !== "optimize-script")} onClick={() => void optimizeScriptWithAgent()}>
                                            优化剧本 Agent
                                        </Button>
                                        {scriptOptimizeHref ? (
                                            <Button icon={<ArrowLeft className="size-4" />} onClick={() => router.push(scriptOptimizeHref)}>
                                                本集生产台剧本页
                                            </Button>
                                        ) : null}
                                    </>
                                ) : null}
                                {activeTab === "stage1" ? (
                                    <>
                                        <Button icon={<ShieldCheck className="size-4" />} loading={runningAction === "validate-stage1"} onClick={() => void runAction("validate", { stage: "stage1" })}>校验 Stage 1</Button>
                                    </>
                                ) : null}
                                {activeTab === "stage2" ? (
                                    <>
                                        <Button icon={<ShieldCheck className="size-4" />} loading={runningAction === "validate-stage2"} onClick={() => void runAction("validate", { stage: "stage2" })}>校验 Stage 2</Button>
                                        <Button icon={<PackagePlus className="size-4" />} disabled={snapshot?.validations?.stage2?.state !== "passed"} onClick={importAssetPromptCards}>资产写入素材</Button>
                                    </>
                                ) : null}
                                {activeTab === "stage3" ? (
                                    <>
                                        <Button icon={<ShieldCheck className="size-4" />} loading={runningAction === "validate-stage3"} onClick={() => void runAction("validate", { stage: "stage3" })}>校验 Stage 3</Button>
                                    </>
                                ) : null}
                                {activeTab === "copy" ? (
                                    <>
                                        <Button type="primary" icon={<Download className="size-4" />} disabled={copyOnlySyncState.disabled} loading={runningAction === "export-copy-only-"} onClick={() => void exportCopyOnlyToVideo()}>{copyOnlySyncState.label}</Button>
                                        <Button icon={<Video className="size-4" />} disabled={!canImportCopyOnly} onClick={importCopyOnlyToVideo}>同步到视频生成</Button>
                                        <Button icon={<Video className="size-4" />} onClick={() => router.push(videoHref(episode, { projectSlug, sourceEpisodeId, sourceProjectId }))}>进入视频生成</Button>
                                    </>
                                ) : null}
                                {activeTab === "quality" ? (
                                    <Button danger icon={<Square className="size-4" />} disabled={currentReport?.jobStatus !== "running"} loading={runningAction === "cancel-latest-job-"} onClick={() => void runAction("cancel-latest-job")}>停止 Runner</Button>
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
                                        <div className="thin-scrollbar shrink-0 overflow-x-auto border-b border-[var(--studio-border-subtle)] p-2">
                                            <div className="flex min-w-max gap-2">
                                                {visibleFiles.map((file) => (
                                                    <button
                                                        key={file.key}
                                                        type="button"
                                                        className={`w-[190px] shrink-0 rounded-lg border px-3 py-2 text-left transition ${activeFileKey === file.key ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-panel-muted-bg)]"}`}
                                                        onClick={() => setActiveFileKey(file.key)}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="min-w-0 truncate text-sm font-semibold text-[var(--studio-text-primary)]">{file.label}</span>
                                                            <Tag className="m-0 shrink-0" color={file.exists ? "success" : "default"}>{file.exists ? "有文件" : "空"}</Tag>
                                                        </div>
                                                        <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{file.path}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                                        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]">{currentFile?.label || "未选择文件"}</div>
                                                <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{currentFile?.path || "-"}</div>
                                            </div>
                                            <div className="flex shrink-0 gap-2">
                                                <Button icon={<Clipboard className="size-4" />} disabled={!draft} onClick={() => copyText(draft, "已复制当前内容")}>复制</Button>
                                                <Button type="primary" icon={<Save className="size-4" />} disabled={!editable || !currentFile} loading={runningAction.startsWith("save")} onClick={saveCurrentFile}>保存</Button>
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
    const metadata = { ...(input.metadata || {}) };
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
    const nextEntry: AssetProjectLibraryEntry = current
        ? { ...current, role: "editor", syncStatus: current.syncStatus || "local", updatedAt: now }
        : { addedAt: now, projectId, role: "editor", syncStatus: "local", updatedAt: now, visibility: "project" };
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
                <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm leading-6 text-[var(--studio-text-primary)]">只完成了启动护栏检查，没有启动后台 Runner。通常是内容执行被锁定，或本机 runner 未接入。</div>
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
