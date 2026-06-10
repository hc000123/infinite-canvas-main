import { normalizeStoryboardTableShot, type StoryboardTableShot, type StoryboardTableShotWriteInput } from "../canvas/utils/storyboard-management.ts";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types.ts";
import { numberField, stringField, stringListField } from "./agent-runner-mapping-preview.ts";
import { workflowMappingPreviewItemKey, type WorkflowStoryboardMappingPreviewApplyResult } from "./agent-runner-workflow-apply-common.ts";
import { summarizeWorkflowStageDisplayState } from "./agent-runner-workflow-display.ts";

export function canApplyWorkflowMappingPreviewToStoryboardTable({
    workflowRun,
    preview,
    output,
    canvasId,
    episodeId,
}: {
    workflowRun?: AgentWorkflowRunRecord;
    preview?: AgentWorkflowMappingPreview;
    output?: AgentWorkflowStageOutput;
    canvasId?: string;
    episodeId?: string;
}) {
    if (!preview) return { allowed: false, reason: "未找到映射预览" };
    if (preview.targetType !== "storyboard_table") return { allowed: false, reason: "当前预览不是分镜头表映射，本轮不能应用" };
    if (!workflowRun) return { allowed: false, reason: "未找到 workflow run" };
    if (!canvasId || !episodeId) return { allowed: false, reason: "当前缺少画布或本集上下文，不能写入分镜头表" };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    const displayState = summarizeWorkflowStageDisplayState(workflowRun, preview.sourceStageId);
    if (displayState.displayStatus !== "approved") return { allowed: false, reason: displayState.hasSceneStates ? `${displayState.summaryText}，不能写入分镜头表` : "该阶段尚未批准，不能写入分镜头表" };
    if (!stageState.outputId || stageState.outputId !== preview.sourceOutputId) return { allowed: false, reason: "当前预览缺少已批准产物，不能写入分镜头表" };
    if (!output) return { allowed: false, reason: "未找到阶段产物快照" };
    return { allowed: true, reason: "" };
}

export function applyWorkflowMappingPreviewToStoryboardTable({
    preview,
    workflowRun,
    output,
    canvasId,
    episodeId,
    selectedItemIds,
    existingShots,
}: {
    preview: AgentWorkflowMappingPreview;
    workflowRun: AgentWorkflowRunRecord;
    output: AgentWorkflowStageOutput;
    canvasId: string;
    episodeId: string;
    selectedItemIds?: string[];
    existingShots: StoryboardTableShot[];
}): WorkflowStoryboardMappingPreviewApplyResult {
    const eligibility = canApplyWorkflowMappingPreviewToStoryboardTable({ workflowRun, preview, output, canvasId, episodeId });
    if (!eligibility.allowed) return { appliedWrites: [], appliedPreviewItemIds: [], skippedPreviewItemIds: [], warnings: [eligibility.reason] };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    const selectedIdSet = selectedItemIds?.length ? new Set(selectedItemIds) : undefined;
    const maxOrder = existingShots.filter((shot) => shot.canvasId === canvasId && shot.episodeId === episodeId).reduce((max, shot) => Math.max(max, shot.order), 0);
    let createdCount = 0;
    const warnings: string[] = [];
    const appliedWrites: Array<{ previewItemId: string; input: StoryboardTableShotWriteInput }> = [];
    const appliedPreviewItemIds: string[] = [];
    const skippedPreviewItemIds: string[] = [];
    for (const item of preview.items) {
        if (selectedIdSet && !selectedIdSet.has(item.itemId)) continue;
        if (item.targetType !== "storyboard_table") {
            warnings.push(`条目 ${item.title} 不是分镜头表映射，已跳过。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "skip") {
            warnings.push(`条目 ${item.title} 标记为 skip，未写入分镜头表。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "update") {
            warnings.push(`条目 ${item.title} 标记为 update，但当前没有成熟更新匹配逻辑，未写入分镜头表。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        const appliedItemKey = workflowMappingPreviewItemKey(preview, item.itemId);
        if (existingShots.some((shot) => shot.canvasId === canvasId && shot.episodeId === episodeId && shot.workflowSource?.previewId === preview.previewId && shot.workflowSource.previewItemId === item.itemId)) {
            warnings.push(`条目 ${item.title} 已写入分镜头表，已跳过重复应用。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        createdCount += 1;
        const record = item.mappedFields && typeof item.mappedFields === "object" && !Array.isArray(item.mappedFields) ? (item.mappedFields as Record<string, unknown>) : {};
        const order = maxOrder + createdCount;
        const shot = normalizeStoryboardTableShot({
            projectId: preview.projectId,
            canvasId,
            episodeId,
            sceneId: stringField(record.sceneId),
            sceneName: stringField(record.sceneName) || "未命名场次",
            location: stringField(record.location),
            timeOfDay: stringField(record.timeOfDay),
            order,
            title: stringField(record.title) || item.title || `镜头 ${order}`,
            scriptText: stringField(record.scriptText),
            visualDescription: stringField(record.visualDescription) || item.sourceText,
            characters: stringListField(record.characters),
            dialogue: stringField(record.dialogue),
            action: stringField(record.action),
            emotion: stringField(record.emotion),
            shotSize: stringField(record.shotSize),
            cameraMovement: stringField(record.cameraMovement),
            estimatedDuration: numberField(record.estimatedDuration, 3),
            assetNeeds: stringListField(record.assetNeeds),
            assetRefs: [],
            productionBibleRefs: [],
            agentRunId: stageState?.runnerRunId,
            sourceType: "workflow_mapping_preview",
            workflowSource: {
                sourceType: "workflow_mapping_preview",
                workflowId: workflowRun.workflowId,
                workflowRunId: workflowRun.id,
                workflowVersion: workflowRun.workflowVersion,
                stageId: preview.sourceStageId,
                agentId: stageState?.agentId || "",
                sourceOutputId: preview.sourceOutputId,
                previewId: preview.previewId,
                previewItemId: item.itemId,
                sourceFiles: output.sourceFiles,
                qualityGateIds: output.qualityGateIds,
                createdFromText: item.sourceText.slice(0, 500),
            },
        });
        appliedWrites.push({ previewItemId: item.itemId, input: shot });
        appliedPreviewItemIds.push(appliedItemKey);
    }
    return { appliedWrites, appliedPreviewItemIds, skippedPreviewItemIds, warnings };
}
