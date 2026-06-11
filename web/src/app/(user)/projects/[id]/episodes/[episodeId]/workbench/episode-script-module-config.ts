import type { ScriptEpisode, ScriptScene } from "../../../../../canvas/utils/script-management";
import type { EpisodeModuleConfig, EpisodeModuleRow } from "./components/episode-module-panel";
import { extractEpisodeOverview, padEpisodeOrder, uniqueTextList } from "./episode-workbench-display";

export function buildScriptModuleConfig(input: {
    episode: ScriptEpisode;
    hasScript: boolean;
    onOptimizeScript: () => void;
    onSaveScript: () => void;
    runningStageIds: Record<string, boolean>;
    scriptOptimizing: boolean;
    scriptDraft: string;
    scriptSnapshot: string;
    stageSceneRows: ScriptScene[];
}): EpisodeModuleConfig {
    const characters = uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).join("、") || "待导演分析确认";
    const sceneList = input.stageSceneRows.map((scene) => `第 ${padEpisodeOrder(scene.order)} 场 ${scene.location || "未标注地点"}：${scene.beat || scene.dialogue || "待补充"}`).join("\n") || "暂无结构化场次；可在详情查看剧本文本。";
    const scriptBody = input.scriptSnapshot || input.scriptDraft || "暂无本集剧本。";
    const scriptChanged = input.scriptDraft.trim() !== input.scriptSnapshot.trim();
    const scriptOptimizing = input.scriptOptimizing;
    const scriptOverview = extractEpisodeOverview(input.episode.summary || input.scriptSnapshot) || (input.hasScript ? `已导入本集剧本，完整正文 ${scriptBody.length} 字，点击查看。` : "尚未导入本集剧本。");
    const sceneListPreview = input.stageSceneRows.length ? `已整理 ${input.stageSceneRows.length} 个结构化场次，点击查看列表。` : "暂无结构化场次；可在详情查看剧本文本。";
    const rows: EpisodeModuleRow[] = [
        {
            actionLabel: "查看",
            cells: ["剧本摘要", scriptOverview, `${input.stageSceneRows.length} 场`],
            detail: { body: scriptBody, meta: [{ label: "场次数", value: String(input.stageSceneRows.length) }], subtitle: "本集剧本全文只在详情中展示，主列表保持总览。", title: "剧本摘要" },
            highlight: !input.hasScript,
            id: "script-summary",
            status: input.hasScript ? "已完成" : "待生成",
            tone: input.hasScript ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["场次列表", sceneListPreview, `${input.stageSceneRows.length} 条`],
            detail: { body: sceneList, subtitle: "结构化场次列表。", title: "场次列表" },
            id: "script-scenes",
            status: input.stageSceneRows.length ? "已完成" : "待确认",
            tone: input.stageSceneRows.length ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["核心冲突", input.episode.hook || "待补充核心冲突。", "故事钩子"],
            detail: { body: input.episode.hook || scriptBody, title: "核心冲突" },
            id: "script-conflict",
            status: input.episode.hook ? "已完成" : "待确认",
            tone: input.episode.hook ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["人物", characters, `${uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).length} 人`],
            detail: { body: characters, title: "人物" },
            id: "script-characters",
            status: characters === "待导演分析确认" ? "待确认" : "已完成",
            tone: characters === "待导演分析确认" ? "amber" : "green",
        },
        {
            actionLabel: "查看",
            cells: ["爽点", input.episode.turningPoint || "待补充爽点 / 转折。", "转折"],
            detail: { body: input.episode.turningPoint || scriptBody, title: "爽点" },
            id: "script-high-point",
            status: input.episode.turningPoint ? "已完成" : "待确认",
            tone: input.episode.turningPoint ? "green" : "amber",
        },
        {
            actionLabel: "查看",
            cells: ["反转点", input.episode.cliffhanger || "待补充反转点 / 悬念。", "悬念"],
            detail: { body: input.episode.cliffhanger || scriptBody, title: "反转点" },
            id: "script-reversal",
            status: input.episode.cliffhanger ? "已完成" : "待确认",
            tone: input.episode.cliffhanger ? "green" : "amber",
        },
    ];
    return {
        actions: input.hasScript
            ? [
                  { disabled: !input.scriptDraft.trim(), label: "AI 优化剧本", loading: scriptOptimizing, onClick: input.onOptimizeScript },
                  { disabled: !input.scriptDraft.trim() || scriptOptimizing, label: scriptChanged ? "确认提交剧本" : "进入导演分析", onClick: input.onSaveScript, primary: true },
              ]
            : [{ disabled: !input.scriptDraft.trim(), label: "导入剧本", onClick: input.onSaveScript, primary: true }],
        columns: "110px minmax(300px,1fr) 80px 90px 80px",
        emptyText: "暂无剧本条目",
        filters: ["全部", "已完成", "待确认", "待生成"],
        headers: ["类型", "内容", "引用", "状态", "操作"],
        rows,
        notice: input.hasScript
            ? {
                  text: "这里负责把原始剧本整理成后续 Agent 更容易理解的输入。你可以先用 AI 优化，再直接在优化稿上修改，最后确认提交进入导演分析。",
                  title: "剧本是后续工作流的输入源",
                  tone: scriptOptimizing ? "cyan" : "slate",
              }
            : {
                  text: "请先导入或粘贴本集剧本。保存后再进行导演分析，避免后续 Agent 基于空输入运行。",
                  title: "缺少剧本输入",
                  tone: "amber",
              },
        runningPreview: scriptOptimizing
            ? {
                  title: "剧本优化 Agent 正在处理",
                  lines: ["保留原剧情和人物关系，不改写核心事实。", "整理场次、动作、对白和关键视觉信息，让后续导演分析、资产提取、分镜更稳定。", "优化稿会写回当前编辑区，确认提交前不会进入下一步。"],
              }
            : undefined,
        subtitle: "先把剧本优化成后续 Agent 可稳定读取的版本；这里不做导演分析。",
        summary: [
            { label: "剧本状态", tone: input.hasScript ? "green" : "amber", value: input.hasScript ? "已导入" : "待导入" },
            { label: "场次", value: String(input.stageSceneRows.length) },
            { label: "人物", value: String(uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).length) },
            { label: "文本量", tone: input.hasScript ? "cyan" : "slate", value: `${scriptBody.length} 字` },
        ],
        title: "剧本模块",
    };
}
