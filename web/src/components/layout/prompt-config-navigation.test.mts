import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { navigationTools } from "../../constant/navigation-tools.ts";

const modal = readFileSync(new URL("./app-config-modal.tsx", import.meta.url), "utf8");

test("prompt center is a secondary configuration instead of a primary navigation tool", () => {
    assert.equal(navigationTools.some((tool) => tool.slug === "prompts"), false);
    assert.ok(modal.includes("提示词配置"));
    assert.ok(modal.includes('router.push("/prompts")'));
    assert.match(modal, /const openPromptConfig = \(\) => \{\s*setConfigDialogOpen\(false\);\s*router\.push\("\/prompts"\);\s*\};/);
});
