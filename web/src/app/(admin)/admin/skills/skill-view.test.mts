import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import type { SkillAdminItem } from "@/services/api/admin-skills.ts";
import { groupSkillItemsByStage, resolveOpenSkillStageKeys } from "../../../../components/skills/skill-stage-groups.ts";
import { canPublishSkill, filterSkillItems, nextDraftVersion, nextPatchVersion, skillLifecycleLabel } from "./skill-view.ts";

function skillItem(id: string, capabilities: string[], inputArtifactTypes: string[], outputArtifactTypes: string[], projectTags: string[], stageKey = ""): SkillAdminItem {
    return {
        skill: { id, name: id, summary: id, ownerType: "system", ownerUserId: "", ownerProjectId: "", stageKey, enabled: true, recommendedVersionId: `${id}-v1`, createdAt: "", updatedAt: "" },
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

test("filters skills by capability, artifact type, and tag", () => {
    const items = [
        skillItem("storyboard", ["workflow.stage.storyboard"], ["production_script"], ["storyboard_package"], ["vertical"]),
        skillItem("image", ["asset.character.rendition"], ["asset_record"], ["asset_brief"], ["short_drama"]),
    ];
    assert.deepEqual(
        filterSkillItems(items, { search: "", capability: "asset.character.rendition", inputArtifactType: "asset_record", outputArtifactType: "asset_brief", projectTag: "short_drama" }).map(
            (item) => item.skill.id,
        ),
        ["image"],
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

test("skill center keeps automatically detected technical filters collapsed by default", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["Skill 中心", "高级筛选", "能力类型", "输入类型", "输出类型", "适用标签", "已由系统从 Skill 清单自动识别", "全部 Skill 由管理员统一维护，发布后供所有账号和项目使用。"]) {
        assert.ok(page.includes(text), `missing ${text}`);
    }
    assert.match(page, /const \[advancedFiltersOpen, setAdvancedFiltersOpen\] = useState\(false\)/);
    assert.match(page, /advancedFiltersOpen \? <div/);
    assert.equal(page.includes("所有者"), false);
    assert.equal(page.includes("workflowSkillStageNumbers"), false);
    assert.equal(page.includes('disabled={!detailQuery.data}'), false);
    for (const text of ["导入外部 Skill", "导入新版本", "独立试运行", "设为可用", "技术详情与底层契约"]) assert.ok(page.includes(text), `missing Skill action ${text}`);
    assert.equal(page.includes("工作流 Run ID"), false);
});

test("new version import compares against the selected version", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /previousVersionId=\{folderImportMode === "version" \? activeVersionId : undefined\}/);
});

test("admin Skill deletion uses the protected lifecycle endpoint and confirmation", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["deleteAdminSkill,", "deleteAdminSkill(token, activeItem!.skill.id)", "confirmSkillDelete", "删除 Skill", "仅有空草稿时会一并删除", "deleteSkillMutation.mutateAsync()"]) {
        assert.ok(page.includes(text), `missing Skill deletion wiring ${text}`);
    }
});

test("folder-imported admin versions keep technical contracts read-only", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /const importedFolderVersion = activeVersion\?\.sourceKind === "folder_import";/);
    assert.match(page, /readOnly=\{activeVersion\?\.status !== "draft" \|\| importedFolderVersion\}/);
    assert.match(page, /activeVersion\?\.status === "draft" && !importedFolderVersion/);
});

test("groups skills by explicit stage before manifest fallback", () => {
    const groups = groupSkillItemsByStage([
        skillItem("explicit-rendition", ["workflow.stage.script"], [], ["production_script"], [], "asset-rendition-scene"),
        skillItem("content", ["content.classify"], ["production_script"], ["content_profile"], []),
        skillItem("extract", ["workflow.stage.art"], ["production_script"], ["asset_catalog"], []),
        skillItem("brief", ["asset.scene.brief"], ["asset_catalog"], ["asset_brief"], []),
        skillItem("storyboard", ["storyboard.vertical.short"], [], ["storyboard_package"], []),
        skillItem("video", [], [], ["video_prompt_package"], []),
        skillItem("delivery", [], [], ["delivery_report"], []),
        skillItem("unknown", ["custom.general"], [], ["custom_result"], []),
    ]);

    assert.deepEqual(groups.map((group) => [group.key, group.items.map((item) => item.skill.id)]), [
        ["script", ["content"]],
        ["asset-extraction", ["extract"]],
        ["asset-brief", ["brief"]],
        ["asset-rendition", ["explicit-rendition"]],
        ["storyboard", ["storyboard"]],
        ["video", ["video"]],
        ["delivery", ["delivery"]],
        ["other", ["unknown"]],
    ]);
});

test("stage groups expose visible totals and default open keys", () => {
    const groups = groupSkillItemsByStage([
        skillItem("primary-script", ["workflow.stage.script"], [], ["production_script"], []),
        skillItem("content-script", ["content.classify"], [], ["content_profile"], []),
        skillItem("scene-image", ["asset.rendition.generate"], [], ["asset_rendition"], []),
    ]);

    assert.deepEqual(groups.map(({ key, totalCount }) => ({ key, totalCount })), [
        { key: "script", totalCount: 2 },
        { key: "asset-rendition", totalCount: 1 },
    ]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", false), ["asset-rendition"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "", false), ["script"]);
    assert.deepEqual(resolveOpenSkillStageKeys(groups, "scene-image", true), ["script", "asset-rendition"]);
});

test("admin registry renders production-stage collapse groups", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    for (const text of ["groupSkillItemsByStage", "resolveOpenSkillStageKeys", "openStageKeys", "group.totalCount", "group.items.map"]) {
        assert.ok(page.includes(text), `missing stage group wiring ${text}`);
    }
    assert.equal(page.includes("group.systemCount"), false);
    assert.equal(page.includes("group.projectCount"), false);
    assert.equal(page.includes("visibleItems.map((item) => <SkillCard"), false);
});

test("admin skill registry cards only show the skill name", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const skillCard = page.slice(page.indexOf("function SkillCard"), page.indexOf("function VersionButton"));
    assert.match(skillCard, /item\.skill\.name/);
    for (const detail of ["item.skill.summary", "manifest?.capabilities", "inputArtifactTypes", "outputArtifactTypes"]) assert.equal(skillCard.includes(detail), false);
});

test("admin independent trial receives the selected Skill executor", () => {
    const page = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /executorKind=\{detailQuery\.data\?\.package\.manifest\.executorKind\}/);
});
