import assert from "node:assert/strict";
import test from "node:test";
import { navigationTools } from "./navigation-tools.ts";

test("keeps four distinct workspace-level entries", () => {
    assert.deepEqual(navigationTools.map((tool) => tool.slug), ["projects", "canvas", "assets", "resources"]);
    assert.deepEqual(navigationTools.map((tool) => tool.label), ["项目中心", "画布", "资产", "资源库"]);
});

test("keeps storyboard, prompts and cache out of the primary spine", () => {
    assert.equal(navigationTools.some((tool) => ["storyboard", "prompts", "cache"].includes(tool.slug)), false);
});
