import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { AdminPublicModelChannelSettings } from "@/services/api/admin.ts";
import { skillTrialModelBlockReason } from "./skill-trial-model-preflight.ts";

function channel(defaultTextModel = "", defaultImageModel = "") {
    return { defaultTextModel, defaultImageModel } as AdminPublicModelChannelSettings;
}

test("requires the explicit default for the Skill executor", () => {
    assert.equal(skillTrialModelBlockReason("text_model", channel("", "image-model")), "缺少默认文本模型");
    assert.equal(skillTrialModelBlockReason("image_model", channel("text-model", "")), "缺少默认图片模型");
    assert.equal(skillTrialModelBlockReason("text_model", channel("text-model", "")), "");
    assert.equal(skillTrialModelBlockReason("image_model", channel("", "image-model")), "");
    assert.equal(skillTrialModelBlockReason("text_model", {} as AdminPublicModelChannelSettings), "缺少默认文本模型");
});

test("does not invent a model requirement for an unknown executor", () => {
    assert.equal(skillTrialModelBlockReason("fixed_adapter", channel()), "");
    assert.equal(skillTrialModelBlockReason(undefined, channel()), "");
});

test("trial panel reads raw public defaults and blocks submission with an actionable message", () => {
    const panel = readFileSync(new URL("./skill-trial-panel.tsx", import.meta.url), "utf8");
    assert.match(panel, /state\.publicSettings\?\.modelChannel/);
    assert.match(panel, /skillTrialModelBlockReason\(executorKind, modelChannel\)/);
    assert.match(panel, /disabled: Boolean\(modelBlockReason\)/);
    assert.match(panel, /\/admin\/settings/);
    assert.match(panel, /请联系管理员配置默认模型/);
    assert.doesNotMatch(panel, /resolveEffectiveConfig/);
});
