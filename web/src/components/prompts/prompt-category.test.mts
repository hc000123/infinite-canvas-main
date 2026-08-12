import assert from "node:assert/strict";
import test from "node:test";

import { promptCategoryLabel, promptCategoryOptions } from "./prompt-category.ts";

test("exposes the five fixed business prompt categories", () => {
    assert.deepEqual(
        promptCategoryOptions.map(({ value, label }) => ({ value, label })),
        [
            { value: "scene", label: "场景" },
            { value: "prop", label: "道具" },
            { value: "character", label: "角色" },
            { value: "video", label: "视频" },
            { value: "text", label: "文本" },
        ],
    );
    assert.equal(promptCategoryLabel("scene"), "场景");
    assert.equal(promptCategoryLabel("unknown"), "unknown");
});
