import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/stores/use-asset-store";
import type { AssetBreakdownItem } from "./asset-breakdown.ts";
import { buildImageBriefFromAssetBreakdown, type ImageBrief } from "./image-brief.ts";
import { buildEpisodeImageNeedRows, episodeImageNeedKind, findImageBriefForAssetBreakdown, summarizeEpisodeImageNeed } from "./episode-image-needs.ts";

test("resolves episode image need display kind from agent asset kind", () => {
    assert.equal(episodeImageNeedKind(item({ kind: "character" })), "character");
    assert.equal(episodeImageNeedKind(item({ kind: "scene" })), "scene");
    assert.equal(episodeImageNeedKind(item({ kind: "prop" })), "prop");
    assert.equal(episodeImageNeedKind(item({ kind: "style" })), "mood");
    assert.equal(episodeImageNeedKind(item({ kind: "character", agentAssetKind: "costume" })), "costume");
    assert.equal(episodeImageNeedKind(item({ kind: "character", agentAssetKind: "makeup" })), "makeup");
    assert.equal(episodeImageNeedKind(item({ kind: "style", agentAssetKind: "effect" })), "effect");
});

test("finds linked brief without creating duplicates", () => {
    const linked = buildImageBriefFromAssetBreakdown(item({ briefId: "brief-linked" }), "brief-linked", "now");
    const sourceLinked = buildImageBriefFromAssetBreakdown(item({ id: "need-source" }), "brief-source", "now");
    assert.equal(findImageBriefForAssetBreakdown(item({ briefId: "brief-linked" }), [linked])?.id, "brief-linked");
    assert.equal(findImageBriefForAssetBreakdown(item({ id: "need-source" }), [sourceLinked])?.id, "brief-source");
    assert.equal(findImageBriefForAssetBreakdown(item({ id: "need-new" }), [linked, sourceLinked]), undefined);
});

test("builds episode image need rows with correct empty and generated statuses", () => {
    const needWithoutBrief = item({ id: "need-empty", name: "空需求" });
    const needWithBrief = item({ id: "need-brief", name: "已有 Brief", briefId: "brief-1" });
    const needGenerated = item({ id: "need-generated", name: "有结果", briefId: "brief-2", assetIds: ["asset-2"], status: "generated" });
    const briefWithoutResult = buildImageBriefFromAssetBreakdown(needWithBrief, "brief-1", "now");
    const briefWithResult: ImageBrief = { ...buildImageBriefFromAssetBreakdown(needGenerated, "brief-2", "now"), resultAssetIds: ["asset-1"], primaryAssetId: "asset-1", status: "generated" };
    const rows = buildEpisodeImageNeedRows({
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        items: [needWithoutBrief, needWithBrief, needGenerated, item({ id: "other-episode", episodeId: "episode-2" })],
        briefs: [briefWithoutResult, briefWithResult],
        assets: [asset("asset-1"), asset("asset-2")],
    });

    assert.deepEqual(
        rows.map((row) => row.item.id),
        ["need-empty", "need-brief", "need-generated"],
    );
    assert.equal(rows[0].hasBrief, false);
    assert.equal(rows[0].resultAssetCount, 0);
    assert.equal(rows[0].primaryAsset, undefined);
    assert.equal(rows[0].statusLabel, "草稿");
    assert.equal(rows[1].hasBrief, true);
    assert.equal(rows[1].resultAssetCount, 0);
    assert.equal(rows[1].statusLabel, "Brief 已创建");
    assert.equal(rows[2].hasBrief, true);
    assert.equal(rows[2].resultAssetCount, 2);
    assert.equal(rows[2].primaryAsset?.id, "asset-1");
    assert.equal(rows[2].statusLabel, "已生成");
    assert.deepEqual(summarizeEpisodeImageNeed(rows[2]), {
        title: "角色 · 已生成",
        sourceLabel: "资产拆解",
        resultLabel: "结果素材 2",
        primaryAssetTitle: "asset-1",
    });
});

function item(patch: Partial<AssetBreakdownItem>): AssetBreakdownItem {
    return {
        id: "need-1",
        projectId: "project-1",
        canvasId: "canvas-1",
        episodeId: "episode-1",
        episodeTitle: "第一集",
        scriptId: "script-1",
        kind: "character",
        name: "魏梁",
        description: "学士袍造型",
        sourceText: "魏梁上台",
        tags: ["角色"],
        assetIds: [],
        status: "draft",
        createdAt: "now",
        updatedAt: "now",
        ...patch,
    };
}

function asset(id: string): Asset {
    return {
        id,
        kind: "image",
        title: id,
        coverUrl: `/${id}.png`,
        data: { dataUrl: "", width: 1, height: 1, bytes: 1, mimeType: "image/png" },
        tags: [],
        createdAt: "now",
        updatedAt: "now",
    };
}
