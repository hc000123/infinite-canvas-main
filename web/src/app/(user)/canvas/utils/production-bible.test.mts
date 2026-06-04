import assert from "node:assert/strict";
import test from "node:test";

import { itemsForProductionBibleProject, normalizeProductionBibleInput, productionBibleAssetRoleLabel, productionBibleKindLabel, type ProductionBibleItem } from "./production-bible.ts";

test("normalizes production bible write input", () => {
    const input = normalizeProductionBibleInput({
        projectId: "project-1",
        kind: "character",
        name: "  魏梁  ",
        description: "  女主角  ",
        tags: [" 主角 ", "毕业", "主角", ""],
        assetRefs: [
            { assetId: "asset-1", role: "" },
            { assetId: "asset-1", role: "portrait" },
            { assetId: " asset-2 ", role: " consistency " },
            { assetId: "", role: "reference" },
        ],
        promptSnippets: {
            positive: " 稳定、克制 ",
            negative: " 夸张滤镜 ",
            consistency: " 学士袍与短发保持一致 ",
        },
    });

    assert.equal(input.name, "魏梁");
    assert.equal(input.description, "女主角");
    assert.deepEqual(input.tags, ["主角", "毕业"]);
    assert.deepEqual(input.assetRefs, [
        { assetId: "asset-1", role: "reference" },
        { assetId: "asset-2", role: "consistency" },
    ]);
    assert.deepEqual(input.promptSnippets, {
        positive: "稳定、克制",
        negative: "夸张滤镜",
        consistency: "学士袍与短发保持一致",
    });
});

test("filters project items and keeps newest first", () => {
    const items: ProductionBibleItem[] = [
        item("a", "project-1", "character", "2026-06-01T00:00:00.000Z"),
        item("b", "project-2", "character", "2026-06-03T00:00:00.000Z"),
        item("c", "project-1", "scene", "2026-06-04T00:00:00.000Z"),
        item("d", "project-1", "character", "2026-06-02T00:00:00.000Z"),
    ];

    assert.deepEqual(
        itemsForProductionBibleProject(items, "project-1").map((entry) => entry.id),
        ["c", "d", "a"],
    );
    assert.deepEqual(
        itemsForProductionBibleProject(items, "project-1", "character").map((entry) => entry.id),
        ["d", "a"],
    );
});

test("labels production bible kind and asset role", () => {
    assert.equal(productionBibleKindLabel("character"), "角色");
    assert.equal(productionBibleKindLabel("scene"), "场景");
    assert.equal(productionBibleKindLabel("prop"), "道具");
    assert.equal(productionBibleAssetRoleLabel("portrait"), "形象");
    assert.equal(productionBibleAssetRoleLabel("custom"), "custom");
});

function item(id: string, projectId: string, kind: ProductionBibleItem["kind"], updatedAt: string): ProductionBibleItem {
    return {
        id,
        projectId,
        kind,
        name: id,
        description: "",
        tags: [],
        assetRefs: [],
        promptSnippets: {},
        createdAt: updatedAt,
        updatedAt,
    };
}
