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
    buildWorkflowStagePromptMessages,
    buildWorkflowStageSourceFiles,
    canGenerateWorkflowMappingPreview,
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
        const detail = workflowStageDetail(selectedWorkflowPreset, stage);
        if (!detail.agent) {
            message.error(`阶段 ${stage.name} 缺少绑定的 Agent，无法执行`);
            return;
        }
        const sourceFiles = buildWorkflowStageSourceFiles(detail.skills, detail.qualityGates);
        const workflowTextModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
        const isReady = Boolean(workflowTextModel) && checkAiConfigReady(effectiveConfig, workflowTextModel);
        const requestConfig = { ...effectiveConfig, model: workflowTextModel || effectiveConfig.model };
        const promptMessages = buildWorkflowStagePromptMessages({
            workflowId: selectedWorkflowPreset.workflowId,
            workflowVersion: selectedWorkflowPreset.version,
            stage,
            agent: detail.agent,
            skills: detail.skills,
            qualityGates: detail.qualityGates,
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
                storyboardRequirement: detail.qualityGates.length ? detail.qualityGates.map((gate) => gate.purpose).join("；") : stage.outputSummary,
                assetNeedSummary: "",
            },
        });
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
            stageId: stage.stageId,
            agentId: detail.agent.agentId,
            agentName: detail.agent.name,
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
            qualityGateIds: detail.qualityGates.map((gate) => gate.gateId),
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
                        <div className="mt-1 text-xl font-semibold">统一维护资产提取、分镜、生图 Brief、视频提示词和质检 Agent</div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">本轮 workflow 文本阶段执行会接真实文本模型生成草案；图片与视频仍为手动触发，不会在此处扣费或写入业务数据。</p>
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
                    <Alert className="mb-4" type="info" showIcon message="文本执行模式" description="当前可对单个阶段手动触发文本草案执行。仅生成文本草案，不调用图片/视频接口，不触发扣费。执行完成后先进入待审核状态。" />
                    <div className="grid gap-4">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold">{selectedWorkflowPreset.name}</span>
                                <Tag className="m-0">v{selectedWorkflowPreset.version}</Tag>
                                <Tag className="m-0">{selectedWorkflowPreset.enabled ? "项目已启用" : "项目未启用"}</Tag>
                                <Tag className="m-0">{selectedWorkflowPreset.selected ? "项目已选择" : "项目未选择"}</Tag>
                                <Tag className="m-0">导入时间：{selectedWorkflowPreset.importedAt}</Tag>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-stone-500">{selectedWorkflowPreset.description}</p>
                            <div className="mt-2 text-xs text-stone-500">来源目录：{selectedWorkflowPreset.sourceRoot}</div>
                        </div>

                        <div className="grid gap-3">
                            {selectedWorkflowStages.map((stage) => {
                                const detail = workflowStageDetail(selectedWorkflowPreset, stage);
                                const mappingPreviewStatus = selectedWorkflowRun ? canGenerateWorkflowMappingPreview(selectedWorkflowRun, stage.stageId) : { allowed: false, reason: "尚未初始化 workflow run" };
                                const stagePreviews = selectedStagePreviews.filter((preview) => preview.sourceStageId === stage.stageId);
                                return (
                                    <div key={stage.stageId} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Tag className="m-0">阶段 {stage.order}</Tag>
                                            <span className="font-medium">{stage.name}</span>
                                            {detail.agent ? <Tag className="m-0">{detail.agent.name}</Tag> : null}
                                        </div>
                                        <div className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{stage.purpose}</div>
                                        <div className="mt-2 grid gap-2 text-xs text-stone-500 md:grid-cols-2">
                                            <div>输入：{stage.inputSummary}</div>
                                            <div>输出：{stage.outputSummary}</div>
                                        </div>
                                        {detail.agent ? (
                                            <div className="mt-3 rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                                                <div className="font-medium">{detail.agent.role}</div>
                                                <div>{detail.agent.responsibility}</div>
                                                <div className="mt-1 text-stone-500">系统提示摘要：{detail.agent.systemPromptSummary}</div>
                                                <div className="mt-1 text-stone-500">来源：{detail.agent.sourceFile}</div>
                                            </div>
                                        ) : null}
                                        <Space className="mt-3" size={[6, 6]} wrap>
                                            {detail.skills.map((skill) => (
                                                <Tag key={skill.skillId} className="m-0">
                                                    {skill.name}
                                                </Tag>
                                            ))}
                                        </Space>
                                        <Space className="mt-2" size={[6, 6]} wrap>
                                            {detail.qualityGates.map((gate) => (
                                                <Tag key={gate.gateId} className="m-0">
                                                    质量门：{gate.name}
                                                </Tag>
                                            ))}
                                        </Space>
                                        <WorkflowStageStatePanel stageId={stage.stageId} workflowRun={selectedWorkflowRun} workflowOutputs={workflowOutputs} workflowEvidences={workflowEvidences} />
                                        {stagePreviews.length ? (
                                            <WorkflowMappingPreviewPanel
                                                previews={stagePreviews}
                                                appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                                                applyingPreviewIds={applyingPreviewIds}
                                                hasCanvasContext={Boolean(canvasId)}
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
                                        {selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.status === "review" ? (
                                            <div className="mt-3 grid gap-2 rounded-md bg-stone-50 p-2 dark:bg-white/5">
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
                                        <Space className="mt-3" size={[6, 6]} wrap>
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
                                                生成映射预览
                                            </Button>
                                            <Button
                                                size="small"
                                                type="primary"
                                                disabled={selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.status === "blocked"}
                                                loading={Boolean(runningStageIds[stage.stageId])}
                                                onClick={() => void runWorkflowStageText(stage.stageId)}
                                            >
                                                运行文本草案（文本执行）
                                            </Button>
                                            {!mappingPreviewStatus.allowed ? <span className="text-xs text-stone-500">{mappingPreviewStatus.reason}</span> : null}
                                            {selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId)?.status === "blocked" ? (
                                                <span className="text-xs text-amber-600">{selectedWorkflowRun.stageStates.find((item) => item.stageId === stage.stageId)?.blockedReason}</span>
                                            ) : null}
                                        </Space>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                            <WorkflowSummaryBlock title="Agent" items={selectedWorkflowPreset.agents.map((agent) => `${agent.name}：${agent.responsibility}`)} />
                            <WorkflowSummaryBlock title="技能包" items={selectedWorkflowPreset.skills.map((skill) => `${skill.name}：${skill.summary}`)} />
                            <WorkflowSummaryBlock title="质量门" items={selectedWorkflowPreset.qualityGates.map((gate) => `${gate.name}：${gate.summary}`)} />
                        </div>

                        <details>
                            <summary className="cursor-pointer text-sm text-stone-500">查看来源文件清单</summary>
                            <div className="mt-2 grid gap-1.5 text-xs text-stone-500">
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

function WorkflowSummaryBlock({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="font-medium">{title}</div>
            <div className="mt-2 grid gap-1.5 text-xs leading-5 text-stone-500">
                {items.map((item) => (
                    <div key={item}>{item}</div>
                ))}
            </div>
        </div>
    );
}

function WorkflowStageStatePanel({ stageId, workflowRun, workflowOutputs, workflowEvidences }: { stageId: string; workflowRun?: AgentWorkflowRunRecord; workflowOutputs: AgentWorkflowStageOutput[]; workflowEvidences: AgentWorkflowReviewEvidence[] }) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    const output = stageState?.outputId ? workflowOutputs.find((item) => item.outputId === stageState.outputId) : workflowOutputs.find((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const evidences = workflowEvidences.filter((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const latestEvidence = evidences[0];
    return (
        <div className="mt-3 grid gap-1.5 rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-white/5">
            <div className="flex flex-wrap items-center gap-2">
                <Tag className="m-0">{workflowStageStatusLabel(stageState?.status || "idle")}</Tag>
                <span>审核证据：{evidences.length} 条</span>
                {latestEvidence ? <span>最近审核：{latestEvidence.createdAt}</span> : null}
            </div>
            <div>最近产物：{output?.summary || "暂无阶段产物"}</div>
            {stageState?.blockedReason ? <div className="text-amber-600">阻塞原因：{stageState.blockedReason}</div> : null}
            {stageState?.errorMessage ? <div className="text-rose-500">错误：{stageState.errorMessage}</div> : null}
        </div>
    );
}

function WorkflowMappingPreviewPanel({
    previews,
    appliedPreviewItemIds,
    applyingPreviewIds,
    hasCanvasContext,
    onApplyProductionBiblePreview,
    onApplyStoryboardPreview,
    onApplyVideoNodePreview,
}: {
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    hasCanvasContext: boolean;
    onApplyProductionBiblePreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyStoryboardPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyVideoNodePreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    return (
        <div className="mt-3 grid gap-2 rounded-md border border-dashed border-stone-200 p-3 dark:border-stone-700">
            <div className="text-xs font-medium text-stone-500">映射预览</div>
            {previews.map((preview) => {
                const creatableItems = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
                const pendingCreatableItems = creatableItems.filter((item) => !appliedPreviewItemIds.includes(item.itemId));
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
                            {preview.targetType === "production_bible" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyProductionBiblePreview(preview)}>
                                    写入设定库
                                </Button>
                            ) : preview.targetType === "storyboard_table" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyStoryboardPreview(preview)}>
                                    写入分镜头表
                                </Button>
                            ) : preview.targetType === "video_node" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyVideoNodePreview(preview)}>
                                    创建视频配置节点
                                </Button>
                            ) : (
                                <Tag className="m-0">后续步骤处理</Tag>
                            )}
                        </div>
                        <div className="mt-1">{preview.summary}</div>
                        {preview.warnings.length ? <div className="mt-1 text-amber-600">Warnings：{preview.warnings.join("；")}</div> : null}
                        {applyDisabledReason ? <div className="mt-1 text-stone-500">{applyDisabledReason}</div> : null}
                        {appliedCount ? <div className="mt-1 text-emerald-600">{preview.targetType === "video_node" ? `已创建：${appliedCount} 个` : `已写入：${appliedCount} 条`}</div> : null}
                        <div className="mt-2 grid gap-2">
                            {preview.items.map((item) => (
                                <div key={item.itemId} className="rounded bg-white px-2 py-1.5 dark:bg-black/20">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{item.action}</Tag>
                                        <span className="font-medium">{item.title}</span>
                                        {appliedPreviewItemIds.includes(item.itemId) ? (
                                            <Tag className="m-0" color="green">
                                                {preview.targetType === "production_bible" ? "已写入设定库" : preview.targetType === "storyboard_table" ? "已写入分镜头表" : "已创建视频配置节点"}
                                            </Tag>
                                        ) : null}
                                        {typeof item.confidence === "number" ? <span className="text-stone-400">置信度 {item.confidence}</span> : null}
                                    </div>
                                    <div className="mt-1">{item.reason}</div>
                                    <div className="mt-1 text-stone-500">来源：{item.sourceText}</div>
                                    <pre className="mt-1 overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50">{JSON.stringify(item.mappedFields, null, 2)}</pre>
                                    {item.warnings.length ? <div className="mt-1 text-amber-600">{item.warnings.join("；")}</div> : null}
                                </div>
                            ))}
                        </div>
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
