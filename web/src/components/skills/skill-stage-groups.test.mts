import assert from "node:assert/strict";
import test from "node:test";

import type { SkillAdminItem } from "@/services/api/admin-skills.ts";
import { groupSkillItemsByStage, resolveOpenSkillStageKeys } from "./skill-stage-groups.ts";

function skillItem(id: string, capabilities: string[], outputArtifactTypes: string[], stageKey = ""): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType: "system", ownerUserId: "", ownerProjectId: "", stageKey, enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
        versions: [],
        bindings: [],
        evaluations: [],
        audits: [],
        recommendedPackage: {
            manifest: { capabilities, inputArtifactTypes: [], outputArtifactTypes, projectTags: [], schemaCompatibility: {}, sideEffects: ["none"], estimatedCostClass: "text_low" },
            files: { "SKILL.md": "test" },
            inputContract: { requiredInputs: [], artifactInputs: [], imagePolicy: { required: false, min: 0, max: 0, allowTextFallback: true, allowedTypes: [] } },
            outputContract: { schemaVersion: "1.0.0", schema: { type: "object" }, artifactOutputs: [] },
            qualityGateProfile: ["schema"],
            contentHash: "hash",
        },
    };
}

test("groups visible Skills in fixed production-stage order with totals", () => {
    const groups = groupSkillItemsByStage([
        skillItem("script", ["workflow.stage.script"], ["production_script"]),
        skillItem("extract", ["workflow.stage.art"], ["asset_catalog"]),
        skillItem("brief", ["asset.scene.brief"], ["asset_brief"]),
        skillItem("rendition", ["asset.rendition.generate"], ["asset_rendition"]),
        skillItem("storyboard", ["storyboard.vertical.short"], ["storyboard_package"]),
        skillItem("video", [], ["video_prompt_package"]),
        skillItem("delivery", [], ["delivery_report"]),
        skillItem("other", ["custom.general"], ["custom_result"]),
    ]);

    assert.deepEqual(groups.map(({ key }) => key), ["script", "asset-extraction", "asset-brief", "asset-rendition", "storyboard", "video", "delivery", "other"]);
    assert.deepEqual(groups.map(({ totalCount }) => totalCount), [1, 1, 1, 1, 1, 1, 1, 1]);
});

test("opens the selected stage or every filtered stage", () => {
    const groups = groupSkillItemsByStage([
        skillItem("script", ["workflow.stage.script"], ["production_script"]),
        skillItem("scene-image", ["asset.rendition.generate"], ["asset_rendition"]),
    ]);

    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", false), ["asset-rendition"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "", false), ["script"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", true), ["script", "asset-rendition"]);
});
