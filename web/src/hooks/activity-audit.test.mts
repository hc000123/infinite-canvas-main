import assert from "node:assert/strict";
import test from "node:test";

import { activityReportPayload } from "./activity-audit.ts";

test("builds a controlled business event", () => {
    assert.deepEqual(activityReportPayload("project.created", { targetType: "project", targetId: "project-1", targetName: "新项目", summary: "创建项目", metadata: { projectId: "project-1" } }, "event-1"), {
        action: "project.created",
        targetType: "project",
        targetId: "project-1",
        targetName: "新项目",
        summary: "创建项目",
        metadata: { projectId: "project-1" },
        clientEventId: "event-1",
    });
});

test("does not expose high-frequency action names", () => {
    assert.throws(() => activityReportPayload("canvas.node_dragged" as never, {}, "event-2"));
});
