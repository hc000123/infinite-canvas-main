import assert from "node:assert/strict";
import test from "node:test";

import { videoWorkflowHref } from "../../../../../original-workflow/video-workflow-routing.ts";
import { buildDeliveryReport } from "./workflow-delivery-check.ts";

test("delivery blocks missing selected versions", () => {
    const report = buildDeliveryReport([{ assetStatus: "完整", generation: undefined, id: "P01", promptStatus: "已确认" }]);
    assert.equal(report.blockingCount, 1);
    assert.match(report.items[0].issues.join("；"), /成功视频版本/);
});

test("delivery reports active and failed tasks", () => {
    const report = buildDeliveryReport([
        { assetStatus: "完整", generation: { status: "running" }, id: "P01", promptStatus: "已确认" },
        { assetStatus: "完整", generation: { status: "failed" }, id: "P02", promptStatus: "已确认" },
    ]);
    assert.equal(report.blockingCount, 2);
});

test("canonical workflow href uses project route", () => {
    assert.equal(videoWorkflowHref(1, "p1", "e1"), "/projects/p1/episodes/e1/workflow");
});
