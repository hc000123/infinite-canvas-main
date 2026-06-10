import { NODE_DEFAULT_SIZE } from "../canvas/constants.ts";
import type { CanvasNodeData, CanvasNodeMetadata, Position } from "../canvas/types.ts";
import { placeCanvasNodeAwayFromNodes } from "../canvas/utils/canvas-node-placement.ts";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types.ts";
import { objectListField, stringField, stringListField } from "./agent-runner-mapping-preview.ts";
import { workflowMappingPreviewItemKey, type WorkflowVideoNodeMappingPreviewApplyResult } from "./agent-runner-workflow-apply-common.ts";
import { summarizeWorkflowStageDisplayState } from "./agent-runner-workflow-display.ts";

export function canApplyWorkflowMappingPreviewToVideoNodes({ workflowRun, preview, output, canvasId }: { workflowRun?: AgentWorkflowRunRecord; preview?: AgentWorkflowMappingPreview; output?: AgentWorkflowStageOutput; canvasId?: string }) {
    if (!preview) return { allowed: false, reason: "未找到映射预览" };
    if (preview.targetType !== "video_node") return { allowed: false, reason: "当前预览不是视频配置节点映射，本轮不能应用" };
    if (!workflowRun) return { allowed: false, reason: "未找到 workflow run" };
    if (!canvasId) return { allowed: false, reason: "当前缺少画布上下文，不能创建视频配置节点" };
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === preview.sourceStageId);
    if (!stageState) return { allowed: false, reason: "未找到阶段状态" };
    const displayState = summarizeWorkflowStageDisplayState(workflowRun, preview.sourceStageId);
    if (displayState.displayStatus !== "approved") return { allowed: false, reason: displayState.hasSceneStates ? `${displayState.summaryText}，不能创建视频配置节点` : "该阶段尚未批准，不能创建视频配置节点" };
    if (!stageState.outputId || stageState.outputId !== preview.sourceOutputId) return { allowed: false, reason: "当前预览缺少已批准产物，不能创建视频配置节点" };
    if (!output) return { allowed: false, reason: "未找到阶段产物快照" };
    return { allowed: true, reason: "" };
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
        const appliedItemKey = workflowMappingPreviewItemKey(preview, item.itemId);
        const existingNode = workingNodes.find((node) => node.metadata?.workflowSource?.previewId === preview.previewId && node.metadata.workflowSource.previewItemId === item.itemId);
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
            appliedPreviewItemIds.push(appliedItemKey);
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
        appliedPreviewItemIds.push(appliedItemKey);
        focusNodeIds.push(node.id);
    }

    return { appliedNodes, appliedPreviewItemIds, skippedPreviewItemIds, warnings, focusNodeIds, nextNodes: workingNodes };
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
