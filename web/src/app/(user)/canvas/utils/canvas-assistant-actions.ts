import { NODE_DEFAULT_SIZE } from "../constants.ts";
import type { CanvasConnection, CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata, Position } from "../types.ts";

export type AssistantCanvasReadAction =
    | { id: string; kind: "read"; type: "canvas.read"; reason?: string; payload?: Record<string, never> }
    | { id: string; kind: "read"; type: "canvas.summarize"; reason?: string; payload?: Record<string, never> }
    | { id: string; kind: "read"; type: "node.explain_context"; reason?: string; payload: { nodeIds: string[] } };

export type AssistantCanvasWriteAction =
    | { id: string; kind: "write"; type: "node.create_text"; reason?: string; payload: { title?: string; content: string; position?: Position }; preview?: AssistantCanvasActionPreview }
    | { id: string; kind: "write"; type: "node.create_config"; reason?: string; payload: { mode: CanvasGenerationMode; title?: string; config?: Partial<CanvasNodeMetadata>; position?: Position }; preview?: AssistantCanvasActionPreview }
    | { id: string; kind: "write"; type: "connection.create"; reason?: string; payload: { fromNodeId: string; toNodeId: string }; preview?: AssistantCanvasActionPreview };

export type AssistantCanvasAction = AssistantCanvasReadAction | AssistantCanvasWriteAction;

export type AssistantCanvasActionPreview = {
    summary: string;
    affectedNodeIds: string[];
    affectedConnectionIds: string[];
    createdNodes?: CanvasNodeData[];
    createdConnections?: CanvasConnection[];
};

export type AssistantCanvasValidationResult = { ok: true; action: AssistantCanvasAction } | { ok: false; errors: string[] };
export type AssistantCanvasSuggestionResult = { actions: AssistantCanvasAction[]; reason: string } | null;

type AssistantActionMessage = { assistantActions?: AssistantCanvasAction[]; assistantActionStatus?: "pending" | "applied" | "cancelled"; assistantActionAppliedAt?: string };

const readTypes = new Set(["canvas.read", "canvas.summarize", "node.explain_context"]);
const writeTypes = new Set(["node.create_text", "node.create_config", "connection.create"]);
const forbiddenTypes = new Set(["node.delete", "connection.delete", "node.update", "node.overwrite", "ai.generate", "image.generate", "video.generate"]);
const aiTriggerFields = ["taskId", "taskStatus", "rawTaskStatus", "generationStartedAt", "videoTaskMode", "videoActionType", "actionType"];

export function validateAssistantCanvasAction(action: unknown, nodes: CanvasNodeData[], connections: CanvasConnection[]): AssistantCanvasValidationResult {
    const errors: string[] = [];
    if (!isRecord(action)) return { ok: false, errors: ["action 必须是对象"] };

    const type = typeof action.type === "string" ? action.type : "";
    const kind = action.kind;
    if (forbiddenTypes.has(type)) errors.push("不允许删除、覆盖或自动触发 AI 生成");
    if (!readTypes.has(type) && !writeTypes.has(type)) errors.push(`不支持的动作类型：${type || "(empty)"}`);
    if (readTypes.has(type) && kind !== "read") errors.push("只读动作 kind 必须是 read");
    if (writeTypes.has(type) && kind !== "write") errors.push("写入动作 kind 必须是 write");

    if (type === "node.explain_context") validateNodeIds(action.payload, nodes, errors);
    if (type === "node.create_text") validateCreateText(action.payload, errors);
    if (type === "node.create_config") validateCreateConfig(action.payload, errors);
    if (type === "connection.create") validateCreateConnection(action.payload, nodes, connections, errors);

    return errors.length ? { ok: false, errors } : { ok: true, action: action as AssistantCanvasAction };
}

export function validateAssistantCanvasActions(actions: AssistantCanvasAction[], nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const errors: string[] = [];
    let nextNodes = nodes;
    let nextConnections = connections;
    actions.forEach((action) => {
        const validation = validateAssistantCanvasAction(action, nextNodes, nextConnections);
        if (!validation.ok) {
            errors.push(...validation.errors);
            return;
        }
        if (action.kind === "write" && action.preview) {
            nextNodes = [...nextNodes, ...(action.preview.createdNodes || [])];
            nextConnections = [...nextConnections, ...(action.preview.createdConnections || [])];
        }
    });
    return errors;
}

export function parseAssistantCanvasActionSuggestion({
    text,
    nodes,
    connections,
    selectedNodeIds,
    idPrefix = `suggest-${Date.now().toString(36)}`,
}: {
    text: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    idPrefix?: string;
}): AssistantCanvasSuggestionResult {
    const input = text.trim();
    if (!input) return null;
    const selectedIds = selectedNodeIds.filter((id) => nodes.some((node) => node.id === id));
    const mode = requestedConfigMode(input);

    if (mentionsConnection(input) && mode && selectedIds.length) {
        return buildSuggestedActions(
            [
                {
                    id: `${idPrefix}-config`,
                    kind: "write",
                    type: "node.create_config",
                    reason: `根据“${input}”创建${modeLabel(mode)}配置节点`,
                    payload: { mode, title: `${modeLabel(mode)}生成配置`, position: positionNearNode(nodes, selectedIds[0]) },
                },
                {
                    id: `${idPrefix}-connect`,
                    kind: "write",
                    type: "connection.create",
                    reason: "连接当前选中节点到新配置节点",
                    payload: { fromNodeId: selectedIds[0], toNodeId: `assistant-node-${idPrefix}-config` },
                },
            ],
            nodes,
            connections,
            "已解析为创建配置节点并连接选中节点",
        );
    }

    if (mentionsConnection(input) && selectedIds.length >= 2) {
        return buildSuggestedActions(
            [
                {
                    id: `${idPrefix}-connect`,
                    kind: "write",
                    type: "connection.create",
                    reason: "连接两个已选节点",
                    payload: { fromNodeId: selectedIds[0], toNodeId: selectedIds[1] },
                },
            ],
            nodes,
            connections,
            "已解析为连接两个已选节点",
        );
    }

    const textContent = requestedTextNodeContent(input);
    if (textContent) {
        return buildSuggestedActions(
            [
                {
                    id: `${idPrefix}-text`,
                    kind: "write",
                    type: "node.create_text",
                    reason: "根据用户输入创建文本节点",
                    payload: { title: "助手文本", content: textContent, position: positionNearNode(nodes, selectedIds[0]) },
                },
            ],
            nodes,
            connections,
            "已解析为创建文本节点",
        );
    }

    if (mode && /创建|新增|加一个|生成/.test(input)) {
        return buildSuggestedActions(
            [
                {
                    id: `${idPrefix}-config`,
                    kind: "write",
                    type: "node.create_config",
                    reason: `根据用户输入创建${modeLabel(mode)}配置节点`,
                    payload: { mode, title: `${modeLabel(mode)}生成配置`, position: positionNearNode(nodes, selectedIds[0]) },
                },
            ],
            nodes,
            connections,
            `已解析为创建${modeLabel(mode)}配置节点`,
        );
    }

    return null;
}

export function buildAssistantCanvasActionPreview(action: AssistantCanvasAction, nodes: CanvasNodeData[], connections: CanvasConnection[]): AssistantCanvasActionPreview {
    const validation = validateAssistantCanvasAction(action, nodes, connections);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    if (action.kind !== "write") return { summary: readActionSummary(action), affectedNodeIds: [], affectedConnectionIds: [] };

    if (action.type === "node.create_text") {
        const spec = NODE_DEFAULT_SIZE.text;
        const node: CanvasNodeData = {
            id: `assistant-node-${action.id}`,
            type: "text" as CanvasNodeData["type"],
            title: action.payload.title?.trim() || action.payload.content.slice(0, 32) || spec.title,
            position: action.payload.position || nextNodePosition(nodes),
            width: spec.width,
            height: spec.height,
            metadata: { content: action.payload.content, status: "success", fontSize: 14 },
        };
        return { summary: `创建文本节点：${node.title}`, affectedNodeIds: [], affectedConnectionIds: [], createdNodes: [node] };
    }

    if (action.type === "node.create_config") {
        const spec = NODE_DEFAULT_SIZE.config;
        const node: CanvasNodeData = {
            id: `assistant-node-${action.id}`,
            type: "config" as CanvasNodeData["type"],
            title: action.payload.title?.trim() || spec.title,
            position: action.payload.position || nextNodePosition(nodes),
            width: spec.width,
            height: spec.height,
            metadata: { content: "", status: "idle", generationMode: action.payload.mode, ...action.payload.config },
        };
        return { summary: `创建${modeLabel(action.payload.mode)}配置节点`, affectedNodeIds: [], affectedConnectionIds: [], createdNodes: [node] };
    }

    const connection: CanvasConnection = { id: `assistant-connection-${action.id}`, fromNodeId: action.payload.fromNodeId, toNodeId: action.payload.toNodeId };
    return {
        summary: `连接节点：${action.payload.fromNodeId} -> ${action.payload.toNodeId}`,
        affectedNodeIds: [action.payload.fromNodeId, action.payload.toNodeId],
        affectedConnectionIds: [],
        createdConnections: [connection],
    };
}

export function executeAssistantCanvasReadAction(action: AssistantCanvasReadAction, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const validation = validateAssistantCanvasAction(action, nodes, connections);
    if (!validation.ok) throw new Error(validation.errors.join("; "));
    if (action.type === "node.explain_context") return { text: explainNodeContext(action.payload.nodeIds, nodes, connections) };
    return { text: summarizeCanvas(nodes, connections) };
}

export function applyAssistantCanvasActions({ nodes, connections, actions }: { nodes: CanvasNodeData[]; connections: CanvasConnection[]; actions: AssistantCanvasAction[] }) {
    let nextNodes: CanvasNodeData[] = nodes.map((node) => ({ ...node, metadata: node.metadata ? { ...node.metadata } : undefined }));
    let nextConnections: CanvasConnection[] = connections.map((connection) => ({ ...connection }));

    for (const action of actions) {
        const validation = validateAssistantCanvasAction(action, nextNodes, nextConnections);
        if (!validation.ok || action.kind !== "write" || !action.preview) continue;
        const preview = buildAssistantCanvasActionPreview(action, nextNodes, nextConnections);
        if (!samePreview(action.preview, preview)) continue;
        nextNodes = [...nextNodes, ...(preview.createdNodes || [])];
        nextConnections = [...nextConnections, ...(preview.createdConnections || [])];
    }

    return { nodes: nextNodes, connections: nextConnections };
}

function summarizeCanvas(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    if (!nodes.length) return "当前画布为空，还没有节点或连线。";
    const typeSummary = Object.entries(
        nodes.reduce<Record<string, number>>((counts, node) => {
            const label = nodeTypeLabel(node.type);
            counts[label] = (counts[label] || 0) + 1;
            return counts;
        }, {}),
    )
        .map(([label, count]) => `${label} ${count} 个`)
        .join("、");
    const statusSummary = Object.entries(
        nodes.reduce<Record<string, number>>((counts, node) => {
            const label = statusLabel(node.metadata?.status);
            counts[label] = (counts[label] || 0) + 1;
            return counts;
        }, {}),
    )
        .map(([label, count]) => `${label} ${count} 个`)
        .join("、");
    const nodeLines = nodes.slice(0, 12).map((node) => `- ${nodeLabel(node)}：${nodeDetail(node)}`);
    const connectionLines = connections.slice(0, 12).map((connection) => {
        const from = nodes.find((node) => node.id === connection.fromNodeId);
        const to = nodes.find((node) => node.id === connection.toNodeId);
        return `- ${connection.fromNodeId} -> ${connection.toNodeId}（${relationLabel(from, to)}）`;
    });

    return [
        "当前画布总结",
        `当前画布共有 ${nodes.length} 个节点、${connections.length} 条连线。`,
        `节点类型：${typeSummary}。`,
        `任务状态：${statusSummary}。`,
        "主要节点：",
        ...nodeLines,
        connections.length ? "连线关系：" : "连线关系：暂无。",
        ...connectionLines,
    ].join("\n");
}

function explainNodeContext(nodeIds: string[], nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return nodeIds
        .map((nodeId) => {
            const current = nodes.find((node) => node.id === nodeId);
            if (!current) return `节点不存在：${nodeId}`;
            const upstream = connections
                .filter((connection) => connection.toNodeId === nodeId)
                .map((connection) => {
                    const from = nodes.find((node) => node.id === connection.fromNodeId);
                    return `- ${from ? nodeLabel(from) : connection.fromNodeId}（${relationLabel(from, current)}）`;
                });
            const downstream = connections
                .filter((connection) => connection.fromNodeId === nodeId)
                .map((connection) => {
                    const to = nodes.find((node) => node.id === connection.toNodeId);
                    return `- ${to ? nodeLabel(to) : connection.toNodeId}（${relationLabel(current, to)}）`;
                });
            return [`当前节点：${nodeLabel(current)}`, `节点信息：${nodeDetail(current)}`, "上游节点：", ...(upstream.length ? upstream : ["- 无"]), "下游节点：", ...(downstream.length ? downstream : ["- 无"])].join("\n");
        })
        .join("\n\n");
}

function buildSuggestedActions(drafts: AssistantCanvasAction[], nodes: CanvasNodeData[], connections: CanvasConnection[], reason: string): AssistantCanvasSuggestionResult {
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

function requestedConfigMode(text: string): CanvasGenerationMode | null {
    if (/视频.*配置|配置.*视频|视频生成/.test(text)) return "video";
    if (/(图片|图像|生图).*(配置|生成)|配置.*(图片|图像|生图)/.test(text)) return "image";
    return null;
}

function requestedTextNodeContent(text: string) {
    if (!/文本节点|文字节点|便签|笔记/.test(text) || !/创建|新增|加一个|生成/.test(text)) return null;
    const content = text.match(/内容(?:是|为|：|:)\s*([\s\S]+)$/)?.[1] || text.match(/(?:写上|写入)\s*([\s\S]+)$/)?.[1] || "";
    return content.trim() || null;
}

function mentionsConnection(text: string) {
    return /连接|连线|连到|接到|连起来/.test(text);
}

function positionNearNode(nodes: CanvasNodeData[], nodeId?: string) {
    const node = nodes.find((item) => item.id === nodeId);
    return node ? { x: node.position.x + node.width + 96, y: node.position.y } : nextNodePosition(nodes);
}

export function resolveAssistantActionDecision({ message, nodes, connections, decision }: { message: AssistantActionMessage; nodes: CanvasNodeData[]; connections: CanvasConnection[]; decision: "apply" | "cancel" }) {
    if (decision === "cancel") {
        return { nodes, connections, message: { ...message, assistantActionStatus: "cancelled" as const }, applied: false };
    }

    if (message.assistantActionStatus !== "pending" || !message.assistantActions?.length) {
        return { nodes, connections, message, applied: false };
    }

    const result = applyAssistantCanvasActions({ nodes, connections, actions: message.assistantActions });
    const applied = result.nodes.length !== nodes.length || result.connections.length !== connections.length;
    return {
        ...result,
        message: applied ? { ...message, assistantActionStatus: "applied" as const, assistantActionAppliedAt: new Date().toISOString() } : message,
        applied,
    };
}

function validateNodeIds(payload: unknown, nodes: CanvasNodeData[], errors: string[]) {
    const ids = isRecord(payload) && Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
    if (!ids.length) errors.push("需要提供 nodeIds");
    ids.forEach((id) => {
        if (typeof id !== "string" || !nodes.some((node) => node.id === id)) errors.push(`节点不存在：${String(id)}`);
    });
}

function validateCreateText(payload: unknown, errors: string[]) {
    if (!isRecord(payload) || typeof payload.content !== "string" || !payload.content.trim()) errors.push("创建文本节点需要 content");
}

function validateCreateConfig(payload: unknown, errors: string[]) {
    if (!isRecord(payload) || !["text", "image", "video"].includes(String(payload.mode))) errors.push("创建配置节点需要合法 mode");
    const config = isRecord(payload) && isRecord(payload.config) ? payload.config : {};
    if (Object.keys(config).some((key) => aiTriggerFields.includes(key))) errors.push("配置节点不能携带自动生成任务字段");
    if (config.status === "loading" || config.status === "success" || config.content) errors.push("配置节点不能伪造生成结果或自动生成状态");
}

function validateCreateConnection(payload: unknown, nodes: CanvasNodeData[], connections: CanvasConnection[], errors: string[]) {
    if (!isRecord(payload)) {
        errors.push("创建连线需要 payload");
        return;
    }
    const fromNodeId = String(payload.fromNodeId || "");
    const toNodeId = String(payload.toNodeId || "");
    if (!nodes.some((node) => node.id === fromNodeId)) errors.push(`起点节点不存在：${fromNodeId}`);
    if (!nodes.some((node) => node.id === toNodeId)) errors.push(`终点节点不存在：${toNodeId}`);
    if (fromNodeId && toNodeId && fromNodeId === toNodeId) errors.push("不能连接同一个节点");
    if (connections.some((connection) => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId)) errors.push("不能重复创建已有连线");
}

function nextNodePosition(nodes: CanvasNodeData[]) {
    const right = nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), 0);
    return { x: right + 96, y: nodes[0]?.position.y || 0 };
}

function readActionSummary(action: AssistantCanvasReadAction) {
    if (action.type === "canvas.summarize") return "总结当前画布";
    if (action.type === "node.explain_context") return "解释选中节点上下游";
    return "读取当前画布";
}

function nodeLabel(node: CanvasNodeData) {
    return `${node.title || node.id}（${nodeTypeLabel(node.type)}，${node.id}）`;
}

function nodeDetail(node: CanvasNodeData) {
    const metadata = node.metadata || {};
    const prompt = truncateText(metadata.prompt || metadata.content || "", 60);
    return [`状态 ${statusLabel(metadata.status)}`, metadata.taskStatus ? `任务 ${metadata.taskStatus}` : "", prompt ? `提示词/内容：${prompt}` : ""].filter(Boolean).join("；");
}

function relationLabel(from?: CanvasNodeData, to?: CanvasNodeData) {
    if (!from || !to) return "普通连线";
    const metadata = to.metadata || {};
    if (metadata.relationType === "variant" || metadata.variantOfNodeId === from.id || (metadata.videoActionType === "variant" && metadata.sourceVideoNodeId === from.id)) return "变体";
    if (metadata.relationType === "continuation" || metadata.continuationOfNodeId === from.id || metadata.videoActionType === "continue") return "续写";
    if (metadata.relationType === "derivative" || ((metadata.videoActionType === "edit" || metadata.videoActionType === "extend") && metadata.sourceVideoNodeId === from.id)) return "派生";
    if (to.type === "config" || metadata.references?.includes(from.id) || metadata.referenceOrder?.some((item) => item.nodeId === from.id) || metadata.referenceRoles?.some((item) => item.nodeId === from.id)) return "参考";
    return "普通连线";
}

function nodeTypeLabel(type: CanvasNodeData["type"]) {
    return ({ image: "图片", text: "文本", config: "配置", video: "视频", audio: "音频" } as Record<string, string>)[type] || String(type);
}

function statusLabel(status?: CanvasNodeMetadata["status"]) {
    return ({ idle: "空闲", loading: "生成中", success: "成功", error: "失败" } as Record<string, string>)[status || "idle"] || "空闲";
}

function truncateText(text: string, max: number) {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function modeLabel(mode: CanvasGenerationMode) {
    if (mode === "video") return "视频";
    if (mode === "text") return "文本";
    return "图片";
}

function samePreview(a: AssistantCanvasActionPreview, b: AssistantCanvasActionPreview) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
