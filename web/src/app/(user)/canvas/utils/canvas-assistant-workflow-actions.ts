import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "../../projects/agent-runner-types";
import { workflowMappingPreviewItemKey } from "../../projects/agent-runner-workflow-apply-common";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "../types";
import { buildAssistantCanvasActionPreview, validateAssistantCanvasAction, type AssistantCanvasAction, type AssistantCanvasSuggestionResult } from "./canvas-assistant-actions";

export function buildWorkflowAssistantActionSuggestion({
    appliedPreviewItemIds,
    connections,
    nodes,
    outputs,
    previews,
    text,
    workflowRun,
}: {
    appliedPreviewItemIds: string[];
    connections: CanvasConnection[];
    nodes: CanvasNodeData[];
    outputs: AgentWorkflowStageOutput[];
    previews: AgentWorkflowMappingPreview[];
    text: string;
    workflowRun?: AgentWorkflowRunRecord;
}): AssistantCanvasSuggestionResult {
    if (!isWorkflowCanvasActionRequest(text)) return null;
    if (!workflowRun) return null;
    const videoPreview = latestPreview(previews.filter((preview) => preview.workflowRunId === workflowRun.id), "video_node");
    if (!videoPreview) return null;
    const output = outputs.find((item) => item.outputId === videoPreview.sourceOutputId);
    if (!output) return null;
    const pendingItems = videoPreview.items
        .filter((item) => item.targetType === "video_node" && item.action === "create" && !appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(videoPreview, item.itemId)))
        .slice(0, 6);
    if (!pendingItems.length) return null;

    const drafts: AssistantCanvasAction[] = pendingItems.map((item, index) => {
        const mapped = item.mappedFields && typeof item.mappedFields === "object" && !Array.isArray(item.mappedFields) ? (item.mappedFields as Record<string, unknown>) : {};
        const prompt = readString(mapped.finalPrompt) || readString(mapped.videoPrompt) || readString(mapped.effectivePrompt) || readString(mapped.prompt) || item.sourceText;
        const config: Partial<CanvasNodeMetadata> = {
            content: "",
            status: "idle",
            generationMode: "video",
            prompt,
            finalPrompt: prompt,
            seconds: readString(mapped.seconds) || readString(mapped.duration) || "6",
            duration: readString(mapped.duration) || readString(mapped.seconds) || "6",
            size: readString(mapped.size) || readString(mapped.ratio),
            ratio: readString(mapped.ratio) || readString(mapped.size),
            references: readStringList(mapped.references),
            referenceAssets: readObjectList(mapped.referenceAssets),
            shotGroupId: readString(mapped.shotGroupId),
            storyboardShotGroupId: readString(mapped.storyboardShotGroupId) || readString(mapped.shotGroupId),
            storyboardTableShotIds: readStringList(mapped.storyboardTableShotIds),
            episodeId: workflowRun.episodeId,
            sourceType: "workflow_mapping_preview",
            storyboardRole: "video_config",
            workflowSource: {
                sourceType: "workflow_mapping_preview",
                workflowId: workflowRun.workflowId,
                workflowRunId: workflowRun.id,
                workflowVersion: workflowRun.workflowVersion,
                stageId: videoPreview.sourceStageId,
                agentId: workflowRun.stageStates.find((stage) => stage.stageId === videoPreview.sourceStageId)?.agentId || "",
                sourceOutputId: videoPreview.sourceOutputId,
                previewId: videoPreview.previewId,
                previewItemId: item.itemId,
                sourceFiles: output.sourceFiles,
                qualityGateIds: output.qualityGateIds,
                createdFromText: item.sourceText.slice(0, 500),
            },
        };
        return {
            id: `workflow-video-${Date.now().toString(36)}-${index}`,
            kind: "write",
            type: "node.create_config",
            reason: `从 workflow 待落地项创建视频配置节点：${item.title}`,
            payload: {
                mode: "video",
                title: item.title || `视频配置 ${index + 1}`,
                config,
            },
        };
    });

    return buildPreviewActions(drafts, nodes, connections, `已找到 ${drafts.length} 个待落地视频配置节点。确认前不会修改画布，也不会触发生成或扣费。`);
}

function buildPreviewActions(drafts: AssistantCanvasAction[], nodes: CanvasNodeData[], connections: CanvasConnection[], reason: string): AssistantCanvasSuggestionResult {
    const actions: AssistantCanvasAction[] = [];
    let nextNodes = nodes;
    let nextConnections = connections;
    for (const draft of drafts) {
        const validation = validateAssistantCanvasAction(draft, nextNodes, nextConnections);
        if (!validation.ok || validation.action.kind !== "write") return null;
        const preview = buildAssistantCanvasActionPreview(validation.action, nextNodes, nextConnections);
        const action = { ...validation.action, preview };
        actions.push(action);
        nextNodes = [...nextNodes, ...(preview.createdNodes || [])];
        nextConnections = [...nextConnections, ...(preview.createdConnections || [])];
    }
    return actions.length ? { actions, reason } : null;
}

function isWorkflowCanvasActionRequest(text: string) {
    return /(工作流|workflow|待落地|落地).*(视频配置|配置节点|放进画布|动作预览)|视频配置.*(待落地|放进画布|动作预览)/i.test(text);
}

function latestPreview(previews: AgentWorkflowMappingPreview[], targetType: AgentWorkflowMappingPreview["targetType"]) {
    return previews
        .filter((preview) => preview.targetType === targetType)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function readObjectList(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
