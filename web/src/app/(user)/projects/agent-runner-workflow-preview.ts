import {
    analyzeWorkflowStageOutput,
    buildArtDesignProductionBiblePreviewItems,
    buildDirectorProductionBiblePreviewItems,
    buildDirectorStoryboardPreviewItems,
    buildStoryboardTablePreviewItems,
    buildVideoNodePreviewItems,
} from "./agent-runner-mapping-preview.ts";
import { summarizeWorkflowStageDisplayState } from "./agent-runner-workflow-display.ts";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types.ts";

export function canGenerateWorkflowMappingPreview(workflowRun: AgentWorkflowRunRecord, stageId: string, expectedSceneKeys: string[] = []) {
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === stageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    const displayState = summarizeWorkflowStageDisplayState(workflowRun, stageId, expectedSceneKeys);
    if (displayState.displayStatus !== "approved") return { allowed: false, reason: displayState.hasSceneStates ? `${displayState.summaryText}，不能生成映射预览` : "该阶段尚未批准，不能生成映射预览" };
    if (!stageState.outputId) return { allowed: false, reason: "该阶段没有可用产物，不能生成映射预览" };
    return { allowed: true, reason: "" };
}

export function buildWorkflowMappingPreviews({ workflowRun, stageId, output, now }: { workflowRun: AgentWorkflowRunRecord; stageId: string; output: AgentWorkflowStageOutput; now: string }): AgentWorkflowMappingPreview[] {
    const eligibility = canGenerateWorkflowMappingPreview(workflowRun, stageId);
    if (!eligibility.allowed) return [];
    const base = {
        projectId: workflowRun.projectId,
        canvasId: workflowRun.canvasId,
        episodeId: workflowRun.episodeId,
        workflowRunId: workflowRun.id,
        sourceStageId: stageId,
        sourceOutputId: output.outputId,
        createdAt: now,
    };
    if (stageId === "director-analysis") {
        const productionBibleAnalysis = analyzeWorkflowStageOutput(output, "production_bible");
        const storyboardAnalysis = analyzeWorkflowStageOutput(output, "storyboard_table");
        return [
            {
                ...base,
                previewId: `${output.outputId}:production_bible`,
                targetType: "production_bible",
                title: "导演分析设定映射预览",
                summary: "预览将来可映射到人物 / 场景设定摘要的草案。",
                items: buildDirectorProductionBiblePreviewItems(productionBibleAnalysis),
                warnings: productionBibleAnalysis.warnings,
            },
            {
                ...base,
                previewId: `${output.outputId}:storyboard_table`,
                targetType: "storyboard_table",
                title: "导演分析分镜表映射预览",
                summary: "预览将来可映射到分集 / 场次 / 镜头分析摘要的草案。",
                items: buildDirectorStoryboardPreviewItems(storyboardAnalysis),
                warnings: storyboardAnalysis.warnings,
            },
        ];
    }
    if (stageId === "art-design") {
        const productionBibleAnalysis = analyzeWorkflowStageOutput(output, "production_bible");
        return [
            {
                ...base,
                previewId: `${output.outputId}:production_bible`,
                targetType: "production_bible",
                title: "服化道设定映射预览",
                summary: "预览将来可映射到角色 / 场景 / 道具设定库的草案。",
                items: buildArtDesignProductionBiblePreviewItems(productionBibleAnalysis),
                warnings: productionBibleAnalysis.warnings,
            },
        ];
    }
    if (stageId === "seedance-storyboard") {
        const storyboardAnalysis = analyzeWorkflowStageOutput(output, "storyboard_table");
        const videoAnalysis = analyzeWorkflowStageOutput(output, "video_node");
        return [
            {
                ...base,
                previewId: `${output.outputId}:storyboard_table`,
                targetType: "storyboard_table",
                title: "Seedance 分镜表映射预览",
                summary: "预览将来可映射到分镜头表的镜头草案。",
                items: buildStoryboardTablePreviewItems(storyboardAnalysis),
                warnings: storyboardAnalysis.warnings,
            },
            {
                ...base,
                previewId: `${output.outputId}:video_node`,
                targetType: "video_node",
                title: "Seedance 视频节点映射预览",
                summary: "预览将来可映射到画布视频配置节点的提示词草案。",
                items: buildVideoNodePreviewItems(videoAnalysis),
                warnings: videoAnalysis.warnings,
            },
        ];
    }
    return [];
}
