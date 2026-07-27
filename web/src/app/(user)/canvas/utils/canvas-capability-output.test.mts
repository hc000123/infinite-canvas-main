import assert from "node:assert/strict";
import test from "node:test";

import type { ArtifactEnvelope } from "../../../../services/api/invocations-contract.ts";
import type { CanvasNodeData } from "../types.ts";
import { canvasCapabilitySourceText, planCanvasCapabilityOutput } from "./canvas-capability-output.ts";

const sourceNode: CanvasNodeData = {
    id: "source-node",
    type: "text" as CanvasNodeData["type"],
    title: "原始剧本",
    position: { x: 100, y: 80 },
    width: 320,
    height: 180,
    metadata: { content: "公交站剧本" },
};

const artifact = (id: string, artifactType: string, payload: Record<string, unknown>): ArtifactEnvelope => ({
    artifact: {
        id,
        userId: "user-1",
        artifactType,
        schemaId: `schema-${artifactType}`,
        schemaVersion: "1.0.0",
        schemaContentHash: `schema-hash-${artifactType}`,
        projectId: "project-1",
        episodeId: "episode-1",
        contentHash: `hash-${id}`,
        createdAt: "2026-07-26T00:00:00Z",
    },
    parentArtifactIds: ["source-artifact"],
    payload,
    extensions: {},
});

test("writes every approved Artifact as a traceable downstream canvas node", () => {
    const result = planCanvasCapabilityOutput({
        nodes: [sourceNode],
        connections: [],
        sourceNode,
        artifacts: [
            artifact("artifact-script", "production_script", { productionScript: "优化后的生产剧本" }),
            artifact("artifact-brief", "asset_brief", { assetId: "lin-qiu", brief: "林秋角色生图提示词" }),
        ],
        trace: {
            invocationId: "invocation-1",
            artifactIds: ["artifact-script", "artifact-brief"],
            skillVersionId: "skill-version-1",
            appliedAt: "2026-07-26T01:00:00Z",
        },
        nodeId: (item) => `node-${item.artifact.id}`,
        connectionId: (item) => `connection-${item.artifact.id}`,
    });

    assert.equal(result.nodes.length, 3);
    assert.deepEqual(result.createdNodeIds, ["node-artifact-script", "node-artifact-brief"]);
    assert.deepEqual(
        result.nodes.slice(1).map((node) => ({ title: node.title, content: node.metadata?.content, position: node.position, capabilityArtifact: node.metadata?.capabilityArtifact })),
        [
            {
                title: "Skill · production_script",
                content: "优化后的生产剧本",
                position: { x: 500, y: 80 },
                capabilityArtifact: {
                    source: "canvas_chat",
                    sourceNodeId: "source-node",
                    invocationId: "invocation-1",
                    artifactId: "artifact-script",
                    artifactType: "production_script",
                    artifactHash: "hash-artifact-script",
                    artifactIds: ["artifact-script", "artifact-brief"],
                    skillVersionId: "skill-version-1",
                    appliedAt: "2026-07-26T01:00:00Z",
                },
            },
            {
                title: "Skill · asset_brief",
                content: "林秋角色生图提示词",
                position: { x: 500, y: 284 },
                capabilityArtifact: {
                    source: "canvas_chat",
                    sourceNodeId: "source-node",
                    invocationId: "invocation-1",
                    artifactId: "artifact-brief",
                    artifactType: "asset_brief",
                    artifactHash: "hash-artifact-brief",
                    artifactIds: ["artifact-script", "artifact-brief"],
                    skillVersionId: "skill-version-1",
                    appliedAt: "2026-07-26T01:00:00Z",
                },
            },
        ],
    );
    assert.deepEqual(result.connections, [
        { id: "connection-artifact-script", fromNodeId: "source-node", toNodeId: "node-artifact-script" },
        { id: "connection-artifact-brief", fromNodeId: "source-node", toNodeId: "node-artifact-brief" },
    ]);
});

test("replaying the same Invocation Artifact set does not duplicate canvas nodes", () => {
    const output = artifact("artifact-script", "production_script", { productionScript: "优化后的生产剧本" });
    const input = {
        nodes: [sourceNode],
        connections: [],
        sourceNode,
        artifacts: [output],
        trace: {
            invocationId: "invocation-1",
            artifactIds: ["artifact-script"],
            skillVersionId: "skill-version-1",
            appliedAt: "2026-07-26T01:00:00Z",
        },
        nodeId: () => "node-artifact-script",
        connectionId: () => "connection-artifact-script",
    };
    const first = planCanvasCapabilityOutput(input);
    const replay = planCanvasCapabilityOutput({ ...input, nodes: first.nodes, connections: first.connections });

    assert.equal(replay.nodes.length, first.nodes.length);
    assert.equal(replay.connections.length, first.connections.length);
    assert.deepEqual(replay.createdNodeIds, []);
});

test("uses semantic node text without treating media URLs as Skill input", () => {
    assert.equal(canvasCapabilitySourceText(sourceNode), "公交站剧本");
    assert.equal(canvasCapabilitySourceText({ ...sourceNode, type: "config" as CanvasNodeData["type"], metadata: { content: "旧值", prompt: "镜头提示词" } }), "镜头提示词");
    assert.equal(canvasCapabilitySourceText({ ...sourceNode, type: "image" as CanvasNodeData["type"], metadata: { content: "blob:image", prompt: "角色参考图" } }), "角色参考图");
    assert.equal(canvasCapabilitySourceText({ ...sourceNode, type: "video" as CanvasNodeData["type"], metadata: { content: "https://example.invalid/video.mp4" } }), "");
});
