import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routeUrl = new URL("./[subjectId]/page.tsx", import.meta.url);

test("adds a dedicated dynamic route for a subject production workbench", () => {
    assert.equal(existsSync(routeUrl), true);
    const source = readFileSync(routeUrl, "utf8");
    assert.match(source, /useParams<\{ subjectId: string \}>/);
    assert.match(source, /subject\.id === params\.subjectId/);
    assert.match(source, /<AssetVariantNav/);
    assert.match(source, /<AssetReferencePanel/);
    assert.match(source, /<AssetCandidateGrid/);
    assert.match(source, /<AssetVersionPanel/);
});

test("provides a safe missing-subject state and responsive production layout", () => {
    const source = readFileSync(routeUrl, "utf8");
    assert.match(source, /没有找到这个资产主体/);
    assert.match(source, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(0,7fr\)\]/);
    assert.match(source, /href="\/assets"/);
});

test("keeps all workbench components private to the subject route", () => {
    for (const file of ["asset-variant-nav.tsx", "asset-reference-panel.tsx", "asset-candidate-grid.tsx", "asset-version-panel.tsx", "asset-related-media-panel.tsx"]) {
        assert.equal(existsSync(new URL(`./[subjectId]/components/${file}`, import.meta.url)), true, file);
    }
});
