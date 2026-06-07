"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Switch, Tag } from "antd";
import { Bot, Copy, RotateCcw, Save, Workflow } from "lucide-react";

import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import {
    canInvokeAgentConfig,
    defaultAgentConfig,
    defaultAgentConfigs,
    formatInputVariablesText,
    mergeAgentConfigs,
    parseInputVariablesText,
    validateAgentConfig,
    type AgentConfig,
    type AgentConfigKind,
    type AgentReasoningLevel,
    type AgentWritePolicy,
} from "./agent-settings";
import { builtInAgentWorkflowPresets, resolveWorkflowPreset, sortedWorkflowStages, workflowStageDetail } from "./agent-workflow-presets";
import {
    agentRunKindLabel,
    agentRunStatusLabel,
    buildWorkflowStageSourceFiles,
    canGenerateWorkflowMappingPreview,
    workflowMappingPreviewItemKey,
    workflowStageStatusLabel,
    type AgentRunInput,
    type AgentWorkflowMappingPreview,
    type AgentWorkflowReviewEvidence,
    type AgentWorkflowRunRecord,
    type AgentWorkflowStageOutput,
    listAgentRunsByProject,
} from "./agent-runner";
import { useAgentSettingsStore } from "./use-agent-settings-store";
import { useAgentRunnerStore } from "./use-agent-runner-store";
import { getSeedanceWorkflowAgentCore } from "./workflow-agents/seedance-workflow-agents";
import {
    buildSeedanceQualityGateManifest,
    evaluateWorkflowQualityGates,
    getWorkflowStageRequiredReadings,
    type WorkflowGateCheckResult,
    type WorkflowQualityGateManifest,
    type WorkflowReadingSourceType,
    type WorkflowReadingStatus,
} from "./workflow-quality-gates";
import type { CanvasNodeData } from "../canvas/types";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    canvasNodes?: CanvasNodeData[];
    onApplyVideoPreviewNodes?: (result: { nodes: CanvasNodeData[]; focusNodeIds: string[] }) => void;
    onClose: () => void;
};

type AgentConfigFormValues = {
    name: string;
    scenario: string;
    enabled: boolean;
    systemPrompt: string;
    userPromptTemplate: string;
    inputVariablesText: string;
    outputJsonExample: string;
    modelPreference: string;
    temperature: number;
    maxOutputTokens: number;
    reasoningLevel: AgentReasoningLevel;
    writePolicy: AgentWritePolicy;
};

const agentKindOptions: Array<{ label: string; value: AgentConfigKind }> = [
    { label: "资产提取 Agent", value: "asset_extractor" },
    { label: "分镜导演 Agent", value: "storyboard_director" },
    { label: "生图 Brief Agent", value: "image_brief_builder" },
    { label: "视频提示词 Agent", value: "video_prompt_builder" },
    { label: "提示词质检 Agent", value: "prompt_reviewer" },
];

export function AgentSettingsDrawer({ open, projectId, projectTitle, canvasId, episodeId, episodeTitle, canvasNodes, onApplyVideoPreviewNodes, onClose }: Props) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<AgentConfigFormValues>();
    const [selectedKind, setSelectedKind] = useState<AgentConfigKind>("asset_extractor");
    const [selectedWorkflowId, setSelectedWorkflowId] = useState(builtInAgentWorkflowPresets()[0].workflowId);
    const [workflowEnabled, setWorkflowEnabled] = useState(false);
    const [workflowSelected, setWorkflowSelected] = useState(false);
    const [runningStageIds, setRunningStageIds] = useState<Record<string, boolean>>({});
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const [expandedStageIds, setExpandedStageIds] = useState<string[]>([]);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const globalConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const projectWorkflowSelections = useAgentSettingsStore((state) => state.projectWorkflowSelections);
    const saveProjectConfig = useAgentSettingsStore((state) => state.saveProjectConfig);
    const copyDefaultToProject = useAgentSettingsStore((state) => state.copyDefaultToProject);
    const resetProjectConfig = useAgentSettingsStore((state) => state.resetProjectConfig);
    const saveProjectWorkflowSelection = useAgentSettingsStore((state) => state.saveProjectWorkflowSelection);
    const resetProjectWorkflowSelection = useAgentSettingsStore((state) => state.resetProjectWorkflowSelection);
    const runs = useAgentRunnerStore((state) => state.runs);
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowEvidences = useAgentRunnerStore((state) => state.workflowEvidences);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const markWorkflowStageReadingsRead = useAgentRunnerStore((state) => state.markWorkflowStageReadingsRead);
    const generateWorkflowMappingPreview = useAgentRunnerStore((state) => state.generateWorkflowMappingPreview);
    const applyProductionBiblePreview = useAgentRunnerStore((state) => state.applyProductionBiblePreview);
    const applyStoryboardPreview = useAgentRunnerStore((state) => state.applyStoryboardPreview);
    const applyVideoNodePreview = useAgentRunnerStore((state) => state.applyVideoNodePreview);
    const createRun = useAgentRunnerStore((state) => state.createRun);
    const approveRun = useAgentRunnerStore((state) => state.approveRun);
    const rejectRun = useAgentRunnerStore((state) => state.rejectRun);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const resolvedConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalConfigs, projectConfigs[projectId] || []), [globalConfigs, projectConfigs, projectId]);
    const workflowPresets = useMemo(() => builtInAgentWorkflowPresets(), []);
    const selectedWorkflowPreset = useMemo(() => resolveWorkflowPreset(selectedWorkflowId, projectWorkflowSelections[projectId] || []) || workflowPresets[0], [projectId, projectWorkflowSelections, selectedWorkflowId, workflowPresets]);
    const selectedWorkflowStages = useMemo(() => sortedWorkflowStages(selectedWorkflowPreset), [selectedWorkflowPreset]);
    const qualityGateManifest = useMemo(() => buildSeedanceQualityGateManifest({ workflowId: selectedWorkflowPreset.workflowId, version: selectedWorkflowPreset.version }), [selectedWorkflowPreset.version, selectedWorkflowPreset.workflowId]);
    const selectedWorkflowRun = useMemo(
        () => workflowRuns.find((run) => run.projectId === projectId && run.canvasId === canvasId && run.episodeId === episodeId && run.workflowId === selectedWorkflowPreset.workflowId),
        [canvasId, episodeId, projectId, selectedWorkflowPreset.workflowId, workflowRuns],
    );
    const selectedStagePreviews = useMemo(() => (selectedWorkflowRun ? workflowMappingPreviews.filter((preview) => preview.workflowRunId === selectedWorkflowRun.id) : []), [selectedWorkflowRun, workflowMappingPreviews]);
    const recentRuns = useMemo(() => listAgentRunsByProject(runs, projectId).slice(0, 8), [projectId, runs]);
    const selectedConfig = resolvedConfigs.find((config) => config.kind === selectedKind) || defaultAgentConfig(selectedKind);
    const projectOverrideKinds = new Set((projectConfigs[projectId] || []).map((config) => config.kind));
    const validation = validateAgentConfig(selectedConfig);
    const callable = canInvokeAgentConfig(selectedConfig);
    const effectiveConfig = useEffectiveConfig();

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue(configToForm(selectedConfig));
    }, [form, open, selectedConfig]);

    useEffect(() => {
        if (!open) return;
        setWorkflowEnabled(selectedWorkflowPreset.enabled);
        setWorkflowSelected(selectedWorkflowPreset.selected);
    }, [open, selectedWorkflowPreset]);

    useEffect(() => {
        if (!open) return;
        ensureWorkflowRun({ projectId, canvasId, episodeId, preset: selectedWorkflowPreset });
    }, [canvasId, ensureWorkflowRun, episodeId, open, projectId, selectedWorkflowPreset]);

    useEffect(() => {
        if (!open) return;
        setExpandedStageIds(
            selectedWorkflowStages
                .filter((stage) => {
                    const stageState = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId);
                    return shouldExpandWorkflowStageByDefault(stage.stageId, stageState?.status, selectedWorkflowRun?.currentStageId);
                })
                .map((stage) => stage.stageId),
        );
    }, [open, selectedWorkflowRun?.currentStageId, selectedWorkflowRun?.id, selectedWorkflowStages]);

    const saveOverride = async () => {
        const values = await form.validateFields();
        const nextConfig = formToConfig(selectedConfig, values, projectId);
        const result = validateAgentConfig(nextConfig);
        if (!result.valid) {
            message.error(result.errors.join("；"));
            return;
        }
        saveProjectConfig(projectId, nextConfig);
        message.success("Agent 项目级配置已保存");
    };

    const restoreDefaultToForm = () => {
        form.setFieldsValue(configToForm(defaultAgentConfig(selectedKind, new Date().toISOString())));
        message.info("已恢复默认模板到表单，保存后才会写入项目配置");
    };

    const copyDefault = () => {
        copyDefaultToProject(projectId, selectedKind);
        message.success("已复制默认模板到项目配置");
    };

    const resetProjectOverride = () => {
        resetProjectConfig(projectId, selectedKind);
        message.success("已移除项目级覆盖，回到默认配置");
    };

    const createPreviewRun = () => {
        try {
            createRun(
                selectedConfig,
                {
                    projectId,
                    sourceType: "agent_settings_preview",
                    sourceId: selectedKind,
                    variables: { agentKind: selectedKind },
                },
                selectedConfig.outputJsonExample || { summary: `${selectedConfig.name} 本地预览运行记录`, items: [], warnings: ["第一版只创建本地草案记录，不调用真实模型。"] },
            );
            message.success("已创建本地 Agent run 预览");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "Agent 配置不可用，无法创建 run");
        }
    };

    const runWorkflowStageText = async (stageId: string) => {
        const workflowRunId = ensureWorkflowRun({ projectId, canvasId, episodeId, preset: selectedWorkflowPreset });
        const workflowRun = workflowRuns.find((run) => run.id === workflowRunId) || selectedWorkflowRun;
        const stageState = workflowRun?.stageStates.find((item) => item.stageId === stageId);
        if (stageState?.status === "blocked") {
            message.warning(stageState.blockedReason || "前置阶段未批准，暂不能执行");
            return;
        }
        const stage = selectedWorkflowStages.find((item) => item.stageId === stageId);
        if (!stage) return;
        const core = getSeedanceWorkflowAgentCore(stage.stageId);
        if (!core) {
            message.error(`阶段 ${stage.name} 缺少 Agent Core，无法执行`);
            return;
        }
        const workflowTextModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const isReady = Boolean(workflowTextModel) && checkAiConfigReady(effectiveConfig, workflowTextModel);
        const requestConfig = { ...effectiveConfig, model: workflowTextModel || effectiveConfig.model };
        const coreInput = core.buildInput({
            preset: selectedWorkflowPreset,
            inputSnapshot: {
                projectId,
                projectTitle,
                canvasId,
                episodeId,
                episodeTitle: episodeTitle || "未选择本集（设置中心）",
                scriptSnapshot: "未提供本集剧本快照（设置中心）",
                stageSummary: `${stage.inputSummary}；输出目标：${stage.outputSummary}`,
                directorOutputSummary: "",
                artDesignOutputSummary: "",
                storyboardRequirement: stage.qualityGateIds.length
                    ? stage.qualityGateIds
                          .map((gateId) => selectedWorkflowPreset.qualityGates.find((gate) => gate.gateId === gateId)?.purpose)
                          .filter(Boolean)
                          .join("；")
                    : stage.outputSummary,
                assetNeedSummary: "",
            },
        });
        const sourceFiles = buildWorkflowStageSourceFiles(coreInput.skills, coreInput.qualityGates);
        const promptMessages = core.buildPromptMessages(coreInput, selectedWorkflowPreset);
        const runInput: AgentRunInput = {
            projectId,
            canvasId,
            episodeId,
            episodeTitle,
            sourceType: "workflow_text_stage",
            sourceId: stage.stageId,
            variables: { stageId },
            workflowRunId,
            workflowId: selectedWorkflowPreset.workflowId,
            workflowVersion: selectedWorkflowPreset.version,
            stageId: core.stageId,
            agentId: core.agentId,
            agentName: coreInput.agent.name,
            sourcePresetId: selectedWorkflowPreset.workflowId,
            presetId: selectedWorkflowPreset.workflowId,
            inputSnapshot: {
                stageName: stage.name,
                stageSummary: stage.inputSummary,
            },
            promptMessages,
            model: workflowTextModel,
            provider: `openai-${effectiveConfig.channelMode}`,
            configSummary: JSON.stringify(
                {
                    model: workflowTextModel,
                    baseUrl: effectiveConfig.baseUrl,
                    channelMode: effectiveConfig.channelMode,
                    textModelList: effectiveConfig.textModels,
                    provider: effectiveConfig.channelMode === "remote" ? "openai-remote" : "openai-local",
                },
                null,
                2,
            ),
            sourceFiles,
            qualityGateIds: coreInput.qualityGates.map((gate) => gate.gateId),
        };
        const runId = startWorkflowTextRun(runInput);
        setRunningStageIds((current) => ({ ...current, [stage.stageId]: true }));
        if (!isReady) {
            const reason = workflowTextModel ? "当前 API 配置或文本模型不可用" : "未配置文本模型（textModel），请先在 AI 配置中填写。";
            failWorkflowTextRun(runId, reason);
            message.warning(`文本执行未完成：${reason}`);
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
            return;
        }
        if (requestConfig.channelMode === "local" && !requestConfig.apiKey.trim()) {
            failWorkflowTextRun(runId, "本地模式缺少 API Key，无法发起文本调用。请先检查 AI 配置。");
            message.warning("文本执行未完成：本地模式缺少 API Key。");
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
            return;
        }
        if (requestConfig.channelMode === "local" && !requestConfig.baseUrl.trim()) {
            failWorkflowTextRun(runId, "本地模式缺少 API Base URL，无法发起文本调用。请先检查 AI 配置。");
            message.warning("文本执行未完成：本地模式缺少 API Base URL。");
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
            return;
        }
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`阶段 ${stage.name} 文本草案已生成，状态为“待审核”。`);
        } catch (error) {
            failWorkflowTextRun(runId, error instanceof Error ? error.message : "文本执行失败");
            message.warning(error instanceof Error ? error.message : "文本执行失败");
        } finally {
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
        }
    };

    const saveWorkflowSelection = () => {
        saveProjectWorkflowSelection(projectId, { workflowId: selectedWorkflowPreset.workflowId, enabled: workflowEnabled, selected: workflowSelected, updatedAt: new Date().toISOString() });
        message.success("多 Agent workflow 项目级选择已保存");
    };

    const resetWorkflowSelection = () => {
        resetProjectWorkflowSelection(projectId, selectedWorkflowPreset.workflowId);
        message.success("已移除 workflow 项目级选择");
    };

    return (
        <Drawer title="Agent 设置中心" open={open} onClose={onClose} size={1080} destroyOnHidden>
            <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-sm text-stone-500">当前项目：{projectTitle}</div>
                        <div className="mt-1 text-xl font-semibold">Agent 工作台</div>
                    </div>
                    <Tag className="m-0">本地设置</Tag>
                </div>

                <Card
                    size="small"
                    title={
                        <span className="inline-flex items-center gap-2">
                            <Workflow className="size-4" />多 Agent 工作流预设
                        </span>
                    }
                    extra={
                        <Space wrap>
                            <Select className="min-w-72" value={selectedWorkflowId} options={workflowPresets.map((preset) => ({ label: `${preset.name} v${preset.version}`, value: preset.workflowId }))} onChange={setSelectedWorkflowId} />
                            <Switch checked={workflowEnabled} checkedChildren="启用" unCheckedChildren="停用" onChange={setWorkflowEnabled} />
                            <Switch checked={workflowSelected} checkedChildren="已选择" unCheckedChildren="未选择" onChange={setWorkflowSelected} />
                            <Button size="small" type="primary" icon={<Save className="size-3.5" />} onClick={saveWorkflowSelection}>
                                保存 workflow 选择
                            </Button>
                            <Button size="small" danger onClick={resetWorkflowSelection}>
                                清除项目选择
                            </Button>
                        </Space>
                    }
                >
                    <Alert className="mb-4" type="info" showIcon message="仅运行文本草案；图片、视频生成与业务写入仍需人工确认。" />
                    <div className="grid gap-4">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold">{selectedWorkflowPreset.name}</span>
                                <Tag className="m-0">v{selectedWorkflowPreset.version}</Tag>
                                <Tag className="m-0">{selectedWorkflowPreset.enabled ? "项目已启用" : "项目未启用"}</Tag>
                                <Tag className="m-0">{selectedWorkflowPreset.selected ? "项目已选择" : "项目未选择"}</Tag>
                                <Tag className="m-0">阶段 {selectedWorkflowStages.length}</Tag>
                                <Tag className="m-0">Agent {selectedWorkflowPreset.agents.length}</Tag>
                                <Tag className="m-0">质量门 {selectedWorkflowPreset.qualityGates.length}</Tag>
                                {selectedWorkflowRun ? <Tag className="m-0">当前阶段：{workflowStageName(selectedWorkflowStages, selectedWorkflowRun.currentStageId)}</Tag> : null}
                            </div>
                            <div className="mt-2 text-sm text-stone-500">主视图只保留状态、数量、warning 和动作，详细追溯信息按需展开。</div>
                        </div>

                        <div className="grid gap-3">
                            {selectedWorkflowStages.map((stage) => {
                                const detail = workflowStageDetail(selectedWorkflowPreset, stage);
                                const stageState = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId);
                                const mappingPreviewStatus = selectedWorkflowRun ? canGenerateWorkflowMappingPreview(selectedWorkflowRun, stage.stageId) : { allowed: false, reason: "尚未初始化 workflow run" };
                                const stagePreviews = selectedStagePreviews.filter((preview) => preview.sourceStageId === stage.stageId);
                                const qualityGateResults = selectedWorkflowRun
                                    ? evaluateWorkflowQualityGates({ manifest: qualityGateManifest, workflowRun: selectedWorkflowRun, stageId: stage.stageId, outputs: workflowOutputs, evidences: workflowEvidences })
                                    : [];
                                const errorCount = qualityGateResults.filter((result) => result.status === "error").length;
                                const warningCount = qualityGateResults.filter((result) => result.status === "warning").length;
                                const dependencySummary = summarizeWorkflowDependencies(selectedWorkflowStages, selectedWorkflowRun, stage.stageId);
                                const isExpanded = expandedStageIds.includes(stage.stageId);
                                return (
                                    <details
                                        key={stage.stageId}
                                        open={isExpanded}
                                        className="rounded-lg border border-stone-200 p-3 dark:border-stone-800"
                                        onToggle={(event) => {
                                            const nextOpen = event.currentTarget.open;
                                            setExpandedStageIds((current) => (nextOpen ? (current.includes(stage.stageId) ? current : [...current, stage.stageId]) : current.filter((item) => item !== stage.stageId)));
                                        }}
                                    >
                                        <summary className="cursor-pointer list-none">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">阶段 {stage.order}</Tag>
                                                <span className="font-medium">{stage.name}</span>
                                                <Tag className="m-0">{workflowStageStatusLabel(stageState?.status || "idle")}</Tag>
                                                {selectedWorkflowRun?.currentStageId === stage.stageId && stageState?.status !== "approved" ? (
                                                    <Tag className="m-0" color="blue">
                                                        当前阶段
                                                    </Tag>
                                                ) : null}
                                                {detail.agent ? <Tag className="m-0">{detail.agent.name}</Tag> : null}
                                                <Tag className="m-0">预览 {stagePreviews.length}</Tag>
                                                <Tag className="m-0" color={errorCount ? "red" : "green"}>
                                                    error {errorCount}
                                                </Tag>
                                                <Tag className="m-0" color={warningCount ? "orange" : "default"}>
                                                    warning {warningCount}
                                                </Tag>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
                                                <span>输入：{stage.inputSummary}</span>
                                                <span>输出：{stage.outputSummary}</span>
                                            </div>
                                            {stageState?.blockedReason ? <div className="mt-2 text-xs text-amber-600">阻塞原因：{stageState.blockedReason}</div> : null}
                                            {dependencySummary ? <div className="mt-1 text-xs text-stone-500">前置依赖：{dependencySummary}</div> : null}
                                            {stageState?.errorMessage ? <div className="mt-1 text-xs text-rose-500">错误：{stageState.errorMessage}</div> : null}
                                        </summary>

                                        <div className="mt-3 grid gap-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">{stage.purpose}</Tag>
                                                {detail.skills.length ? <Tag className="m-0">技能 {detail.skills.length}</Tag> : null}
                                                {detail.qualityGates.length ? <Tag className="m-0">质量门 {detail.qualityGates.length}</Tag> : null}
                                            </div>
                                            {detail.agent ? (
                                                <details className="rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                                                    <summary className="cursor-pointer font-medium text-stone-600 dark:text-stone-300">查看阶段说明与 Agent</summary>
                                                    <div className="mt-2 grid gap-1.5">
                                                        <div>{detail.agent.role}</div>
                                                        <div>{detail.agent.responsibility}</div>
                                                        <div className="text-stone-500">系统提示摘要：{detail.agent.systemPromptSummary}</div>
                                                        <div className="text-stone-500">来源：{detail.agent.sourceFile}</div>
                                                    </div>
                                                </details>
                                            ) : null}
                                            <WorkflowStageStatePanel stageId={stage.stageId} workflowRun={selectedWorkflowRun} workflowOutputs={workflowOutputs} workflowEvidences={workflowEvidences} />
                                            <WorkflowQualityGatePanel
                                                stageId={stage.stageId}
                                                workflowRun={selectedWorkflowRun}
                                                manifest={qualityGateManifest}
                                                gateResults={qualityGateResults}
                                                onMarkReadingsRead={() => {
                                                    if (!selectedWorkflowRun) {
                                                        message.warning("尚未初始化 workflow run");
                                                        return;
                                                    }
                                                    const result = markWorkflowStageReadingsRead(selectedWorkflowRun.id, stage.stageId);
                                                    if (!result.ok) message.warning(result.reason || "无法生成规范读取记录");
                                                    else message.success(`已按 manifest 标记 ${result.count || 0} 条规范读取记录`);
                                                }}
                                            />
                                            {stagePreviews.length ? (
                                                <WorkflowMappingPreviewPanel
                                                    previews={stagePreviews}
                                                    appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                                                    applyingPreviewIds={applyingPreviewIds}
                                                    hasCanvasContext={Boolean(canvasId)}
                                                    hasStoryboardContext={Boolean(canvasId && episodeId)}
                                                    onApplyProductionBiblePreview={(preview) => {
                                                        const creatableCount = preview.items.filter((item) => item.targetType === "production_bible" && item.action === "create").length;
                                                        modal.confirm({
                                                            title: "确认写入设定库",
                                                            content: `将把 ${creatableCount} 条设定草案写入设定库。不会写入分镜头表，不会创建或修改画布节点。`,
                                                            okText: "确认写入",
                                                            cancelText: "取消",
                                                            onOk: () => {
                                                                setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: true }));
                                                                try {
                                                                    const result = applyProductionBiblePreview(preview.previewId);
                                                                    if (!result.ok) {
                                                                        message.warning(result.reason || "当前预览不能写入设定库");
                                                                        return;
                                                                    }
                                                                    message.success(`已写入 ${result.appliedCount || 0} 条设定库条目`);
                                                                    if (result.warnings.length) message.info(result.warnings.join("；"));
                                                                } finally {
                                                                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                                                                }
                                                            },
                                                        });
                                                    }}
                                                    onApplyStoryboardPreview={(preview) => {
                                                        const creatableCount = preview.items.filter((item) => item.targetType === "storyboard_table" && item.action === "create").length;
                                                        modal.confirm({
                                                            title: "确认写入分镜头表",
                                                            content: `将追加 ${creatableCount} 条分镜草案到当前本集分镜头表。不会写入设定库，不会创建或修改画布节点。`,
                                                            okText: "确认写入",
                                                            cancelText: "取消",
                                                            onOk: () => {
                                                                setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: true }));
                                                                try {
                                                                    const result = applyStoryboardPreview(preview.previewId);
                                                                    if (!result.ok) {
                                                                        message.warning(result.reason || "当前预览不能写入分镜头表");
                                                                        return;
                                                                    }
                                                                    message.success(`已追加 ${result.appliedCount || 0} 条分镜头表条目`);
                                                                    if (result.warnings.length) message.info(result.warnings.join("；"));
                                                                } finally {
                                                                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                                                                }
                                                            },
                                                        });
                                                    }}
                                                    onApplyVideoNodePreview={(preview) => {
                                                        const creatableCount = preview.items.filter((item) => item.targetType === "video_node" && item.action !== "skip").length;
                                                        modal.confirm({
                                                            title: "确认创建视频配置节点",
                                                            content: `将根据当前预览在当前画布创建或更新 ${creatableCount} 个视频配置节点，不会开始视频生成，不会扣费，也不会写入设定库或分镜头表。`,
                                                            okText: "确认创建",
                                                            cancelText: "取消",
                                                            onOk: () => {
                                                                setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: true }));
                                                                try {
                                                                    const result = applyVideoNodePreview(preview.previewId, { existingNodes: canvasNodes });
                                                                    if (!result.ok) {
                                                                        message.warning(result.reason || "当前预览不能创建视频配置节点");
                                                                        return;
                                                                    }
                                                                    if (result.nextNodes && result.focusNodeIds?.length) {
                                                                        onApplyVideoPreviewNodes?.({ nodes: result.nextNodes, focusNodeIds: result.focusNodeIds });
                                                                    }
                                                                    message.success(`已创建或更新 ${result.appliedCount || 0} 个视频配置节点`);
                                                                    if (result.warnings.length) message.info(result.warnings.join("；"));
                                                                } finally {
                                                                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                                                                }
                                                            },
                                                        });
                                                    }}
                                                />
                                            ) : null}
                                            {stageState?.status === "review" ? (
                                                <div className="grid gap-2 rounded-md bg-stone-50 p-2 dark:bg-white/5">
                                                    <Input.TextArea
                                                        rows={2}
                                                        value={reviewNotes[stage.stageId] || ""}
                                                        placeholder="可选：填写本阶段审核备注"
                                                        onChange={(event) => setReviewNotes((current) => ({ ...current, [stage.stageId]: event.target.value }))}
                                                    />
                                                    <Space size={6} wrap>
                                                        <Button
                                                            size="small"
                                                            type="primary"
                                                            onClick={() => {
                                                                const runnerRunId = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.runnerRunId;
                                                                if (runnerRunId) approveRun(runnerRunId, reviewNotes[stage.stageId]);
                                                            }}
                                                        >
                                                            批准阶段
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            danger
                                                            onClick={() => {
                                                                const runnerRunId = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.runnerRunId;
                                                                if (runnerRunId) rejectRun(runnerRunId, reviewNotes[stage.stageId]);
                                                            }}
                                                        >
                                                            驳回阶段
                                                        </Button>
                                                    </Space>
                                                </div>
                                            ) : null}
                                            <Space size={[6, 6]} wrap>
                                                <Button
                                                    size="small"
                                                    disabled={!mappingPreviewStatus.allowed}
                                                    onClick={() => {
                                                        if (!selectedWorkflowRun) return;
                                                        const result = generateWorkflowMappingPreview(selectedWorkflowRun.id, stage.stageId);
                                                        if (!result.ok) message.warning(result.reason || "当前阶段不能生成映射预览");
                                                        else message.success(`已生成 ${stage.name} 的映射预览`);
                                                    }}
                                                >
                                                    生成预览
                                                </Button>
                                                <Button size="small" type="primary" disabled={stageState?.status === "blocked"} loading={Boolean(runningStageIds[stage.stageId])} onClick={() => void runWorkflowStageText(stage.stageId)}>
                                                    运行草案
                                                </Button>
                                                {!mappingPreviewStatus.allowed ? <span className="text-xs text-stone-500">{mappingPreviewStatus.reason}</span> : null}
                                            </Space>
                                        </div>
                                    </details>
                                );
                            })}
                        </div>

                        <details>
                            <summary className="cursor-pointer text-sm text-stone-500">查看 preset 来源与文件清单</summary>
                            <div className="mt-2 grid gap-2 text-xs text-stone-500">
                                <div>说明：{selectedWorkflowPreset.description}</div>
                                <div>来源目录：{selectedWorkflowPreset.sourceRoot}</div>
                                {selectedWorkflowPreset.sourceFiles.map((file) => (
                                    <div key={file.path} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                                        [{sourceCategoryLabel(file.category)}] {file.path}：{file.summary}
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <Card size="small" title="Agent 类型">
                        <div className="grid gap-2">
                            {agentKindOptions.map((option) => {
                                const config = resolvedConfigs.find((item) => item.kind === option.value) || defaultAgentConfig(option.value);
                                const status = canInvokeAgentConfig(config);
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`rounded-lg border p-3 text-left transition hover:bg-stone-50 dark:hover:bg-white/5 ${selectedKind === option.value ? "border-stone-900 dark:border-stone-100" : "border-stone-200 dark:border-stone-800"}`}
                                        onClick={() => setSelectedKind(option.value)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{option.label}</span>
                                            <Tag className="m-0" color={status.callable ? "green" : "default"}>
                                                {status.callable ? "可用" : "不可用"}
                                            </Tag>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <Tag className="m-0">{config.reasoningLevel}</Tag>
                                            <Tag className="m-0">{config.writePolicy === "confirm_before_write" ? "确认后写入" : "仅预览"}</Tag>
                                            {projectOverrideKinds.has(option.value) ? <Tag className="m-0">项目覆盖</Tag> : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    <Card
                        size="small"
                        title={
                            <span className="inline-flex items-center gap-2">
                                <Bot className="size-4" />
                                {selectedConfig.name}
                            </span>
                        }
                        extra={
                            <Space wrap>
                                <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={restoreDefaultToForm}>
                                    恢复默认模板
                                </Button>
                                <Button size="small" icon={<Copy className="size-3.5" />} onClick={copyDefault}>
                                    复制默认到项目
                                </Button>
                                <Button size="small" danger disabled={!projectOverrideKinds.has(selectedKind)} onClick={resetProjectOverride}>
                                    移除项目覆盖
                                </Button>
                                <Button size="small" type="primary" icon={<Save className="size-3.5" />} onClick={() => void saveOverride()}>
                                    保存项目配置
                                </Button>
                                <Button size="small" onClick={createPreviewRun}>
                                    创建预览 Run
                                </Button>
                            </Space>
                        }
                    >
                        {!validation.valid ? <Alert className="mb-4" type="warning" showIcon message="当前配置需要修正" description={validation.errors.join("；")} /> : null}
                        {!callable.callable ? <Alert className="mb-4" type="info" showIcon message="后续调用入口会显示不可用" description={callable.reason} /> : null}
                        <Form form={form} layout="vertical">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Form.Item name="name" label="Agent 名称" rules={[{ required: true, message: "请填写 Agent 名称" }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="enabled" label="是否启用" valuePropName="checked">
                                    <Switch checkedChildren="启用" unCheckedChildren="停用" />
                                </Form.Item>
                            </div>
                            <Form.Item name="scenario" label="使用场景">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: "请填写系统提示词" }]}>
                                <Input.TextArea rows={5} />
                            </Form.Item>
                            <Form.Item name="userPromptTemplate" label="用户提示词模板" rules={[{ required: true, message: "请填写用户提示词模板" }]}>
                                <Input.TextArea rows={6} />
                            </Form.Item>
                            <Form.Item name="inputVariablesText" label="输入变量说明">
                                <Input.TextArea rows={4} placeholder="每行一个变量，例如：scriptSnapshot：本集剧本文本快照" />
                            </Form.Item>
                            <Form.Item name="outputJsonExample" label="输出 JSON 示例 / Schema">
                                <Input.TextArea rows={8} />
                            </Form.Item>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <Form.Item name="modelPreference" label="模型偏好">
                                    <Input placeholder="default / gpt-... / doubao-..." />
                                </Form.Item>
                                <Form.Item name="temperature" label="Temperature">
                                    <InputNumber className="w-full" min={0} max={2} step={0.1} />
                                </Form.Item>
                                <Form.Item name="maxOutputTokens" label="最大输出">
                                    <InputNumber className="w-full" min={1} step={100} />
                                </Form.Item>
                                <Form.Item name="reasoningLevel" label="推理程度">
                                    <Select
                                        options={[
                                            { label: "中", value: "中" },
                                            { label: "高", value: "高" },
                                            { label: "超高", value: "超高" },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item name="writePolicy" label="写入策略">
                                    <Select
                                        options={[
                                            { label: "仅预览", value: "preview_only" },
                                            { label: "确认后写入", value: "confirm_before_write" },
                                        ]}
                                    />
                                </Form.Item>
                            </div>
                        </Form>
                    </Card>
                </div>

                <Card size="small" title="运行记录">
                    {recentRuns.length ? (
                        <div className="grid gap-3">
                            {recentRuns.map((run) => (
                                <Card key={run.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">{agentRunKindLabel(run.agentKind)}</Tag>
                                                <Tag className="m-0">{agentRunStatusLabel(run.status)}</Tag>
                                                <Tag className="m-0">配置 v{run.agentConfigVersion}</Tag>
                                                {run.input.workflowId ? <Tag className="m-0">workflow {run.input.workflowId}</Tag> : null}
                                                {run.input.stageId ? <Tag className="m-0">stage {run.input.stageId}</Tag> : null}
                                                {run.input.episodeTitle ? <Tag className="m-0">{run.input.episodeTitle}</Tag> : null}
                                            </div>
                                            <div className="mt-2 text-sm font-medium">{run.workflowTextOutput?.summary || run.draftOutput.summary}</div>
                                            {run.status === "error" || run.status === "failed" ? <div className="mt-1 text-xs text-rose-500">{run.errorMessage || "执行失败"}</div> : null}
                                            <div className="mt-1 text-xs text-stone-500">
                                                来源：{run.input.sourceType}
                                                {run.input.sourceId ? ` / ${run.input.sourceId}` : ""} · {run.createdAt}
                                                {run.input.agentId ? ` · agent ${run.input.agentId}` : ""}
                                                {run.input.model ? ` · model ${run.input.model}` : ""}
                                            </div>
                                        </div>
                                        <Space size={6} wrap>
                                            <Button size="small" disabled={run.status !== "ready_for_review" && run.status !== "review"} onClick={() => approveRun(run.id)}>
                                                批准
                                            </Button>
                                            <Button size="small" disabled={run.status !== "ready_for_review" && run.status !== "review"} onClick={() => rejectRun(run.id)}>
                                                驳回
                                            </Button>
                                        </Space>
                                    </div>
                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs text-stone-500">查看草案 / workflow 文本产物</summary>
                                        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">
                                            {JSON.stringify({ draftOutput: run.draftOutput, workflowTextOutput: run.workflowTextOutput, proposedActions: run.proposedActions }, null, 2)}
                                        </pre>
                                    </details>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500 dark:bg-white/5">暂无 Agent run。可以先选择一个 Agent，点击“创建预览 Run”生成本地草案记录。</div>
                    )}
                </Card>
            </div>
        </Drawer>
    );
}

function WorkflowStageStatePanel({ stageId, workflowRun, workflowOutputs, workflowEvidences }: { stageId: string; workflowRun?: AgentWorkflowRunRecord; workflowOutputs: AgentWorkflowStageOutput[]; workflowEvidences: AgentWorkflowReviewEvidence[] }) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    const output = stageState?.outputId ? workflowOutputs.find((item) => item.outputId === stageState.outputId) : workflowOutputs.find((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const evidences = workflowEvidences.filter((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const latestEvidence = evidences[0];
    return (
        <div className="grid gap-2 rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-white/5">
            <div className="flex flex-wrap items-center gap-2">
                <Tag className="m-0">{workflowStageStatusLabel(stageState?.status || "idle")}</Tag>
                <span>阶段产物：{output ? "1 条" : "0 条"}</span>
                <span>审核证据：{evidences.length} 条</span>
                {latestEvidence ? <span>最近审核：{latestEvidence.createdAt}</span> : null}
            </div>
            <div>最近产物：{output?.summary || "暂无阶段产物"}</div>
            {stageState?.blockedReason ? <div className="text-amber-600">阻塞原因：{stageState.blockedReason}</div> : null}
            {stageState?.errorMessage ? <div className="text-rose-500">错误：{stageState.errorMessage}</div> : null}
            {output ? (
                <details>
                    <summary className="cursor-pointer text-stone-500">查看产物详情</summary>
                    <div className="mt-2 grid gap-2">
                        <div className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                            <div>输出格式：{output.outputFormat}</div>
                            <div>生成时间：{output.createdAt}</div>
                            <div className="mt-1">摘要：{output.summary}</div>
                        </div>
                        {output.structuredOutput !== undefined ? (
                            <details className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                                <summary className="cursor-pointer text-stone-500">查看 rawJson</summary>
                                <pre className="mt-2 overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50">{JSON.stringify(output.structuredOutput, null, 2)}</pre>
                            </details>
                        ) : null}
                        <details className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                            <summary className="cursor-pointer text-stone-500">查看 rawText / sourceFiles / qualityGateIds</summary>
                            <div className="mt-2 grid gap-2">
                                <pre className="overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50 whitespace-pre-wrap">{output.rawText}</pre>
                                <div>sourceFiles：{output.sourceFiles.join("；") || "（无）"}</div>
                                <div>qualityGateIds：{output.qualityGateIds.join("；") || "（无）"}</div>
                            </div>
                        </details>
                    </div>
                </details>
            ) : null}
            {evidences.length ? (
                <details>
                    <summary className="cursor-pointer text-stone-500">查看审核证据</summary>
                    <div className="mt-2 grid gap-2">
                        {evidences.map((evidence) => (
                            <div key={evidence.evidenceId} className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className="m-0" color={evidence.decision === "approved" ? "green" : "red"}>
                                        {evidence.decision === "approved" ? "已批准" : "已驳回"}
                                    </Tag>
                                    <span>{evidence.createdAt}</span>
                                    <span>{evidence.reviewer}</span>
                                </div>
                                <div className="mt-1">摘要：{evidence.outputSummary}</div>
                                {evidence.reviewerNote ? <div className="mt-1 text-stone-500">备注：{evidence.reviewerNote}</div> : null}
                                <details className="mt-1">
                                    <summary className="cursor-pointer text-stone-500">查看追溯信息</summary>
                                    <div className="mt-1 grid gap-1 text-stone-500">
                                        <div>outputHash：{evidence.outputHash}</div>
                                        <div>sourceFiles：{evidence.sourceFiles.join("；") || "（无）"}</div>
                                        <div>qualityGateIds：{evidence.qualityGateIds.join("；") || "（无）"}</div>
                                    </div>
                                </details>
                            </div>
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}

function WorkflowQualityGatePanel({
    stageId,
    workflowRun,
    manifest,
    gateResults,
    onMarkReadingsRead,
}: {
    stageId: string;
    workflowRun?: AgentWorkflowRunRecord;
    manifest: WorkflowQualityGateManifest;
    gateResults: WorkflowGateCheckResult[];
    onMarkReadingsRead: () => void;
}) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    const requiredReadings = getWorkflowStageRequiredReadings(manifest, stageId);
    const readingRows = requiredReadings.map((reading) => {
        const record = stageState?.readingRecords.find((item) => item.readingId === reading.readingId || item.sourceFile === reading.sourceFile);
        return { reading, status: record?.status || ("missing" as WorkflowReadingStatus), readAt: record?.readAt };
    });
    const readCount = readingRows.filter((row) => row.status === "read").length;
    const missingCount = readingRows.length - readCount;
    const errorCount = gateResults.filter((result) => result.status === "error").length;
    const warningCount = gateResults.filter((result) => result.status === "warning").length;
    return (
        <div className="grid gap-2 rounded-md border border-stone-200 p-2 text-xs leading-5 dark:border-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Tag className="m-0">
                        已读 {readCount}/{requiredReadings.length}
                    </Tag>
                    <Tag className="m-0" color={missingCount ? "orange" : "green"}>
                        缺失 {missingCount}
                    </Tag>
                    <Tag className="m-0" color={errorCount ? "red" : "green"}>
                        error {errorCount}
                    </Tag>
                    <Tag className="m-0" color={warningCount ? "orange" : "default"}>
                        warning {warningCount}
                    </Tag>
                </div>
                <Button size="small" disabled={!workflowRun} onClick={onMarkReadingsRead}>
                    按 manifest 标记已读
                </Button>
            </div>
            <details>
                <summary className="cursor-pointer text-stone-500">查看 required readings 与缺失原因</summary>
                <div className="mt-2 grid gap-1">
                    {readingRows.map(({ reading, status, readAt }) => (
                        <div key={reading.readingId} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag className="m-0" color={status === "read" ? "green" : status === "missing" ? "red" : "default"}>
                                    {readingStatusLabel(status)}
                                </Tag>
                                <span>
                                    [{readingSourceTypeLabel(reading.sourceType)}] {reading.sourceFile}
                                </span>
                            </div>
                            <div className="mt-1 text-stone-500">
                                {reading.label}
                                {readAt ? ` · ${readAt}` : ""}
                            </div>
                        </div>
                    ))}
                </div>
            </details>
            <details>
                <summary className="cursor-pointer text-stone-500">查看 gate result 详情</summary>
                <div className="mt-2 grid gap-1">
                    {gateResults.map((result) => (
                        <div key={result.resultId} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag className="m-0" color={result.status === "error" ? "red" : result.status === "warning" ? "orange" : "green"}>
                                    {result.status.toUpperCase()}
                                </Tag>
                                <span>{result.name}</span>
                                <Tag className="m-0">{qualityGateCheckKindLabel(result.checkKind)}</Tag>
                            </div>
                            <div className="mt-1 text-stone-500">{result.message}</div>
                        </div>
                    ))}
                </div>
            </details>
        </div>
    );
}

function readingSourceTypeLabel(sourceType: WorkflowReadingSourceType) {
    if (sourceType === "agent") return "agent";
    if (sourceType === "skill") return "skill";
    if (sourceType === "template") return "template";
    if (sourceType === "example") return "example";
    if (sourceType === "tool") return "tool";
    return "rule";
}

function readingStatusLabel(status: WorkflowReadingStatus) {
    if (status === "read") return "已读";
    if (status === "skipped") return "跳过";
    return "缺失";
}

function qualityGateCheckKindLabel(checkKind: WorkflowGateCheckResult["checkKind"]) {
    if (checkKind === "required_reading") return "规范读取";
    if (checkKind === "artifact_field") return "阶段产物";
    if (checkKind === "manual_review") return "审核证据";
    return "manifest";
}

function WorkflowMappingPreviewPanel({
    previews,
    appliedPreviewItemIds,
    applyingPreviewIds,
    hasCanvasContext,
    hasStoryboardContext,
    onApplyProductionBiblePreview,
    onApplyStoryboardPreview,
    onApplyVideoNodePreview,
}: {
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    hasCanvasContext: boolean;
    hasStoryboardContext: boolean;
    onApplyProductionBiblePreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyStoryboardPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyVideoNodePreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    return (
        <div className="mt-3 grid gap-2 rounded-md border border-dashed border-stone-200 p-3 dark:border-stone-700">
            <div className="text-xs font-medium text-stone-500">映射预览</div>
            {previews.map((preview) => {
                const creatableItems = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
                const pendingCreatableItems = creatableItems.filter((item) => !appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId)));
                const appliedCount = creatableItems.length - pendingCreatableItems.length;
                const applyDisabledReason =
                    preview.targetType === "video_node"
                        ? !hasCanvasContext
                            ? "当前缺少画布上下文，不能创建视频配置节点"
                            : !creatableItems.length
                              ? "当前预览没有可创建的视频配置节点"
                              : !pendingCreatableItems.length
                                ? "已创建视频配置节点"
                                : ""
                        : !creatableItems.length
                          ? preview.targetType === "production_bible"
                              ? "当前预览没有可新增的设定库条目"
                              : "当前预览没有可新增的分镜头表条目"
                          : preview.targetType === "storyboard_table" && !hasStoryboardContext
                            ? "当前缺少画布或本集上下文，不能写入分镜头表"
                            : !pendingCreatableItems.length
                              ? preview.targetType === "production_bible"
                                  ? "已写入设定库"
                                  : "已写入分镜头表"
                              : "";
                return (
                    <div key={preview.previewId} className="rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">{preview.targetType}</Tag>
                            <span className="font-medium">{preview.title}</span>
                            <Tag className="m-0">条目 {preview.items.length}</Tag>
                            <Tag className="m-0" color={preview.warnings.length ? "orange" : "default"}>
                                warning {preview.warnings.length}
                            </Tag>
                            <Tag className="m-0" color={appliedCount ? "green" : "default"}>
                                {preview.targetType === "video_node" ? `已创建 ${appliedCount}` : `已应用 ${appliedCount}`}
                            </Tag>
                            {preview.targetType === "production_bible" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyProductionBiblePreview(preview)}>
                                    写入设定库
                                </Button>
                            ) : preview.targetType === "storyboard_table" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyStoryboardPreview(preview)}>
                                    写入分镜
                                </Button>
                            ) : preview.targetType === "video_node" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyVideoNodePreview(preview)}>
                                    创建节点
                                </Button>
                            ) : (
                                <Tag className="m-0">后续步骤处理</Tag>
                            )}
                        </div>
                        <div className="mt-1">{preview.summary}</div>
                        {preview.warnings.length ? <div className="mt-1 text-amber-600">提示：{preview.warnings.join("；")}</div> : null}
                        {applyDisabledReason ? <div className="mt-1 text-stone-500">{applyDisabledReason}</div> : null}
                        <details className="mt-2">
                            <summary className="cursor-pointer text-stone-500">查看条目与追溯</summary>
                            <div className="mt-2 grid gap-2">
                                {preview.items.map((item) => (
                                    <details key={item.itemId} className="rounded bg-white px-2 py-1.5 dark:bg-black/20">
                                        <summary className="cursor-pointer list-none">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">{item.action}</Tag>
                                                <span className="font-medium">{item.title}</span>
                                                {appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId)) ? (
                                                    <Tag className="m-0" color="green">
                                                        {preview.targetType === "production_bible" ? "已写入设定库" : preview.targetType === "storyboard_table" ? "已写入分镜头表" : "已创建视频配置节点"}
                                                    </Tag>
                                                ) : null}
                                                {typeof item.confidence === "number" ? <span className="text-stone-400">置信度 {item.confidence}</span> : null}
                                                {item.warnings.length ? (
                                                    <Tag className="m-0" color="orange">
                                                        warning {item.warnings.length}
                                                    </Tag>
                                                ) : null}
                                            </div>
                                            <div className="mt-1">{item.reason}</div>
                                        </summary>
                                        <div className="mt-2 grid gap-2">
                                            <div className="text-stone-500">来源：{item.sourceText}</div>
                                            {item.warnings.length ? <div className="text-amber-600">{item.warnings.join("；")}</div> : null}
                                            <details>
                                                <summary className="cursor-pointer text-stone-500">查看 mappedFields</summary>
                                                <pre className="mt-2 overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50">{JSON.stringify(item.mappedFields, null, 2)}</pre>
                                            </details>
                                        </div>
                                    </details>
                                ))}
                                <details className="rounded bg-white px-2 py-1.5 dark:bg-black/20">
                                    <summary className="cursor-pointer text-stone-500">查看完整追溯信息</summary>
                                    <div className="mt-2 grid gap-1 text-stone-500">
                                        <div>previewId：{preview.previewId}</div>
                                        <div>workflowRunId：{preview.workflowRunId}</div>
                                        <div>sourceStageId：{preview.sourceStageId}</div>
                                        <div>sourceOutputId：{preview.sourceOutputId}</div>
                                        <div>createdAt：{preview.createdAt}</div>
                                    </div>
                                </details>
                            </div>
                        </details>
                    </div>
                );
            })}
        </div>
    );
}

function sourceCategoryLabel(category: string) {
    if (category === "agent") return "Agent";
    if (category === "skill") return "Skill";
    if (category === "template") return "Template";
    if (category === "example") return "Example";
    if (category === "tool") return "Tool";
    if (category === "config") return "Config";
    return "Guide";
}

function shouldExpandWorkflowStageByDefault(stageId: string, status: AgentWorkflowRunRecord["stageStates"][number]["status"] | undefined, currentStageId?: string) {
    if (status === "approved" || status === "blocked") return false;
    if (status === "review" || status === "running" || status === "rejected" || status === "error") return true;
    return currentStageId === stageId || !status || status === "idle";
}

function workflowStageName(stages: ReturnType<typeof sortedWorkflowStages>, stageId?: string) {
    return stages.find((stage) => stage.stageId === stageId)?.name || "未开始";
}

function summarizeWorkflowDependencies(stages: ReturnType<typeof sortedWorkflowStages>, workflowRun: AgentWorkflowRunRecord | undefined, stageId: string) {
    const stageState = workflowRun?.stageStates.find((item) => item.stageId === stageId);
    if (!stageState?.dependsOnStageIds.length) return "";
    return stageState.dependsOnStageIds
        .map((dependencyId) => {
            const dependencyStage = stages.find((item) => item.stageId === dependencyId);
            const dependencyState = workflowRun?.stageStates.find((item) => item.stageId === dependencyId);
            return `${dependencyStage?.name || dependencyId}：${workflowStageStatusLabel(dependencyState?.status || "idle")}`;
        })
        .join("；");
}

function configToForm(config: AgentConfig): AgentConfigFormValues {
    return {
        name: config.name,
        scenario: config.scenario,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.userPromptTemplate,
        inputVariablesText: formatInputVariablesText(config.inputVariables),
        outputJsonExample: config.outputJsonExample || config.outputJsonSchema || "",
        modelPreference: config.modelPreference,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        reasoningLevel: config.reasoningLevel,
        writePolicy: config.writePolicy,
    };
}

function formToConfig(base: AgentConfig, values: AgentConfigFormValues, projectId: string): AgentConfig {
    return {
        ...base,
        id: base.projectId ? base.id : `agent-config-${projectId}-${base.kind}`,
        projectId,
        name: values.name,
        scenario: values.scenario || "",
        enabled: values.enabled,
        systemPrompt: values.systemPrompt,
        userPromptTemplate: values.userPromptTemplate,
        inputVariables: parseInputVariablesText(values.inputVariablesText || ""),
        outputJsonExample: values.outputJsonExample || "",
        modelPreference: values.modelPreference || "default",
        temperature: values.temperature ?? 0.4,
        maxOutputTokens: values.maxOutputTokens ?? 1800,
        reasoningLevel: values.reasoningLevel,
        writePolicy: values.writePolicy,
        updatedAt: new Date().toISOString(),
    };
}
