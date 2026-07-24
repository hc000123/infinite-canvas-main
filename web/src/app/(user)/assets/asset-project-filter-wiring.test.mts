import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readAssetFile = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("asset page wires mutually exclusive workflow and canvas selectors", () => {
    const panel = readAssetFile("./components/asset-filter-panel.tsx");
    const actions = readAssetFile("./use-asset-filter-actions.ts");
    const query = readAssetFile("./use-asset-page-query.ts");
    const page = readAssetFile("./page.tsx");

    assert.match(panel, /placeholder="工作流项目"/);
    assert.match(panel, /placeholder="画布"/);
    assert.match(panel, /onCanvasLibraryFilterChange\(""\)/);
    assert.match(panel, /onProjectContextFilterChange\(""\)/);
    assert.doesNotMatch(panel, /PROJECT_FILTER_COLLAPSED_COUNT/);
    assert.match(actions, /changeCanvasLibraryFilter/);
    assert.match(query, /const \[canvasLibraryFilter, setCanvasLibraryFilter\] = useState\(""\)/);
    assert.match(page, /onCanvasLibraryFilterChange: assetFilterActions\.changeCanvasLibraryFilter/);
});
