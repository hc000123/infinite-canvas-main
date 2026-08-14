export type ProductionTraceAssetLike = {
    id: string;
    title?: string;
    updatedAt?: string;
    data?: unknown;
    metadata?: Record<string, unknown>;
};

export type MediaPostProcessingTrace = {
    type: "video_upscale" | "subtitle_erase";
    jobId?: string;
    runId?: string;
    provider?: string;
    providerRequestId?: string;
    status?: string;
    estimatedBillableMinutes?: number;
    estimatedCostCny?: number;
    pricingRuleVersion?: string;
};

export type MediaProductionTrace = {
    productionPackageId?: string;
    scriptSnapshot?: string;
    scriptVersion?: string;
    generation: {
        status?: string;
        taskId?: string;
        aiTaskId?: string;
        generationCredits?: number;
    };
    postProcessing: MediaPostProcessingTrace[];
    costSnapshot: {
        generationCredits?: number;
        postProcessingCny: number;
    };
    selectedOutput: {
        assetId: string;
        assetVersionNumber?: number;
        storageKey?: string;
        title?: string;
        updatedAt?: string;
    };
    nextAction: "finish_post_processing" | "ready_for_edit";
};

export function readAssetProductionTrace(asset: ProductionTraceAssetLike | undefined, assets: ProductionTraceAssetLike[] = []): MediaProductionTrace | undefined {
    if (!asset) return undefined;
    const lineage = assetLineage(asset, assets);
    const generation = lineage.flatMap((item) => generationRecords(item.metadata || {})).at(-1);
    const postProcessing = lineage.flatMap((item) => {
        const metadata = item.metadata || {};
        return [postProcessingTrace("video_upscale", metadata.videoUpscale), postProcessingTrace("subtitle_erase", metadata.subtitleErase)].filter((trace): trace is MediaPostProcessingTrace => Boolean(trace));
    });
    const scriptSnapshot = readString(generation?.scriptSnapshot);
    const generationCredits = readNumber(generation?.aiTaskCredits);
    const postProcessingCny = roundCost(postProcessing.reduce((sum, item) => sum + (item.estimatedCostCny || 0), 0));
    return {
        productionPackageId: readString(generation?.productionPackageId),
        scriptSnapshot,
        scriptVersion: scriptSnapshot ? productionSnapshotVersion(scriptSnapshot) : undefined,
        generation: {
            status: readString(generation?.taskStatus) || readString(generation?.aiTaskStatus),
            taskId: readString(generation?.taskId) || readString(generation?.upstreamTaskId),
            aiTaskId: readString(generation?.aiTaskId),
            generationCredits,
        },
        postProcessing,
        costSnapshot: { generationCredits, postProcessingCny },
        selectedOutput: {
            assetId: asset.id,
            assetVersionNumber: readNumber(generation?.assetVersionNumber) || readNumber(generation?.productionVideoVersionNumber),
            storageKey: readString(readRecord(asset.data)?.storageKey),
            title: asset.title,
            updatedAt: asset.updatedAt,
        },
        nextAction: postProcessing.some((item) => item.status !== "succeeded") ? "finish_post_processing" : "ready_for_edit",
    };
}

export function resolveProductionOutputAsset(assetId: string | undefined, assets: ProductionTraceAssetLike[]) {
    if (!assetId) return undefined;
    let current = assets.find((asset) => asset.id === assetId);
    if (!current) return undefined;
    const visited = new Set([current.id]);
    while (true) {
        const child = assets
            .filter((asset) => sourceAssetId(asset) === current!.id && hasPostProcessing(asset))
            .sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""))
            .at(0);
        if (!child || visited.has(child.id)) return current;
        current = child;
        visited.add(child.id);
    }
}

export function productionSnapshotVersion(snapshot: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < snapshot.length; index += 1) {
        hash ^= snapshot.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `snapshot-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assetLineage(asset: ProductionTraceAssetLike, assets: ProductionTraceAssetLike[]) {
    const assetsById = new Map(assets.map((item) => [item.id, item]));
    const lineage: ProductionTraceAssetLike[] = [];
    const visited = new Set<string>();
    let current: ProductionTraceAssetLike | undefined = asset;
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        lineage.unshift(current);
        current = assetsById.get(sourceAssetId(current) || "");
    }
    return lineage;
}

function generationRecords(metadata: Record<string, unknown>) {
    return [...recordsOf(metadata.generations), ...recordsOf(metadata.generation)];
}

function recordsOf(value: unknown) {
    if (Array.isArray(value)) return value.flatMap((item) => (readRecord(item) ? [readRecord(item) as Record<string, unknown>] : []));
    const record = readRecord(value);
    return record ? [record] : [];
}

function postProcessingTrace(type: MediaPostProcessingTrace["type"], value: unknown): MediaPostProcessingTrace | undefined {
    const record = readRecord(value);
    if (!record) return undefined;
    const estimatedCostCny =
        type === "video_upscale"
            ? readNumber(record.estimatedTotalCostCny) || roundCost((readNumber(record.estimatedCostCny) || 0) + (readNumber(record.estimatedInterpolationCostCny) || 0))
            : readNumber(record.estimatedCostCny);
    return {
        type,
        jobId: readString(record.jobId),
        runId: readString(record.runId),
        provider: readString(record.provider),
        providerRequestId: readString(record.providerRequestId),
        status: readString(record.status),
        estimatedBillableMinutes: readNumber(record.estimatedBillableMinutes),
        estimatedCostCny,
        pricingRuleVersion: readString(record.pricingRuleVersion),
    };
}

function sourceAssetId(asset: ProductionTraceAssetLike) {
    const metadata = asset.metadata || {};
    return readString(metadata.sourceAssetId) || readString(readRecord(metadata.canvasSource)?.sourceAssetId);
}

function hasPostProcessing(asset: ProductionTraceAssetLike) {
    return Boolean(readRecord(asset.metadata?.videoUpscale) || readRecord(asset.metadata?.subtitleErase));
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
    return typeof value === "string" && value ? value : undefined;
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundCost(value: number) {
    return Number(value.toFixed(6));
}
