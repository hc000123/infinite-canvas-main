import assert from "node:assert/strict";
import test from "node:test";

import { canPublishSkill, nextPatchVersion, resolveBindingLabel, sortWorkflowSkillItems } from "./workflow-skill-view.ts";

test("orders workflow stages by production sequence", () => {
    const items = ["art", "delivery", "script", "video", "assets", "storyboard"].map((stageKey) => ({ skill: { stageKey } }));
    assert.deepEqual(
        sortWorkflowSkillItems(items as never).map((item) => item.skill.stageKey),
        ["script", "art", "assets", "storyboard", "video", "delivery"],
    );
});

test("project binding wins over global binding", () => {
    assert.equal(resolveBindingLabel({ global: "1.0.0", project: "1.1.0" }), "项目灰度 · 1.1.0");
});

test("AI stage publish is blocked when content hash has no passed evaluation", () => {
    const version = { id: "version-1", skillId: "skill-1", version: "1.1.0", status: "draft", contentHash: "new", createdBy: "admin", publishedAt: "", createdAt: "", updatedAt: "" } as const;
    const evaluations = [
        {
            id: "eval-1",
            skillVersionId: "version-1",
            baselineVersionId: "baseline",
            contentHash: "old",
            projectId: "p1",
            episodeId: "e1",
            inputHash: "input",
            resultJson: "{}",
            diffJson: "{}",
            gateJson: "{}",
            status: "passed",
            errorMessage: "",
            durationMs: 1,
            createdBy: "admin",
            createdAt: "",
            updatedAt: "",
        },
    ] as const;
    assert.equal(canPublishSkill({ stageKey: "art", version, evaluations: [...evaluations] }), false);
});

test("increments semantic patch version", () => {
    assert.equal(nextPatchVersion("2.4.9"), "2.4.10");
});
