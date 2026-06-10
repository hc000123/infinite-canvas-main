"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Drawer, Form, Tabs, Tag } from "antd";

import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import {
    canInvokeAgentConfig,
    defaultAgentConfig,
    defaultAgentConfigs,
    mergeAgentConfigs,
    validateAgentConfig,
    type AgentConfigKind,
} from "./agent-settings";
import { configToForm, formToConfig, type AgentConfigFormValues } from "./agent-settings-form";
import { builtInAgentWorkflowPresets, resolveWorkflowPreset, sortedWorkflowStages } from "./agent-workflow-presets";
import { listAgentRunsByProject } from "./agent-runner-records";
import { summarizeWorkflowStageDisplayState, type AgentWorkflowDisplayStatus } from "./agent-runner-workflow-display";
import { AgentModelSettingsPanel } from "./agent-model-settings-panel";
import { AgentQuickAgentsPanel } from "./agent-quick-agents-panel";
import { AgentWorkflowExecutionPanel } from "./agent-workflow-execution-panel";
import { useAgentSettingsStore } from "./use-agent-settings-store";
import { useAgentRunnerStore } from "./use-agent-runner-store";
import { useAgentWorkflowActions } from "./use-agent-workflow-actions";
import { buildSeedanceQualityGateManifest } from "./workflow-quality-gates";
import type { CanvasNodeData } from "../canvas/types";

export type AgentWorkspacePanelProps = {
    projectId: string;
    projectTitle: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    initialAgentKind?: AgentConfigKind;
    initialStageId?: string;
    initialTab?: "quick-agents" | "workflow";
    settingsOnly?: boolean;
    canvasNodes?: CanvasNodeData[];
    onApplyVideoPreviewNodes?: (result: { nodes: CanvasNodeData[]; focusNodeIds: string[] }) => void;
};

type Props = AgentWorkspacePanelProps & {
    open: boolean;
    onClose: () => void;
};

export function AgentSettingsDrawer({ open, onClose, ...panelProps }: Props) {
    return (
        <Drawer title="Agent 工作台" open={open} onClose={onClose} size={1080} destroyOnHidden>
            <AgentWorkspacePanel {...panelProps} />
        </Drawer>
    );
}

export function AgentWorkspacePanel({ projectId, projectTitle, canvasId, episodeId, episodeTitle, initialAgentKind, initialStageId, initialTab, settingsOnly = false, canvasNodes, onApplyVideoPreviewNodes }: AgentWorkspacePanelProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AgentConfigFormValues>();
    const [selectedKind, setSelectedKind] = useState<AgentConfigKind>(initialAgentKind || "asset_extractor");
    const [expandedStageIds, setExpandedStageIds] = useState<string[]>([]);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const globalConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const projectWorkflowSelections = useAgentSettingsStore((state) => state.projectWorkflowSelections);
    const saveProjectConfig = useAgentSettingsStore((state) => state.saveProjectConfig);
    const copyDefaultToProject = useAgentSettingsStore((state) => state.copyDefaultToProject);
    const resetProjectConfig = useAgentSettingsStore((state) => state.resetProjectConfig);
    const runs = useAgentRunnerStore((state) => state.runs);
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const workflowOutputs = useAgentRunnerStore((state) => state.workflowOutputs);
    const workflowEvidences = useAgentRunnerStore((state) => state.workflowEvidences);
    const workflowMappingPreviews = useAgentRunnerStore((state) => state.workflowMappingPreviews);
    const workflowAppliedPreviewItemIds = useAgentRunnerStore((state) => state.workflowAppliedPreviewItemIds);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const createRun = useAgentRunnerStore((state) => state.createRun);
    const aiConfig = useConfigStore((state) => state.config);
    const updateAiConfig = useConfigStore((state) => state.updateConfig);
    const checkAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const resolvedConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalConfigs, projectConfigs[projectId] || []), [globalConfigs, projectConfigs, projectId]);
    const workflowPresets = useMemo(() => builtInAgentWorkflowPresets(), []);
    const selectedWorkflowPreset = useMemo(() => resolveWorkflowPreset(workflowPresets[0].workflowId, projectWorkflowSelections[projectId] || []) || workflowPresets[0], [projectId, projectWorkflowSelections, workflowPresets]);
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
    const workflowTextModel = (effectiveConfig.textModel || effectiveConfig.model || "").trim();
    const selectedAgentModel = selectedConfig.modelPreference.trim() && selectedConfig.modelPreference !== "default" ? selectedConfig.modelPreference.trim() : workflowTextModel || "未配置";
    const textApiReady = Boolean(workflowTextModel);
    const textChannelLabel = "后端托管文本通道";
    const {
        applyingPreviewIds,
        runningStageIds,
        applyProductionBiblePreviewWithConfirm,
        applyStoryboardPreviewWithConfirm,
        applyVideoNodePreviewWithConfirm,
        approveWorkflowStage,
        generateMappingPreviewForStage,
        markWorkflowReadingsRead,
        rejectWorkflowStage,
        runWorkflowStageText,
    } = useAgentWorkflowActions({
        canvasId,
        canvasNodes,
        checkAiConfigReady,
        effectiveConfig,
        episodeId,
        episodeTitle,
        onApplyVideoPreviewNodes,
        projectId,
        projectTitle,
        reviewNotes,
        selectedWorkflowPreset,
        selectedWorkflowRun,
        selectedWorkflowStages,
        workflowTextModel,
    });

    useEffect(() => {
        form.setFieldsValue(configToForm(selectedConfig));
    }, [form, selectedConfig]);

    useEffect(() => {
        ensureWorkflowRun({ projectId, canvasId, episodeId, preset: selectedWorkflowPreset });
    }, [canvasId, ensureWorkflowRun, episodeId, projectId, selectedWorkflowPreset]);

    useEffect(() => {
        setExpandedStageIds(
            selectedWorkflowStages
                .filter((stage) => {
                    const displayState = selectedWorkflowRun ? summarizeWorkflowStageDisplayState(selectedWorkflowRun, stage.stageId) : undefined;
                    return stage.stageId === initialStageId || shouldExpandWorkflowStageByDefault(stage.stageId, displayState?.displayStatus, selectedWorkflowRun?.currentStageId);
                })
                .map((stage) => stage.stageId),
        );
    }, [initialStageId, selectedWorkflowRun, selectedWorkflowStages]);

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

    return (
        <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-sm text-stone-500">当前项目：{projectTitle}</div>
                    <div className="mt-1 text-xl font-semibold">{settingsOnly ? "Agent 设置" : "工作流执行"}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                        {canvasId ? <Tag className="m-0">画布 {canvasId}</Tag> : null}
                        {episodeId ? <Tag className="m-0">{episodeTitle || `本集 ${episodeId}`}</Tag> : null}
                    </div>
                </div>
                <Tag className="m-0">项目本地配置</Tag>
            </div>

            <Tabs
                defaultActiveKey={settingsOnly ? "models" : initialTab || "workflow"}
                items={[
                    {
                        key: "models",
                        label: "模型配置",
                        forceRender: true,
                        children: <AgentModelSettingsPanel config={aiConfig} effectiveConfig={effectiveConfig} onConfigChange={updateAiConfig} onOpenFullConfig={() => openConfigDialog()} />,
                    },
                    !settingsOnly
                        ? {
                              key: "workflow",
                              label: "工作流执行",
                              children: (
                                  <AgentWorkflowExecutionPanel
                                      selectedWorkflowPreset={selectedWorkflowPreset}
                                      selectedWorkflowStages={selectedWorkflowStages}
                                      selectedWorkflowRun={selectedWorkflowRun}
                                      selectedStagePreviews={selectedStagePreviews}
                                      qualityGateManifest={qualityGateManifest}
                                      workflowOutputs={workflowOutputs}
                                      workflowEvidences={workflowEvidences}
                                      workflowAppliedPreviewItemIds={workflowAppliedPreviewItemIds}
                                      applyingPreviewIds={applyingPreviewIds}
                                      runningStageIds={runningStageIds}
                                      expandedStageIds={expandedStageIds}
                                      setExpandedStageIds={setExpandedStageIds}
                                      reviewNotes={reviewNotes}
                                      setReviewNotes={setReviewNotes}
                                      hasCanvasContext={Boolean(canvasId && onApplyVideoPreviewNodes)}
                                      hasStoryboardContext={Boolean(canvasId && episodeId)}
                                      onMarkReadingsRead={markWorkflowReadingsRead}
                                      onApplyProductionBiblePreview={applyProductionBiblePreviewWithConfirm}
                                      onApplyStoryboardPreview={applyStoryboardPreviewWithConfirm}
                                      onApplyVideoNodePreview={applyVideoNodePreviewWithConfirm}
                                      onGenerateWorkflowMappingPreview={generateMappingPreviewForStage}
                                      onRunWorkflowStageText={(stageId) => void runWorkflowStageText(stageId)}
                                      onApproveStage={approveWorkflowStage}
                                      onRejectStage={rejectWorkflowStage}
                                  />
                              ),
                          }
                        : undefined,
                    {
                        key: "quick-agents",
                        label: "单 Agent 配置",
                        forceRender: true,
                        children: (
                            <AgentQuickAgentsPanel
                                callable={callable}
                                form={form}
                                onCopyDefault={copyDefault}
                                onCreatePreviewRun={createPreviewRun}
                                onOpenConfig={() => openConfigDialog()}
                                onResetProjectOverride={resetProjectOverride}
                                onRestoreDefaultToForm={restoreDefaultToForm}
                                onSaveOverride={() => void saveOverride()}
                                projectOverrideKinds={projectOverrideKinds}
                                recentRuns={recentRuns}
                                resolvedConfigs={resolvedConfigs}
                                selectedAgentModel={selectedAgentModel}
                                selectedConfig={selectedConfig}
                                selectedKind={selectedKind}
                                setSelectedKind={setSelectedKind}
                                settingsOnly={settingsOnly}
                                textApiReady={textApiReady}
                                textChannelLabel={textChannelLabel}
                                validation={validation}
                            />
                        ),
                    },
                ].filter((item): item is NonNullable<typeof item> => Boolean(item))}
            />
        </div>
    );
}

function shouldExpandWorkflowStageByDefault(stageId: string, status: AgentWorkflowDisplayStatus | undefined, currentStageId?: string) {
    if (status === "approved" || status === "blocked") return false;
    if (status === "review" || status === "running" || status === "rejected" || status === "error" || status === "partial") return true;
    return currentStageId === stageId || !status || status === "idle";
}
