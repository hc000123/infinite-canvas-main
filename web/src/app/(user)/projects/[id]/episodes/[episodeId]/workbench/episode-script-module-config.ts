import type { ScriptEpisode, ScriptScene } from "../../../../../canvas/utils/script-management";
import type { EpisodeModuleConfig, EpisodeModuleRow } from "./components/episode-module-panel";
import { extractEpisodeOverview, padEpisodeOrder, uniqueTextList } from "./episode-workbench-display";

export function buildScriptModuleConfig(input: {
    episode: ScriptEpisode;
    hasScript: boolean;
    onRunStage: (stageId: string) => void;
    onSaveScript: () => void;
    runningStageIds: Record<string, boolean>;
    scriptDraft: string;
    scriptSnapshot: string;
    stageSceneRows: ScriptScene[];
}): EpisodeModuleConfig {
    const characters = uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).join("、") || "待导演分析确认";
    const sceneList = input.stageSceneRows.map((scene) => `第 ${padEpisodeOrder(scene.order)} 场 ${scene.location || "未标注地点"}：${scene.beat || scene.dialogue || "待补充"}`).join("\n") || "暂无结构化场次；可在详情查看剧本文本。";
    const scriptBody = input.scriptSnapshot || input.scriptDraft || "暂无本集剧本。";
    const scriptChanged = input.scriptDraft.trim() !== input.scriptSnapshot.trim();
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
                  { disabled: !input.scriptDraft.trim() || !scriptChanged, label: "保存修改", onClick: input.onSaveScript },
                  { disabled: false, label: "运行分析", loading: Boolean(input.runningStageIds["director-analysis"]), onClick: () => input.onRunStage("director-analysis"), primary: true },
              ]
            : [{ disabled: !input.scriptDraft.trim(), label: "导入剧本", onClick: input.onSaveScript, primary: true }],
        columns: "110px minmax(300px,1fr) 80px 90px 80px",
        emptyText: "暂无剧本条目",
        filters: ["全部", "已完成", "待确认", "待生成"],
        headers: ["类型", "内容", "引用", "状态", "操作"],
        rows,
        subtitle: "用于承载本集剧本摘要、场次、核心冲突、人物、爽点和反转点；全文在详情抽屉查看。",
        summary: [
            { label: "剧本状态", tone: input.hasScript ? "green" : "amber", value: input.hasScript ? "已导入" : "待导入" },
            { label: "场次", value: String(input.stageSceneRows.length) },
            { label: "人物", value: String(uniqueTextList(input.stageSceneRows.flatMap((scene) => scene.characterIds)).length) },
            { label: "文本量", tone: input.hasScript ? "cyan" : "slate", value: `${scriptBody.length} 字` },
        ],
        title: "剧本模块",
    };
}
