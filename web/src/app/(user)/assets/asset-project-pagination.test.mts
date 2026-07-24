import assert from "node:assert/strict";
import test from "node:test";

import type { AssetProjectResultGroup } from "./asset-project-groups.ts";
import { packAssetProjectGroupPages } from "./asset-project-pagination.ts";

test("packs small projects near the target without splitting a project", () => {
    const pages = packAssetProjectGroupPages([group("a", 20), group("b", 10), group("c", 7)], 30);

    assert.deepEqual(pages.map((page) => page.map((item) => item.id)), [["a", "b"], ["c"]]);
});

test("keeps an oversized project on one page", () => {
    const pages = packAssetProjectGroupPages([group("project-with-37-assets", 37)], 30);

    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.[0]?.assets.length, 37);
});

test("starts the next complete project on a new page when it would overflow", () => {
    const pages = packAssetProjectGroupPages([group("a", 24), group("b", 13), group("c", 2)], 30);

    assert.deepEqual(pages.map((page) => page.map((item) => item.id)), [["a"], ["b", "c"]]);
});

function group(id: string, count: number): AssetProjectResultGroup {
    return {
        id,
        title: id,
        assets: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}` })) as AssetProjectResultGroup["assets"],
        productionBibleItems: [],
    };
}
