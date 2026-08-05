import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import type { SkillAdminItem, SkillOwnerType } from "@/services/api/admin-skills.ts";
import { canPublishSkill, filterSkillItems, nextDraftVersion, nextPatchVersion, skillLifecycleLabel } from "./skill-view.ts";

function skillItem(id: string, ownerType: SkillOwnerType, capabilities: string[], inputArtifactTypes: string[], outputArtifactTypes: string[], projectTags: string[]): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType, ownerUserId: "", ownerProjectId: ownerType === "project" ? "p1" : "", stageKey: "script", enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
        versions: [],
        bindings: [],
        evaluations: [],
        audits: [],
        recommendedPackage: {
            manifest: { capabilities, inputArtifactTypes, outputArtifactTypes, projectTags, schemaCompatibility: {}, sideEffects: ["none"], estimatedCostClass: "text_low" },
            files: { "SKILL.md": "test" },
            inputContract: { requiredInputs: [], artifactInputs: [], imagePolicy: { required: false, min: 0, max: 0, allowTextFallback: true, allowedTypes: [] } },
            outputContract: { schemaVersion: "1.0.0", schema: { type: "object" }, artifactOutputs: [] },
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

test("folder-first lifecycle uses production language", () => {
    assert.equal(skillLifecycleLabel({ status: "draft" } as never, false, false), "待试跑");
    assert.equal(skillLifecycleLabel({ status: "published" } as never, true, false), "可使用");
    assert.equal(skillLifecycleLabel({ status: "published" } as never, true, true), "推荐");
    assert.equal(skillLifecycleLabel({ status: "archived" } as never, false, false), "已停用");
});

test("skill center is generic and exposes manifest filters", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["Skill 中心", "Capability", "输入 Artifact", "输出 Artifact", "所有者", "项目标签"]) {
        assert.ok(page.includes(text), `missing ${text}`);
    }
    assert.equal(page.includes("workflowSkillStageNumbers"), false);
    assert.equal(page.includes('disabled={!detailQuery.data}'), false);
    for (const text of ["导入 Skill 文件夹", "导入新版本", "独立试运行", "设为可用", "技术详情与底层契约"]) assert.ok(page.includes(text), `missing folder-first action ${text}`);
    assert.equal(page.includes("工作流 Run ID"), false);
});

test("new version import compares against the selected version", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /previousVersionId=\{folderImportMode === "version" \? activeVersionId : undefined\}/);
});

test("folder-imported admin versions keep technical contracts read-only", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /const importedFolderVersion = activeVersion\?\.sourceKind === "folder_import";/);
    assert.match(page, /readOnly=\{activeVersion\?\.status !== "draft" \|\| importedFolderVersion\}/);
    assert.match(page, /activeVersion\?\.status === "draft" && !importedFolderVersion/);
});
