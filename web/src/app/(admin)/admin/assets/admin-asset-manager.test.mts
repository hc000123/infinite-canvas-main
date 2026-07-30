import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("admin asset manager imports files first and organizes them afterwards", () => {
    const page = read("page.tsx");
    const grid = read("components/asset-file-grid.tsx");
    const batch = read("components/asset-batch-organizer.tsx");
    assert.match(page, /type="file" multiple/);
    assert.match(page, /上传素材/);
    assert.match(grid, /onDropFiles/);
    assert.match(page, /整个项目/);
    assert.match(page, /全部集数/);
    assert.match(batch, /批量整理/);
    assert.doesNotMatch(page, /封面 URL|素材 URL|标签，用逗号分隔/);
});

test("admin asset manager exposes independent projects and nested folders", () => {
    const projects = read("components/asset-project-browser.tsx");
    const folders = read("components/asset-folder-tree.tsx");
    assert.match(projects, /新建项目/);
    assert.match(projects, /只填写|项目名称|name/);
    assert.match(folders, /Tree/);
    assert.match(folders, /parentId/);
});
