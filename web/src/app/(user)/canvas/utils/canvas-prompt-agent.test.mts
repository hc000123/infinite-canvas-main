import assert from "node:assert/strict";
import test from "node:test";

import { buildPromptAgentCanvasActions } from "./canvas-prompt-agent-actions.ts";
import { formatPromptAgentOutputText } from "./canvas-prompt-agent-render.ts";
import { buildPromptAgentSystemContext, parsePromptAgentPlan } from "./canvas-prompt-agent.ts";
import { buildPromptAgentSkillContext, promptAgentSkillPacks, promptAgentSkillsForIntent, promptAgentSkillsForSelection } from "./canvas-prompt-agent-skills.ts";
import { buildPromptAgentExecutionPlan, promptAgentToolForAction, updatePromptAgentExecutionState } from "./canvas-prompt-agent-tools.ts";

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

test("selects workflow-derived skills for image prompt intent", () => {
    const skills = promptAgentSkillsForIntent("image_prompt");
    const ids = skills.map((skill) => skill.id);

    assert.ok(ids.includes("original-art-prompt-format"));
    assert.ok(ids.includes("director-method-shot"));
    assert.equal(ids.includes("seedance-copy-only"), false);
});

test("selects copy-only and director skills for storyboard prompt intent", () => {
    const text = buildPromptAgentSkillContext("storyboard_prompt");

    assert.match(text, /Skill 5 轻量分镜/);
    assert.match(text, /Copy-only 代码块字段硬规则/);
    assert.match(text, /情绪物理化/);
    assert.match(text, /清道夫/);
});

test("injects adapted skills into prompt agent system context", () => {
    const context = buildPromptAgentSystemContext({ intent: "video_prompt", selectedReferences: [], workflowContext: "" });

    assert.match(context, /适配 Skill/);
    assert.match(context, /@图N/);
    assert.match(context, /视频第一版只创建配置节点/);
});

test("selects skills from a prompt agent skill pack", () => {
    const packIds = promptAgentSkillPacks.map((pack) => pack.id);
    const imageSkills = promptAgentSkillsForSelection({ intent: "image_prompt", skillPackId: "art-direction" }).map((skill) => skill.id);
    const videoSkills = promptAgentSkillsForSelection({ intent: "video_prompt", skillPackId: "seedance-video" }).map((skill) => skill.id);

    assert.ok(packIds.includes("auto"));
    assert.ok(packIds.includes("art-direction"));
    assert.ok(imageSkills.includes("original-art-prompt-format"));
    assert.ok(imageSkills.includes("director-method-shot"));
    assert.equal(imageSkills.includes("seedance-copy-only"), false);
    assert.ok(videoSkills.includes("seedance-copy-only"));
    assert.ok(videoSkills.includes("mx-shell-copyonly"));
});

test("injects selected skill pack label into prompt agent system context", () => {
    const context = buildPromptAgentSystemContext({ intent: "video_prompt", skillPackId: "seedance-video", selectedReferences: [], workflowContext: "" });

    assert.match(context, /当前 Skill Pack：Seedance 视频/);
    assert.match(context, /Skill 5 轻量分镜/);
    assert.match(context, /清道夫 Copy-only/);
    assert.doesNotMatch(context, /原格式服化道图片提示词/);
});

test("describes prompt agent tools with permissions and cost gates", () => {
    assert.equal(promptAgentToolForAction("node.create_image_config")?.permission, "write_canvas");
    assert.equal(promptAgentToolForAction("image.generate")?.permission, "generate_image");
    assert.equal(promptAgentToolForAction("image.generate")?.requiresConfirmation, true);
    assert.equal(promptAgentToolForAction("video.generate"), null);
});

test("builds mode-aware execution plan for prompt agent actions", () => {
    const plan = {
        intent: "image_prompt" as const,
        reply: "已整理图片提示词。",
        outputs: [
            {
                id: "img-1",
                kind: "image_prompt" as const,
                title: "雨夜角色",
                finalPrompt: "rainy portrait",
            },
        ],
        actions: [
            { id: "create-1", type: "node.create_image_config" as const, outputId: "img-1", title: "创建图片配置" },
            { id: "generate-1", type: "image.generate" as const, outputId: "img-1", title: "生图" },
        ],
    };

    const ask = buildPromptAgentExecutionPlan(plan, "ask");
    const auto = buildPromptAgentExecutionPlan(plan, "auto");
    const review = buildPromptAgentExecutionPlan(plan, "review");

    assert.equal(ask.mode, "ask");
    assert.equal(ask.steps[0].status, "confirm");
    assert.match(ask.summary, /等待确认/);
    assert.equal(auto.steps[0].status, "ready");
    assert.equal(auto.steps[1].status, "confirm");
    assert.match(auto.summary, /自动模式/);
    assert.equal(review.steps[0].status, "blocked");
    assert.match(review.summary, /审核模式/);
});

test("review mode does not build canvas write actions", () => {
    const plan = {
        intent: "image_prompt" as const,
        reply: "只审核。",
        outputs: [
            {
                id: "img-1",
                kind: "image_prompt" as const,
                title: "雨夜角色",
                finalPrompt: "rainy portrait",
            },
        ],
        actions: [{ id: "create-1", type: "node.create_image_config" as const, outputId: "img-1", title: "创建图片配置" }],
    };

    const result = buildPromptAgentCanvasActions({ plan, nodes: [], connections: [], selectedNodeIds: [], agentMode: "review" });

    assert.equal(result, null);
});

test("adds mode constraints to prompt agent system context", () => {
    const autoContext = buildPromptAgentSystemContext({ intent: "image_prompt", agentMode: "auto", selectedReferences: [], workflowContext: "" });
    const reviewContext = buildPromptAgentSystemContext({ intent: "image_prompt", agentMode: "review", selectedReferences: [], workflowContext: "" });

    assert.match(autoContext, /自动模式/);
    assert.match(autoContext, /视频生成仍然禁止自动触发/);
    assert.match(reviewContext, /审核模式/);
    assert.match(reviewContext, /actions 必须为空数组/);
});

test("overrides execution plan steps with runtime status", () => {
    const plan = {
        intent: "image_prompt" as const,
        reply: "已整理图片提示词。",
        outputs: [{ id: "img-1", kind: "image_prompt" as const, title: "雨夜角色", finalPrompt: "rainy portrait" }],
        actions: [{ id: "create-1", type: "node.create_image_config" as const, outputId: "img-1", title: "创建图片配置" }],
    };

    const state = updatePromptAgentExecutionState(undefined, [{ actionId: "create-1", status: "succeeded", note: "已写入画布" }], "已完成 1 个步骤", "2026-06-18T10:00:00.000Z");
    const execution = buildPromptAgentExecutionPlan(plan, "ask", state);

    assert.equal(execution.steps[0].status, "succeeded");
    assert.equal(execution.steps[0].note, "已写入画布");
    assert.equal(execution.succeededCount, 1);
    assert.match(execution.summary, /已完成 1 个步骤/);
});

test("records image generation result without losing existing execution status", () => {
    const initial = updatePromptAgentExecutionState(undefined, [{ actionId: "create-1", status: "succeeded", note: "已写入画布" }], "已完成画布写入", "2026-06-18T10:00:00.000Z");
    const next = updatePromptAgentExecutionState(initial, [{ actionId: "generate-1", status: "succeeded", note: "生成了 2 张图片" }], "生图完成：2 张", "2026-06-18T10:01:00.000Z");

    assert.equal(next.steps["create-1"].status, "succeeded");
    assert.equal(next.steps["generate-1"].status, "succeeded");
    assert.equal(next.steps["generate-1"].note, "生成了 2 张图片");
    assert.equal(next.summary, "生图完成：2 张");
    assert.equal(next.updatedAt, "2026-06-18T10:01:00.000Z");
});
