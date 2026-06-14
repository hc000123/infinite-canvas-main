import assert from "node:assert/strict";
import test from "node:test";

import { isVideoChannelAuthError, isVideoChannelUpstreamError, normalizeVideoGenerationErrorMessage } from "./video-generation-errors.ts";

test("normalizes legacy relay upstream video errors", () => {
    const message = normalizeVideoGenerationErrorMessage("视频生成失败：中转上游拒绝创建视频任务，请确认该账号已开通当前视频模型。上游返回：fail_submit_task：upstream_error");

    assert.match(message, /视频上游拒绝创建/);
    assert.doesNotMatch(message, /中转/);
    assert.doesNotMatch(message, /上游返回：视频生成失败/);
});

test("detects enterprise ark api key failures as auth errors", () => {
    const message = "AuthenticationError: The API key doesn't exist.";

    assert.equal(isVideoChannelAuthError(message), true);
    assert.equal(isVideoChannelUpstreamError(message), false);
    assert.match(normalizeVideoGenerationErrorMessage(message), /视频通道认证失败/);
});
