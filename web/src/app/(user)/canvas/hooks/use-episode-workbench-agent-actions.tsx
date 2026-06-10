"use client";

import { Button } from "antd";
import type { ComponentType, ReactNode } from "react";

import type { AgentConfig } from "../../projects/agent-settings";
import type { AgentDraftOutput, AgentRunInput, AgentRunRecord } from "../../projects/agent-runner";
import {
    buildAssetBreakdownInputsFromAgentRun,
    buildAssetExtractorRunInput,
    buildLocalAssetExtractorDraftOutput,
    type AgentAssetExtractorContext,
} from "../utils/agent-asset-extractor";
import {
    buildLocalStoryboardDirectorDraftOutput,
    buildStoryboardDirectorRunInput,
    buildStoryboardTableShotInputsFromAgentRun,
    validateStoryboardDraftWriteMode,
    type StoryboardDraftWriteMode,
} from "../utils/agent-storyboard-director";
import type { EpisodeWorkbenchCanvas } from "../utils/episode-workbench";
import type { StoryboardTableShotWriteInput } from "../utils/storyboard-management";
import type { AssetBreakdownWriteInput } from "../utils/asset-breakdown";

type AgentActionMessage = {
    success: (text: string) => void;
    warning: (text: string) => void;
};

type AgentActionModal = {
    confirm: (config: {
        cancelText?: string;
        content: ReactNode;
        footer?: (originNode: ReactNode, buttons: { CancelBtn: ComponentType; OkBtn: ComponentType }) => ReactNode;
        okText?: string;
        onOk?: () => void;
        title: string;
    }) => { destroy: () => void };
};

type AgentAvailability = {
    allowed: boolean;
    reason: string;
};

type AgentReadiness = {
    canRun: boolean;
    reason: string;
};

export function useEpisodeWorkbenchAgentActions({
    activeCanvas,
    activeShots,
    applyAgentTableShots,
    assetExtractorAvailability,
    assetExtractorConfig,
    assetExtractorRunReadiness,
    createAgentRun,
    importAgentAssetDrafts,
    markAgentRunApplied,
    message,
    modal,
    onOpenAgentSettings,
    projectId,
    scriptDraft,
    setSelectedShotIds,
    storyboardDirectorAvailability,
    storyboardDirectorConfig,
    storyboardDirectorRunReadiness,
}: {
    activeCanvas?: EpisodeWorkbenchCanvas | null;
    activeShots: { length: number };
    applyAgentTableShots: (input: { projectId: string; canvasId: string; episodeId: string; shots: StoryboardTableShotWriteInput[]; mode: StoryboardDraftWriteMode }) => number;
    assetExtractorAvailability: AgentAvailability;
    assetExtractorConfig?: AgentConfig;
    assetExtractorRunReadiness: AgentReadiness;
    createAgentRun: (config: AgentConfig, input: AgentRunInput, output: AgentDraftOutput) => void;
    importAgentAssetDrafts: (input: { projectId: string; episodeId: string; drafts: AssetBreakdownWriteInput[] }) => number;
    markAgentRunApplied: (runId: string) => void;
    message: AgentActionMessage;
    modal: AgentActionModal;
    onOpenAgentSettings?: () => void;
    projectId: string;
    scriptDraft: string;
    setSelectedShotIds: (ids: string[]) => void;
    storyboardDirectorAvailability: AgentAvailability;
    storyboardDirectorConfig?: AgentConfig;
    storyboardDirectorRunReadiness: AgentReadiness;
}) {
    const runStoryboardDirector = () => {
        if (!activeCanvas) return message.warning("请先选择画布");
        if (!storyboardDirectorRunReadiness.canRun) return message.warning(storyboardDirectorRunReadiness.reason);
        if (!storyboardDirectorConfig || !storyboardDirectorAvailability.allowed) {
            message.warning(storyboardDirectorAvailability.reason || "分镜导演 Agent 不可用");
            onOpenAgentSettings?.();
            return;
        }
        try {
            const context = { projectId, canvas: { ...activeCanvas, scriptSnapshot: scriptDraft || activeCanvas.scriptSnapshot } };
            createAgentRun(storyboardDirectorConfig, buildStoryboardDirectorRunInput(context), buildLocalStoryboardDirectorDraftOutput(context));
            message.success("已创建分镜导演草案，请先审核再写入分镜头表");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "分镜导演 Agent 运行失败");
        }
    };

    const runAssetExtraction = () => {
        if (!activeCanvas) return message.warning("请先选择画布");
        if (!assetExtractorRunReadiness.canRun) return message.warning(assetExtractorRunReadiness.reason);
        if (!assetExtractorConfig || !assetExtractorAvailability.allowed) {
            message.warning(assetExtractorAvailability.reason || "资产提取 Agent 不可用");
            onOpenAgentSettings?.();
            return;
        }
        try {
            const context: AgentAssetExtractorContext = { projectId, canvas: activeCanvas };
            createAgentRun(assetExtractorConfig, buildAssetExtractorRunInput(context), buildLocalAssetExtractorDraftOutput(context));
            message.success("已创建资产提取草案，请先审核再写入本集生图需求");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "资产提取 Agent 运行失败");
        }
    };

    const applyAssetExtractionRun = (run: AgentRunRecord) => {
        if (!activeCanvas?.episodeId) return message.warning("请先绑定或导入本集剧本");
        try {
            const drafts = buildAssetBreakdownInputsFromAgentRun(run, { projectId, canvas: activeCanvas });
            if (!drafts.length) return message.warning("当前草案没有可写入的资产需求");
            const apply = () => {
                const count = importAgentAssetDrafts({ projectId, episodeId: activeCanvas.episodeId!, drafts });
                markAgentRunApplied(run.id);
                message.success(`已写入 ${count} 条本集生图需求，重复项会自动合并`);
            };
            modal.confirm({ title: "写入本集生图需求？", content: "将把已批准的资产草案写入资产拆解列表，不会自动创建 Brief、生成图片或扣费。重复资产会按同集同类同名合并。", okText: "写入", cancelText: "取消", onOk: apply });
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "资产草案写入失败");
        }
    };

    const applyStoryboardDirectorRun = (run: AgentRunRecord, mode?: StoryboardDraftWriteMode) => {
        if (!activeCanvas?.episodeId) return message.warning("请先绑定或导入本集剧本");
        const validation = validateStoryboardDraftWriteMode({ existingShotCount: activeShots.length, mode });
        if (!validation.valid) {
            const confirmationRef: { destroy?: () => void } = {};
            const confirmation = modal.confirm({
                title: "写入分镜头表",
                content: "当前已有分镜头表，请选择追加到现有分镜后面，或覆盖当前本集分镜头表并清空对应生成镜头组。",
                okText: "追加",
                cancelText: "取消",
                onOk: () => applyStoryboardDirectorRun(run, "append"),
                footer: (_, { OkBtn, CancelBtn }) => (
                    <>
                        <Button
                            danger
                            onClick={() => {
                                confirmationRef.destroy?.();
                                applyStoryboardDirectorRun(run, "replace");
                            }}
                        >
                            覆盖
                        </Button>
                        <CancelBtn />
                        <OkBtn />
                    </>
                ),
            });
            confirmationRef.destroy = confirmation.destroy;
            return;
        }
        try {
            const shots = buildStoryboardTableShotInputsFromAgentRun(run, { projectId, canvas: activeCanvas });
            if (!shots.length) return message.warning("当前草案没有可写入的分镜头");
            const count = applyAgentTableShots({ projectId, canvasId: activeCanvas.id, episodeId: activeCanvas.episodeId, shots, mode: mode || "replace" });
            markAgentRunApplied(run.id);
            setSelectedShotIds([]);
            message.success(`已${mode === "append" ? "追加" : "写入"} ${count} 条分镜头草案`);
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "分镜草案写入失败");
        }
    };

    return { applyAssetExtractionRun, applyStoryboardDirectorRun, runAssetExtraction, runStoryboardDirector };
}
