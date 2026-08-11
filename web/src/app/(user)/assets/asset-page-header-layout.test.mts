import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./components/asset-page-header.tsx", import.meta.url), "utf8");

test("desktop asset filters keep readable widths and wrap instead of truncating", () => {
    assert.match(source, /2xl:flex-wrap/);
    assert.match(source, /2xl:w-40 2xl:shrink-0/);
    assert.match(source, /2xl:!w-56 2xl:shrink-0/);
    assert.match(source, /2xl:w-36 2xl:shrink-0/);
    assert.ok((source.match(/studio-toolbar-button shrink-0/g) || []).length >= 2);
    assert.match(source, /studio-primary-action shrink-0/);
});
