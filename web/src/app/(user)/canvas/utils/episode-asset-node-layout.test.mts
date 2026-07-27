import assert from "node:assert/strict";
import test from "node:test";

import { sortEpisodeAssetsForCanvas } from "./episode-asset-node-layout.ts";

test("episode assets use role, scene, prop, other order", () => {
    const asset = (id: string, category: string) => ({ id, title: id, assetBinding: { category, subjectId: id, variantName: "基础" } }) as any;
    assert.deepEqual(
        sortEpisodeAssetsForCanvas([asset("prop", "prop"), asset("role", "character"), asset("scene", "scene")]).map((item) => item.id),
        ["role", "scene", "prop"],
    );
});
