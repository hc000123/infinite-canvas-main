import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const results = readFileSync(new URL("./components/asset-results-section.tsx", import.meta.url), "utf8");

test("wires the subject-first asset center and inbox", () => {
    assert.match(page, /<AssetCenterNav/);
    assert.match(page, /<AssetInboxSection/);
    assert.match(page, /<AssetOrganizeModal/);
    assert.doesNotMatch(results, /ProductionBibleSummaryCard/);
});
