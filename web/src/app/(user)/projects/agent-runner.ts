import { canInvokeAgentConfig, normalizeAgentConfig, type AgentConfig, type AgentConfigKind } from "./agent-settings.ts";
import type { AgentWorkflowAgent, AgentWorkflowPreset, AgentWorkflowQualityGate, AgentWorkflowSkill, AgentWorkflowStage } from "./agent-workflow-presets";
import type { ProductionBibleItem, ProductionBibleKind, ProductionBibleWriteInput } from "../canvas/utils/production-bible.ts";
import { NODE_DEFAULT_SIZE } from "../canvas/constants.ts";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "../canvas/types.ts";
import { placeCanvasNodeAwayFromNodes } from "../canvas/utils/canvas-node-placement.ts";
import { normalizeStoryboardTableShot, type StoryboardTableShot, type StoryboardTableShotWriteInput } from "../canvas/utils/storyboard-management.ts";

export type AgentRunStatus = "draft" | "ready_for_review" | "running" | "review" | "approved" | "rejected" | "applied" | "error" | "failed";
export type AgentRunKind = AgentConfigKind | "workflow_text";

export type WorkflowTextOutputFormat = "json" | "text";

export type WorkflowTextRunOutput = {
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    stageId: string;
    agentId: string;
    workflowId: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string;
    name?: string;
};

export type WorkflowStagePromptContext = {
    projectId?: string;
    projectTitle?: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptSnapshot?: string;
    stageSummary?: string;
    sceneSummary?: string;
    directorOutputSummary?: string;
    artDesignOutputSummary?: string;
    storyboardRequirement?: string;
    assetNeedSummary?: string;
};

export type WorkflowStagePromptBuildInput = {
    workflowId: string;
    workflowVersion: string;
    stage: AgentWorkflowStage;
    agent: AgentWorkflowAgent;
    skills: AgentWorkflowSkill[];
    qualityGates: AgentWorkflowQualityGate[];
    inputSnapshot?: WorkflowStagePromptContext;
};

export type AgentRunInput = {
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    episodeTitle?: string;
    scriptId?: string;
    scriptSnapshot?: string;
    sourceType: string;
    sourceId?: string;
    variables: Record<string, unknown>;
    workflowRunId?: string;
    workflowId?: string;
    workflowVersion?: string;
    stageId?: string;
    agentId?: string;
    agentName?: string;
    sourcePresetId?: string;
    presetId?: string;
    inputSnapshot?: Record<string, unknown>;
    promptMessages?: ChatCompletionMessage[];
    model?: string;
    provider?: string;
    configSummary?: string;
    sourceFiles?: string[];
    qualityGateIds?: string[];
};

export type AgentDraftOutput = {
    summary: string;
    items: unknown[];
    rawJson: unknown;
    warnings: string[];
    schemaVersion: string;
};

export type AgentRunProposedAction = {
    type: string;
    title: string;
    targetRefs: Array<{
        kind: string;
        id: string;
        label?: string;
    }>;
    payload: unknown;
    requiresConfirmation: boolean;
};

export type AgentRunRecord = {
    id: string;
    agentKind: AgentRunKind;
    agentConfigId: string;
    agentConfigVersion: string;
    status: AgentRunStatus;
    input: AgentRunInput;
    draftOutput: AgentDraftOutput;
    proposedActions: AgentRunProposedAction[];
    approvedAt?: string;
    appliedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    workflowTextOutput?: WorkflowTextRunOutput;
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageStatus = "idle" | "running" | "review" | "approved" | "rejected" | "error" | "blocked";

export type AgentWorkflowStageState = {
    stageId: string;
    agentId: string;
    status: AgentWorkflowStageStatus;
    runnerRunId?: string;
    outputId?: string;
    approvedAt?: string;
    rejectedAt?: string;
    errorMessage?: string;
    evidenceIds: string[];
    dependsOnStageIds: string[];
    blockedReason?: string;
};

export type AgentWorkflowRunRecord = {
    id: string;
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    workflowId: string;
    workflowVersion: string;
    presetId: string;
    currentStageId: string;
    stageStates: AgentWorkflowStageState[];
    createdAt: string;
    updatedAt: string;
};

export type AgentWorkflowStageOutput = {
    outputId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    rawText: string;
    summary: string;
    structuredOutput?: unknown;
    outputFormat: WorkflowTextOutputFormat;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type AgentWorkflowReviewEvidence = {
    evidenceId: string;
    projectId: string;
    workflowRunId: string;
    stageId: string;
    runnerRunId: string;
    decision: "approved" | "rejected";
    reviewer: string;
    reviewerNote?: string;
    outputSummary: string;
    outputHash: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdAt: string;
};

export type WorkflowMappingPreviewTargetType = "production_bible" | "storyboard_table" | "video_node";

export type AgentWorkflowMappingPreviewItem = {
    itemId: string;
    targetType: WorkflowMappingPreviewTargetType;
    action: "create" | "update" | "skip";
    title: string;
    reason: string;
    sourceText: string;
    mappedFields: Record<string, unknown>;
    confidence?: number;
    warnings: string[];
};

export type AgentWorkflowMappingPreview = {
    previewId: string;
    projectId: string;
    canvasId?: string;
    episodeId?: string;
    workflowRunId: string;
    sourceStageId: string;
    sourceOutputId: string;
    targetType: WorkflowMappingPreviewTargetType;
    title: string;
    summary: string;
    items: AgentWorkflowMappingPreviewItem[];
    warnings: string[];
    createdAt: string;
};

export type WorkflowMappingPreviewApplyResult = {
    appliedWrites: Array<{ previewItemId: string; input: ProductionBibleWriteInput }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
};

export type WorkflowStoryboardMappingPreviewApplyResult = {
    appliedWrites: Array<{ previewItemId: string; input: StoryboardTableShotWriteInput }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
};

export type WorkflowVideoNodeMappingPreviewApplyResult = {
    appliedNodes: Array<{ previewItemId: string; node: CanvasNodeData }>;
    appliedPreviewItemIds: string[];
    skippedPreviewItemIds: string[];
    warnings: string[];
    focusNodeIds: string[];
    nextNodes: CanvasNodeData[];
};

export function createAgentRunRecord({ config, input, id, now, draftOutput }: { config: AgentConfig; input: AgentRunInput; id: string; now: string; draftOutput?: unknown }): AgentRunRecord {
    const normalizedConfig = normalizeAgentConfig(config);
    const callable = canInvokeAgentConfig(normalizedConfig);
    if (!callable.callable) throw new Error(callable.reason || "Agent 配置不可用");
    const output = normalizeAgentDraftOutput(draftOutput || { summary: "已创建 Agent 运行记录，等待草案输出。", items: [], warnings: [] });
    return {
        id,
        agentKind: normalizedConfig.kind,
        agentConfigId: normalizedConfig.id,
        agentConfigVersion: normalizedConfig.version,
        status: output.items.length || output.summary ? "ready_for_review" : "draft",
        input,
        draftOutput: output,
        proposedActions: buildAgentRunProposedActions(normalizedConfig.kind, output),
        createdAt: now,
        updatedAt: now,
    };
}

export function createWorkflowTextRunRecord({ input, id, now }: { input: AgentRunInput; id: string; now: string }): AgentRunRecord {
    const normalizedInput = normalizeWorkflowRunInput(input);
    return {
        id,
        agentKind: "workflow_text",
        agentConfigId: normalizedInput.sourcePresetId || normalizedInput.workflowId || "workflow-text-runner",
        agentConfigVersion: normalizedInput.workflowVersion || "1.0.0",
        status: "running",
        input: normalizedInput,
        draftOutput: normalizeAgentDraftOutput({ summary: "workflow 阶段文本执行中...", items: [], warnings: ["执行开始，等待 LLM 返回文本。"] }),
        proposedActions: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function createAgentWorkflowRunRecord({ preset, projectId, canvasId, episodeId, id, now }: { preset: AgentWorkflowPreset; projectId: string; canvasId?: string; episodeId?: string; id: string; now: string }): AgentWorkflowRunRecord {
    const stages = orderedWorkflowPresetStages(preset);
    const firstStageId = stages[0]?.stageId || "";
    return refreshWorkflowStageBlocks(
        {
            id,
            projectId,
            canvasId,
            episodeId,
            workflowId: preset.workflowId,
            workflowVersion: preset.version,
            presetId: preset.workflowId,
            currentStageId: firstStageId,
            stageStates: stages.map((stage, index) => ({
                stageId: stage.stageId,
                agentId: stage.agentId,
                status: index === 0 ? "idle" : "blocked",
                evidenceIds: [],
                dependsOnStageIds: index === 0 ? [] : [stages[index - 1].stageId],
                blockedReason: index === 0 ? undefined : `需先批准前置阶段：${stages[index - 1].name}`,
            })),
            createdAt: now,
            updatedAt: now,
        },
        now,
    );
}

export function startAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, now: string): AgentWorkflowRunRecord {
    const checked = refreshWorkflowStageBlocks(workflowRun, now);
    const stageState = checked.stageStates.find((stage) => stage.stageId === stageId);
    if (!stageState || stageState.status === "blocked") return checked;
    return {
        ...checked,
        currentStageId: stageId,
        stageStates: checked.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "running", runnerRunId, errorMessage: undefined, blockedReason: undefined } : stage)),
        updatedAt: now,
    };
}

export function buildAgentWorkflowStageOutput({ workflowRunId, runnerRun, outputId, now }: { workflowRunId: string; runnerRun: AgentRunRecord; outputId: string; now: string }): AgentWorkflowStageOutput | undefined {
    if (!runnerRun.workflowTextOutput || !runnerRun.input.stageId) return undefined;
    return {
        outputId,
        workflowRunId,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        rawText: runnerRun.workflowTextOutput.rawText,
        summary: runnerRun.workflowTextOutput.summary,
        structuredOutput: runnerRun.workflowTextOutput.structuredOutput,
        outputFormat: runnerRun.workflowTextOutput.outputFormat,
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function completeAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, output: AgentWorkflowStageOutput, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: output.stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === output.stageId ? { ...stage, status: "review", runnerRunId: output.runnerRunId, outputId: output.outputId, errorMessage: undefined, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function failAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, stageId: string, runnerRunId: string, errorMessage: string, now: string): AgentWorkflowRunRecord {
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: stageId,
            stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "error", runnerRunId, errorMessage, blockedReason: undefined } : stage)),
            updatedAt: now,
        },
        now,
    );
}

export function buildAgentWorkflowReviewEvidence({
    workflowRun,
    runnerRun,
    evidenceId,
    decision,
    reviewerNote,
    now,
}: {
    workflowRun: AgentWorkflowRunRecord;
    runnerRun: AgentRunRecord;
    evidenceId: string;
    decision: "approved" | "rejected";
    reviewerNote?: string;
    now: string;
}): AgentWorkflowReviewEvidence | undefined {
    if (!runnerRun.input.stageId || !runnerRun.workflowTextOutput) return undefined;
    return {
        evidenceId,
        projectId: workflowRun.projectId,
        workflowRunId: workflowRun.id,
        stageId: runnerRun.input.stageId,
        runnerRunId: runnerRun.id,
        decision,
        reviewer: "local",
        reviewerNote: reviewerNote?.trim() || undefined,
        outputSummary: runnerRun.workflowTextOutput.summary,
        outputHash: stableWorkflowSnapshotHash({
            rawText: runnerRun.workflowTextOutput.rawText,
            summary: runnerRun.workflowTextOutput.summary,
            outputFormat: runnerRun.workflowTextOutput.outputFormat,
            stageId: runnerRun.input.stageId,
            runnerRunId: runnerRun.id,
        }),
        sourceFiles: runnerRun.workflowTextOutput.sourceFiles,
        qualityGateIds: runnerRun.workflowTextOutput.qualityGateIds,
        createdAt: now,
    };
}

export function reviewAgentWorkflowStageRun(workflowRun: AgentWorkflowRunRecord, evidence: AgentWorkflowReviewEvidence, now: string): AgentWorkflowRunRecord {
    const status = evidence.decision === "approved" ? "approved" : "rejected";
    return refreshWorkflowStageBlocks(
        {
            ...workflowRun,
            currentStageId: evidence.stageId,
            stageStates: workflowRun.stageStates.map((stage) =>
                stage.stageId === evidence.stageId
                    ? {
                          ...stage,
                          status,
                          runnerRunId: evidence.runnerRunId,
                          approvedAt: evidence.decision === "approved" ? now : stage.approvedAt,
                          rejectedAt: evidence.decision === "rejected" ? now : undefined,
                          errorMessage: undefined,
                          blockedReason: undefined,
                          evidenceIds: Array.from(new Set([...stage.evidenceIds, evidence.evidenceId])),
                      }
                    : stage,
            ),
            updatedAt: now,
        },
        now,
    );
}

export function workflowStageStatusLabel(status: AgentWorkflowStageStatus) {
    if (status === "idle") return "未开始";
    if (status === "running") return "运行中";
    if (status === "review") return "待审核";
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "error") return "异常";
    return "已阻塞";
}

export function canGenerateWorkflowMappingPreview(workflowRun: AgentWorkflowRunRecord, stageId: string) {
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === stageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    if (stageState.status !== "approved") return { allowed: false, reason: "该阶段尚未批准，不能生成映射预览" };
    if (!stageState.outputId) return { allowed: false, reason: "该阶段没有可用产物，不能生成映射预览" };
    return { allowed: true, reason: "" };
}

export function buildWorkflowMappingPreviews({ workflowRun, stageId, output, now }: { workflowRun: AgentWorkflowRunRecord; stageId: string; output: AgentWorkflowStageOutput; now: string }): AgentWorkflowMappingPreview[] {
    const eligibility = canGenerateWorkflowMappingPreview(workflowRun, stageId);
    if (!eligibility.allowed) return [];
    const analysis = analyzeWorkflowStageOutput(output);
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
        return [
            {
                ...base,
                previewId: `${output.outputId}:production_bible`,
                targetType: "production_bible",
                title: "导演分析设定映射预览",
                summary: "预览将来可映射到人物 / 场景设定摘要的草案。",
                items: buildDirectorProductionBiblePreviewItems(analysis),
                warnings: analysis.warnings,
            },
            {
                ...base,
                previewId: `${output.outputId}:storyboard_table`,
                targetType: "storyboard_table",
                title: "导演分析分镜表映射预览",
                summary: "预览将来可映射到分集 / 场次 / 镜头分析摘要的草案。",
                items: buildDirectorStoryboardPreviewItems(analysis),
                warnings: analysis.warnings,
            },
        ];
    }
    if (stageId === "art-design") {
        return [
            {
                ...base,
                previewId: `${output.outputId}:production_bible`,
                targetType: "production_bible",
                title: "服化道设定映射预览",
                summary: "预览将来可映射到角色 / 场景 / 道具设定库的草案。",
                items: buildArtDesignProductionBiblePreviewItems(analysis),
                warnings: analysis.warnings,
            },
        ];
    }
    if (stageId === "seedance-storyboard") {
        return [
            {
                ...base,
                previewId: `${output.outputId}:storyboard_table`,
                targetType: "storyboard_table",
                title: "Seedance 分镜表映射预览",
                summary: "预览将来可映射到分镜头表的镜头草案。",
                items: buildStoryboardTablePreviewItems(analysis),
                warnings: analysis.warnings,
            },
            {
                ...base,
                previewId: `${output.outputId}:video_node`,
                targetType: "video_node",
                title: "Seedance 视频节点映射预览",
                summary: "预览将来可映射到画布视频配置节点的提示词草案。",
                items: buildVideoNodePreviewItems(analysis),
                warnings: analysis.warnings,
            },
        ];
    }
    return [];
}

export function canApplyWorkflowMappingPreviewToProductionBible({ workflowRun, preview, output }: { workflowRun?: AgentWorkflowRunRecord; preview?: AgentWorkflowMappingPreview; output?: AgentWorkflowStageOutput }) {
    if (!preview) return { allowed: false, reason: "未找到映射预览" };
    if (preview.targetType !== "production_bible") return { allowed: false, reason: "当前预览不是设定库映射，本轮不能应用" };
    if (!workflowRun) return { allowed: false, reason: "未找到 workflow run" };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    if (stageState.status !== "approved") return { allowed: false, reason: "该阶段尚未批准，不能写入设定库" };
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
        if (existingItems.some((existing) => existing.projectId === preview.projectId && existing.metadata?.source?.previewItemId === item.itemId)) {
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
        appliedPreviewItemIds.push(item.itemId);
    }
    return { appliedWrites, appliedPreviewItemIds, skippedPreviewItemIds, warnings };
}

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
    if (stageState.status !== "approved") return { allowed: false, reason: "该阶段尚未批准，不能写入分镜头表" };
    if (!stageState.outputId || stageState.outputId !== preview.sourceOutputId) return { allowed: false, reason: "当前预览缺少已批准产物，不能写入分镜头表" };
    if (!output) return { allowed: false, reason: "未找到阶段产物快照" };
    return { allowed: true, reason: "" };
}

export function canApplyWorkflowMappingPreviewToVideoNodes({ workflowRun, preview, output, canvasId }: { workflowRun?: AgentWorkflowRunRecord; preview?: AgentWorkflowMappingPreview; output?: AgentWorkflowStageOutput; canvasId?: string }) {
    if (!preview) return { allowed: false, reason: "未找到映射预览" };
    if (preview.targetType !== "video_node") return { allowed: false, reason: "当前预览不是视频配置节点映射，本轮不能应用" };
    if (!workflowRun) return { allowed: false, reason: "未找到 workflow run" };
    if (!canvasId) return { allowed: false, reason: "当前缺少画布上下文，不能创建视频配置节点" };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    if (stageState.status !== "approved") return { allowed: false, reason: "该阶段尚未批准，不能创建视频配置节点" };
    if (!stageState.outputId || stageState.outputId !== preview.sourceOutputId) return { allowed: false, reason: "当前预览缺少已批准产物，不能创建视频配置节点" };
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
        if (existingShots.some((shot) => shot.canvasId === canvasId && shot.episodeId === episodeId && shot.workflowSource?.previewItemId === item.itemId)) {
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
        appliedPreviewItemIds.push(item.itemId);
    }
    return { appliedWrites, appliedPreviewItemIds, skippedPreviewItemIds, warnings };
}

export function applyWorkflowMappingPreviewToVideoNodes({
    preview,
    workflowRun,
    output,
    canvasId,
    episodeId,
    selectedItemIds,
    existingNodes,
    placement,
    defaultMetadata,
    idFactory = defaultPreviewNodeId,
}: {
    preview: AgentWorkflowMappingPreview;
    workflowRun: AgentWorkflowRunRecord;
    output: AgentWorkflowStageOutput;
    canvasId: string;
    episodeId?: string;
    selectedItemIds?: string[];
    existingNodes: CanvasNodeData[];
    placement?: Position;
    defaultMetadata?: Partial<CanvasNodeMetadata>;
    idFactory?: (previewItemId: string) => string;
}): WorkflowVideoNodeMappingPreviewApplyResult {
    const eligibility = canApplyWorkflowMappingPreviewToVideoNodes({ workflowRun, preview, output, canvasId });
    if (!eligibility.allowed) return { appliedNodes: [], appliedPreviewItemIds: [], skippedPreviewItemIds: [], warnings: [eligibility.reason], focusNodeIds: [], nextNodes: existingNodes };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    const selectedIdSet = selectedItemIds?.length ? new Set(selectedItemIds) : undefined;
    const warnings: string[] = [];
    const appliedNodes: Array<{ previewItemId: string; node: CanvasNodeData }> = [];
    const appliedPreviewItemIds: string[] = [];
    const skippedPreviewItemIds: string[] = [];
    const focusNodeIds: string[] = [];
    const workingNodes = [...existingNodes];

    for (const item of preview.items) {
        if (selectedIdSet && !selectedIdSet.has(item.itemId)) continue;
        if (item.targetType !== "video_node") {
            warnings.push(`条目 ${item.title} 不是视频配置节点映射，已跳过。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        const existingNode = workingNodes.find((node) => node.metadata?.workflowSource?.previewItemId === item.itemId);
        if (item.action === "skip") {
            warnings.push(`条目 ${item.title} 标记为 skip，未创建视频配置节点。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "update" && !existingNode) {
            warnings.push(`条目 ${item.title} 标记为 update，但当前没有找到可更新的视频配置节点。`);
            skippedPreviewItemIds.push(item.itemId);
            continue;
        }
        if (item.action === "create" && existingNode) {
            warnings.push(`条目 ${item.title} 已创建视频配置节点，已跳过重复应用。`);
            skippedPreviewItemIds.push(item.itemId);
            focusNodeIds.push(existingNode.id);
            continue;
        }

        const record = item.mappedFields && typeof item.mappedFields === "object" && !Array.isArray(item.mappedFields) ? (item.mappedFields as Record<string, unknown>) : {};
        const finalPrompt = stringField(record.finalPrompt) || stringField(record.videoPrompt) || stringField(record.effectivePrompt) || stringField(record.prompt) || item.sourceText;
        const metadata: CanvasNodeMetadata = {
            ...defaultMetadata,
            content: "",
            status: "idle",
            generationMode: "video",
            prompt: stringField(record.prompt) || stringField(record.videoPrompt) || finalPrompt,
            finalPrompt,
            seconds: stringField(record.seconds) || stringField(record.duration) || stringField(defaultMetadata?.seconds) || "5",
            duration: stringField(record.duration) || stringField(record.seconds) || stringField(defaultMetadata?.duration) || "5",
            size: stringField(record.size) || stringField(record.ratio) || stringField(defaultMetadata?.size),
            ratio: stringField(record.ratio) || stringField(record.size) || stringField(defaultMetadata?.ratio),
            references: stringListField(record.references),
            referenceAssets: objectListField(record.referenceAssets),
            shotGroupId: stringField(record.shotGroupId),
            storyboardShotGroupId: stringField(record.storyboardShotGroupId) || stringField(record.shotGroupId),
            storyboardTableShotIds: stringListField(record.storyboardTableShotIds),
            episodeId: episodeId || workflowRun.episodeId,
            agentRunId: stageState?.runnerRunId,
            sourceType: "workflow_mapping_preview",
            storyboardRole: "video_config",
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
        };

        if (existingNode) {
            const updatedNode = {
                ...existingNode,
                title: stringField(record.title) || item.title || existingNode.title,
                metadata: { ...existingNode.metadata, ...metadata },
            };
            const index = workingNodes.findIndex((node) => node.id === existingNode.id);
            workingNodes[index] = updatedNode;
            appliedNodes.push({ previewItemId: item.itemId, node: updatedNode });
            appliedPreviewItemIds.push(item.itemId);
            focusNodeIds.push(updatedNode.id);
            continue;
        }

        const node = placeCanvasNodeAwayFromNodes(
            buildWorkflowVideoConfigNode({
                id: idFactory(item.itemId),
                title: stringField(record.title) || item.title || "视频生成配置",
                metadata,
                position: nextWorkflowVideoNodePosition(workingNodes, placement),
            }),
            workingNodes,
        );
        workingNodes.push(node);
        appliedNodes.push({ previewItemId: item.itemId, node });
        appliedPreviewItemIds.push(item.itemId);
        focusNodeIds.push(node.id);
    }

    return { appliedNodes, appliedPreviewItemIds, skippedPreviewItemIds, warnings, focusNodeIds, nextNodes: workingNodes };
}

export function buildWorkflowStageSourceFiles(skills: AgentWorkflowSkill[], qualityGates: AgentWorkflowQualityGate[]): string[] {
    const sourceFiles: string[] = [];
    for (const skill of skills) {
        for (const sourceFile of skill.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    for (const gate of qualityGates) {
        for (const sourceFile of gate.sourceFiles) {
            if (!sourceFiles.includes(sourceFile.path)) sourceFiles.push(sourceFile.path);
        }
    }
    return sourceFiles;
}

export function buildWorkflowStagePrompt({ workflowId, workflowVersion, stage, agent, skills, qualityGates, inputSnapshot }: WorkflowStagePromptBuildInput) {
    const sourceFiles = buildWorkflowStageSourceFiles(skills, qualityGates);
    return [
        `你正在执行 Seedance 工作流的文本阶段草案生成任务。请仅返回文本草案，不调用图片/视频生成接口，不触发扣费。`,
        `workflowId: ${workflowId}`,
        `workflowVersion: ${workflowVersion}`,
        `stageId: ${stage.stageId}`,
        `stageName: ${stage.name}`,
        `agentId: ${agent.agentId}`,
        `agentName: ${agent.name}`,
        `stagePurpose: ${stage.purpose}`,
        `outputSummary: ${stage.outputSummary}`,
        `agentRole: ${agent.role}`,
        `agentResponsibility: ${agent.responsibility}`,
        `agentSystemPromptSummary: ${agent.systemPromptSummary}`,
        `skills: ${skills.map((skill) => `${skill.name}（${skill.purpose}）`).join("；")}`,
        `qualityGates: ${qualityGates.map((gate) => `${gate.name}（${gate.summary}）`).join("；")}`,
        `sourceFiles: ${sourceFiles.join("；") || "（无）"}`,
        "",
        `最小上下文：${buildWorkflowStageContextLines(inputSnapshot, agent.agentId, stage.stageId).join("；")}`,
        "",
        `要求：输出可读、可审核的文本草案，并在必要处给出校验建议。若你能输出 JSON，请将结果放在 JSON 里；若不适配，可输出纯文本，但必须完整可读。`,
    ].join("\n");
}

export function buildWorkflowStagePromptMessages(params: WorkflowStagePromptBuildInput): ChatCompletionMessage[] {
    return [
        { role: "system", content: "你是 Seedance workflow 阶段文本助手，只输出可人工审核的文本产物。" },
        { role: "user", content: buildWorkflowStagePrompt(params) },
    ];
}

export function buildWorkflowTextRunOutput(input: AgentRunInput, rawText: string, now: string): WorkflowTextRunOutput {
    const parsed = tryParseTextOutput(rawText);
    return {
        rawText,
        summary: summarizeWorkflowTextOutput(parsed.value, rawText),
        structuredOutput: parsed.value,
        outputFormat: parsed.format,
        stageId: input.stageId || "",
        agentId: input.agentId || "",
        workflowId: input.workflowId || input.sourcePresetId || input.presetId || "workflow",
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        createdAt: now,
    };
}

export function normalizeAgentDraftOutput(value: unknown, schemaVersion = "1.0.0"): AgentDraftOutput {
    const parsed = parseRawJson(value);
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const items = Array.isArray(record.items) ? record.items : Array.isArray(record.assets) ? record.assets : Array.isArray(record.shots) ? record.shots : Array.isArray(record.briefs) ? record.briefs : [];
    const warnings = Array.isArray(record.warnings) ? record.warnings.map((item) => String(item)).filter(Boolean) : [];
    return {
        summary: String(record.summary || record.title || (items.length ? `生成 ${items.length} 条草案` : "暂无草案摘要")),
        items,
        rawJson: parsed,
        warnings,
        schemaVersion: String(record.schemaVersion || schemaVersion),
    };
}

export function validateAgentDraftOutputShape(value: unknown) {
    const output = normalizeAgentDraftOutput(value);
    return {
        valid: Boolean(output.summary && Array.isArray(output.items) && Array.isArray(output.warnings) && output.schemaVersion),
        output,
    };
}

export function buildAgentTraceMetadata(run: Pick<AgentRunRecord, "id" | "agentConfigId" | "agentConfigVersion" | "agentKind">) {
    return {
        agentRunId: run.id,
        agentKind: run.agentKind,
        agentConfigId: run.agentConfigId,
        agentConfigVersion: run.agentConfigVersion,
    };
}

export function canWriteAgentRun(run: Pick<AgentRunRecord, "status">) {
    return run.status === "approved";
}

export function summarizeAgentRunDraft(run: Pick<AgentRunRecord, "status" | "draftOutput" | "agentConfigVersion">) {
    return {
        status: run.status,
        itemCount: run.draftOutput.items.length,
        warningCount: run.draftOutput.warnings.length,
        configVersionLabel: `配置 v${run.agentConfigVersion}`,
        summary: run.draftOutput.summary,
    };
}

export function buildAgentRunProposedActions(kind: AgentRunKind, output: AgentDraftOutput): AgentRunProposedAction[] {
    return output.items.map((item, index) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const title = String(record.title || record.name || `${agentRunKindLabel(kind)}草案 ${index + 1}`);
        return {
            type: `${kind}.preview`,
            title,
            targetRefs: buildTargetRefs(record),
            payload: item,
            requiresConfirmation: true,
        };
    });
}

export function updateAgentRunDraft(run: AgentRunRecord, output: unknown, now: string): AgentRunRecord {
    const draftOutput = normalizeAgentDraftOutput(output);
    return {
        ...run,
        status: "ready_for_review",
        draftOutput,
        proposedActions: buildAgentRunProposedActions(run.agentKind, draftOutput),
        updatedAt: now,
        errorMessage: undefined,
    };
}

export function setWorkflowTextRunCompleted(run: AgentRunRecord, rawText: string, now: string): AgentRunRecord {
    if (run.agentKind !== "workflow_text") return updateAgentRunDraft(run, rawText, now);
    const workflowTextOutput = buildWorkflowTextRunOutput(run.input, rawText, now);
    const structuredItems =
        workflowTextOutput.structuredOutput && typeof workflowTextOutput.structuredOutput === "object" && !Array.isArray(workflowTextOutput.structuredOutput) ? (workflowTextOutput.structuredOutput as Record<string, unknown>).items : [];
    return {
        ...run,
        status: "review",
        draftOutput: {
            summary: workflowTextOutput.summary,
            items: Array.isArray(structuredItems) ? structuredItems : [],
            rawJson: workflowTextOutput.structuredOutput || rawText,
            warnings: workflowTextOutput.outputFormat === "text" ? ["模型返回非 JSON，已按文本保留。"] : [],
            schemaVersion: "workflow-text.v1",
        },
        workflowTextOutput,
        updatedAt: now,
        errorMessage: undefined,
    };
}

export function setWorkflowTextRunFailed(run: AgentRunRecord, errorMessage: string, now: string): AgentRunRecord {
    return {
        ...run,
        status: "error",
        errorMessage,
        draftOutput: {
            ...run.draftOutput,
            summary: errorMessage || "执行失败",
            warnings: [...run.draftOutput.warnings, errorMessage || "执行失败"],
        },
        updatedAt: now,
    };
}

export function markAgentRunFailed(run: AgentRunRecord, errorMessage: string, now: string): AgentRunRecord {
    return { ...run, status: "failed", errorMessage, updatedAt: now };
}

export function approveAgentRun(run: AgentRunRecord, now: string): AgentRunRecord {
    if (run.status === "applied") return run;
    return { ...run, status: "approved", approvedAt: now, rejectedAt: undefined, updatedAt: now };
}

export function rejectAgentRun(run: AgentRunRecord, now: string): AgentRunRecord {
    return { ...run, status: "rejected", rejectedAt: now, updatedAt: now };
}

export function markAgentRunApplied(run: AgentRunRecord, now: string): AgentRunRecord {
    if (run.status !== "approved") throw new Error("Agent run 必须先批准，才能标记为已应用");
    return { ...run, status: "applied", appliedAt: now, updatedAt: now };
}

export function listAgentRunsByProject(runs: AgentRunRecord[], projectId: string) {
    return orderAgentRuns(runs.filter((run) => run.input.projectId === projectId));
}

export function listAgentRunsByEpisode(runs: AgentRunRecord[], episodeId: string) {
    return orderAgentRuns(runs.filter((run) => run.input.episodeId === episodeId));
}

export function listAgentRunsByAgentKind(runs: AgentRunRecord[], agentKind: AgentRunKind) {
    return orderAgentRuns(runs.filter((run) => run.agentKind === agentKind));
}

export function agentRunStatusLabel(status: AgentRunStatus) {
    if (status === "draft") return "草稿";
    if (status === "ready_for_review") return "待审核";
    if (status === "running") return "运行中";
    if (status === "review") return "待审核";
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "applied") return "已应用";
    if (status === "failed") return "失败";
    return "异常";
}

export function agentRunKindLabel(kind: AgentRunKind) {
    if (kind === "asset_extractor") return "资产提取";
    if (kind === "storyboard_director") return "分镜导演";
    if (kind === "image_brief_builder") return "生图 Brief";
    if (kind === "video_prompt_builder") return "视频提示词";
    if (kind === "workflow_text") return "文本工作流";
    return "提示词质检";
}

function parseRawJson(value: unknown) {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return { summary: value, items: [], warnings: ["原始输出不是合法 JSON，已作为文本摘要保存。"] };
    }
}

function buildWorkflowStageContextLines(snapshot: WorkflowStagePromptContext | undefined, agentId: string, stageId: string) {
    if (!snapshot) return ["（未提供上下文）"];
    const lines: string[] = [];
    if (snapshot.projectTitle) lines.push(`项目：${snapshot.projectTitle}`);
    if (snapshot.episodeTitle) lines.push(`本集：${snapshot.episodeTitle}`);
    if (snapshot.scriptSnapshot) lines.push(`剧本：${snapshot.scriptSnapshot}`);
    if (snapshot.stageSummary) lines.push(`阶段输入摘要：${snapshot.stageSummary}`);

    if (agentId === "director" || stageId === "director-analysis") {
        if (snapshot.sceneSummary) lines.push(`场次摘要：${snapshot.sceneSummary}`);
        return lines.length ? lines : ["未提供项目/剧本/场次上下文"];
    }
    if (agentId === "art-designer" || stageId === "art-design") {
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.assetNeedSummary) lines.push(`本集资产需求摘要：${snapshot.assetNeedSummary}`);
        return lines.length ? lines : ["未提供导演产物摘要 / 资产需求"];
    }
    if (agentId === "storyboard-artist" || stageId === "seedance-storyboard") {
        if (snapshot.directorOutputSummary) lines.push(`导演产物摘要：${snapshot.directorOutputSummary}`);
        if (snapshot.artDesignOutputSummary) lines.push(`服化道产物摘要：${snapshot.artDesignOutputSummary}`);
        if (snapshot.storyboardRequirement) lines.push(`分镜输出要求：${snapshot.storyboardRequirement}`);
        return lines.length ? lines : ["未提供导演 / 服化道产物及要求"];
    }
    return lines.length ? lines : ["未提供阶段上下文"];
}

function normalizeWorkflowRunInput(input: AgentRunInput): AgentRunInput {
    return {
        ...input,
        sourceFiles: normalizeStringList(input.sourceFiles),
        qualityGateIds: normalizeStringList(input.qualityGateIds),
        promptMessages: Array.isArray(input.promptMessages) ? input.promptMessages : [],
    };
}

function normalizeStringList(value: unknown) {
    const list = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    return Array.from(new Set(list.map((item) => item.trim())));
}

function tryParseTextOutput(rawText: string) {
    const trimmed = rawText.trim();
    const parsed = parseWorkflowTextJson(trimmed) || parseWorkflowTextJson(extractCodeBlock(trimmed));
    if (parsed !== undefined) return { format: "json" as const, value: parsed };
    return { format: "text" as const, value: undefined };
}

function parseWorkflowTextJson(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function extractCodeBlock(text: string) {
    const match = text.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    return match?.[1]?.trim() || "";
}

function summarizeWorkflowTextOutput(value: unknown, rawText: string) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.summary === "string" && record.summary.trim()) return record.summary;
        if (typeof record.text === "string" && record.text.trim()) return record.text;
        if (typeof record.output === "string" && record.output.trim()) return record.output;
    }
    const preview = rawText.trim();
    return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview || "模型返回空文本";
}

function buildTargetRefs(record: Record<string, unknown>) {
    const id = typeof record.id === "string" ? record.id : typeof record.sourceId === "string" ? record.sourceId : "";
    const label = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : undefined;
    const kind = typeof record.kind === "string" ? record.kind : "draft_item";
    return id ? [{ kind, id, label }] : [];
}

function analyzeWorkflowStageOutput(output: AgentWorkflowStageOutput) {
    const warnings = [...(output.structuredOutput ? [] : ["结构化解析不足，当前预览基于 rawText 摘要生成。"])];
    const record = output.structuredOutput && typeof output.structuredOutput === "object" && !Array.isArray(output.structuredOutput) ? (output.structuredOutput as Record<string, unknown>) : {};
    const rawLines = output.rawText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);
    const candidates = pickStructuredList(record).length
        ? pickStructuredList(record)
        : rawLines.map((line, index) => ({
              id: `raw-${index + 1}`,
              title: line.slice(0, 36),
              text: line,
          }));
    return { record, rawLines, candidates, warnings };
}

function pickStructuredList(record: Record<string, unknown>) {
    const keys = ["items", "characters", "scenes", "props", "assets", "shots", "prompts", "cards", "segments"];
    for (const key of keys) {
        if (Array.isArray(record[key])) return record[key];
    }
    return [];
}

function buildDirectorProductionBiblePreviewItems(analysis: ReturnType<typeof analyzeWorkflowStageOutput>): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 6), "production_bible", (item, index) => ({
        title: readCandidateTitle(item, `导演分析设定 ${index + 1}`),
        reason: "将导演分析中的人物 / 场景摘要映射为设定库草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            kind: inferBibleKind(item, index === 0 ? "character" : "scene"),
            name: readCandidateTitle(item, `设定 ${index + 1}`),
            description: readCandidateText(item),
            tags: readCandidateTags(item),
            promptSnippets: { consistency: readCandidateText(item) },
        },
        confidence: analysis.warnings.length ? 0.45 : 0.72,
    }));
}

function buildDirectorStoryboardPreviewItems(analysis: ReturnType<typeof analyzeWorkflowStageOutput>): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 6), "storyboard_table", (item, index) => ({
        title: readCandidateTitle(item, `场次草案 ${index + 1}`),
        reason: "将导演分析中的剧情段落 / 场次摘要映射为分镜表预览。",
        sourceText: readCandidateText(item),
        mappedFields: {
            sceneName: readCandidateTitle(item, `场次 ${index + 1}`),
            title: readCandidateTitle(item, `镜头 ${index + 1}`),
            visualDescription: readCandidateText(item),
            action: readCandidateText(item),
        },
        confidence: analysis.warnings.length ? 0.42 : 0.68,
    }));
}

function buildArtDesignProductionBiblePreviewItems(analysis: ReturnType<typeof analyzeWorkflowStageOutput>): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "production_bible", (item, index) => ({
        title: readCandidateTitle(item, `美术设定 ${index + 1}`),
        reason: "将服化道阶段产物映射为角色 / 场景 / 道具设定草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            kind: inferBibleKind(item, "prop"),
            name: readCandidateTitle(item, `设定 ${index + 1}`),
            description: readCandidateText(item),
            tags: readCandidateTags(item),
            promptSnippets: {
                positive: readCandidateField(item, "prompt") || readCandidateText(item),
                consistency: readCandidateField(item, "style") || "",
            },
        },
        confidence: analysis.warnings.length ? 0.48 : 0.78,
    }));
}

function mapPreviewKindToProductionBibleKind(value: unknown): ProductionBibleKind {
    const kind = String(value || "")
        .trim()
        .toLowerCase();
    if (["character", "角色", "person"].includes(kind)) return "character";
    if (["scene", "场景", "mood", "style", "氛围", "风格"].includes(kind)) return "scene";
    if (["prop", "道具", "costume", "makeup", "服化道", "服装", "妆发"].includes(kind)) return "prop";
    return "prop";
}

function stringField(value: unknown) {
    return String(value || "").trim();
}

function stringListField(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    const text = String(value || "").trim();
    return text
        ? text
              .split(/[，,、/]/)
              .map((item) => item.trim())
              .filter(Boolean)
        : [];
}

function numberField(value: unknown, fallback: number) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function objectListField(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function buildStoryboardTablePreviewItems(analysis: ReturnType<typeof analyzeWorkflowStageOutput>): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "storyboard_table", (item, index) => ({
        title: readCandidateTitle(item, `分镜草案 ${index + 1}`),
        reason: "将 Seedance 分镜阶段产物映射为分镜头表草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            sceneId: readCandidateField(item, "sceneId") || "",
            sceneName: readCandidateField(item, "sceneName") || `场次 ${index + 1}`,
            location: readCandidateField(item, "location") || "",
            timeOfDay: readCandidateField(item, "timeOfDay") || "",
            title: readCandidateTitle(item, `镜头 ${index + 1}`),
            scriptText: readCandidateField(item, "scriptText") || "",
            visualDescription: readCandidateField(item, "visualDescription") || readCandidateText(item),
            characters: readCandidateField(item, "characters") || [],
            shotSize: readCandidateField(item, "shotSize") || "",
            cameraMovement: readCandidateField(item, "cameraMovement") || "",
            action: readCandidateField(item, "action") || readCandidateText(item),
            emotion: readCandidateField(item, "emotion") || "",
            dialogue: readCandidateField(item, "dialogue") || "",
            estimatedDuration: readCandidateField(item, "estimatedDuration") || "3",
            assetNeeds: readCandidateField(item, "assetNeeds") || [],
        },
        confidence: analysis.warnings.length ? 0.5 : 0.82,
    }));
}

function buildVideoNodePreviewItems(analysis: ReturnType<typeof analyzeWorkflowStageOutput>): AgentWorkflowMappingPreviewItem[] {
    return buildPreviewItems(analysis.candidates.slice(0, 8), "video_node", (item, index) => ({
        title: readCandidateTitle(item, `视频提示词 ${index + 1}`),
        reason: "将 Seedance 分镜阶段产物映射为画布视频配置节点草案。",
        sourceText: readCandidateText(item),
        mappedFields: {
            title: readCandidateTitle(item, `视频节点 ${index + 1}`),
            prompt: readCandidateField(item, "prompt") || readCandidateField(item, "videoPrompt") || readCandidateText(item),
            finalPrompt: readCandidateField(item, "finalPrompt") || readCandidateField(item, "effectivePrompt") || readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            videoPrompt: readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            effectivePrompt: readCandidateField(item, "effectivePrompt") || readCandidateField(item, "finalPrompt") || readCandidateField(item, "videoPrompt") || readCandidateField(item, "prompt") || readCandidateText(item),
            seconds: readCandidateField(item, "seconds") || readCandidateField(item, "duration") || "5",
            duration: readCandidateField(item, "duration") || readCandidateField(item, "seconds") || "5",
            ratio: readCandidateField(item, "ratio") || readCandidateField(item, "size") || "16:9",
            size: readCandidateField(item, "size") || readCandidateField(item, "ratio") || "16:9",
            references: readCandidateField(item, "references") || [],
            referenceAssets: readCandidateField(item, "referenceAssets") || [],
            shotGroupId: readCandidateField(item, "shotGroupId") || "",
            storyboardShotGroupId: readCandidateField(item, "storyboardShotGroupId") || readCandidateField(item, "shotGroupId") || "",
            storyboardTableShotIds: readCandidateField(item, "storyboardTableShotIds") || [],
            videoPromptReviewEnabled: "true",
        },
        confidence: analysis.warnings.length ? 0.46 : 0.8,
    }));
}

function buildPreviewItems(candidates: unknown[], targetType: WorkflowMappingPreviewTargetType, mapper: (item: unknown, index: number) => Omit<AgentWorkflowMappingPreviewItem, "itemId" | "targetType" | "action" | "warnings"> & { confidence?: number }) {
    return candidates.map((item, index) => {
        const mapped = mapper(item, index);
        return {
            itemId: `${targetType}-${index + 1}`,
            targetType,
            action: "create" as const,
            title: mapped.title,
            reason: mapped.reason,
            sourceText: mapped.sourceText,
            mappedFields: mapped.mappedFields,
            confidence: mapped.confidence,
            warnings: [],
        };
    });
}

function inferBibleKind(item: unknown, fallback: ProductionBibleKind): ProductionBibleKind {
    const text = `${readCandidateTitle(item, "")} ${readCandidateField(item, "kind")} ${readCandidateText(item)}`.toLowerCase();
    if (text.includes("角色") || text.includes("人物") || text.includes("character")) return "character";
    if (text.includes("场景") || text.includes("scene")) return "scene";
    if (text.includes("道具") || text.includes("prop")) return "prop";
    return fallback;
}

function readCandidateTitle(item: unknown, fallback: string) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return String(record.title || record.name || record.label || fallback);
    }
    return typeof item === "string" ? item.slice(0, 36) : fallback;
}

function readCandidateText(item: unknown) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return String(record.text || record.summary || record.description || record.prompt || record.output || record.title || record.name || "");
    }
    return typeof item === "string" ? item : JSON.stringify(item);
}

function readCandidateField(item: unknown, key: string) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    const value = (item as Record<string, unknown>)[key];
    return typeof value === "string" || typeof value === "number" || Array.isArray(value) || (value && typeof value === "object") ? value : "";
}

function readCandidateTags(item: unknown) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const tags = (item as Record<string, unknown>).tags;
    return Array.isArray(tags) ? tags.map((tag) => String(tag)).filter(Boolean) : [];
}

function buildWorkflowVideoConfigNode({ id, title, metadata, position }: { id: string; title: string; metadata: CanvasNodeMetadata; position: Position }): CanvasNodeData {
    return {
        id,
        type: "config" as CanvasNodeData["type"],
        title,
        position,
        width: NODE_DEFAULT_SIZE.config.width,
        height: NODE_DEFAULT_SIZE.config.height,
        metadata: { content: "", status: "idle", generationMode: "image", ...metadata },
    };
}

function nextWorkflowVideoNodePosition(nodes: CanvasNodeData[], placement?: Position): Position {
    if (placement) return placement;
    if (!nodes.length) return { x: 120, y: 120 };
    const maxRight = nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), 0);
    const minTop = nodes.reduce((min, node) => Math.min(min, node.position.y), nodes[0]?.position.y || 120);
    return { x: maxRight + 96, y: minTop };
}

function defaultPreviewNodeId(previewItemId: string) {
    return `workflow-video-config-${previewItemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function refreshWorkflowStageBlocks(workflowRun: AgentWorkflowRunRecord, now: string): AgentWorkflowRunRecord {
    const stageById = new Map(workflowRun.stageStates.map((stage) => [stage.stageId, stage]));
    let changed = false;
    const stageStates = workflowRun.stageStates.map((stage) => {
        const missingDependency = stage.dependsOnStageIds.find((stageId) => stageById.get(stageId)?.status !== "approved");
        if (!missingDependency) {
            if (stage.status === "blocked") {
                changed = true;
                return { ...stage, status: "idle" as const, blockedReason: undefined };
            }
            return stage;
        }
        const blockedReason = `需先批准前置阶段：${missingDependency}`;
        if (stage.status === "blocked" && stage.blockedReason === blockedReason) return stage;
        changed = true;
        return { ...stage, status: "blocked" as const, blockedReason };
    });
    return changed ? { ...workflowRun, stageStates, updatedAt: now } : workflowRun;
}

function stableWorkflowSnapshotHash(value: unknown) {
    const text = JSON.stringify(value, Object.keys((value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>).sort());
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return `wf-${hash.toString(16).padStart(8, "0")}`;
}

function orderedWorkflowPresetStages(preset: Pick<AgentWorkflowPreset, "stages">) {
    return [...preset.stages].sort((a, b) => a.order - b.order);
}

function orderAgentRuns(runs: AgentRunRecord[]) {
    return [...runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
