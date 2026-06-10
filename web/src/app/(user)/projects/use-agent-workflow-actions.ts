"use client";

import { useState } from "react";
import { App } from "antd";

import { requestImageQuestion } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "../canvas/types";
import type { AgentWorkflowPreset, AgentWorkflowStage } from "./agent-workflow-presets";
import type { AgentRunInput, AgentWorkflowMappingPreview, AgentWorkflowRunRecord } from "./agent-runner-types";
import { buildWorkflowStageSourceFiles } from "./agent-runner-workflow-prompt";
import { useAgentRunnerStore } from "./use-agent-runner-store";
import { getSeedanceWorkflowAgentCore } from "./workflow-agents/seedance-workflow-agents";

type Props = {
    canvasId?: string;
    canvasNodes?: CanvasNodeData[];
    checkAiConfigReady: (config: AiConfig, model: string) => boolean;
    effectiveConfig: AiConfig;
    episodeId?: string;
    episodeTitle?: string;
    onApplyVideoPreviewNodes?: (result: { nodes: CanvasNodeData[]; focusNodeIds: string[] }) => void;
    projectId: string;
    projectTitle: string;
    reviewNotes: Record<string, string>;
    selectedWorkflowPreset: AgentWorkflowPreset;
    selectedWorkflowRun?: AgentWorkflowRunRecord;
    selectedWorkflowStages: AgentWorkflowStage[];
    workflowTextModel: string;
};

export function useAgentWorkflowActions({
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
}: Props) {
    const { message, modal } = App.useApp();
    const [runningStageIds, setRunningStageIds] = useState<Record<string, boolean>>({});
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const workflowRuns = useAgentRunnerStore((state) => state.workflowRuns);
    const ensureWorkflowRun = useAgentRunnerStore((state) => state.ensureWorkflowRun);
    const markWorkflowStageReadingsRead = useAgentRunnerStore((state) => state.markWorkflowStageReadingsRead);
    const generateWorkflowMappingPreview = useAgentRunnerStore((state) => state.generateWorkflowMappingPreview);
    const applyProductionBiblePreview = useAgentRunnerStore((state) => state.applyProductionBiblePreview);
    const applyStoryboardPreview = useAgentRunnerStore((state) => state.applyStoryboardPreview);
    const applyVideoNodePreview = useAgentRunnerStore((state) => state.applyVideoNodePreview);
    const approveRun = useAgentRunnerStore((state) => state.approveRun);
    const rejectRun = useAgentRunnerStore((state) => state.rejectRun);
    const startWorkflowTextRun = useAgentRunnerStore((state) => state.startWorkflowTextRun);
    const completeWorkflowTextRun = useAgentRunnerStore((state) => state.completeWorkflowTextRun);
    const failWorkflowTextRun = useAgentRunnerStore((state) => state.failWorkflowTextRun);

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
            provider: "openai-remote",
            configSummary: JSON.stringify(
                {
                    model: workflowTextModel,
                    channelMode: "remote",
                    textModelList: effectiveConfig.textModels,
                    provider: "openai-remote",
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
        try {
            const response = await requestImageQuestion(requestConfig, promptMessages, () => {});
            completeWorkflowTextRun(runId, response || "没有返回内容");
            message.success(`阶段 ${stage.name} 文本草案已生成，状态为“待审核”。`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : "文本执行失败";
            failWorkflowTextRun(runId, reason);
            message.warning(reason);
        } finally {
            setRunningStageIds((current) => ({ ...current, [stage.stageId]: false }));
        }
    };

    const markWorkflowReadingsRead = (stageId: string) => {
        if (!selectedWorkflowRun) {
            message.warning("尚未初始化 workflow run");
            return;
        }
        const result = markWorkflowStageReadingsRead(selectedWorkflowRun.id, stageId);
        if (!result.ok) message.warning(result.reason || "无法生成规范读取记录");
        else message.success(`已按 manifest 标记 ${result.count || 0} 条规范读取记录`);
    };

    const applyProductionBiblePreviewWithConfirm = (preview: AgentWorkflowMappingPreview) => {
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
    };

    const applyStoryboardPreviewWithConfirm = (preview: AgentWorkflowMappingPreview) => {
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
    };

    const applyVideoNodePreviewWithConfirm = (preview: AgentWorkflowMappingPreview) => {
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
    };

    const generateMappingPreviewForStage = (stageId: string, stageName: string) => {
        if (!selectedWorkflowRun) return;
        const result = generateWorkflowMappingPreview(selectedWorkflowRun.id, stageId);
        if (!result.ok) message.warning(result.reason || "当前阶段不能生成映射预览");
        else message.success(`已生成 ${stageName} 的映射预览`);
    };

    const approveWorkflowStage = (stageId: string) => {
        const runnerRunId = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stageId)?.runnerRunId;
        if (runnerRunId) approveRun(runnerRunId, reviewNotes[stageId]);
    };

    const rejectWorkflowStage = (stageId: string) => {
        const runnerRunId = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stageId)?.runnerRunId;
        if (runnerRunId) rejectRun(runnerRunId, reviewNotes[stageId]);
    };

    return {
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
    };
}
