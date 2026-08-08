import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("./components/asset-page-header.tsx", import.meta.url), "utf8");
const sectionSource = readFileSync(new URL("./components/asset-subject-section.tsx", import.meta.url), "utf8");

test("routes four production categories through the subject creation flow", () => {
    assert.match(headerSource, /onCreate\("image", "blocking"\)/);
    assert.match(pageSource, /setSubjectCreateCategory\(category\)/);
    assert.match(pageSource, /<AssetSubjectCreateModal/);
    assert.match(pageSource, /router\.push\(`\/assets\/\$\{subjectId\}`\)/);
});

test("keeps ordinary material creation on the existing editor flow", () => {
    assert.match(pageSource, /openCreate\(\{ kind, category \}\)/);
    assert.match(headerSource, /onCreate\(key as AssetKind\)/);
});

test("renders subject cards as direct workbench entries even before formal images exist", () => {
    assert.match(sectionSource, /href=\{`\/assets\/\$\{subject\.id\}`\}/);
    assert.match(sectionSource, /待生产/);
    assert.match(sectionSource, /variants\.filter/);
});
