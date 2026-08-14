import assert from "node:assert/strict";
import test from "node:test";
import { navigationTools } from "./navigation-tools.ts";

test("keeps five distinct workspace-level entries", () => {
    assert.deepEqual(navigationTools.map((tool) => tool.slug), ["projects", "agent", "canvas", "assets", "resources"]);
    assert.deepEqual(navigationTools.map((tool) => tool.label), ["工作台", "生产总控", "画布", "素材", "资源库"]);
});

test("keeps storyboard, prompts and cache out of the primary spine", () => {
    assert.equal(navigationTools.some((tool) => ["storyboard", "prompts", "cache"].includes(tool.slug)), false);
});
