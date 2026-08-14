import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { navigationTools } from "../../constant/navigation-tools.ts";

const modal = readFileSync(new URL("./app-config-modal.tsx", import.meta.url), "utf8");
const resources = readFileSync(new URL("../../app/(user)/resources/page.tsx", import.meta.url), "utf8");

test("prompt library is entered from resources and is not duplicated in configuration", () => {
    assert.equal(navigationTools.some((tool) => tool.slug === "prompts"), false);
    assert.equal(navigationTools.some((tool) => tool.slug === "resources"), true);
    assert.match(resources, /href="\/prompts"/);
    assert.match(resources, /提示词库/);
    assert.doesNotMatch(modal, /提示词配置|打开提示词配置|openPromptConfig/);
});
