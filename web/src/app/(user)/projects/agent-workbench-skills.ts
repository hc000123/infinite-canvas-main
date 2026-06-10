import type { Prompt } from "@/services/api/prompts";
import type { Asset } from "@/stores/use-asset-store";

import { assetGenerationRecords } from "../assets/asset-generation.ts";
import type { ScriptScene } from "../canvas/utils/script-management";
import type { StoryboardShot } from "../canvas/utils/storyboard-management";
import type { AgentSkill, AgentSkillApplyContext, AgentSkillOutput, AgentTask, AgentTaskTargetRef, AgentTargetRefKind, AgentWorkbenchInput } from "./agent-workbench-types";

const skillInputSchema = {
    type: "object",
    required: ["projectId", "assets", "productionBibleItems", "prompts", "scriptEpisodes", "scriptScenes", "storyboardGroups", "storyboardShots"],
};

const skillOutputSchema = {
    type: "object",
    required: ["title", "summary", "targetRefs", "proposedActions"],
};

export const agentSkillRegistry: AgentSkill[] = [
    {
        id: "asset.gap_check",
        name: "资产缺口检查 Skill",
        agentKind: "asset_manager",
        description: "检查当前项目设定库和分镜中缺少绑定素材的对象。",
        version: "1.0.0",
        inputSchema: skillInputSchema,
        outputSchema: skillOutputSchema,
        riskLevel: "low",
        run: runAssetGapCheckSkill,
        apply: applyProposedActions,
    },
    {
        id: "asset.reuse_duplicate_scan",
        name: "素材复用/重复检测 Skill",
        agentKind: "asset_manager",
        description: "识别当前项目可复用素材、疑似重复素材，并为未打标签素材生成补标签动作。",
        version: "1.0.0",
        inputSchema: skillInputSchema,
        outputSchema: skillOutputSchema,
        riskLevel: "low",
        run: runAssetReuseDuplicateSkill,
        apply: applyProposedActions,
    },
    {
        id: "prompt.storyboard_completion",
        name: "分镜提示词补全 Skill",
        agentKind: "prompt_engineer",
        description: "基于提示词仓库、设定库和分镜描述补全分镜提示词草案。",
        version: "1.0.0",
        inputSchema: skillInputSchema,
        outputSchema: skillOutputSchema,
        riskLevel: "medium",
        run: runStoryboardPromptCompletionSkill,
        apply: applyProposedActions,
    },
    {
        id: "storyboard.scene_to_draft",
        name: "剧本场次转分镜草案 Skill",
        agentKind: "storyboard_director",
        description: "把尚未进入分镜的剧本场次转换成分镜组和分镜条目草案。",
        version: "1.0.0",
        inputSchema: skillInputSchema,
        outputSchema: skillOutputSchema,
        riskLevel: "medium",
        run: runScriptSceneToStoryboardDraftSkill,
        apply: applyProposedActions,
    },
];

export const defaultAgentSkill: AgentSkill = {
    id: "agent.default_apply",
    name: "默认任务应用器",
    agentKind: "asset_manager",
    description: "兼容旧任务的本地应用器。",
    version: "1.0.0",
    inputSchema: skillInputSchema,
    outputSchema: skillOutputSchema,
    riskLevel: "low",
    run: () => ({ title: "空任务", summary: "", targetRefs: [], proposedActions: [] }),
    apply: applyProposedActions,
};

function runAssetGapCheckSkill(input: AgentWorkbenchInput): AgentSkillOutput {
    const missingBibleRefs = input.productionBibleItems.filter((item) => item.projectId === input.projectId && !item.assetRefs.length);
    const missingShotRefs = projectShots(input).filter((shot) => !shot.assetRefs.length);
    return {
        title: "资产缺口检查：设定与分镜引用巡检",
        targetRefs: [...missingBibleRefs.map((item) => targetRef("production_bible", item.id, item.name || "未命名设定")), ...missingShotRefs.map((shot) => targetRef("storyboard_shot", shot.id, shot.title || "未命名分镜"))],
        summary: [`发现 ${missingBibleRefs.length} 个设定项没有绑定素材。`, `发现 ${missingShotRefs.length} 条分镜没有参考素材。`, "本技能只输出缺口建议，不自动创建或删除素材。"].join("\n"),
        riskLevel: "low",
        proposedActions: [],
    };
}

function runAssetReuseDuplicateSkill(input: AgentWorkbenchInput): AgentSkillOutput {
    const projectAssetIds = projectAssetIdSet(input);
    const projectAssets = input.assets.filter((asset) => projectAssetIds.has(asset.id) || assetGenerationRecords(asset).some((record) => record.projectId === input.projectId));
    const duplicateGroups = duplicateAssetGroups(projectAssets);
    const taglessAssets = projectAssets.filter((asset) => !asset.tags.length).slice(0, 6);
    return {
        title: "素材复用/重复检测：项目素材整理建议",
        targetRefs: [...taglessAssets.map((asset) => targetRef("asset", asset.id, asset.title || "未命名素材")), ...duplicateGroups.flatMap((group) => group.slice(0, 2).map((asset) => targetRef("asset", asset.id, asset.title || "疑似重复素材")))],
        summary: [
            `当前项目可复用素材 ${projectAssets.length} 个。`,
            duplicateGroups.length ? `疑似重复素材 ${duplicateGroups.length} 组，可人工合并或补充标签区分。` : "暂未发现明显重复素材。",
            taglessAssets.length ? `建议为 ${taglessAssets.length} 个素材补充基础标签。` : "当前项目素材标签较完整。",
        ].join("\n"),
        riskLevel: "low",
        proposedActions: taglessAssets.map((asset) => ({
            type: "asset.add_tags",
            assetId: asset.id,
            tags: ["项目素材", asset.kind === "video" ? "视频结果" : asset.kind === "image" ? "参考图" : "待整理"],
            reason: "素材缺少标签，建议补上项目内检索标签。",
        })),
    };
}

function runStoryboardPromptCompletionSkill(input: AgentWorkbenchInput): AgentSkillOutput {
    const shots = projectShots(input);
    const incompleteShots = shots.filter((shot) => !shot.prompt.trim() || !shot.effectivePrompt.trim()).slice(0, 5);
    const bibleSnippets = input.productionBibleItems
        .filter((item) => item.projectId === input.projectId)
        .flatMap((item) => [item.promptSnippets.positive, item.promptSnippets.consistency])
        .filter(isNonEmptyString);
    const promptTemplates = input.prompts.filter((prompt) => prompt.metadata?.type === "video" || prompt.metadata?.type === "positive" || prompt.metadata?.type === "workflow").slice(0, 3);
    return {
        title: "提示词工程：分镜提示词补全",
        targetRefs: [...incompleteShots.map((shot) => targetRef("storyboard_shot", shot.id, shot.title || "未命名分镜")), ...promptTemplates.map((prompt) => targetRef("prompt", prompt.id, prompt.title))],
        summary: [
            `扫描到 ${shots.length} 条分镜，其中 ${incompleteShots.length} 条提示词需要补全。`,
            promptTemplates.length ? `可参考 ${promptTemplates.length} 个视频/正向/工作流模板。` : "暂无可直接复用的视频模板，建议先维护提示词仓库。",
            bibleSnippets.length ? `已读取 ${bibleSnippets.length} 条设定库正向/一致性片段。` : "设定库还没有可复用的一致性片段。",
        ].join("\n"),
        riskLevel: incompleteShots.length ? "medium" : "low",
        proposedActions: incompleteShots.map((shot) => {
            const prompt = buildShotPromptSuggestion(shot, bibleSnippets, promptTemplates);
            return {
                type: "storyboard.update_shot_prompt",
                shotId: shot.id,
                prompt,
                effectivePrompt: prompt,
                reason: "分镜提示词为空或未补全，建议先填入可审核的基础版本。",
            };
        }),
    };
}

function runScriptSceneToStoryboardDraftSkill(input: AgentWorkbenchInput): AgentSkillOutput {
    const projectEpisodes = input.scriptEpisodes.filter((episode) => episode.projectId === input.projectId);
    const projectScenes = input.scriptScenes.filter((scene) => projectEpisodes.some((episode) => episode.id === scene.episodeId));
    const storyboardSceneIds = new Set(projectScenes.map((scene) => scene.storyboardGroupId).filter(Boolean));
    const candidateEpisode = projectEpisodes.find((episode) => projectScenes.some((scene) => scene.episodeId === episode.id && !scene.storyboardGroupId)) || projectEpisodes[0];
    const candidateScenes = candidateEpisode ? projectScenes.filter((scene) => scene.episodeId === candidateEpisode.id && !scene.storyboardGroupId).slice(0, 6) : [];
    return {
        title: "分镜导演：剧本场次转分镜草案",
        targetRefs: [
            ...(candidateEpisode ? [targetRef("script_episode", candidateEpisode.id, candidateEpisode.title || "未命名分集")] : []),
            ...candidateScenes.map((scene) => targetRef("script_scene", scene.id, scene.beat || scene.location || "未命名场次")),
        ],
        summary: [
            `当前项目已有 ${projectEpisodes.length} 个分集、${projectScenes.length} 个场次。`,
            `已关联分镜的场次约 ${storyboardSceneIds.size} 组。`,
            candidateScenes.length ? `建议先把 ${candidateScenes.length} 个未入分镜的场次生成草案。` : "没有发现可直接生成草案的未分镜场次。",
        ].join("\n"),
        riskLevel: candidateScenes.length ? "medium" : "low",
        proposedActions:
            candidateEpisode && candidateScenes.length
                ? [
                      {
                          type: "storyboard.create_group_from_scenes",
                          episodeId: candidateEpisode.id,
                          title: `${candidateEpisode.title || "未命名分集"} 分镜草案`,
                          sceneIds: candidateScenes.map((scene) => scene.id),
                          shots: candidateScenes.map((scene, index) => ({
                              sceneId: scene.id,
                              title: `${candidateEpisode.title || "分集"}-${index + 1}`,
                              description: scene.beat || scene.location || scene.dialogue.slice(0, 80),
                              prompt: buildSceneStoryboardPrompt(scene),
                              effectivePrompt: buildSceneStoryboardPrompt(scene),
                              durationHint: scene.durationHint,
                          })),
                          reason: "把未进入分镜的剧本场次转换为可编辑分镜草案。",
                      },
                  ]
                : [],
    };
}

function applyProposedActions(task: AgentTask, context: AgentSkillApplyContext) {
    task.proposedActions.forEach((action) => context.applyAction(action));
}

function projectShots(input: AgentWorkbenchInput) {
    const groupIds = new Set(input.storyboardGroups.filter((group) => group.projectId === input.projectId).map((group) => group.id));
    return input.storyboardShots.filter((shot) => groupIds.has(shot.groupId));
}

function projectAssetIdSet(input: AgentWorkbenchInput) {
    return new Set<string>([
        ...input.productionBibleItems.filter((item) => item.projectId === input.projectId).flatMap((item) => item.assetRefs.map((ref) => ref.assetId)),
        ...projectShots(input).flatMap((shot) => [...shot.assetRefs.map((ref) => ref.assetId), ...shot.resultAssetIds]),
    ]);
}

function duplicateAssetGroups(assets: Asset[]) {
    const groups = new Map<string, Asset[]>();
    assets.forEach((asset) => {
        const key = `${asset.kind}:${asset.title.trim().toLowerCase()}`;
        groups.set(key, [...(groups.get(key) || []), asset]);
    });
    return Array.from(groups.values()).filter((items) => items.length > 1);
}

function buildShotPromptSuggestion(shot: StoryboardShot, bibleSnippets: string[], prompts: Prompt[]) {
    return [shot.description || shot.title, bibleSnippets[0], prompts[0]?.prompt].filter(Boolean).join("\n");
}

function buildSceneStoryboardPrompt(scene: ScriptScene) {
    return [`场景：${scene.location || "待定地点"}`, scene.beat ? `剧情节拍：${scene.beat}` : "", scene.emotion ? `情绪：${scene.emotion}` : "", scene.dialogue ? `对白：${scene.dialogue}` : "", scene.durationHint ? `时长建议：${scene.durationHint}` : ""]
        .filter(Boolean)
        .join("\n");
}

function targetRef(kind: AgentTargetRefKind, id: string, label: string): AgentTaskTargetRef {
    return { kind, id, label };
}

function isNonEmptyString(value: string | undefined): value is string {
    return Boolean(value?.trim());
}
