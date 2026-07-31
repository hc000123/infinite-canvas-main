import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import type { SkillAdminItem, SkillOwnerType } from "@/services/api/admin-skills.ts";
import { canPublishSkill, filterSkillItems, nextDraftVersion, nextPatchVersion } from "./skill-view.ts";

function skillItem(id: string, ownerType: SkillOwnerType, capabilities: string[], inputArtifactTypes: string[], outputArtifactTypes: string[], projectTags: string[]): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType, ownerProjectId: ownerType === "project" ? "p1" : "", enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
        versions: [],
        bindings: [],
        evaluations: [],
        audits: [],
        recommendedPackage: {
            manifest: { capabilities, inputArtifactTypes, outputArtifactTypes, projectTags, schemaCompatibility: {}, sideEffects: ["none"], estimatedCostClass: "text_low" },
            files: { "SKILL.md": "test" },
            inputContract: { requiredInputs: [], imagePolicy: { required: false, min: 0, max: 0, allowTextFallback: true, allowedTypes: [] } },
            outputContract: { schemaVersion: "1.0.0", schema: { type: "object" } },
            qualityGateProfile: ["schema"],
            contentHash: "hash",
        },
    };
}

test("filters skills by capability, artifact type, tag, and owner", () => {
    const items = [
        skillItem("system-storyboard", "system", ["workflow.stage.storyboard"], ["production_script"], ["storyboard_package"], ["vertical"]),
        skillItem("project-image", "project", ["asset.character.rendition"], ["asset_record"], ["asset_brief"], ["short_drama"]),
    ];
    assert.deepEqual(
        filterSkillItems(items, { search: "", capability: "asset.character.rendition", inputArtifactType: "asset_record", outputArtifactType: "asset_brief", projectTag: "short_drama", ownerType: "project" }).map(
            (item) => item.skill.id,
        ),
        ["project-image"],
    );
});

test("publish requires a same-hash passing evaluation for paid skills", () => {
    const version = { id: "v1", status: "draft", contentHash: "new" } as never;
    const packageValue = { manifest: { estimatedCostClass: "text_high" } } as never;
    assert.equal(canPublishSkill({ version, packageValue, evaluations: [{ skillVersionId: "v1", contentHash: "old", status: "passed" }] as never }), false);
});

test("increments semantic patch version", () => {
    assert.equal(nextPatchVersion("2.4.9"), "2.4.10");
});

test("starts an empty Skill definition at version 1.0.0", () => {
    assert.equal(nextDraftVersion(), "1.0.0");
    assert.equal(nextDraftVersion("2.4.9"), "2.4.10");
});

test("skill center is generic and exposes manifest filters", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["Skill 中心", "Capability", "输入 Artifact", "输出 Artifact", "所有者", "项目标签"]) {
        assert.ok(page.includes(text), `missing ${text}`);
    }
    assert.equal(page.includes("workflowSkillStageNumbers"), false);
    assert.equal(page.includes('disabled={!detailQuery.data}'), false);
});
