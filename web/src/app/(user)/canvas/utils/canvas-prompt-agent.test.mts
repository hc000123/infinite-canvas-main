import assert from "node:assert/strict";
import test from "node:test";

import { buildPromptAgentCanvasActions } from "./canvas-prompt-agent-actions.ts";
import { formatPromptAgentOutputText } from "./canvas-prompt-agent-render.ts";
import { parsePromptAgentPlan } from "./canvas-prompt-agent.ts";

test("parses a valid image prompt agent plan", () => {
    const raw = JSON.stringify({
        intent: "image_prompt",
        reply: "已整理图片提示词。",
        outputs: [
            {
                id: "out-1",
                kind: "image_prompt",
                title: "雨夜角色",
                finalPrompt: "cinematic rain portrait",
                subject: "角色",
                style: "电影感",
            },
        ],
        actions: [{ id: "act-1", type: "node.create_image_config", outputId: "out-1", title: "雨夜角色生图配置" }],
    });

    const result = parsePromptAgentPlan(raw);

    assert.equal(result.ok, true);
    assert.equal(result.plan?.intent, "image_prompt");
    assert.equal(result.plan?.reply, "已整理图片提示词。");
    assert.equal(result.plan?.outputs[0].kind, "image_prompt");
    assert.equal(result.plan?.actions[0].type, "node.create_image_config");
});

test("falls back to plain text when agent output is not JSON", () => {
    const result = parsePromptAgentPlan("不是 JSON");

    assert.equal(result.ok, false);
    assert.match(result.text, /不是 JSON/);
});

test("maps a video prompt plan to a video config node action", () => {
    const plan = {
        intent: "video_prompt" as const,
        reply: "已整理视频提示词。",
        outputs: [
            {
                id: "v1",
                kind: "video_prompt" as const,
                title: "追逐镜头",
                finalPrompt: "低机位跟拍奔跑",
                duration: "6",
                ratio: "16:9",
            },
        ],
        actions: [{ id: "a1", type: "node.create_video_config" as const, outputId: "v1", title: "追逐镜头视频配置" }],
    };

    const result = buildPromptAgentCanvasActions({ plan, nodes: [], connections: [], selectedNodeIds: [] });

    assert.equal(result?.actions.length, 1);
    assert.equal(result?.actions[0].type, "node.create_config");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.mode : "", "video");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.config?.prompt : "", "低机位跟拍奔跑");
    assert.equal(result?.actions[0].kind === "write" ? result.actions[0].payload.config?.duration : "", "6");
});

test("maps a storyboard prompt plan to multiple text node actions", () => {
    const plan = {
        intent: "storyboard_prompt" as const,
        reply: "已拆分分镜。",
        outputs: [
            {
                id: "s1",
                kind: "storyboard_prompt" as const,
                title: "雨夜追逐",
                summary: "两个镜头",
                shots: [
                    { id: "shot-1", title: "镜头 1", visual: "雨夜街道，角色回头", action: "快速奔跑", camera: "手持跟拍", videoPrompt: "雨夜手持跟拍奔跑" },
                    { id: "shot-2", title: "镜头 2", visual: "霓虹灯下停住", action: "喘息", camera: "推近特写", videoPrompt: "霓虹灯下推近特写" },
                ],
            },
        ],
        actions: [{ id: "a2", type: "node.create_storyboard_group" as const, outputId: "s1", title: "雨夜追逐分镜" }],
    };

    const result = buildPromptAgentCanvasActions({ plan, nodes: [], connections: [], selectedNodeIds: [] });

    assert.equal(result?.actions.length, 2);
    assert.equal(result?.actions[0].type, "node.create_text");
    assert.equal(result?.actions[1].type, "node.create_text");
    assert.match(result?.actions[0].kind === "write" ? result.actions[0].payload.content : "", /雨夜手持跟拍奔跑/);
});

test("formats storyboard output into readable shot text", () => {
    const text = formatPromptAgentOutputText({
        id: "s1",
        kind: "storyboard_prompt",
        title: "雨夜追逐",
        summary: "两镜头追逐",
        shots: [
            { id: "shot-1", title: "镜头 1", visual: "雨夜街道，角色回头", camera: "手持跟拍", videoPrompt: "雨夜手持跟拍奔跑" },
            { id: "shot-2", title: "镜头 2", visual: "霓虹灯下停住", camera: "推近特写", videoPrompt: "霓虹灯下推近特写" },
        ],
    });

    assert.match(text, /雨夜追逐/);
    assert.match(text, /1\. 镜头 1/);
    assert.match(text, /雨夜手持跟拍奔跑/);
    assert.match(text, /2\. 镜头 2/);
});
