import type { ProductionBibleItem, ProductionBibleWriteInput } from "../canvas/utils/production-bible.ts";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types.ts";
import { mapPreviewKindToProductionBibleKind } from "./agent-runner-mapping-preview.ts";
import { workflowMappingPreviewItemKey, type WorkflowMappingPreviewApplyResult } from "./agent-runner-workflow-apply-common.ts";
import { summarizeWorkflowStageDisplayState } from "./agent-runner-workflow-display.ts";

export function canApplyWorkflowMappingPreviewToProductionBible({ workflowRun, preview, output }: { workflowRun?: AgentWorkflowRunRecord; preview?: AgentWorkflowMappingPreview; output?: AgentWorkflowStageOutput }) {
    if (!preview) return { allowed: false, reason: "未找到映射预览" };
    if (preview.targetType !== "production_bible") return { allowed: false, reason: "当前预览不是设定库映射，本轮不能应用" };
    if (!workflowRun) return { allowed: false, reason: "未找到 workflow run" };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    const displayState = summarizeWorkflowStageDisplayState(workflowRun, preview.sourceStageId);
    if (displayState.displayStatus !== "approved") return { allowed: false, reason: displayState.hasSceneStates ? `${displayState.summaryText}，不能写入设定库` : "该阶段尚未批准，不能写入设定库" };
    if (!stageState.outputId || stageState.outputId !== preview.sourceOutputId) return { allowed: false, reason: "当前预览缺少已批准产物，不能写入设定库" };
    if (!output) return { allowed: false, reason: "未找到阶段产物快照" };
    return { allowed: true, reason: "" };
}

export function applyWorkflowMappingPreviewToProductionBible({
    preview,
    workflowRun,
    output,
    selectedItemIds,
    existingItems,
}: {
    preview: AgentWorkflowMappingPreview;
    workflowRun: AgentWorkflowRunRecord;
    output: AgentWorkflowStageOutput;
    selectedItemIds?: string[];
    existingItems: ProductionBibleItem[];
}): WorkflowMappingPreviewApplyResult {
    const eligibility = canApplyWorkflowMappingPreviewToProductionBible({ workflowRun, preview, output });
    if (!eligibility.allowed) return { appliedWrites: [], appliedPreviewItemIds: [], skippedPreviewItemIds: [], warnings: [eligibility.reason] };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    const selectedIdSet = selectedItemIds?.length ? new Set(selectedItemIds) : undefined;
    const warnings: string[] = [];
    const appliedWrites: Array<{ previewItemId: string; input: ProductionBibleWriteInput }> = [];
    const appliedPreviewItemIds: string[] = [];
    const skippedPreviewItemIds: string[] = [];
    for (const item of preview.items) {
        if (selectedIdSet && !selectedIdSet.has(item.itemId)) continue;
        if (item.targetType !== "production_bible") {
            warnings.push(`条目 ${item.title} 不是设定库映射，已跳过。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "skip") {
            warnings.push(`条目 ${item.title} 标记为 skip，未写入设定库。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "update") {
            warnings.push(`条目 ${item.title} 标记为 update，但当前没有成熟更新匹配逻辑，未写入设定库。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        const appliedItemKey = workflowMappingPreviewItemKey(preview, item.itemId);
        if (existingItems.some((existing) => existing.projectId === preview.projectId && existing.metadata?.source?.previewId === preview.previewId && existing.metadata.source.previewItemId === item.itemId)) {
            warnings.push(`条目 ${item.title} 已写入设定库，已跳过重复应用。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        const record = item.mappedFields && typeof item.mappedFields === "object" ? (item.mappedFields as Record<string, unknown>) : {};
        const name = String(record.name || record.title || item.title || "未命名设定").trim();
        const description = String(record.description || record.content || item.sourceText || "").trim();
        const tags = Array.isArray(record.tags) ? record.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
        const promptSnippets = record.promptSnippets && typeof record.promptSnippets === "object" && !Array.isArray(record.promptSnippets) ? (record.promptSnippets as Record<string, unknown>) : {};
        const input: ProductionBibleWriteInput = {
            projectId: preview.projectId,
            kind: mapPreviewKindToProductionBibleKind(record.kind),
            name,
            description,
            tags,
            assetRefs: [],
            promptSnippets: {
                positive: String(promptSnippets.positive || "").trim(),
                negative: String(promptSnippets.negative || "").trim(),
                consistency: String(promptSnippets.consistency || "").trim(),
            },
            metadata: {
                source: {
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
            },
        };
        appliedWrites.push({ previewItemId: item.itemId, input });
        appliedPreviewItemIds.push(appliedItemKey);
    }
    return { appliedWrites, appliedPreviewItemIds, skippedPreviewItemIds, warnings };
}
