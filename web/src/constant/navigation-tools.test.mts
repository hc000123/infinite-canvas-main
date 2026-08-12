import assert from "node:assert/strict";
import test from "node:test";

import { navigationTools } from "./navigation-tools.ts";

test("keeps video workflow inside projects instead of the global navigation", () => {
    assert.deepEqual(
        navigationTools.map((tool) => tool.slug),
        ["projects", "agent", "canvas", "storyboard", "assets", "prompts", "cache"],
    );
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
