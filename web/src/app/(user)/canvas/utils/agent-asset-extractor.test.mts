import assert from "node:assert/strict";
import test from "node:test";

import { approveAgentRun, createAgentRunRecord, markAgentRunApplied, normalizeAgentDraftOutput, rejectAgentRun } from "../../projects/agent-runner.ts";
import { defaultAgentConfig } from "../../projects/agent-settings.ts";
import { mergeAssetBreakdownItems } from "./asset-breakdown.ts";
import { assetBreakdownKindFromAgentDraft, buildAssetBreakdownInputsFromAgentRun, buildAssetExtractorRunInput, buildLocalAssetExtractorDraftOutput, canRunAssetExtractor, shouldAllowAssetExtractorRun } from "./agent-asset-extractor.ts";

const canvas = {
    id: "canvas-1",
    title: "第一集画布",
    episodeId: "episode-1",
    episodeTitle: "第一集",
    scriptId: "script-1",
    scriptSnapshot: "白天，图片 1魏梁穿学士袍走向大学操场毕业典礼现场。道具：话筒。她神情坚定，风吹起衣摆。",
};

test("blocks asset extraction when there is no script", () => {
    assert.equal(canRunAssetExtractor({ id: "canvas-1", title: "自由画布" }).canRun, false);
    assert.match(canRunAssetExtractor({ ...canvas, scriptSnapshot: "" }).reason, /剧本/);
    assert.equal(canRunAssetExtractor(canvas).canRun, true);
});

test("disabled asset extractor config cannot create a run", () => {
    const disabled = { ...defaultAgentConfig("asset_extractor"), enabled: false };
    assert.equal(shouldAllowAssetExtractorRun(disabled).allowed, false);
    assert.throws(
        () =>
            createAgentRunRecord({
                config: disabled,
                input: buildAssetExtractorRunInput({ projectId: "project-1", canvas }),
                id: "run-disabled",
                now: "now",
            }),
        /Agent 已禁用/,
    );
});

test("creates run input and records asset extractor config identity", () => {
    const config = { ...defaultAgentConfig("asset_extractor"), id: "project-asset-agent", version: "asset-v1" };
    const input = buildAssetExtractorRunInput({ projectId: "project-1", canvas });
    const output = buildLocalAssetExtractorDraftOutput({ projectId: "project-1", canvas });
    const run = createAgentRunRecord({ config, input, id: "run-1", now: "now", draftOutput: output });
    assert.equal(run.agentKind, "asset_extractor");
    assert.equal(run.agentConfigId, "project-asset-agent");
    assert.equal(run.agentConfigVersion, "asset-v1");
    assert.equal(run.input.projectId, "project-1");
    assert.equal(run.input.canvasId, "canvas-1");
    assert.equal(run.input.episodeId, "episode-1");
    assert.equal(run.input.sourceType, "episode_script");
    assert.ok(run.draftOutput.items.length >= 4);
});

test("local rule draft normalizes to AgentDraftOutput", () => {
    const output = buildLocalAssetExtractorDraftOutput({ projectId: "project-1", canvas });
    const normalized = normalizeAgentDraftOutput({ summary: output.summary, assets: output.items, warnings: output.warnings, schemaVersion: output.schemaVersion });
    assert.equal(normalized.schemaVersion, "asset-extractor.v1");
    assert.ok(normalized.items.some((item) => (item as { kind?: string }).kind === "character"));
    assert.ok(normalized.items.some((item) => (item as { kind?: string }).kind === "scene"));
    assert.ok(normalized.items.some((item) => (item as { kind?: string }).kind === "prop"));
});

test("unapproved or rejected runs cannot write asset breakdown inputs", () => {
    const run = createAgentRunRecord({
        config: defaultAgentConfig("asset_extractor"),
        input: buildAssetExtractorRunInput({ projectId: "project-1", canvas }),
        id: "run-2",
        now: "now",
        draftOutput: buildLocalAssetExtractorDraftOutput({ projectId: "project-1", canvas }),
    });
    assert.throws(() => buildAssetBreakdownInputsFromAgentRun(run, { projectId: "project-1", canvas }), /必须先批准/);
    assert.throws(() => buildAssetBreakdownInputsFromAgentRun(rejectAgentRun(run, "later"), { projectId: "project-1", canvas }), /必须先批准/);
});

test("approved run converts asset drafts into traceable asset breakdown needs", () => {
    const run = approveAgentRun(
        createAgentRunRecord({
            config: { ...defaultAgentConfig("asset_extractor"), id: "config-1", version: "v1" },
            input: buildAssetExtractorRunInput({ projectId: "project-1", canvas }),
            id: "run-3",
            now: "now",
            draftOutput: buildLocalAssetExtractorDraftOutput({ projectId: "project-1", canvas }),
        }),
        "approved",
    );
    const inputs = buildAssetBreakdownInputsFromAgentRun(run, { projectId: "project-1", canvas });
    assert.ok(inputs.some((item) => item.name === "魏梁" && item.kind === "character"));
    assert.ok(inputs.some((item) => item.name === "话筒" && item.kind === "prop"));
    assert.ok(inputs.some((item) => item.agentAssetKind === "mood" && item.kind === "style"));
    assert.ok(inputs.every((item) => item.agentRunId === "run-3"));
    assert.ok(inputs.every((item) => item.sourceType === "agent_asset_extractor"));
    assert.ok(inputs.every((item) => item.agentConfigId === "config-1" && item.agentConfigVersion === "v1"));
    assert.equal(markAgentRunApplied(run, "applied").status, "applied");
});

test("duplicate agent assets merge into existing asset breakdown needs", () => {
    const run = approveAgentRun(
        createAgentRunRecord({
            config: defaultAgentConfig("asset_extractor"),
            input: buildAssetExtractorRunInput({ projectId: "project-1", canvas }),
            id: "run-4",
            now: "now",
            draftOutput: {
                summary: "重复角色",
                items: [
                    { id: "a", kind: "character", name: "魏梁", description: "第一处", scriptEvidence: "证据 1", importance: "high", suggestedBriefKind: "character", tags: ["角色"], warnings: [] },
                    { id: "b", kind: "character", name: "魏梁", description: "第二处", scriptEvidence: "证据 2", importance: "medium", suggestedBriefKind: "character", tags: ["主角"], warnings: ["需要参考图"] },
                ],
            },
        }),
        "approved",
    );
    const inputs = buildAssetBreakdownInputsFromAgentRun(run, { projectId: "project-1", canvas });
    const merged = mergeAssetBreakdownItems(inputs.map((input, index) => ({ ...input, id: `item-${index}`, createdAt: "now", updatedAt: "now" })));
    assert.equal(merged.length, 1);
    assert.match(merged[0].description, /第一处/);
    assert.match(merged[0].description, /第二处/);
    assert.deepEqual(merged[0].tags, ["角色", "高优先级", "主角", "中优先级"]);
    assert.deepEqual(merged[0].warnings, ["需要参考图"]);
});

test("maps extended draft kinds onto existing brief needs", () => {
    assert.equal(assetBreakdownKindFromAgentDraft("costume"), "character");
    assert.equal(assetBreakdownKindFromAgentDraft("makeup"), "character");
    assert.equal(assetBreakdownKindFromAgentDraft("mood"), "style");
    assert.equal(assetBreakdownKindFromAgentDraft("effect"), "style");
});
