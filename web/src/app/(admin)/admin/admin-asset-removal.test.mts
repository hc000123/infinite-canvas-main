import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const webRoot = path.resolve(process.cwd());
const repositoryRoot = path.resolve(webRoot, "..");
const readWeb = (file: string) => readFileSync(path.join(webRoot, file), "utf8");
const readRepository = (file: string) => readFileSync(path.join(repositoryRoot, file), "utf8");

test("admin and canvas no longer expose the server asset library", () => {
    const layout = readWeb("src/app/(admin)/admin/layout.tsx");
    const picker = readWeb("src/app/(user)/canvas/components/asset-picker-modal.tsx");
    const overlays = readWeb("src/app/(user)/canvas/components/canvas-page-overlays.tsx");

    assert.doesNotMatch(layout, /\/admin\/assets|素材管理|PictureOutlined/);
    assert.doesNotMatch(picker, /fetchAssetLibrary|AssetLibraryItem|外部素材库|key:\s*["']library["']/);
    assert.match(picker, /本集资产|全部本地资产/);
    assert.doesNotMatch(overlays, /外部素材/);
    assert.equal(existsSync(path.join(webRoot, "src/app/(admin)/admin/assets/page.tsx")), false);
    assert.equal(existsSync(path.join(webRoot, "src/app/(user)/asset-library/page.tsx")), false);
});

test("server no longer registers or migrates the public asset library", () => {
    const router = readRepository("router/router.go");
    const database = readRepository("repository/db.go");

    assert.doesNotMatch(router, /api\.GET\("\/assets"|admin\.(?:GET|POST|PATCH|DELETE)\("\/(?:assets|asset-projects)/);
    assert.doesNotMatch(database, /&model\.(?:Asset|AssetProject|AssetFolder)\{\}/);
});
