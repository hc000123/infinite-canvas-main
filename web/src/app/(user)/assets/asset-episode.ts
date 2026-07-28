import type { Asset } from "@/stores/use-asset-store";
import { episodeProductionName, type ScriptEpisode } from "../canvas/utils/script-management";
import { assetGenerationRecords, readString } from "./asset-generation";
import { workflowAssetInfo } from "./workflow-asset-image";

export type AssetEpisodeOption = {
    aliases: string[];
    count: number;
    label: string;
    order: number;
    value: string;
};

export function assetEpisodeKeys(asset: Asset | null | undefined) {
    if (!asset) return [];
    const metadata = asset.metadata || {};
    const info = workflowAssetInfo(asset);
    const keys = [...(asset.assetBinding?.episodeIds || []), readString(metadata.episodeId), info?.sourceEpisodeId || "", info?.episode || "", ...assetGenerationRecords(asset).map((generation) => readString(generation.sourceEpisode))];
    return uniqueStrings(keys.map(normalizeEpisodeKey).filter(Boolean));
}

export function primaryAssetEpisodeKey(asset: Asset | null | undefined) {
    return assetEpisodeKeys(asset)[0] || "";
}

export function buildAssetEpisodeOptions(assets: Asset[], episodes: ScriptEpisode[], projectId: string, projectTitles: Record<string, string> = {}) {
    const projectEpisodes = episodes.filter((episode) => !projectId || episode.projectId === projectId).sort((a, b) => a.order - b.order);
    const options = new Map<string, AssetEpisodeOption>();
    projectEpisodes.forEach((episode) => {
        options.set(episode.id, {
            aliases: episodeAliases(episode),
            count: 0,
            label: episodeLabel(episode, projectId ? "" : projectTitles[episode.projectId]),
            order: episode.order,
            value: episode.id,
        });
    });

    assets.forEach((asset) => {
        if (asset.assetBinding?.allEpisodes) {
            options.forEach((option, value) => options.set(value, { ...option, count: option.count + 1 }));
            return;
        }
        const keys = assetEpisodeKeys(asset);
        if (!keys.length) return;
        const matched = Array.from(options.values()).find((option) => keys.some((key) => option.value === key || option.aliases.includes(key)));
        const value = matched?.value || keys[0];
        const option = matched ||
            options.get(value) || {
                aliases: keys,
                count: 0,
                label: fallbackEpisodeLabel(value),
                order: Number.MAX_SAFE_INTEGER,
                value,
            };
        options.set(value, { ...option, count: option.count + 1 });
    });

    return Array.from(options.values())
        .filter((option) => option.count > 0 || (projectId && option.order !== Number.MAX_SAFE_INTEGER))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-Hans-CN"));
}

export function assetMatchesEpisodeOption(asset: Asset, option: AssetEpisodeOption | undefined) {
    if (!option) return true;
    if (asset.assetBinding?.allEpisodes) return true;
    const keys = assetEpisodeKeys(asset);
    return keys.some((key) => key === option.value || option.aliases.includes(key));
}

export function assetEpisodeTitle(asset: Asset, labels: Record<string, string>) {
    const keys = assetEpisodeKeys(asset);
    const key = keys.find((item) => labels[item]);
    return key ? labels[key] : fallbackEpisodeLabel(keys[0] || "");
}

export function assetEpisodeLabels(options: AssetEpisodeOption[]) {
    const labels: Record<string, string> = {};
    options.forEach((option) => {
        labels[option.value] = option.label;
        option.aliases.forEach((alias) => {
            labels[alias] = option.label;
        });
    });
    return labels;
}

function episodeAliases(episode: ScriptEpisode) {
    const padded = String(episode.order || 1).padStart(2, "0");
    return uniqueStrings([episode.id, episode.code || `EP${padded}`, `ep${padded}`, `ep${episode.order}`].map(normalizeEpisodeKey));
}

function episodeLabel(episode: ScriptEpisode, projectTitle?: string) {
    const label = episodeProductionName(episode.code || `EP${String(episode.order || 1).padStart(2, "0")}`, episode.title);
    return projectTitle ? `${projectTitle} · ${label}` : label;
}

function fallbackEpisodeLabel(value: string) {
    const match = value.match(/^ep0*(\d+)/i);
    if (match?.[1]) return `第 ${String(Number(match[1])).padStart(2, "0")} 集`;
    return value || "未标注集数";
}

function normalizeEpisodeKey(value: string) {
    return value.trim();
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}
