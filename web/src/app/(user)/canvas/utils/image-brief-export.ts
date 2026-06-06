import type { Asset } from "@/stores/use-asset-store";

import { buildImageBriefResultSummaries, imageBriefKindLabel, type ImageBrief } from "./image-brief.ts";

export type ImageBriefExportView = "art_direction" | "prompt_sheet" | "storyboard_assets";

export type ImageBriefExportRow = {
    briefId: string;
    briefType: string;
    title: string;
    sourceType: string;
    sourceId: string;
    episode: string;
    scriptText: string;
    fieldSummary: string;
    referenceAssets: string;
    finalPrompt: string;
    resultAssets: string;
    primaryAsset: string;
    status: string;
};

const viewColumns: Record<ImageBriefExportView, Array<keyof ImageBriefExportRow>> = {
    art_direction: ["briefType", "title", "episode", "scriptText", "fieldSummary", "referenceAssets", "primaryAsset", "status"],
    prompt_sheet: ["briefType", "title", "sourceType", "sourceId", "fieldSummary", "referenceAssets", "finalPrompt", "resultAssets", "primaryAsset", "status"],
    storyboard_assets: ["briefType", "title", "sourceType", "sourceId", "episode", "scriptText", "referenceAssets", "resultAssets", "primaryAsset", "status"],
};

const columnLabels: Record<keyof ImageBriefExportRow, string> = {
    briefId: "Brief ID",
    briefType: "Brief 类型",
    title: "标题",
    sourceType: "来源类型",
    sourceId: "来源 ID",
    episode: "集数上下文",
    scriptText: "剧本片段",
    fieldSummary: "结构化字段摘要",
    referenceAssets: "参考素材",
    finalPrompt: "最终提示词",
    resultAssets: "结果素材",
    primaryAsset: "主参考图",
    status: "状态",
};

export function buildImageBriefExportRows(briefs: ImageBrief[], assets: Asset[]): ImageBriefExportRow[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return [...briefs]
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .map((brief) => {
            const summaries = buildImageBriefResultSummaries(brief, assets);
            const primary = summaries.find((item) => item.isPrimary);
            return {
                briefId: brief.id,
                briefType: imageBriefKindLabel(brief.kind),
                title: brief.title,
                sourceType: brief.sourceType,
                sourceId: brief.sourceId,
                episode: [brief.episodeTitle, brief.episodeId].filter(Boolean).join(" / "),
                scriptText: brief.scriptText,
                fieldSummary: imageBriefFieldSummary(brief),
                referenceAssets: brief.referenceAssets.map((ref) => briefAssetLabel(ref.assetId, ref.role, assetsById)).join("\n"),
                finalPrompt: brief.finalPrompt || brief.prompt,
                resultAssets: summaries.map((summary) => briefAssetLabel(summary.assetId, summary.isPrimary ? "primary" : "result", assetsById, summary.currentVersionNumber)).join("\n"),
                primaryAsset: primary ? briefAssetLabel(primary.assetId, "primary", assetsById, primary.currentVersionNumber) : "",
                status: brief.status,
            };
        });
}

export function buildImageBriefExportCsv(briefs: ImageBrief[], assets: Asset[], view: ImageBriefExportView): string {
    const columns = viewColumns[view];
    const header = columns.map((column) => columnLabels[column]);
    const rows = buildImageBriefExportRows(briefs, assets).map((row) => columns.map((column) => row[column]));
    return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function buildImageBriefExportJson(briefs: ImageBrief[], assets: Asset[], view: ImageBriefExportView): string {
    const columns = viewColumns[view];
    const rows = buildImageBriefExportRows(briefs, assets).map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
    return JSON.stringify({ kind: "image-brief-export", view, rows }, null, 2);
}

export function imageBriefExportFileName(projectTitle: string, view: ImageBriefExportView, format: "csv" | "json") {
    return `${safeFileSegment(projectTitle || "项目")}_${imageBriefExportViewLabel(view)}.${format}`;
}

export function imageBriefExportViewLabel(view: ImageBriefExportView) {
    if (view === "art_direction") return "美术设定表";
    if (view === "prompt_sheet") return "生图提示词表";
    return "分镜资产表";
}

export function imageBriefFieldSummary(brief: Pick<ImageBrief, "fields">): string {
    return Object.entries(brief.fields)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${imageBriefFieldLabel(key)}：${value.trim()}`)
        .join("\n");
}

export function csvCell(value: string) {
    if (!/[",\n\r]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
}

function briefAssetLabel(assetId: string, role: string, assetsById: Map<string, Asset>, versionNumber?: number) {
    const asset = assetsById.get(assetId);
    return [asset?.title || assetId, assetId, role, versionNumber ? `v${versionNumber}` : ""].filter(Boolean).join(" · ");
}

function imageBriefFieldLabel(key: string) {
    const labels: Record<string, string> = {
        location: "地点",
        timeOfDay: "时间",
        atmosphere: "氛围",
        composition: "构图",
        lighting: "光影",
        appearance: "外貌",
        costume: "服装",
        expression: "表情",
        pose: "姿态",
        consistency: "一致性",
        material: "材质",
        shape: "形态",
        scale: "尺度",
        usage: "用途",
        details: "细节",
        mood: "情绪",
        palette: "色彩",
        texture: "质感",
        reference: "参考",
        description: "描述",
        sourceText: "来源文本",
        positive: "正向片段",
        negative: "反向片段",
    };
    return labels[key] || key;
}

function safeFileSegment(value: string) {
    return value
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim()
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
}
