"use client";

import { useEffect, useState } from "react";

import type { AgentWorkflowRunRecord } from "../../../../agent-runner-types";
import { withSubScene, type EpisodeModuleKey } from "./episode-workbench-display";
import type { DirectorReviewState } from "./episode-module-config";
import type { EpisodeDetailRecord } from "./components/episode-module-panel";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

type WorkbenchUiMessage = {
    success: (content: string) => void;
    warning: (content: string) => void;
};

type UseEpisodeWorkbenchUiStateOptions = {
    approveRun: (id: string, reviewerNote?: string) => void;
    directorOutputText: string;
    episodeExists: boolean;
    episodeId: string;
    hasScript: boolean;
    message: WorkbenchUiMessage;
    sceneOptions: EpisodeSceneOption[];
    scriptSnapshot: string;
    workflowRun?: AgentWorkflowRunRecord;
};

export function useEpisodeWorkbenchUiState({ approveRun, directorOutputText, episodeExists, episodeId, hasScript, message, sceneOptions, scriptSnapshot, workflowRun }: UseEpisodeWorkbenchUiStateOptions) {
    const [scriptDraft, setScriptDraft] = useState("");
    const [selectedSceneKey, setSelectedSceneKey] = useState("");
    const [subSceneKey] = useState("");
    const [applyingPreviewIds, setApplyingPreviewIds] = useState<Record<string, boolean>>({});
    const [activeModule, setActiveModule] = useState<EpisodeModuleKey>("director");
    const [detailRecord, setDetailRecord] = useState<EpisodeDetailRecord | null>(null);
    const [directorReviewStates, setDirectorReviewStates] = useState<Record<string, DirectorReviewState>>({});
    const [initialModuleSynced, setInitialModuleSynced] = useState(false);

    useEffect(() => {
        if (episodeExists) setScriptDraft(scriptSnapshot);
    }, [episodeExists, scriptSnapshot]);

    useEffect(() => {
        setInitialModuleSynced(false);
    }, [episodeId]);

    useEffect(() => {
        setDirectorReviewStates({});
    }, [directorOutputText, episodeId]);

    useEffect(() => {
        if (!hasScript) {
            setActiveModule("script");
            return;
        }
        if (!initialModuleSynced) {
            setActiveModule("script");
            setInitialModuleSynced(true);
        }
    }, [hasScript, initialModuleSynced]);

    useEffect(() => {
        if (!sceneOptions.length) {
            setSelectedSceneKey("");
            return;
        }
        if (!selectedSceneKey || !sceneOptions.some((scene) => scene.sceneKey === selectedSceneKey)) setSelectedSceneKey(sceneOptions[0].sceneKey);
    }, [sceneOptions, selectedSceneKey]);

    const selectedBaseScene = sceneOptions.find((scene) => scene.sceneKey === selectedSceneKey);
    const currentScene = selectedBaseScene ? withSubScene(selectedBaseScene, subSceneKey) : undefined;
    const currentSceneState = currentScene ? workflowRun?.sceneStates?.find((scene) => scene.stageId === "seedance-storyboard" && scene.sceneKey === currentScene.sceneKey) : undefined;

    const updateDirectorReviewState = (rowId: string, state: DirectorReviewState) => {
        const nextStates = { ...directorReviewStates, [rowId]: state };
        const directorStageState = workflowRun?.stageStates.find((item) => item.stageId === "director-analysis");
        setDirectorReviewStates(nextStates);
        if (nextStates["director-risk"] === "confirmed" && nextStates["director-storyboard"] === "adopted") {
            if (directorStageState?.status === "review" && directorStageState.runnerRunId) {
                approveRun(directorStageState.runnerRunId, "风险提示已确认，分镜建议已采用。");
                message.success("导演分析已批准，资产与生图已解锁");
                return;
            }
            if (directorStageState?.status !== "approved") message.warning("导演分析缺少可批准的运行记录，请重新分析后再确认");
        }
        message.success(state === "adopted" ? "已采用分镜建议" : "已确认风险提示");
    };

    const approveStageReview = (stageId: string, note: string) => {
        const stageState = workflowRun?.stageStates.find((item) => item.stageId === stageId);
        if (stageState?.status !== "review" || !stageState.runnerRunId) {
            message.warning("当前阶段缺少可批准的运行记录");
            return;
        }
        approveRun(stageState.runnerRunId, note);
        message.success("已批准阶段结果");
    };

    const approveCurrentStoryboardScene = () => {
        if (currentSceneState?.status !== "review" || !currentSceneState.runnerRunId) {
            message.warning("当前场次缺少可批准的运行记录");
            return;
        }
        approveRun(currentSceneState.runnerRunId, "分镜场次结果已确认。");
        message.success("已批准当前场次");
    };

    return {
        activeModule,
        applyingPreviewIds,
        approveCurrentStoryboardScene,
        approveStageReview,
        currentScene,
        currentSceneState,
        detailRecord,
        directorReviewStates,
        scriptDraft,
        setActiveModule,
        setApplyingPreviewIds,
        setDetailRecord,
        setScriptDraft,
        updateDirectorReviewState,
    };
}
