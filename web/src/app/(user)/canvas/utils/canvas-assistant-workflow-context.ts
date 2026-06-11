import { workflowMappingPreviewItemKey } from "../../projects/agent-runner-workflow-apply-common";
import { summarizeWorkflowRunDisplayState, workflowStageStatusLabel } from "../../projects/agent-runner-workflow-display";
import type { AgentWorkflowMappingPreview, AgentWorkflowRunRecord } from "../../projects/agent-runner-types";
import type { CreativeProject } from "../../projects/creative-projects";
import { SEEDANCE_WORKFLOW_PRESET_ID } from "../../projects/agent-workflow-presets";
import type { CanvasConnection, CanvasNodeData } from "../types";

export type CanvasAssistantWorkflowContext = {
    text: string;
    summary: string;
    pendingCount: number;
    workflowRun?: AgentWorkflowRunRecord;
};

export function buildCanvasAssistantWorkflowContext({
    appliedPreviewItemIds,
    canvasId,
    canvasTitle,
    connections,
    creativeProject,
    episodeId,
    nodes,
    previews,
    projectId,
    workflowRuns,
}: {
    appliedPreviewItemIds: string[];
    canvasId: string;
    canvasTitle: string;
    connections: CanvasConnection[];
    creativeProject?: CreativeProject;
    episodeId?: string;
    nodes: CanvasNodeData[];
    previews: AgentWorkflowMappingPreview[];
    projectId: string;
    workflowRuns: AgentWorkflowRunRecord[];
}): CanvasAssistantWorkflowContext {
    const workflowRun = workflowRuns.find((run) => run.projectId === projectId && run.episodeId === episodeId && run.workflowId === SEEDANCE_WORKFLOW_PRESET_ID && run.canvasId === canvasId);
    const workflowPreviews = workflowRun ? previews.filter((preview) => preview.workflowRunId === workflowRun.id) : [];
    const previewSummaries = ["production_bible", "storyboard_table", "video_node"].map((targetType) => previewTargetSummary(workflowPreviews, appliedPreviewItemIds, targetType));
    const pendingCount = previewSummaries.reduce((total, item) => total + item.pending, 0);
    const runDisplay = workflowRun ? summarizeWorkflowRunDisplayState(workflowRun) : undefined;
    const nodeSummary = summarizeNodes(nodes);
    const summary = workflowRun ? `${workflowStageStatusLabel(runDisplay?.displayStatus || "idle")}，待落地 ${pendingCount} 项` : "未接入本集 workflow";
    const text = [
        "工作流上下文",
        `项目：${creativeProject?.title || projectId || "未绑定项目"}`,
        `画布：${canvasTitle || canvasId}`,
        `本集：${episodeId || "未绑定本集"}`,
        workflowRun ? `Workflow：${workflowStageStatusLabel(runDisplay?.displayStatus || "idle")}；${runDisplay?.summaryText || "暂无阶段摘要"}` : "Workflow：当前画布未找到绑定的本集 workflow run",
        `待落地：${previewSummaries.map((item) => `${item.label} ${item.pending}/${item.total}`).join("；")}`,
        `画布节点：${nodes.length} 个，连线 ${connections.length} 条；${nodeSummary}`,
        "助手行动边界：可以基于以上上下文解释状态、建议下一步、创建文本/配置节点或连接节点；不要声称已自动写入设定库、分镜头表或触发图片/视频生成，除非用户在页面中确认了对应操作。",
    ].join("\n");
    return { text, summary, pendingCount, workflowRun };
}

function previewTargetSummary(previews: AgentWorkflowMappingPreview[], appliedIds: string[], targetType: string) {
    const latest = previews
        .filter((preview) => preview.targetType === targetType)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
    const items = latest?.items.filter((item) => item.targetType === latest.targetType && item.action === "create") || [];
    const applied = latest ? items.filter((item) => appliedIds.includes(workflowMappingPreviewItemKey(latest, item.itemId))).length : 0;
    return { label: previewTargetLabel(targetType), total: items.length, applied, pending: Math.max(items.length - applied, 0) };
}

function summarizeNodes(nodes: CanvasNodeData[]) {
    if (!nodes.length) return "当前画布为空";
    const counts = nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts)
        .map(([type, count]) => `${nodeTypeLabel(type)} ${count}`)
        .join("、");
}

function previewTargetLabel(targetType: string) {
    if (targetType === "production_bible") return "设定库";
    if (targetType === "storyboard_table") return "分镜表";
    return "视频节点";
}

function nodeTypeLabel(type: string) {
    if (type === "image") return "图片";
    if (type === "video") return "视频";
    if (type === "audio") return "音频";
    if (type === "config") return "配置";
    if (type === "text") return "文本";
    return type;
}
