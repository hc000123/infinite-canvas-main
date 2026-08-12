import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("cache page selects visible files and downloads one or many", () => {
    const page = read("./page.tsx");
    const grid = read("./components/cache-file-grid.tsx");
    const api = read("../../../services/api/project-cache.ts");
    assert.match(page, /selectedFileIds/);
    assert.match(page, /全选当前结果/);
    assert.match(page, /下载所选/);
    assert.match(page, /fetchProjectCacheFileBlob/);
    assert.match(page, /downloadProjectCacheSelection/);
    assert.match(grid, /Checkbox/);
    assert.match(grid, /selectedIds/);
    assert.match(grid, /onToggleSelect/);
    assert.match(api, /package\/selection/);
});

test("cached video preview exposes its recorded generation prompt", () => {
    const preview = read("./components/cache-file-preview-modal.tsx");
    assert.match(preview, /file\.kind === "video"/);
    assert.match(preview, /生成提示词/);
    assert.match(preview, /复制提示词/);
    assert.match(preview, /该缓存未记录生成提示词/);
});
