import type { Asset } from "../../../stores/use-asset-store.ts";

export type AssetGenerationRecord = Record<string, unknown>;

export function assetGenerationRecords(asset: Asset | null | undefined): AssetGenerationRecord[] {
    const metadata = asset?.metadata;
    if (!metadata) return [];
    const records = [...readGenerationList(metadata.generations), ...readGenerationList(metadata.generation)];
    return records.filter((record, index) => records.findIndex((item) => JSON.stringify(item) === JSON.stringify(record)) === index);
}

export function latestAssetGeneration(asset: Asset | null | undefined) {
    return assetGenerationRecords(asset).at(-1);
}

export function assetGenerationSource(generation: AssetGenerationRecord | undefined) {
    return readString(generation?.source);
}

export function assetGenerationAction(generation: AssetGenerationRecord | undefined) {
    return readString(generation?.actionType);
}

export function assetGenerationModelProvider(generation: AssetGenerationRecord | undefined) {
    const model = readString(generation?.model);
    const provider = readString(generation?.provider);
    return [provider, model].filter(Boolean).join(" / ");
}

export function assetGenerationProjectId(generation: AssetGenerationRecord | undefined) {
    return readString(generation?.projectId);
}

export function assetHasGenerationTaskId(generation: AssetGenerationRecord | undefined) {
    return Boolean(readString(generation?.taskId));
}

export function assetGenerationActionLabel(action: string) {
    if (action === "variant" || action === "regenerate") return "平行变体";
    if (action === "edit") return "编辑视频";
    if (action === "extend") return "延长视频";
    if (action === "continue") return "续写";
    if (action === "generate") return "生成";
    return action || "未知";
}

export function assetGenerationSourceLabel(source: string) {
    if (source === "canvas") return "画布";
    if (source === "image-page") return "生图工作台";
    if (source === "video-page") return "视频创作台";
    if (source === "asset-library") return "素材库";
    return source || "未知";
}

export function assetGenerationFilterOptions(assets: Asset[]) {
    const sources = new Map<string, string>();
    const actions = new Map<string, string>();
    const modelProviders = new Map<string, string>();
    assets.forEach((asset) => {
        assetGenerationRecords(asset).forEach((generation) => {
            const source = assetGenerationSource(generation);
            const action = assetGenerationAction(generation);
            const modelProvider = assetGenerationModelProvider(generation);
            if (source) sources.set(source, assetGenerationSourceLabel(source));
            if (action) actions.set(action, assetGenerationActionLabel(action));
            if (modelProvider) modelProviders.set(modelProvider, modelProvider);
        });
    });
    return {
        sources: mapOptions(sources),
        actions: mapOptions(actions),
        modelProviders: mapOptions(modelProviders),
    };
}

export function assetMatchesGenerationFilters(asset: Asset, filters: { source?: string; action?: string; modelProvider?: string; taskId?: "all" | "with" | "without"; projectId?: string; referencedAssetIds?: Set<string> }) {
    const records = assetGenerationRecords(asset);
    const hasTaskId = records.some(assetHasGenerationTaskId);
    if (filters.taskId === "with" && !hasTaskId) return false;
    if (filters.taskId === "without" && hasTaskId) return false;
    if (filters.projectId && !filters.referencedAssetIds?.has(asset.id) && !records.some((generation) => assetGenerationProjectId(generation) === filters.projectId)) return false;
    if (!filters.source && !filters.action && !filters.modelProvider) return true;
    return records.some((generation) => {
        if (filters.source && assetGenerationSource(generation) !== filters.source) return false;
        if (filters.action && assetGenerationAction(generation) !== filters.action) return false;
        if (filters.modelProvider && assetGenerationModelProvider(generation) !== filters.modelProvider) return false;
        return true;
    });
}

export function assetGenerationSearchText(asset: Asset) {
    return assetGenerationRecords(asset)
        .flatMap((generation) => [
            generation.source,
            generation.projectId,
            generation.projectTitle,
            generation.nodeId,
            generation.prompt,
            generation.effectivePrompt,
            generation.model,
            generation.provider,
            generation.taskId,
            generation.actionType,
            JSON.stringify(generation.references || ""),
        ])
        .join(" ")
        .toLowerCase();
}

export function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

export function readRecord(value: unknown): AssetGenerationRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as AssetGenerationRecord) : null;
}

function readGenerationList(value: unknown): AssetGenerationRecord[] {
    if (Array.isArray(value))
        return value.flatMap((item): AssetGenerationRecord[] => {
            const record = readRecord(item);
            return record ? [record] : [];
        });
    const record = readRecord(value);
    return record ? [record] : [];
}

function mapOptions(values: Map<string, string>) {
    return Array.from(values.entries())
        .sort((a, b) => a[1].localeCompare(b[1], "zh-Hans-CN"))
        .map(([value, label]) => ({ value, label }));
}
