import assert from "node:assert/strict";
import test from "node:test";

import { activityActionLabel, activityRiskLabel } from "./admin-user-activity-view.ts";

test("labels controlled activity actions", () => {
    assert.equal(activityActionLabel("ai.succeeded"), "AI 任务成功");
    assert.equal(activityActionLabel("project.deleted"), "删除项目");
    assert.equal(activityActionLabel("security.admin_role_changed"), "管理员角色变更");
});

test("marks outside-IP activity", () => {
    assert.deepEqual(activityRiskLabel({ ipAddress: "203.0.113.8", ipAllowed: false }), { text: "非白名单 IP", color: "error" });
});
