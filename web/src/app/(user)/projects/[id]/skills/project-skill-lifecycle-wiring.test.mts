import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("project Skill management uses the shared folder-first lifecycle", () => {
    for (const text of ["导入项目 Skill 文件夹", "导入新版本", "独立试运行", "设为可用", "技术详情与底层契约"]) assert.ok(page.includes(text), `missing ${text}`);
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
