import type { CanvasProject } from "../../../../../canvas/stores/use-canvas-store";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { workflowMappingPreviewItemKey } from "../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview } from "../../../../agent-runner-types";
import { workflowStageStatusLabel, type WorkflowStageDisplayState } from "../../../../agent-runner-workflow-display";
import type { EpisodeStatusTone } from "./components/episode-module-panel";
import type { CanvasHandoffImportTarget } from "./components/episode-canvas-handoff-utils";
import type { EpisodeSceneOption } from "./use-episode-workbench-state";

export const stageCopy: Record<string, { title: string; agent: string; input: string; output: string; previewTargets: Array<AgentWorkflowMappingPreview["targetType"]> }> = {
    "director-analysis": {
        title: "导演分析",
        agent: "导演分析 Agent",
        input: "本集剧本",
        output: "导演分析、讲戏本、人物清单、场景清单、互动道具清单",
        previewTargets: [],
    },
    "art-design": {
        title: "服化道美术设计",
        agent: "美术设计 Agent",
        input: "导演分析产物、人物 / 场景 / 道具清单、art-design skill / template / examples",
        output: "人物设定提示词、场景 2x2 规划提示词、道具提示词、服化道提示词",
        previewTargets: ["production_bible"],
    },
    "seedance-storyboard": {
        title: "Seedance 分镜",
        agent: "分镜 Agent",
        input: "本集剧本、导演讲戏本、美术设定、参考资产、Seedance 方法论、industrial-quality-rules",
        output: "场次视觉 DNA、生成 P / 镜头 P 拆分表、单 P 任务卡、Seedance 2.0 一键复制提示词",
        previewTargets: ["storyboard_table", "video_node"],
    },
};

export type EpisodeModuleKey = "script" | "director" | "assets" | "storyboard" | "canvas";
export type EpisodeModuleNavStatus = { detail?: string; text: string; tone: EpisodeStatusTone };
export type WorkflowStageDisplaySummary = WorkflowStageDisplayState;

export const episodeModules: Array<{ key: EpisodeModuleKey; label: string }> = [
    { key: "script", label: "剧本" },
    { key: "director", label: "导演分析" },
    { key: "assets", label: "资产与生图" },
    { key: "storyboard", label: "分镜生产包" },
    { key: "canvas", label: "画布承接" },
];

export function latestPreview(previews: AgentWorkflowMappingPreview[], targetType: AgentWorkflowMappingPreview["targetType"]) {
    return previews
        .filter((preview) => preview.targetType === targetType)
        .slice()
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
}

export function buildEpisodePhaseText({
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}) {
    if (!hasScript) return "待导入剧本";
    if (videoPreview || boundCanvas) return "画布承接准备";
    if (storyboardPreview || episodeTableShots.length) return "分镜提示词审核";
    if (productionBiblePreview || artDisplay?.displayStatus === "approved") return "资产与生图待补齐";
    if (directorDisplay?.displayStatus && directorDisplay.displayStatus !== "idle") return `导演分析${workflowStageStatusLabel(directorDisplay.displayStatus)}`;
    if (storyboardDisplay?.displayStatus === "running") return "分镜生成中";
    return "导演分析待启动";
}

export function buildEpisodeNextActionText({
    appliedPreviewItemIds,
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    appliedPreviewItemIds: string[];
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}) {
    if (!hasScript) return "先导入或粘贴本集剧本。";
    if (directorDisplay?.displayStatus === "error" || directorDisplay?.displayStatus === "rejected") return "处理导演分析异常，然后重新运行分析。";
    if (!directorDisplay || directorDisplay.displayStatus === "idle") return "运行导演分析。";
    if (directorDisplay.displayStatus === "running") return "等待导演分析完成。";
    if (directorDisplay.displayStatus === "review" || directorDisplay.displayStatus === "partial") return "查看并确认导演分析结果。";
    if (artDisplay?.displayStatus === "error" || artDisplay?.displayStatus === "rejected") return "处理资产与生图异常，然后重新运行资产分析。";
    if (!productionBiblePreview && artDisplay?.displayStatus !== "approved") return "进入资产与生图，运行资产分析。";
    const assetCounts = productionBiblePreview ? previewCounts(productionBiblePreview, appliedPreviewItemIds) : { applied: 0, pending: 0, total: 0 };
    if (assetCounts.pending) return `写入 ${assetCounts.pending} 条资产清单。`;
    if (storyboardDisplay?.displayStatus === "error" || storyboardDisplay?.displayStatus === "rejected") return "处理分镜生成异常，再重新推进分镜。";
    if (!storyboardPreview && !episodeTableShots.length) return "进入分镜生产包，生成分镜。";
    if (!videoPreview && !boundCanvas) return "进入画布承接，把分镜放入画布。";
    return "进入画布继续生成或检查视频版本。";
}

export function buildEpisodeModuleNavStatus({
    appliedPreviewItemIds,
    artDisplay,
    boundCanvas,
    directorDisplay,
    episodeTableShots,
    hasScript,
    key,
    productionBiblePreview,
    storyboardDisplay,
    storyboardPreview,
    videoPreview,
}: {
    appliedPreviewItemIds: string[];
    artDisplay?: WorkflowStageDisplaySummary;
    boundCanvas?: CanvasProject;
    directorDisplay?: WorkflowStageDisplaySummary;
    episodeTableShots: StoryboardTableShot[];
    hasScript: boolean;
    key: EpisodeModuleKey;
    productionBiblePreview?: AgentWorkflowMappingPreview;
    storyboardDisplay?: WorkflowStageDisplaySummary;
    storyboardPreview?: AgentWorkflowMappingPreview;
    videoPreview?: AgentWorkflowMappingPreview;
}): EpisodeModuleNavStatus {
    if (key === "script") return hasScript ? { text: "完成", tone: "green" } : { text: "开始", tone: "cyan" };
    if (key === "director") return compactWorkflowNavStatus(directorDisplay, hasScript ? "下一步" : "等待", hasScript ? "cyan" : "slate");
    if (key === "assets") {
        if (!hasScript) return { text: "等待", tone: "slate" };
        if (productionBiblePreview) {
            const counts = previewCounts(productionBiblePreview, appliedPreviewItemIds);
            if (counts.pending) return { detail: `${counts.pending} 条资产清单待写入`, text: "待写入", tone: "amber" };
            return { text: "完成", tone: "green" };
        }
        return compactWorkflowNavStatus(artDisplay, "待分析", "slate");
    }
    if (key === "storyboard") {
        if (episodeTableShots.length) return { detail: `${episodeTableShots.length} 个镜头`, text: "完成", tone: "green" };
        if (!hasScript) return { text: "等待", tone: "slate" };
        return compactWorkflowNavStatus(storyboardDisplay, "待生成", "slate");
    }
    if (boundCanvas || videoPreview) return { text: "完成", tone: "green" };
    if (storyboardPreview || episodeTableShots.length) return { text: "待承接", tone: "cyan" };
    return { text: "等待", tone: "slate" };
}

export function compactWorkflowNavStatus(display: WorkflowStageDisplaySummary | undefined, idleText: string, idleTone: EpisodeStatusTone): EpisodeModuleNavStatus {
    if (!display || display.displayStatus === "idle") return { text: idleText, tone: idleTone };
    if (display.displayStatus === "approved") return { text: "完成", tone: "green" };
    if (display.displayStatus === "running") return { text: "运行中", tone: "cyan" };
    if (display.displayStatus === "review" || display.displayStatus === "partial") return { text: "待确认", tone: "amber" };
    if (display.displayStatus === "error" || display.displayStatus === "rejected" || display.displayStatus === "blocked") return { detail: display.summaryText, text: "需处理", tone: "red" };
    return { text: workflowStageStatusLabel(display.displayStatus), tone: "slate" };
}

export function episodeModuleNavToneClass(tone: EpisodeStatusTone) {
    const toneClass: Record<EpisodeStatusTone, string> = {
        amber: "bg-amber-400/10 text-amber-200",
        cyan: "bg-cyan-400/10 text-cyan-100",
        green: "bg-emerald-400/10 text-emerald-200",
        red: "bg-rose-400/10 text-rose-200",
        slate: "bg-slate-800/80 text-slate-400",
    };
    return toneClass[tone];
}

export function workflowDisplayText(display?: WorkflowStageDisplaySummary) {
    if (!display) return "未开始";
    if (display.hasSceneStates && display.summaryText) return display.summaryText;
    return workflowStageStatusLabel(display.displayStatus);
}

export function buildAssetStageActionHint({ display, hasOutput, isRunning, previewPending, previewTotal }: { display?: WorkflowStageDisplaySummary; hasOutput: boolean; isRunning: boolean; previewPending: number; previewTotal: number }): {
    blocked?: boolean;
    text: string;
    tone: EpisodeStatusTone;
} {
    if (isRunning || display?.displayStatus === "running") return { text: "资产分析正在运行，等待 Agent 返回结果。", tone: "cyan" };
    if (display?.displayStatus === "blocked") return { blocked: true, text: `暂不可运行，${formatBlockedReason(display.blockedReason)}。`, tone: "amber" };
    if (display?.displayStatus === "error") return { text: "上次资产分析失败，请查看错误后重新运行。", tone: "red" };
    if (display?.displayStatus === "rejected") return { text: "资产清单已驳回，可重新运行生成新结果。", tone: "red" };
    if (previewPending > 0) return { text: `已有资产清单，${previewPending} 项待写入设定库。`, tone: "amber" };
    if (previewTotal > 0) return { text: `资产清单已处理完成，共 ${previewTotal} 项。`, tone: "green" };
    if (hasOutput) return { text: "资产分析已完成，可刷新资产清单或写入设定库。", tone: "cyan" };
    if (display?.displayStatus === "review") return { text: "资产清单待审核，可生成资产清单。", tone: "cyan" };
    if (display?.displayStatus === "approved") return { text: "资产与生图阶段已批准，可继续处理生图需求。", tone: "green" };
    return { text: "可运行，将从剧本和导演分析中提取角色、场景、道具和服装。", tone: "slate" };
}

export function episodeToneFromWorkflow(display: WorkflowStageDisplaySummary | undefined, fallback: EpisodeStatusTone): EpisodeStatusTone {
    if (!display) return fallback;
    if (display.displayStatus === "approved") return "green";
    if (display.displayStatus === "review" || display.displayStatus === "running" || display.displayStatus === "partial") return "cyan";
    if (display.displayStatus === "blocked" || display.displayStatus === "idle") return "amber";
    if (display.displayStatus === "error" || display.displayStatus === "rejected") return "red";
    return fallback;
}

export function productionBibleKindLabel(kind: unknown) {
    const value = String(kind || "").toLowerCase();
    if (value.includes("character") || value.includes("角色") || value.includes("人物")) return "角色";
    if (value.includes("scene") || value.includes("场景")) return "场景";
    if (value.includes("costume") || value.includes("服装") || value.includes("服化")) return "服装";
    if (value.includes("prop") || value.includes("道具")) return "道具";
    return "资产";
}

export function mappedFieldText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(mappedFieldText).filter(Boolean).join("、");
    if (typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, fieldValue]) => `${key}：${mappedFieldText(fieldValue)}`)
            .filter(Boolean)
            .join("\n");
    }
    return String(value).trim();
}

export function referenceCount(fields: Record<string, unknown>) {
    const refs = [fields.referenceAssets, fields.assetRefs, fields.references, fields.referenceAssetIds].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
    return refs.length;
}

export function generationConfigText(fields: Record<string, unknown>) {
    const model = mappedFieldText(fields.model || fields.videoModel || fields.seedanceModel) || "Seedance";
    const duration = mappedFieldText(fields.duration || fields.estimatedDuration) || "按镜头";
    const ratio = mappedFieldText(fields.aspectRatio || fields.ratio) || "沿用项目";
    return `${model} · ${duration} · ${ratio}`;
}

export function extractEpisodeOverview(text: string) {
    const lines = text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    const picked = lines.find((line) => /^摘要[：:]/.test(line)) || lines.find((line) => line.length >= 12) || "";
    if (!picked) return "";
    return picked.length > 160 ? `已导入本集正文，完整内容 ${text.length} 字，点击查看。` : picked;
}

export function listSafeText(text: string, fallback: string) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;
    return normalized.length > 150 ? `已提取内容，完整文本 ${normalized.length} 字，点击查看。` : normalized;
}

export function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}

export function uniqueTextList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { total: creatable.length, applied, pending: creatable.length - applied };
}

export function findVideoPreviewItemIdsForPackage(preview: AgentWorkflowMappingPreview, pkg: CanvasHandoffImportTarget) {
    const exactId = `video_node-${pkg.order}`;
    const videoItems = preview.items.filter((item) => item.targetType === "video_node" && item.action !== "skip");
    const exactItem = videoItems.find((item) => item.itemId === exactId);
    if (exactItem) return [exactItem.itemId];
    const orderLabel = `P${padEpisodeOrder(pkg.order)}`.toLowerCase();
    const title = pkg.title.trim().toLowerCase();
    const matched = videoItems.filter((item) => {
        const text = [item.itemId, item.title, item.reason, item.sourceText, JSON.stringify(item.mappedFields || {})].join(" ").toLowerCase();
        return text.includes(pkg.id.toLowerCase()) || text.includes(orderLabel) || Boolean(title && text.includes(title));
    });
    if (matched.length) return matched.map((item) => item.itemId);
    return videoItems[pkg.order - 1] ? [videoItems[pkg.order - 1].itemId] : [];
}

export function previewApplyDisabledReason(preview: AgentWorkflowMappingPreview, pendingCount: number, hasCanvas: boolean) {
    if (preview.targetType === "storyboard_table" && !hasCanvas) return "缺少 canvasId，不能写入分镜头表";
    if (preview.targetType === "video_node" && !hasCanvas) return "缺少 canvasId，不能创建视频配置节点";
    if (!pendingCount) return preview.targetType === "production_bible" ? "已写入设定库或没有可写入条目" : preview.targetType === "storyboard_table" ? "已写入分镜头表或没有可写入条目" : "已创建视频配置节点或没有可创建条目";
    return "";
}

export function previewActionLabel(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return "写入设定库";
    if (targetType === "storyboard_table") return "写入分镜头表";
    return "创建视频配置节点";
}

export function previewTypeName(targetType: AgentWorkflowMappingPreview["targetType"]) {
    if (targetType === "production_bible") return "设定库预览";
    if (targetType === "storyboard_table") return "分镜头表预览";
    return "视频节点预览";
}

export function withSubScene(scene: EpisodeSceneOption, subSceneKey: string): EpisodeSceneOption {
    const suffix = subSceneKey.trim();
    if (!suffix) return scene;
    return {
        ...scene,
        sceneKey: `${scene.sceneKey}:${suffix}`,
        sceneLabel: `${scene.sceneLabel} · ${suffix}`,
    };
}

export function sceneSourceLabel(source: EpisodeSceneOption["source"]) {
    if (source === "storyboard_table") return "来源：分镜头表";
    if (source === "script_scene") return "来源：剧本场次";
    return "来源：剧本文本标题";
}

export function formatBlockedReason(reason?: string) {
    const value = reason?.trim();
    if (!value) return "前置阶段未批准";
    return value.replace("director-analysis", "导演分析").replace("art-design", "服化道美术设计").replace("seedance-storyboard", "Seedance 分镜");
}
