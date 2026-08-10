import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./[subjectId]/page.tsx", import.meta.url), "utf8");
const candidates = readFileSync(new URL("./[subjectId]/components/asset-candidate-grid.tsx", import.meta.url), "utf8");
const versions = readFileSync(new URL("./[subjectId]/components/asset-version-panel.tsx", import.meta.url), "utf8");

test("presents current, pending, history, and references in one hierarchy", () => {
    assert.match(page, /当前版本/);
    assert.match(candidates, /待选结果/);
    assert.match(versions, /历史版本/);
    assert.match(page, /参考资料/);
    assert.doesNotMatch(`${page}\n${candidates}\n${versions}`, /候选资产|生成候选/);
    assert.match(page, /compact=\{subjectVariants\.length === 1\}/);
    assert.match(page, /promoteWorkbenchImage/);
});
