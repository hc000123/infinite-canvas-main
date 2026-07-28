import assert from "node:assert/strict";
import test from "node:test";

import { defaultEpisodeCode, episodeProductionName, isValidEpisodeCode, normalizeEpisodeCode } from "./script-management.ts";

test("normalizes and validates standard episode codes", () => {
    assert.equal(normalizeEpisodeCode(" ep01 "), "EP01");
    assert.equal(isValidEpisodeCode("EP108"), true);
    assert.equal(isValidEpisodeCode("ep1"), false);
    assert.equal(defaultEpisodeCode(7), "EP07");
});

test("builds cross-platform-safe episode production names", () => {
    assert.equal(episodeProductionName(" ep01 ", "-1"), "EP01-1");
    assert.equal(episodeProductionName("EP02", "第 1 场：室内/夜"), "EP02-第-1-场-室内-夜");
    assert.equal(episodeProductionName("EP03", "角色.A · B?*"), "EP03-角色-A-B");
    assert.equal(episodeProductionName("EP04", " · "), "EP04-未命名集数");
});
