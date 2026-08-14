import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readAssetFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("asset page wires project then source then project child canvas selectors", () => {
    const panel = readAssetFile("./components/asset-filter-panel.tsx");
    const header = readAssetFile("./components/asset-page-header.tsx");
    const actions = readAssetFile("./use-asset-filter-actions.ts");
    const query = readAssetFile("./use-asset-page-query.ts");
    const page = readAssetFile("./page.tsx");

    assert.match(header, /所有项目/);
    assert.match(header, /onProjectChange/);
    assert.match(panel, />\s*全部来源\s*</);
    assert.match(panel, />\s*工作流\s*</);
    assert.match(panel, />\s*画布\s*</);
    assert.match(panel, /placeholder="选择画布"/);
    assert.match(panel, /sourceScope === "canvas"/);
    assert.doesNotMatch(panel, /placeholder="工作流项目"/);
    assert.doesNotMatch(panel, /PROJECT_FILTER_COLLAPSED_COUNT/);
    assert.match(actions, /changeCanvasLibraryFilter/);
    assert.match(actions, /changeSourceScope/);
    assert.match(query, /const \[canvasLibraryFilter, setCanvasLibraryFilter\] = useState\(""\)/);
    assert.match(query, /canvasIdsForCreativeProject/);
    assert.doesNotMatch(query, /if \(!initialProjectId\) return;/);
    assert.match(page, /workspaceProjectId\("\/assets", searchParams\)/);
    assert.match(page, /params\.set\("projectId", value\)/);
    assert.match(page, /router\.replace\(query \? `\$\{pathname\}\?\$\{query\}` : pathname/);
    assert.match(page, /const activeContextFolderId = activeFolderId \|\| projectFolderRows\.find\(\(item\) => item\.project\.id === projectContextFilter\)\?\.folder\.id/);
    assert.ok((page.match(/activeFolderId: activeContextFolderId/g) || []).length >= 2);
    assert.match(readAssetFile("./use-asset-editor-actions.ts"), /folderId: asset\.folderId \|\| activeFolderId \|\| ""/);
    assert.match(page, /onCanvasLibraryFilterChange: assetFilterActions\.changeCanvasLibraryFilter/);
    assert.match(page, /onSourceScopeChange: assetFilterActions\.changeSourceScope/);
});

test("subject workbench returns to its project asset library", () => {
    const source = readAssetFile("./[subjectId]/page.tsx");
    assert.match(source, /const backHref = requestedReturnTo\.startsWith\("\/"\)[\s\S]*`\/assets\?projectId=\$\{encodeURIComponent\(subject\.projectId\)\}`/);
    assert.match(source, /<Link href=\{backHref\}/);
});
