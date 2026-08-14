import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectWorkstream } from "./project-workstream.ts";

test("workstream sorts by current attention and update time", () => {
    const items = buildProjectWorkstream([
        { id: "archived", title: "旧项目", description: "", status: "archived", updatedAt: "2026-08-14T09:00:00Z", canvasCount: 1, presetSummary: "默认" },
        { id: "active", title: "毕业典礼", description: "", status: "active", updatedAt: "2026-08-14T08:00:00Z", canvasCount: 3, presetSummary: "视频" },
    ]);
    assert.deepEqual(items.map((item) => item.id), ["active", "archived"]);
    assert.equal(items[0]?.actionLabel, "继续制作");
    assert.equal(items[1]?.actionLabel, "查看项目");
});

test("workstream derives only facts available in current stores", () => {
    const [item] = buildProjectWorkstream([{ id: "p1", title: "片名", description: "说明", status: "active", updatedAt: "2026-08-14T08:00:00Z", canvasCount: 0, presetSummary: "默认" }]);
    assert.equal(item?.summary, "说明");
    assert.equal(item?.meta, "暂无画布");
    assert.equal(item?.statusLabel, "草稿");
});
