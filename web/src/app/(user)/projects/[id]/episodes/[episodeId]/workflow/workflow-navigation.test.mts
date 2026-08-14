import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const workbench = readFileSync(new URL("./episode-workflow-workbench.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./components/workflow-header.tsx", import.meta.url), "utf8");

test("workflow renders one validated return target", () => {
    assert.match(page, /returnTo\.startsWith\("\/"\)/);
    assert.match(page, /!returnTo\.startsWith\("\/\/"\)/);
    assert.match(workbench, /returnHref/);
    assert.match(workbench, /returnLabel/);
    assert.match(header, /href=\{props\.returnHref\}/);
    assert.match(header, /aria-label=\{props\.returnLabel\}/);
});
