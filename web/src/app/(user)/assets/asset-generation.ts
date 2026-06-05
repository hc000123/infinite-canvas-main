import type { Asset } from "../../../stores/use-asset-store.ts";

export type AssetGenerationRecord = Record<string, unknown>;

export type AssetGenerationLineageItem = {
    key: string;
    label: string;
    value: string;
};

export type AssetGenerationVersionRecord = {
    id: string;
    index: number;
    label: string;
    isLatest: boolean;
    sourceLabel: string;
    actionLabel: string;
    modelProvider: string;
    nodeId: string;
    taskId: string;
    storyboardGroupId: string;
    storyboardShotId: string;
    createdAt: string;
};

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

export function assetGenerationLineage(generation: AssetGenerationRecord | undefined): AssetGenerationLineageItem[] {
    if (!generation) return [];
    const source = assetGenerationSource(generation);
    const projectTitle = readString(generation.projectTitle);
    const projectId = readString(generation.projectId);
    const storyboardGroupId = readString(generation.storyboardGroupId);
    const storyboardShotId = readString(generation.storyboardShotId);
    const nodeId = readString(generation.nodeId);
    const taskId = readString(generation.taskId);
    const action = assetGenerationAction(generation);
    return [
        source ? { key: "source", label: "来源", value: assetGenerationSourceLabel(source) } : null,
        projectTitle || projectId ? { key: "project", label: "项目", value: [projectTitle, projectId].filter(Boolean).join(" · ") } : null,
        storyboardGroupId ? { key: "storyboardGroupId", label: "分镜组", value: storyboardGroupId } : null,
        storyboardShotId ? { key: "storyboardShotId", label: "分镜", value: storyboardShotId } : null,
        nodeId ? { key: "nodeId", label: "节点", value: nodeId } : null,
        taskId ? { key: "taskId", label: "任务", value: taskId } : null,
        action ? { key: "actionType", label: "动作", value: assetGenerationActionLabel(action) } : null,
    ].filter((item): item is AssetGenerationLineageItem => Boolean(item));
}

export function assetGenerationVersionRecords(asset: Asset | null | undefined): AssetGenerationVersionRecord[] {
    const records = assetGenerationRecords(asset);
    return records.map((generation, index) => {
        const nodeId = readString(generation.nodeId);
        const taskId = readString(generation.taskId);
        const createdAt = readString(generation.createdAt);
        return {
            id: [nodeId, taskId, createdAt, index].filter(Boolean).join(":") || `version-${index + 1}`,
            index,
            label: `版本 ${index + 1}`,
            isLatest: index === records.length - 1,
            sourceLabel: assetGenerationSourceLabel(assetGenerationSource(generation)),
            actionLabel: assetGenerationActionLabel(assetGenerationAction(generation)),
            modelProvider: assetGenerationModelProvider(generation),
            nodeId,
            taskId,
            storyboardGroupId: readString(generation.storyboardGroupId),
            storyboardShotId: readString(generation.storyboardShotId),
            createdAt,
        };
    });
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
            generation.storyboardGroupId,
            generation.storyboardShotId,
            generation.prompt,
            generation.effectivePrompt,
            generation.model,
            generation.provider,
            generation.taskId,
            generation.actionType,
            JSON.stringify(generation.references || ""),
            JSON.stringify(generation.productionBibleRefs || ""),
            JSON.stringify(generation.config || ""),
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
