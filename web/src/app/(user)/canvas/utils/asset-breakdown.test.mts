import assert from "node:assert/strict";
import test from "node:test";

import {
    bindAssetBreakdownAssets,
    buildAssetBreakdownAssetMetadata,
    buildAssetBreakdownDraftsFromScript,
    buildAssetBreakdownProductionBibleAssetRefs,
    createAssetBreakdownBriefDraft,
    linkAssetBreakdownToProductionBible,
    matchProductionBibleItem,
    mergeAssetBreakdownItems,
    type AssetBreakdownItem,
} from "./asset-breakdown.ts";

test("builds initial asset breakdown drafts from episode script text", () => {
    const drafts = buildAssetBreakdownDraftsFromScript({
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        scriptId: "project-1",
        scriptText: "白天，图片 1魏梁穿学士袍走向大学操场毕业典礼现场。道具：话筒。",
        now: "now",
    });
    assert.ok(drafts.some((item) => item.kind === "character" && item.name === "魏梁"));
    assert.ok(drafts.some((item) => item.kind === "scene" && item.name.includes("大学操场")));
    assert.ok(drafts.some((item) => item.kind === "prop" && item.name === "话筒"));
    assert.ok(drafts.some((item) => item.kind === "style" && item.name === "白天"));
});

test("dedupes and merges asset breakdown items by project episode kind and name", () => {
    const merged = mergeAssetBreakdownItems([item({ id: "a", name: "魏梁", tags: ["角色"], sourceText: "图片 1魏梁" }), item({ id: "b", name: "魏梁", tags: ["主角"], sourceText: "魏梁走上台" })]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].tags, ["角色", "主角"]);
    assert.match(merged[0].sourceText, /走上台/);
});

test("links asset breakdown item to production bible entry", () => {
    const linked = linkAssetBreakdownToProductionBible(item({ id: "a" }), "bible-1");
    assert.equal(linked.productionBibleItemId, "bible-1");
    assert.equal(linked.status, "linked");
});

test("creates traceable brief draft for asset image generation", () => {
    const brief = createAssetBreakdownBriefDraft(item({ id: "a", kind: "scene", name: "操场", description: "毕业典礼现场" }), "brief-1", "now");
    assert.equal(brief.briefId, "brief-1");
    assert.equal(brief.status, "brief_ready");
    assert.match(brief.briefDraft?.prompt || "", /场景图/);
    assert.match(brief.briefDraft?.prompt || "", /毕业典礼现场/);
});

test("writes generated or manually bound asset ids back without duplicates", () => {
    const linked = bindAssetBreakdownAssets(item({ id: "a", assetIds: ["asset-1"] }), ["asset-1", "asset-2"], "now");
    assert.deepEqual(linked.assetIds, ["asset-1", "asset-2"]);
    assert.equal(linked.status, "linked");
});

test("matches character scene and prop items to production bible entries only", () => {
    const bible = [{ id: "bible-1", projectId: "project-1", kind: "character" as const, name: "魏梁", description: "", tags: [], assetRefs: [], promptSnippets: {}, createdAt: "now", updatedAt: "now" }];
    assert.equal(matchProductionBibleItem(item({ id: "a", kind: "character", name: "魏梁" }), bible)?.id, "bible-1");
    assert.equal(matchProductionBibleItem(item({ id: "b", kind: "style", name: "白天" }), bible), undefined);
});

test("builds traceable asset metadata for asset breakdown bindings", () => {
    const metadata = buildAssetBreakdownAssetMetadata(
        {
            keep: true,
            assetBreakdownItems: [
                { itemId: "item-1", name: "旧记录" },
                { itemId: "other", name: "保留记录" },
            ],
        },
        item({ id: "item-1", kind: "scene", name: "操场" }),
    );
    assert.equal(metadata.keep, true);
    assert.equal(metadata.episodeId, "episode-1");
    assert.equal(metadata.assetBreakdownItemId, "item-1");
    assert.deepEqual(metadata.assetBreakdownItems, [
        { itemId: "other", name: "保留记录" },
        { itemId: "item-1", projectId: "project-1", episodeId: "episode-1", kind: "scene", name: "操场" },
    ]);
});

test("builds production bible asset refs from asset breakdown kind", () => {
    assert.deepEqual(buildAssetBreakdownProductionBibleAssetRefs(item({ kind: "scene" }), ["asset-1", "asset-1", "asset-2"]), [
        { assetId: "asset-1", role: "environment" },
        { assetId: "asset-2", role: "environment" },
    ]);
    assert.deepEqual(buildAssetBreakdownProductionBibleAssetRefs(item({ kind: "style" }), ["asset-3"]), [{ assetId: "asset-3", role: "style" }]);
    assert.deepEqual(buildAssetBreakdownProductionBibleAssetRefs(item({ kind: "character" }), ["asset-4"]), [{ assetId: "asset-4", role: "reference" }]);
});

function item(patch: Partial<AssetBreakdownItem>): AssetBreakdownItem {
    return {
        id: "item-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        scriptId: "project-1",
        kind: "character",
        name: "魏梁",
        description: "",
        sourceText: "",
        tags: [],
        assetIds: [],
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}
