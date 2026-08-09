import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project Skill management uses the shared folder-first lifecycle", () => {
    for (const text of ["导入项目 Skill", "导入新版本", "独立试运行", "设为可用", "技术详情与底层契约"]) assert.ok(page.includes(text), `missing ${text}`);
    assert.ok(page.includes(">导入项目 Skill</Button>"));
    assert.match(page, /scope="project"/);
    assert.doesNotMatch(page, /Workflow Run ID/);
    assert.doesNotMatch(page, /disabled=\{!detailQuery\.data\}/);
    assert.match(page, /evaluationSummaryJson/);
    assert.doesNotMatch(page, /activeItem\?\.evaluations\.find/);
});

test("archived project Skill versions are view-only", () => {
    assert.match(page, /activeVersion\.status === "archived"/);
});

test("project new version import compares against the selected version", () => {
    assert.match(page, /previousVersionId=\{folderImportMode === "version" \? activeVersionId : undefined\}/);
});

test("folder-imported project versions keep technical contracts read-only", () => {
    assert.match(page, /const importedFolderVersion = activeVersion\?\.sourceKind === "folder_import";/);
    assert.match(page, /readOnly=\{!editable \|\| activeVersion\?\.status !== "draft" \|\| importedFolderVersion\}/);
    assert.match(page, /editable && activeVersion\?\.status === "draft" && !importedFolderVersion/);
});

test("project registry uses the shared fixed-stage drawers", () => {
    for (const text of ["groupSkillItemsByStage", "resolveOpenSkillStageKeys", "openStageKeys", "group.systemCount", "group.projectCount", "group.items.map"]) {
        assert.ok(page.includes(text), `missing stage group wiring ${text}`);
    }
    assert.match(page, /activeKey=\{openStageKeys\}/);
    assert.doesNotMatch(page, /\{items\.map\(/);
});

test("project independent trial receives the selected Skill executor", () => {
    assert.match(page, /executorKind=\{detailQuery\.data\?\.package\.manifest\.executorKind\}/);
});

test("project Skill cards expose a confirmed delete action only for project-owned Skills", () => {
    assert.match(page, /mutationFn: \(skillId: string\) => deleteProjectSkill\(token, skillId\)/);
    assert.ok(page.includes('onDelete={item.skill.ownerType === "project"'));
    assert.ok(page.includes('title={`删除“${item.skill.name}”？`}'));
    assert.ok(page.includes('aria-label={`删除 Skill ${item.skill.name}`}'));
    assert.ok(page.includes("onClick={(event) => event.stopPropagation()}"));
});
