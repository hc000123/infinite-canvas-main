"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import { workflowMappingPreviewItemKey, type AgentWorkflowMappingPreview, type AgentWorkflowRunRecord } from "../../../../agent-runner";

type WorkbenchMessage = {
    info: (content: string) => void;
    success: (content: string) => void;
    warning: (content: string) => void;
};

type WorkbenchModal = {
    confirm: (config: { cancelText: string; content: string; okText: string; onOk: () => void; title: string }) => void;
};

type UseEpisodeWorkbenchPreviewActionsOptions = {
    applyProductionBiblePreview: (previewId: string) => { appliedCount?: number; ok: boolean; reason?: string; warnings: string[] };
    applyStoryboardPreview: (previewId: string) => { appliedCount?: number; ok: boolean; reason?: string; warnings: string[] };
    applyVideoNodePreview: (previewId: string, options: { existingNodes: CanvasProject["nodes"] }) => { appliedCount?: number; ok: boolean; reason?: string; warnings: string[] };
    boundCanvas?: CanvasProject;
    generateWorkflowMappingPreview: (workflowRunId: string, stageId: string) => { ok: boolean; reason?: string };
    message: WorkbenchMessage;
    modal: WorkbenchModal;
    onCreateCanvas: () => void;
    router: { push: (href: string) => void };
    setApplyingPreviewIds: Dispatch<SetStateAction<Record<string, boolean>>>;
    summarizeApprovedStoryboardScenes: (workflowRunId: string) => { ok: boolean; reason?: string; sceneCount?: number };
    workflowAppliedPreviewItemIds: string[];
    workflowRun?: AgentWorkflowRunRecord;
};

export function useEpisodeWorkbenchPreviewActions({
    applyProductionBiblePreview,
    applyStoryboardPreview,
    applyVideoNodePreview,
    boundCanvas,
    generateWorkflowMappingPreview,
    message,
    modal,
    onCreateCanvas,
    router,
    setApplyingPreviewIds,
    summarizeApprovedStoryboardScenes,
    workflowAppliedPreviewItemIds,
    workflowRun,
}: UseEpisodeWorkbenchPreviewActionsOptions) {
    const summarizeStoryboardScenes = useCallback(() => {
        if (!workflowRun) return;
        const result = summarizeApprovedStoryboardScenes(workflowRun.id);
        if (!result.ok) message.warning(result.reason || "无法汇总已批准场次");
        else message.success(`已汇总 ${result.sceneCount || 0} 个已批准场次，可生成第三阶段预览`);
    }, [message, summarizeApprovedStoryboardScenes, workflowRun]);

    const generatePreview = useCallback(
        (stageId: string, targetLabel: string) => {
            if (!workflowRun) return;
            const result = generateWorkflowMappingPreview(workflowRun.id, stageId);
            if (!result.ok) message.warning(result.reason || "当前阶段不能生成映射预览");
            else message.success(`已生成 ${targetLabel}`);
        },
        [generateWorkflowMappingPreview, message, workflowRun],
    );

    const confirmApplyPreview = useCallback(
        (preview: AgentWorkflowMappingPreview) => {
            const creatableCount = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create" && !workflowAppliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
            const labels = previewTargetLabels(preview.targetType);
            modal.confirm({
                title: labels.confirmTitle,
                content: `${labels.confirmContentPrefix}${creatableCount} 条。不会自动生成图片，不会自动生成视频，不会触发扣费。`,
                okText: labels.okText,
                cancelText: "取消",
                onOk: () => {
                    setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: true }));
                    try {
                        const result =
                            preview.targetType === "production_bible"
                                ? applyProductionBiblePreview(preview.previewId)
                                : preview.targetType === "storyboard_table"
                                  ? applyStoryboardPreview(preview.previewId)
                                  : applyVideoNodePreview(preview.previewId, { existingNodes: boundCanvas?.nodes || [] });
                        if (!result.ok) {
                            message.warning(result.reason || "当前预览不能写入");
                            return;
                        }
                        message.success(`${labels.doneText}${result.appliedCount || 0} 条`);
                        if (result.warnings.length) message.info(result.warnings.join("；"));
                    } finally {
                        setApplyingPreviewIds((current) => ({ ...current, [preview.previewId]: false }));
                    }
                },
            });
        },
        [applyProductionBiblePreview, applyStoryboardPreview, applyVideoNodePreview, boundCanvas?.nodes, message, modal, setApplyingPreviewIds, workflowAppliedPreviewItemIds],
    );

    const openCanvasOrCreate = useCallback(() => (boundCanvas ? router.push(`/canvas/${boundCanvas.id}`) : onCreateCanvas()), [boundCanvas, onCreateCanvas, router]);

    return { confirmApplyPreview, generatePreview, openCanvasOrCreate, summarizeStoryboardScenes };
}

function previewTargetLabels(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return { confirmTitle: "确认写入设定库", confirmContentPrefix: "将把设定草案写入设定库：", okText: "确认写入", doneText: "已写入设定库 " };
    if (targetType === "storyboard_table") return { confirmTitle: "确认写入分镜头表", confirmContentPrefix: "将把分镜草案追加到当前本集分镜头表：", okText: "确认写入", doneText: "已写入分镜头表 " };
    return { confirmTitle: "确认创建视频配置节点", confirmContentPrefix: "将在绑定画布创建或更新视频配置节点：", okText: "确认创建", doneText: "已创建视频配置节点 " };
}
