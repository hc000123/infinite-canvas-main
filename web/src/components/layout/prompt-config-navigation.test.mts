import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { navigationTools } from "../../constant/navigation-tools.ts";

const modal = readFileSync(new URL("./app-config-modal.tsx", import.meta.url), "utf8");

test("prompt library is primary navigation and is not duplicated in configuration", () => {
    assert.equal(navigationTools.some((tool) => tool.slug === "prompts"), true);
    assert.doesNotMatch(modal, /提示词配置|打开提示词配置|openPromptConfig/);
});
