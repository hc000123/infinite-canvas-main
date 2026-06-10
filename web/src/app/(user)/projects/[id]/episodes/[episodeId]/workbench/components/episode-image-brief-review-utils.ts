import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { type ImageBrief, type ImageBriefKind, type ImageBriefWriteInput } from "../../../../../../canvas/utils/image-brief";
import type { EpisodeStatusTone } from "./episode-module-panel";

export type EpisodeBriefFilter = "全部" | "角色图" | "场景图" | "道具图" | "服装图" | "氛围图";
export type EpisodeBriefStatus = "Agent 草案" | "待审核" | "待补素材" | "可生成" | "生成中" | "已生成" | "已回流" | "已驳回";
export type EpisodeBriefStatusTab = "待审核" | "待补素材" | "可生成" | "已生成" | "已回流";
export type OpenImageWorkbenchPayload = { assetId?: string; briefId?: string; prompt: string; title?: string };

export type EpisodeBriefAsset = {
    description: string;
    episodeLabel: string;
    id: string;
    item?: { itemId: string };
    libraryMatchCount: number;
    name: string;
    promptDraft: string;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    type: "角色" | "场景" | "道具" | "服装";
};

export type EpisodeBriefReviewRow = {
    asset?: EpisodeBriefAsset;
    brief?: ImageBrief;
    description: string;
    id: string;
    kind: ImageBriefKind;
    source: string;
    sourceDetail: string;
    status: EpisodeBriefStatus;
    title: string;
    typeLabel: EpisodeBriefFilter;
};

export function buildEpisodeBriefReviewRows({ assets, briefs, rejectedIds }: { assets: EpisodeBriefAsset[]; briefs: ImageBrief[]; rejectedIds: string[] }): EpisodeBriefReviewRow[] {
    const matchedBriefIds = new Set<string>();
    const rows = assets.map((asset) => {
        const brief = briefs.find((item) => item.sourceType === "asset_breakdown" && item.sourceId === asset.id) || briefs.find((item) => item.title.includes(asset.name));
        if (brief) matchedBriefIds.add(brief.id);
        const kind = brief?.kind || briefKindFromEpisodeAsset(asset);
        const typeLabel = briefTypeLabelFromAsset(asset, kind);
        return {
            asset,
            brief,
            description: brief?.scriptText || asset.description,
            id: brief ? `brief-${brief.id}` : `need-${asset.id}`,
            kind,
            source: asset.item ? "资产提取 Agent" : "导演分析",
            sourceDetail: asset.sourceReason || asset.episodeLabel,
            status: rejectedIds.includes(`need-${asset.id}`) || (brief && rejectedIds.includes(`brief-${brief.id}`)) ? "已驳回" : episodeBriefStatus(brief, asset),
            title: brief?.title || `${asset.name} · ${typeLabel}`,
            typeLabel,
        } satisfies EpisodeBriefReviewRow;
    });
    const extraRows = briefs
        .filter((brief) => !matchedBriefIds.has(brief.id))
        .map((brief) => ({
            brief,
            description: brief.scriptText || brief.finalPrompt || brief.prompt,
            id: `brief-${brief.id}`,
            kind: brief.kind,
            source: briefSourceLabel(brief.sourceType),
            sourceDetail: brief.sourceId || brief.episodeTitle,
            status: rejectedIds.includes(`brief-${brief.id}`) ? "已驳回" : episodeBriefStatus(brief),
            title: brief.title,
            typeLabel: briefTypeLabelFromKind(brief.kind),
        }));
    return [...rows, ...extraRows].sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.title.localeCompare(b.title));
}

export function buildEpisodeBriefInput(row: EpisodeBriefReviewRow, projectId: string, episode: ScriptEpisode): ImageBriefWriteInput {
    const asset = row.asset;
    const kind = row.kind;
    const description = row.description || asset?.description || "";
    return {
        projectId,
        canvasId: "",
        episodeId: episode.id,
        episodeTitle: episode.title,
        sourceType: asset ? "asset_breakdown" : "manual",
        sourceId: asset?.id || `manual-${Date.now()}`,
        kind,
        mode: "standard",
        title: row.title,
        scriptText: description,
        fields: briefFieldsFromRequirement(kind, row.title, description, asset),
        referenceAssets: [],
        finalPrompt: asset?.promptDraft || "",
        resultAssetIds: [],
        metadata: {
            agentRunId: asset?.item?.itemId,
            agentAssetKind: asset?.type,
            suggestedBriefKind: kind,
            tags: asset ? [asset.type, episode.title] : ["手动补充"],
            warnings: asset?.status === "缺素材" ? ["缺少参考素材"] : [],
        },
    };
}

export function summarizeEpisodeBriefRows(rows: EpisodeBriefReviewRow[]) {
    return {
        agentDraft: rows.filter((row) => row.status === "Agent 草案").length,
        review: rows.filter((row) => row.status === "待审核").length,
        material: rows.filter((row) => row.status === "待补素材").length,
        ready: rows.filter((row) => row.status === "可生成").length,
        generated: rows.filter((row) => row.status === "已生成").length,
        synced: rows.filter((row) => row.status === "已回流").length,
    };
}

export function briefRowMatchesStatusTab(row: EpisodeBriefReviewRow, tab: EpisodeBriefStatusTab) {
    if (tab === "待审核") return row.status === "Agent 草案" || row.status === "待审核";
    return row.status === tab;
}

export function briefTone(status: EpisodeBriefStatus): EpisodeStatusTone {
    if (status === "可生成" || status === "已生成" || status === "已回流") return "green";
    if (status === "待补素材") return "amber";
    if (status === "已驳回") return "red";
    return "cyan";
}

export function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}

function episodeBriefStatus(brief?: ImageBrief, asset?: EpisodeBriefAsset): EpisodeBriefStatus {
    if (!brief) return asset?.item ? "Agent 草案" : "待审核";
    if (brief.status === "archived") return "已回流";
    if (brief.status === "generated") return "已生成";
    if (brief.validationResult.severity === "error" || (!brief.referenceAssets.length && asset?.status === "缺素材")) return "待补素材";
    if (brief.status === "prompt_ready") return "可生成";
    return "待审核";
}

function briefFieldsFromRequirement(kind: ImageBriefKind, title: string, description: string, asset?: EpisodeBriefAsset): Record<string, string> {
    if (kind === "scene") return { location: title, timeOfDay: "", atmosphere: description, composition: "", lighting: "" };
    if (kind === "character") return { appearance: description, costume: asset?.type === "服装" ? description : "待美术审核确认", expression: "", pose: "", consistency: asset?.referencedShotLabels.join("、") || "保持本集镜头连续性" };
    if (kind === "prop") return { material: "待美术审核确认", shape: "待美术审核确认", scale: "", usage: description, details: description };
    return { mood: description, palette: "", lighting: "", texture: "", reference: asset?.sourceReason || "" };
}

function briefKindFromEpisodeAsset(asset: EpisodeBriefAsset): ImageBriefKind {
    if (asset.type === "角色" || asset.type === "服装") return "character";
    if (asset.type === "场景") return "scene";
    if (asset.type === "道具") return "prop";
    return "mood";
}

function briefTypeLabelFromAsset(asset: EpisodeBriefAsset, kind: ImageBriefKind): EpisodeBriefFilter {
    if (asset.type === "角色") return "角色图";
    if (asset.type === "场景") return "场景图";
    if (asset.type === "道具") return "道具图";
    if (asset.type === "服装") return "服装图";
    return briefTypeLabelFromKind(kind);
}

function briefTypeLabelFromKind(kind: ImageBriefKind): EpisodeBriefFilter {
    if (kind === "character") return "角色图";
    if (kind === "scene") return "场景图";
    if (kind === "prop") return "道具图";
    return "氛围图";
}

function briefSourceLabel(sourceType: ImageBrief["sourceType"]) {
    if (sourceType === "asset_breakdown") return "资产提取 Agent";
    if (sourceType === "production_bible") return "设定库";
    if (sourceType === "storyboard") return "分镜生产包";
    return "手动补充";
}

function statusOrder(status: EpisodeBriefStatus) {
    return ["Agent 草案", "待审核", "待补素材", "可生成", "生成中", "已生成", "已回流", "已驳回"].indexOf(status);
}
