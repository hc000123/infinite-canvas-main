import assert from "node:assert/strict";
import test from "node:test";

import { buildShotGroupEpisodeReferenceCandidates, mergeShotGroupReferenceRefs, selectedEpisodeReferenceRefs, type ShotGroupEpisodeReferenceCandidate } from "./shot-group-episode-references.ts";
import type { AssetBreakdownItem } from "./asset-breakdown.ts";
import type { ImageBrief } from "./image-brief.ts";
import type { ShotGroup, StoryboardAssetRef, StoryboardTableShot } from "./storyboard-management.ts";

test("matches episode image need primary references inside the same project episode", () => {
    const candidates = buildShotGroupEpisodeReferenceCandidates({
        group: shotGroup({ prompt: "魏梁在大学操场毕业典礼上发言" }),
        shots: [tableShot({ assetNeeds: ["角色：魏梁", "场景：大学操场"], visualDescription: "魏梁站在大学操场主席台" })],
        imageNeeds: [
            imageNeed({ id: "need-character", kind: "character", name: "魏梁", sourceType: "agent_asset_extractor" }),
            imageNeed({ id: "need-scene", kind: "scene", name: "大学操场", sourceType: "manual" }),
            imageNeed({ id: "need-other-project", projectId: "project-other", kind: "character", name: "魏梁", sourceType: "manual" }),
            imageNeed({ id: "need-other-episode", episodeId: "episode-other", kind: "scene", name: "大学操场", sourceType: "manual" }),
        ],
        briefs: [
            brief({ id: "brief-character", sourceId: "need-character", resultAssetIds: ["asset-character-old"], primaryAssetId: "asset-character" }),
            brief({ id: "brief-scene", sourceId: "need-scene", resultAssetIds: ["asset-scene"] }),
            brief({ id: "brief-other-project", projectId: "project-other", sourceId: "need-other-project", resultAssetIds: ["asset-other-project"], primaryAssetId: "asset-other-project" }),
            brief({ id: "brief-other-episode", episodeId: "episode-other", sourceId: "need-other-episode", resultAssetIds: ["asset-other-episode"], primaryAssetId: "asset-other-episode" }),
        ],
        assets: [asset("asset-character", "角色主参考"), asset("asset-character-old", "角色旧结果"), asset("asset-scene", "场景结果"), asset("asset-other-project", "跨项目"), asset("asset-other-episode", "跨集")],
    });

    assert.deepEqual(
        candidates.map((candidate) => candidate.assetId),
        ["asset-character", "asset-scene"],
    );
    assert.equal(candidates[0].isPrimary, true);
    assert.equal(candidates[0].sourceType, "agent_asset_extractor");
    assert.equal(candidates[0].defaultSelected, true);
    assert.ok(candidates[0].matchReasons.some((reason) => reason.includes("名称命中")));
    assert.equal(candidates[1].sourceType, "manual");
});

test("does not select unclear sources or image needs without result assets", () => {
    const candidates = buildShotGroupEpisodeReferenceCandidates({
        group: shotGroup({ prompt: "魏梁拿着话筒" }),
        shots: [tableShot({ assetNeeds: ["道具：话筒"], visualDescription: "话筒特写" })],
        imageNeeds: [imageNeed({ id: "need-unknown", kind: "prop", name: "话筒" }), imageNeed({ id: "need-empty", kind: "prop", name: "奖杯", sourceType: "manual" })],
        briefs: [brief({ id: "brief-unknown", sourceId: "need-unknown", resultAssetIds: ["asset-prop"] }), brief({ id: "brief-empty", sourceId: "need-empty", resultAssetIds: [] })],
        assets: [asset("asset-prop", "话筒")],
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].sourceType, "unknown");
    assert.equal(candidates[0].sourceLabel, "来源待确认");
    assert.equal(candidates[0].defaultSelected, false);
});

test("merges manual and auto references with fixed asset versions and manual priority", () => {
    const manualRefs: StoryboardAssetRef[] = [{ assetId: "asset-character", kind: "image", role: "first_frame" }];
    const autoRefs = selectedEpisodeReferenceRefs([
        candidate({ assetId: "asset-character", defaultSelected: true }),
        candidate({ assetId: "asset-scene", defaultSelected: true, sourceType: "manual" }),
        candidate({ assetId: "asset-unknown", defaultSelected: false }),
    ]);
    const merged = mergeShotGroupReferenceRefs({
        manualRefs,
        autoRefs,
        assets: [asset("asset-character", "角色主参考", { assetVersionId: "ver-character", versionNumber: 3 }), asset("asset-scene", "场景参考", { assetVersionId: "ver-scene", versionNumber: 2 })],
    });

    assert.deepEqual(
        merged.map((ref) => ref.assetId),
        ["asset-character", "asset-scene"],
    );
    assert.equal(merged[0].role, "first_frame");
    assert.equal(merged[1].source, "manual");
    assert.equal(merged[1].assetVersion?.assetVersionId, "ver-scene");
    assert.equal(merged[1].assetVersion?.versionNumber, 2);
});

function candidate(patch: Partial<ShotGroupEpisodeReferenceCandidate>): ShotGroupEpisodeReferenceCandidate {
    return {
        assetId: "asset-character",
        assetTitle: "角色主参考",
        kind: "image",
        role: "episode_reference",
        sourceType: "agent_asset_extractor",
        sourceLabel: "Agent 提取",
        defaultSelected: true,
        isPrimary: true,
        matchReasons: ["名称命中：魏梁"],
        score: 100,
        ...patch,
    };
}

function imageNeed(patch: Partial<AssetBreakdownItem>): AssetBreakdownItem {
    return {
        id: "need-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        scriptId: "script-1",
        kind: "character",
        name: "魏梁",
        description: "主角",
        sourceText: "魏梁走上台",
        tags: [],
        assetIds: [],
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function brief(patch: Partial<ImageBrief>): ImageBrief {
    return {
        id: "brief-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        sourceType: "asset_breakdown",
        sourceId: "need-1",
        kind: "character",
        mode: "standard",
        title: "魏梁",
        scriptText: "",
        fields: {},
        referenceAssets: [],
        validationResult: { ok: true, severity: "none", messages: [] },
        prompt: "",
        finalPrompt: "",
        resultAssetIds: [],
        status: "generated",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function shotGroup(patch: Partial<ShotGroup>): ShotGroup {
    return {
        id: "sg-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "大学操场",
        shotIds: ["shot-1"],
        totalDuration: 8,
        prompt: "",
        effectivePrompt: "",
        assetRefs: [],
        audioRefs: [],
        status: "prompt_ready",
        resultAssetIds: [],
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function tableShot(patch: Partial<StoryboardTableShot>): StoryboardTableShot {
    return {
        id: "shot-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "大学操场",
        location: "大学操场",
        timeOfDay: "白天",
        order: 1,
        title: "镜头 1",
        scriptText: "魏梁发言",
        visualDescription: "",
        characters: [],
        dialogue: "",
        action: "",
        emotion: "",
        shotSize: "",
        cameraMovement: "",
        estimatedDuration: 5,
        assetNeeds: [],
        assetRefs: [],
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function asset(id: string, title: string, version?: { assetVersionId: string; versionNumber: number }) {
    return {
        id,
        kind: "image",
        title,
        coverUrl: `blob:${id}`,
        data: { dataUrl: `blob:${id}`, width: 100, height: 100, bytes: 10, mimeType: "image/png" },
        updatedAt: "2026-01-01T00:00:00.000Z",
        metadata: version
            ? {
                  currentAssetVersionId: version.assetVersionId,
                  assetVersions: [{ id: version.assetVersionId, versionNumber: version.versionNumber, kind: "image", title, data: {}, createdAt: "now", source: "manual_edit" }],
              }
            : undefined,
    };
}
