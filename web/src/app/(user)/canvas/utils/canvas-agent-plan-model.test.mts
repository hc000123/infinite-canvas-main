import assert from "node:assert/strict";
import test from "node:test";

import type { AgentSkillRef } from "../../../../services/api/agent-registry.ts";
import {
    activeAgentPlanInvocationId,
    buildCanvasAgentApplyInput,
    buildCanvasAgentPlanRequest,
    buildCanvasAgentSourceText,
    cloneCanvasAgentSkillRefs,
    finalAgentPlanOutputRefs,
} from "./canvas-agent-plan-model.ts";

const skillRefs: AgentSkillRef[] = [
    {
        stepKey: "script",
        label: "剧本整理",
        capability: "script.optimize",
        skillId: "skill-script",
        skillVersionId: "skill-version-script",
        skillVersionConstraint: "",
        required: true,
        inputBindings: [{ bindingName: "source_text" }],
        parameters: { temperature: 0.2 },
        expectedOutputType: "production_script",
    },
];

test("builds one source_text from the user goal and semantic selected-node context", () => {
    assert.equal(
        buildCanvasAgentSourceText("整理成生产稿", [
            { id: "text-1", type: "text" as never, title: "原始剧本", text: "公交站剧本" },
            { id: "image-1", type: "image" as never, title: "角色图", dataUrl: "data:image/png;base64,secret" },
        ]),
        "用户目标：整理成生产稿\n\n画布引用：\n[原始剧本]\n公交站剧本",
    );
});

test("builds a stable canvas message Apply receipt for the final Invocation", () => {
    assert.deepEqual(
        buildCanvasAgentApplyInput({ invocationId: "invocation-final", attempt: 2, artifactSetHash: "set-hash", sourceMessageId: "message-1", artifactIds: ["artifact-1", "artifact-2"] }),
        {
            idempotencyKey: "client-local-agent-invocation-final-2",
            attempt: 2,
            artifactSetHash: "set-hash",
            target: "client_local_receipt",
            targetId: "message-1",
            payload: { surface: "canvas", targetKind: "message", targetId: "message-1", artifactIds: ["artifact-1", "artifact-2"] },
        },
    );
});

test("builds a mutation-safe Agent Plan request", () => {
    const refs = cloneCanvasAgentSkillRefs(skillRefs);
    const request = buildCanvasAgentPlanRequest({
        projectId: "project-1",
        episodeId: "episode-1",
        agentId: "agent-1",
        agentVersionId: "agent-version-1",
        goal: " 整理剧本 ",
        sourceArtifact: { artifactId: "artifact-source", contentHash: "source-hash" },
        sourceBindingName: "source_text",
        skillRefs: refs,
        idempotencyKey: "plan-key",
    });
    refs[0].parameters.temperature = 9;
    refs[0].inputBindings[0].bindingName = "changed";

    assert.equal(request.goal, "整理剧本");
    assert.equal(request.skillOverrides?.[0].parameters.temperature, 0.2);
    assert.equal(request.skillOverrides?.[0].inputBindings[0].bindingName, "source_text");
    assert.deepEqual(request.sourceArtifactRefs, [{ bindingName: "source_text", artifactId: "artifact-source", contentHash: "source-hash" }]);
});

test("resolves the active Invocation and final ordered Artifact refs from plan detail", () => {
    const detail = {
        plan: { status: "needs_review" },
        steps: [
            { step: { ordinal: 1, invocationId: "invocation-1", status: "completed" }, outputArtifactRefs: [{ bindingName: "production_script", artifactId: "artifact-1", contentHash: "hash-1" }] },
            { step: { ordinal: 2, invocationId: "invocation-2", status: "needs_review" }, outputArtifactRefs: [{ bindingName: "asset_catalog", artifactId: "artifact-2", contentHash: "hash-2" }] },
        ],
    } as never;

    assert.equal(activeAgentPlanInvocationId(detail), "invocation-2");
    assert.deepEqual(finalAgentPlanOutputRefs(detail), [{ bindingName: "asset_catalog", artifactId: "artifact-2", contentHash: "hash-2" }]);
});
