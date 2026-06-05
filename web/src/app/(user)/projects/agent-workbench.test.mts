import assert from "node:assert/strict";
import test from "node:test";

import { agentSkillRegistry, applyAgentSkillTaskActions, buildAgentTasksForKind, buildAssetManagerTask, buildPromptEngineerTask, buildStoryboardDirectorTask, skillsForAgentKind, type AgentWorkbenchInput } from "./agent-workbench.ts";

test("registers first-version agent skills by agent kind", () => {
    assert.deepEqual(
        agentSkillRegistry.map((skill) => skill.id),
        ["asset.gap_check", "asset.reuse_duplicate_scan", "prompt.storyboard_completion", "storyboard.scene_to_draft"],
    );
    assert.deepEqual(
        skillsForAgentKind("asset_manager").map((skill) => skill.id),
        ["asset.gap_check", "asset.reuse_duplicate_scan"],
    );
});

test("asset manager suggests tags for project assets and reports missing refs", () => {
    const task = buildAssetManagerTask({
        ...baseInput(),
        assets: [{ ...imageAsset("asset-1"), tags: [] }],
        productionBibleItems: [{ id: "bible-1", projectId: "project-1", kind: "character", name: "魏梁", description: "", tags: [], assetRefs: [], promptSnippets: {}, createdAt: "now", updatedAt: "now" }],
        storyboardGroups: [storyboardGroup()],
        storyboardShots: [{ ...storyboardShot(), assetRefs: [], resultAssetIds: ["asset-1"] }],
    });

    assert.equal(task.kind, "asset_manager");
    assert.equal(task.skillId, "asset_manager.combined");
    assert.match(task.summary, /设定项没有绑定素材/);
    assert.deepEqual(task.proposedActions[0], {
        type: "asset.add_tags",
        assetId: "asset-1",
        tags: ["项目素材", "参考图"],
        reason: "素材缺少标签，建议补上项目内检索标签。",
    });
});

test("agent kind builds separate skill tasks with trace metadata", () => {
    const tasks = buildAgentTasksForKind("asset_manager", {
        ...baseInput(),
        assets: [{ ...imageAsset("asset-1"), tags: [] }],
        productionBibleItems: [{ id: "bible-1", projectId: "project-1", kind: "character", name: "魏梁", description: "", tags: [], assetRefs: [], promptSnippets: {}, createdAt: "now", updatedAt: "now" }],
        storyboardGroups: [storyboardGroup()],
        storyboardShots: [{ ...storyboardShot(), assetRefs: [], resultAssetIds: ["asset-1"] }],
    });

    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].skillId, "asset.gap_check");
    assert.equal(tasks[0].skillName, "资产缺口检查 Skill");
    assert.equal(tasks[0].skillVersion, "1.0.0");
    assert.equal(tasks[0].proposedActions.length, 0);
    assert.equal(tasks[1].skillId, "asset.reuse_duplicate_scan");
    assert.equal(tasks[1].proposedActions[0].type, "asset.add_tags");
});

test("skill apply uses explicit confirmation callback only", () => {
    const [task] = buildAgentTasksForKind("prompt_engineer", {
        ...baseInput(),
        storyboardGroups: [storyboardGroup()],
        storyboardShots: [{ ...storyboardShot(), prompt: "", effectivePrompt: "", description: "魏梁走上主席台" }],
    });
    const applied: string[] = [];

    applyAgentSkillTaskActions(task, {
        applyAction: (action) => applied.push(action.type),
    });

    assert.deepEqual(applied, ["storyboard.update_shot_prompt"]);
});

test("prompt engineer proposes prompt completion for empty storyboard shots", () => {
    const task = buildPromptEngineerTask({
        ...baseInput(),
        productionBibleItems: [{ id: "bible-1", projectId: "project-1", kind: "scene", name: "操场", description: "", tags: [], assetRefs: [], promptSnippets: { positive: "真实毕业典礼光线" }, createdAt: "now", updatedAt: "now" }],
        prompts: [{ id: "prompt-1", title: "镜头模板", coverUrl: "", prompt: "中景，侧向跟拍", tags: [], category: "", githubUrl: "", preview: "", metadata: { type: "video" }, createdAt: "now", updatedAt: "now" }],
        storyboardGroups: [storyboardGroup()],
        storyboardShots: [{ ...storyboardShot(), prompt: "", effectivePrompt: "", description: "魏梁走上主席台" }],
    });

    assert.equal(task.kind, "prompt_engineer");
    assert.equal(task.proposedActions[0].type, "storyboard.update_shot_prompt");
    if (task.proposedActions[0].type === "storyboard.update_shot_prompt") {
        assert.match(task.proposedActions[0].prompt, /魏梁走上主席台/);
        assert.match(task.proposedActions[0].prompt, /真实毕业典礼光线/);
        assert.match(task.proposedActions[0].prompt, /侧向跟拍/);
    }
});

test("storyboard director previews a group from script scenes without writing state", () => {
    const task = buildStoryboardDirectorTask({
        ...baseInput(),
        scriptEpisodes: [{ id: "episode-1", projectId: "project-1", order: 1, title: "第一集", summary: "", hook: "", turningPoint: "", cliffhanger: "", sceneIds: ["scene-1"], createdAt: "now", updatedAt: "now" }],
        scriptScenes: [{ id: "scene-1", episodeId: "episode-1", order: 1, location: "大学操场", characterIds: [], beat: "毕业典礼开始", dialogue: "无", emotion: "克制", durationHint: "8秒", createdAt: "now", updatedAt: "now" }],
    });

    assert.equal(task.kind, "storyboard_director");
    assert.equal(task.proposedActions[0].type, "storyboard.create_group_from_scenes");
    if (task.proposedActions[0].type === "storyboard.create_group_from_scenes") {
        assert.equal(task.proposedActions[0].sceneIds[0], "scene-1");
        assert.match(task.proposedActions[0].shots[0].prompt, /大学操场/);
    }
});

function baseInput(): AgentWorkbenchInput {
    return {
        projectId: "project-1",
        assets: [],
        productionBibleItems: [],
        prompts: [],
        scriptEpisodes: [],
        scriptScenes: [],
        storyboardGroups: [],
        storyboardShots: [],
        idFactory: () => "task-1",
        now: "now",
    };
}

function imageAsset(id: string) {
    return {
        id,
        kind: "image" as const,
        title: "参考图",
        coverUrl: "",
        tags: [],
        source: "Canvas",
        data: { dataUrl: "", width: 100, height: 100, bytes: 10, mimeType: "image/png" },
        metadata: { generation: { projectId: "project-1" } },
        createdAt: "now",
        updatedAt: "now",
    };
}

function storyboardGroup() {
    return { id: "group-1", projectId: "project-1", order: 1, title: "分镜组", description: "", preset: {}, shotIds: ["shot-1"], createdAt: "now", updatedAt: "now" };
}

function storyboardShot() {
    return {
        id: "shot-1",
        groupId: "group-1",
        order: 1,
        title: "分镜一",
        description: "",
        prompt: "已有提示词",
        effectivePrompt: "已有提示词",
        assetRefs: [],
        nodeRefs: [],
        resultAssetIds: [],
        status: "draft" as const,
        createdAt: "now",
        updatedAt: "now",
    };
}
