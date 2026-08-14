import assert from "node:assert/strict";
import test from "node:test";

import { navigationTools } from "./navigation-tools.ts";

test("keeps video workflow inside projects instead of the global navigation", () => {
    assert.deepEqual(
        navigationTools.map((tool) => tool.slug),
        ["projects", "canvas", "storyboard", "assets", "prompts", "cache"],
    );
});

test("keeps production control inside projects instead of a peer top-level entry", () => {
    assert.equal(navigationTools.some((tool) => tool.slug === "agent"), false);
    assert.deepEqual(navigationTools[0], { slug: "projects", label: "项目中心", shortLabel: "项目", icon: navigationTools[0].icon });
});

test("keeps the prompt library as a standalone navigation tool", () => {
    assert.deepEqual(
        navigationTools.filter((tool) => tool.slug === "prompts").map(({ label, shortLabel }) => ({ label, shortLabel })),
        [{ label: "提示词库", shortLabel: "提示词" }],
    );
});

test("keeps storyboard navigation and removes the duplicate image workbench", () => {
    assert.deepEqual(
        navigationTools.filter((tool) => tool.slug === "image" || tool.slug === "storyboard").map(({ slug, label, shortLabel }) => ({ slug, label, shortLabel })),
        [{ slug: "storyboard", label: "分镜制作台", shortLabel: "分镜" }],
    );
});
