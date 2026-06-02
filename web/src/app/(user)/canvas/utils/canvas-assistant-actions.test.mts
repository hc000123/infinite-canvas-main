import assert from "node:assert/strict";
import test from "node:test";

import { applyAssistantCanvasActions, buildAssistantCanvasActionPreview, executeAssistantCanvasReadAction, parseAssistantCanvasActionSuggestion, resolveAssistantActionDecision, validateAssistantCanvasAction } from "./canvas-assistant-actions.ts";

const node = (id, type = "text") => ({
    id,
    type,
    title: id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 80,
    metadata: { content: "", status: "idle" },
});

const videoNode = (id, metadata = {}) => ({
    ...node(id, "video"),
    title: id,
    metadata: { prompt: "视频提示词", status: "success", ...metadata },
});

test("validates allowed read actions and rejects unsupported destructive actions", () => {
    const nodes = [node("a")];

    assert.equal(validateAssistantCanvasAction({ id: "r1", kind: "read", type: "canvas.summarize" }, nodes, []).ok, true);
    assert.equal(validateAssistantCanvasAction({ id: "r2", kind: "read", type: "node.explain_context", payload: { nodeIds: ["a"] } }, nodes, []).ok, true);
    assert.deepEqual(validateAssistantCanvasAction({ id: "bad", kind: "write", type: "node.delete", payload: { nodeId: "a" } }, nodes, []).ok, false);
});

test("validates connection create rules", () => {
    const nodes = [node("a"), node("b")];
    const connections = [{ id: "c1", fromNodeId: "a", toNodeId: "b" }];

    assert.equal(validateAssistantCanvasAction({ id: "same", kind: "write", type: "connection.create", payload: { fromNodeId: "a", toNodeId: "a" } }, nodes, []).ok, false);
    assert.equal(validateAssistantCanvasAction({ id: "missing", kind: "write", type: "connection.create", payload: { fromNodeId: "a", toNodeId: "x" } }, nodes, []).ok, false);
    assert.equal(validateAssistantCanvasAction({ id: "dup", kind: "write", type: "connection.create", payload: { fromNodeId: "a", toNodeId: "b" } }, nodes, connections).ok, false);
    assert.equal(validateAssistantCanvasAction({ id: "ok", kind: "write", type: "connection.create", payload: { fromNodeId: "b", toNodeId: "a" } }, nodes, connections).ok, true);
});

test("rejects config actions that would look like generated results or AI tasks", () => {
    const nodes = [node("a")];

    assert.equal(validateAssistantCanvasAction({ id: "loading", kind: "write", type: "node.create_config", payload: { mode: "video", config: { status: "loading" } } }, nodes, []).ok, false);
    assert.equal(validateAssistantCanvasAction({ id: "task", kind: "write", type: "node.create_config", payload: { mode: "video", config: { taskId: "task-1" } } }, nodes, []).ok, false);
});

test("builds text and config previews without mutating canvas state", () => {
    const nodes = [node("a")];
    const textAction = { id: "text-1", kind: "write", type: "node.create_text", payload: { content: "助手创建的文本", position: { x: 10, y: 20 } } };
    const configAction = { id: "config-1", kind: "write", type: "node.create_config", payload: { mode: "video", config: { model: "seedance" } } };

    const textPreview = buildAssistantCanvasActionPreview(textAction, nodes, []);
    const configPreview = buildAssistantCanvasActionPreview(configAction, nodes, []);

    assert.deepEqual(textPreview.affectedNodeIds, []);
    assert.equal(textPreview.createdNodes?.[0].type, "text");
    assert.equal(textPreview.createdNodes?.[0].metadata?.content, "助手创建的文本");
    assert.equal(configPreview.createdNodes?.[0].type, "config");
    assert.equal(configPreview.createdNodes?.[0].metadata?.generationMode, "video");
    assert.equal(nodes.length, 1);
});

test("builds connection preview with affected nodes and created connection", () => {
    const nodes = [node("a"), node("b")];
    const action = { id: "conn-1", kind: "write", type: "connection.create", payload: { fromNodeId: "a", toNodeId: "b" } };

    const preview = buildAssistantCanvasActionPreview(action, nodes, []);

    assert.deepEqual(preview.affectedNodeIds, ["a", "b"]);
    assert.deepEqual(preview.affectedConnectionIds, []);
    assert.deepEqual(preview.createdConnections, [{ id: "assistant-connection-conn-1", fromNodeId: "a", toNodeId: "b" }]);
});

test("applies only valid write actions with matching previews", () => {
    const nodes = [node("a"), node("b")];
    const textAction = { id: "text-2", kind: "write", type: "node.create_text", payload: { content: "新增文本" } };
    const connectionAction = { id: "conn-2", kind: "write", type: "connection.create", payload: { fromNodeId: "a", toNodeId: "b" } };
    const actions = [
        { ...textAction, preview: buildAssistantCanvasActionPreview(textAction, nodes, []) },
        { ...connectionAction, preview: buildAssistantCanvasActionPreview(connectionAction, nodes, []) },
        { id: "read", kind: "read", type: "canvas.summarize" },
        { id: "bad-preview", kind: "write", type: "node.create_text", payload: { content: "不会应用" }, preview: { summary: "bad", affectedNodeIds: [], affectedConnectionIds: [] } },
    ];

    const result = applyAssistantCanvasActions({ nodes, connections: [], actions });

    assert.equal(result.nodes.length, 3);
    assert.equal(result.connections.length, 1);
    assert.equal(result.nodes.find((item) => item.id === "assistant-node-text-2")?.metadata?.content, "新增文本");
    assert.equal(nodes.length, 2);
});

test("summarizes the current canvas with node types, prompts, statuses, and connections", () => {
    const nodes = [node("text-1", "text"), videoNode("video-1", { taskStatus: "succeeded" }), node("config-1", "config")];
    const connections = [
        { id: "c1", fromNodeId: "text-1", toNodeId: "config-1" },
        { id: "c2", fromNodeId: "config-1", toNodeId: "video-1" },
    ];

    const result = executeAssistantCanvasReadAction({ id: "summary", kind: "read", type: "canvas.summarize" }, nodes, connections);

    assert.match(result.text, /当前画布共有 3 个节点、2 条连线/);
    assert.match(result.text, /文本 1 个/);
    assert.match(result.text, /视频 1 个/);
    assert.match(result.text, /video-1/);
    assert.match(result.text, /视频提示词/);
    assert.match(result.text, /config-1 -> video-1/);
});

test("explains selected node upstream and downstream context with relation labels", () => {
    const nodes = [
        videoNode("source-video"),
        videoNode("variant-video", { relationType: "variant", variantOfNodeId: "source-video", sourceVideoNodeId: "source-video" }),
        videoNode("next-video", { relationType: "continuation", continuationOfNodeId: "variant-video" }),
        videoNode("edit-video", { relationType: "derivative", sourceVideoNodeId: "variant-video" }),
    ];
    const connections = [
        { id: "c1", fromNodeId: "source-video", toNodeId: "variant-video" },
        { id: "c2", fromNodeId: "variant-video", toNodeId: "next-video" },
        { id: "c3", fromNodeId: "variant-video", toNodeId: "edit-video" },
    ];

    const result = executeAssistantCanvasReadAction({ id: "ctx", kind: "read", type: "node.explain_context", payload: { nodeIds: ["variant-video"] } }, nodes, connections);

    assert.match(result.text, /当前节点：variant-video/);
    assert.match(result.text, /上游节点/);
    assert.match(result.text, /source-video/);
    assert.match(result.text, /变体/);
    assert.match(result.text, /下游节点/);
    assert.match(result.text, /next-video/);
    assert.match(result.text, /续写/);
    assert.match(result.text, /edit-video/);
    assert.match(result.text, /派生/);
});

test("read-only actions do not change canvas nodes or connections", () => {
    const nodes = [node("a"), node("b")];
    const connections = [{ id: "c1", fromNodeId: "a", toNodeId: "b" }];
    const result = applyAssistantCanvasActions({ nodes, connections, actions: [{ id: "read", kind: "read", type: "canvas.summarize" }] });

    assert.deepEqual(result.nodes, nodes);
    assert.deepEqual(result.connections, connections);
});

test("parses request to create a video config node", () => {
    const result = parseAssistantCanvasActionSuggestion({ text: "帮我创建一个视频配置节点", nodes: [], connections: [], selectedNodeIds: [], idPrefix: "video-config" });

    assert.equal(result?.actions.length, 1);
    assert.equal(result?.actions[0].type, "node.create_config");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.mode : "", "video");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].preview?.createdNodes?.[0].metadata?.generationMode : "", "video");
});

test("parses request to connect the selected image to a new video config node", () => {
    const nodes = [node("image-1", "image")];
    const result = parseAssistantCanvasActionSuggestion({ text: "把选中的图片连到视频配置", nodes, connections: [], selectedNodeIds: ["image-1"], idPrefix: "image-video" });

    assert.equal(result?.actions.length, 2);
    assert.equal(result?.actions[0].type, "node.create_config");
    assert.equal(result?.actions[1].type, "connection.create");
    assert.equal(result?.actions[1].kind === "write" ? result.actions[1].payload.fromNodeId : "", "image-1");
    assert.equal(result?.actions[1].kind === "write" ? result.actions[1].payload.toNodeId : "", "assistant-node-image-video-config");
});

test("parses request to create a text node with content", () => {
    const result = parseAssistantCanvasActionSuggestion({ text: "创建一个文本节点，内容是今天先整理分镜", nodes: [], connections: [], selectedNodeIds: [], idPrefix: "text-node" });

    assert.equal(result?.actions.length, 1);
    assert.equal(result?.actions[0].type, "node.create_text");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.content : "", "今天先整理分镜");
});

test("returns no write action when user input cannot be parsed as a controlled action", () => {
    const result = parseAssistantCanvasActionSuggestion({ text: "你觉得这个故事怎么样", nodes: [node("a")], connections: [], selectedNodeIds: ["a"], idPrefix: "chat" });

    assert.equal(result, null);
});

test("cancels an assistant action without changing canvas state", () => {
    const nodes = [node("a")];
    const message = { id: "m1", role: "assistant", mode: "ask", text: "预览", assistantActionStatus: "pending" };

    const result = resolveAssistantActionDecision({ message, nodes, connections: [], decision: "cancel" });

    assert.equal(result.applied, false);
    assert.equal(result.nodes, nodes);
    assert.equal(result.connections.length, 0);
    assert.equal(result.message.assistantActionStatus, "cancelled");
});

test("applies a confirmed assistant action and returns changed canvas state", () => {
    const nodes = [node("a"), node("b")];
    const textAction = { id: "text-3", kind: "write", type: "node.create_text", reason: "验证确认应用", payload: { content: "确认后新增" } };
    const connectionAction = { id: "conn-3", kind: "write", type: "connection.create", reason: "连接已有节点", payload: { fromNodeId: "a", toNodeId: "b" } };
    const message = {
        id: "m2",
        role: "assistant",
        mode: "ask",
        text: "预览",
        assistantActionStatus: "pending",
        assistantActions: [
            { ...textAction, preview: buildAssistantCanvasActionPreview(textAction, nodes, []) },
            { ...connectionAction, preview: buildAssistantCanvasActionPreview(connectionAction, nodes, []) },
        ],
    };

    const result = resolveAssistantActionDecision({ message, nodes, connections: [], decision: "apply" });

    assert.equal(result.applied, true);
    assert.equal(result.nodes.length, 3);
    assert.equal(result.connections.length, 1);
    assert.equal(result.message.assistantActionStatus, "applied");
    assert.equal(nodes.length, 2);
});
