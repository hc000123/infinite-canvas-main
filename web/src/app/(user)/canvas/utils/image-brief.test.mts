import assert from "node:assert/strict";
import test from "node:test";

import {
    buildImageBriefFromAssetBreakdown,
    buildImageBriefFromProductionBible,
    buildImageBriefFromShotGroup,
    buildImageBriefGenerationMetadata,
    buildImageBriefImageConfigNode,
    buildImageBriefPrompt,
    buildImageBriefResultPatch,
    buildImageBriefResultSummaries,
    buildImageBriefPrimaryAssetPatch,
    buildImageBriefPrimaryAssetBreakdownPatch,
    buildProductionBibleBriefPrimaryAssetRefs,
    buildProductionBibleBriefAssetRefs,
    defaultImageBriefFields,
    imageBriefGenerationGate,
    imageBriefKindFromAssetBreakdownItem,
    mergeImageBriefResultAssetIds,
    validateImageBrief,
    type ImageBrief,
} from "./image-brief.ts";
import type { AssetBreakdownItem } from "./asset-breakdown.ts";
import type { ProductionBibleItem } from "./production-bible.ts";
import type { ShotGroup, StoryboardTableShot } from "./storyboard-management.ts";

test("builds default fields for scene character prop and mood briefs", () => {
    assert.deepEqual(Object.keys(defaultImageBriefFields("scene")), ["location", "timeOfDay", "atmosphere", "composition", "lighting"]);
    assert.deepEqual(Object.keys(defaultImageBriefFields("character")), ["appearance", "costume", "expression", "pose", "consistency"]);
    assert.deepEqual(Object.keys(defaultImageBriefFields("prop")), ["material", "shape", "scale", "usage", "details"]);
    assert.deepEqual(Object.keys(defaultImageBriefFields("mood")), ["mood", "palette", "lighting", "texture", "reference"]);
});

test("validates standard reminder and free brief modes", () => {
    const standard = brief({ mode: "standard", fields: { location: "操场" } });
    assert.equal(validateImageBrief(standard).ok, false);
    assert.equal(validateImageBrief(standard).severity, "error");

    const reminder = brief({ mode: "reminder", fields: { location: "操场" } });
    assert.equal(validateImageBrief(reminder).ok, true);
    assert.equal(validateImageBrief(reminder).severity, "warning");

    const free = brief({ mode: "free", fields: {} });
    assert.equal(validateImageBrief(free).ok, true);
    assert.equal(validateImageBrief(free).messages.length, 0);
});

test("builds final prompt for scene character prop and mood briefs", () => {
    assert.match(buildImageBriefPrompt(brief({ kind: "scene", title: "大学操场", fields: { location: "大学操场", lighting: "白天自然光" } })), /场景图/);
    assert.match(buildImageBriefPrompt(brief({ kind: "character", title: "魏梁", fields: { appearance: "年轻女性", costume: "学士袍" } })), /角色图/);
    assert.match(buildImageBriefPrompt(brief({ kind: "prop", title: "话筒", fields: { material: "黑色金属", usage: "毕业致辞" } })), /道具图/);
    assert.match(buildImageBriefPrompt(brief({ kind: "mood", title: "毕业典礼氛围", fields: { mood: "克制温暖", palette: "清透日光" } })), /氛围参考图/);
});

test("creates a brief from asset breakdown item", () => {
    const result = buildImageBriefFromAssetBreakdown(
        assetBreakdown({
            agentRunId: "run-1",
            agentConfigId: "asset-extractor",
            agentConfigVersion: "3",
            suggestedBriefKind: "character",
            warnings: ["保持一致性"],
        }),
        "brief-1",
        "now",
    );
    assert.equal(result.id, "brief-1");
    assert.equal(result.sourceType, "asset_breakdown");
    assert.equal(result.sourceId, "asset-breakdown-1");
    assert.equal(result.kind, "character");
    assert.equal(result.episodeId, "episode-1");
    assert.equal(result.fields.description, "学士袍造型");
    assert.equal(result.metadata?.agentRunId, "run-1");
    assert.equal(result.metadata?.agentConfigId, "asset-extractor");
    assert.equal(result.metadata?.agentConfigVersion, "3");
    assert.deepEqual(result.metadata?.warnings, ["保持一致性"]);
    assert.match(result.prompt, /魏梁/);
});

test("maps asset need kinds to image brief kinds", () => {
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "character" })), "character");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "scene" })), "scene");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "prop" })), "prop");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "style" })), "mood");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "character", agentAssetKind: "costume" })), "character");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "character", agentAssetKind: "makeup" })), "character");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "style", agentAssetKind: "effect" })), "mood");
    assert.equal(imageBriefKindFromAssetBreakdownItem(assetBreakdown({ kind: "style", suggestedBriefKind: "prop" })), "prop");
});

test("creates a brief from production bible item", () => {
    const result = buildImageBriefFromProductionBible(productionBible(), { canvasId: "canvas-1", episodeId: "episode-1", episodeTitle: "第一集" }, "brief-1", "now");
    assert.equal(result.sourceType, "production_bible");
    assert.equal(result.sourceId, "bible-1");
    assert.equal(result.kind, "scene");
    assert.equal(result.fields.consistency, "保持操场横幅一致");
});

test("creates a mood brief from shot group", () => {
    const result = buildImageBriefFromShotGroup(shotGroup(), [tableShot("shot-1"), tableShot("shot-2")], "brief-1", "now");
    assert.equal(result.kind, "mood");
    assert.equal(result.sourceType, "storyboard");
    assert.equal(result.sourceId, "shot-group-1");
    assert.equal(result.metadata?.shotGroupId, "shot-group-1");
    assert.deepEqual(result.metadata?.shotIds, ["shot-1", "shot-2"]);
    assert.match(result.scriptText, /魏梁上台/);
});

test("builds image generation metadata from a brief", () => {
    const result = buildImageBriefGenerationMetadata(
        brief({
            id: "brief-1",
            kind: "character",
            mode: "reminder",
            sourceType: "asset_breakdown",
            sourceId: "asset-breakdown-1",
            episodeId: "episode-1",
            episodeTitle: "第一集",
            finalPrompt: "最终提示词",
            referenceAssets: [{ assetId: "asset-1", role: "reference" }],
            metadata: {
                assetBreakdownItemId: "asset-breakdown-1",
                agentRunId: "run-1",
                agentConfigId: "asset-extractor",
                agentConfigVersion: "3",
                shotGroupId: "shot-group-1",
                shotIds: ["shot-1"],
            },
        }),
    );
    assert.equal(result.briefId, "brief-1");
    assert.equal(result.briefKind, "character");
    assert.equal(result.briefMode, "reminder");
    assert.equal(result.finalPrompt, "最终提示词");
    assert.equal(result.sourceType, "asset_breakdown");
    assert.equal(result.episodeId, "episode-1");
    assert.equal(result.assetBreakdownItemId, "asset-breakdown-1");
    assert.equal(result.agentRunId, "run-1");
    assert.equal(result.agentConfigId, "asset-extractor");
    assert.equal(result.agentConfigVersion, "3");
    assert.equal(result.shotGroupId, "shot-group-1");
    assert.deepEqual(result.shotIds, ["shot-1"]);
});

test("builds image config node from a brief", () => {
    const node = buildImageBriefImageConfigNode({
        brief: brief({ id: "brief-1", finalPrompt: "最终提示词", metadata: { productionBibleItemId: "bible-1" } }),
        config: { model: "gpt-image", imageModel: "image-special", size: "16:9" } as never,
        position: { x: 10, y: 20 },
        id: "config-1",
    });
    assert.equal(node.id, "config-1");
    assert.equal(node.type, "config");
    assert.equal(node.metadata?.generationMode, "image");
    assert.equal(node.metadata?.prompt, "最终提示词");
    assert.equal(node.metadata?.model, "image-special");
    assert.equal(node.metadata?.briefId, "brief-1");
    assert.equal(node.metadata?.productionBibleItemId, "bible-1");
});

test("builds image config node with asset need trace metadata", () => {
    const node = buildImageBriefImageConfigNode({
        brief: brief({
            id: "brief-1",
            sourceType: "asset_breakdown",
            sourceId: "asset-breakdown-1",
            episodeId: "episode-1",
            episodeTitle: "第一集",
            finalPrompt: "最终提示词",
            metadata: { assetBreakdownItemId: "asset-breakdown-1", agentRunId: "run-1", agentConfigId: "asset-extractor", agentConfigVersion: "3" },
        }),
        config: { model: "gpt-image", imageModel: "image-special", size: "16:9" } as never,
        position: { x: 10, y: 20 },
        id: "config-1",
    });
    assert.equal(node.metadata?.briefId, "brief-1");
    assert.equal(node.metadata?.assetBreakdownItemId, "asset-breakdown-1");
    assert.equal(node.metadata?.agentRunId, "run-1");
    assert.equal(node.metadata?.agentConfigId, "asset-extractor");
    assert.equal(node.metadata?.agentConfigVersion, "3");
    assert.equal(node.metadata?.episodeId, "episode-1");
    assert.equal(node.metadata?.episodeTitle, "第一集");
    assert.equal(node.metadata?.sourceType, "asset_breakdown");
    assert.equal(node.metadata?.finalPrompt, "最终提示词");
});

test("gates brief generation by validation mode", () => {
    const invalid = brief({ mode: "standard", validationResult: { ok: false, severity: "error", messages: ["缺少光影"] } });
    assert.equal(imageBriefGenerationGate(invalid).allowed, false);

    const warning = brief({ mode: "reminder", validationResult: { ok: true, severity: "warning", messages: ["缺少光影"] } });
    assert.equal(imageBriefGenerationGate(warning).allowed, true);
    assert.equal(imageBriefGenerationGate(warning).needsConfirmation, true);

    const free = brief({ mode: "free", validationResult: { ok: true, severity: "none", messages: [] } });
    assert.equal(imageBriefGenerationGate(free).allowed, true);
    assert.equal(imageBriefGenerationGate(free).needsConfirmation, false);
});

test("merges brief result asset ids without duplicates", () => {
    const same = mergeImageBriefResultAssetIds(brief({ resultAssetIds: ["asset-1"] }), "asset-1");
    assert.deepEqual(same.resultAssetIds, ["asset-1"]);
    assert.equal(same.status, "generated");

    const next = mergeImageBriefResultAssetIds(brief({ resultAssetIds: ["asset-1"] }), "asset-2");
    assert.deepEqual(next.resultAssetIds, ["asset-1", "asset-2"]);
});

test("sets primary brief result asset without mutating asset order unexpectedly", () => {
    const result = buildImageBriefPrimaryAssetPatch(brief({ resultAssetIds: ["asset-1", "asset-2"] }), "asset-2");
    assert.equal(result.primaryAssetId, "asset-2");
    assert.deepEqual(result.resultAssetIds, ["asset-2", "asset-1"]);
});

test("builds brief result summaries with generation and version metadata", () => {
    const result = buildImageBriefResultSummaries(brief({ primaryAssetId: "asset-2", resultAssetIds: ["asset-1", "asset-2"] }), [
        asset("asset-1", { generation: { createdAt: "2026", model: "m1", provider: "openai", finalPrompt: "prompt", referenceAssets: [{ assetId: "ref-1" }] } }),
        asset("asset-2", {
            generation: { createdAt: "2027", model: "m2", provider: "volcengine-ark", finalPrompt: "prompt2", referenceAssets: [] },
            assetVersions: [
                { id: "v1", versionNumber: 1 },
                { id: "v2", versionNumber: 2 },
            ],
            currentAssetVersionId: "v2",
        }),
    ] as never);
    assert.equal(result[0]?.assetId, "asset-2");
    assert.equal(result[0]?.isPrimary, true);
    assert.equal(result[0]?.currentVersionNumber, 2);
    assert.equal(result[1]?.model, "m1");
    assert.equal(result[1]?.referenceAssets.length, 1);
});

test("builds asset breakdown result patch", () => {
    const result = buildImageBriefResultPatch(assetBreakdown(), "asset-2");
    assert.deepEqual(result.assetIds, ["asset-1", "asset-2"]);
    assert.equal(result.status, "generated");
});

test("builds asset breakdown primary reference patch", () => {
    const result = buildImageBriefPrimaryAssetBreakdownPatch(assetBreakdown(), "asset-2");
    assert.deepEqual(result.assetIds, ["asset-2", "asset-1"]);
    assert.equal(result.status, "linked");
});

test("builds production bible refs from brief result", () => {
    const result = buildProductionBibleBriefAssetRefs(productionBible(), "asset-1");
    assert.deepEqual(result.assetRefs, [{ assetId: "asset-1", role: "reference" }]);
});

test("builds production bible primary reference patch", () => {
    const result = buildProductionBibleBriefPrimaryAssetRefs({ ...productionBible(), assetRefs: [{ assetId: "asset-0", role: "reference" }] }, "asset-1");
    assert.deepEqual(result.assetRefs, [
        { assetId: "asset-1", role: "primary_reference" },
        { assetId: "asset-0", role: "reference" },
    ]);
});

function brief(patch: Partial<ImageBrief>): ImageBrief {
    return {
        id: "brief",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        sourceType: "manual",
        sourceId: "",
        kind: "scene",
        mode: "standard",
        title: "大学操场",
        scriptText: "毕业典礼现场",
        fields: defaultImageBriefFields("scene"),
        referenceAssets: [],
        validationResult: { ok: false, severity: "error", messages: [] },
        prompt: "",
        finalPrompt: "",
        resultAssetIds: [],
        primaryAssetId: undefined,
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function asset(id: string, metadata: Record<string, unknown>) {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: "",
        data: { dataUrl: "", width: 1, height: 1, bytes: 1, mimeType: "image/png" },
        tags: [],
        createdAt: "now",
        updatedAt: "now",
        metadata,
    };
}

function assetBreakdown(patch: Partial<AssetBreakdownItem> = {}): AssetBreakdownItem {
    return {
        id: "asset-breakdown-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        scriptId: "script-1",
        kind: "character",
        name: "魏梁",
        description: "学士袍造型",
        sourceText: "魏梁走上主席台",
        tags: ["角色"],
        assetIds: ["asset-1"],
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function productionBible(): ProductionBibleItem {
    return {
        id: "bible-1",
        projectId: "project-1",
        kind: "scene",
        name: "大学操场",
        description: "毕业典礼操场",
        tags: ["场景"],
        assetRefs: [],
        promptSnippets: { consistency: "保持操场横幅一致" },
        createdAt: "now",
        updatedAt: "now",
    };
}

function shotGroup(): ShotGroup {
    return {
        id: "shot-group-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "大学操场",
        shotIds: ["shot-1", "shot-2"],
        totalDuration: 10,
        prompt: "毕业典礼，克制温暖",
        effectivePrompt: "",
        assetRefs: [],
        audioRefs: [],
        status: "prompt_ready",
        resultAssetIds: [],
        createdAt: "now",
        updatedAt: "now",
    };
}

function tableShot(id: string): StoryboardTableShot {
    return {
        id,
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        sceneName: "大学操场",
        location: "大学操场",
        timeOfDay: "白天",
        order: id === "shot-1" ? 1 : 2,
        title: id,
        scriptText: id === "shot-1" ? "魏梁上台" : "台下反应",
        visualDescription: "",
        characters: ["魏梁"],
        dialogue: "",
        action: "",
        emotion: "克制",
        shotSize: "中景",
        cameraMovement: "推近",
        estimatedDuration: 5,
        assetRefs: [],
        createdAt: "now",
        updatedAt: "now",
    };
}
