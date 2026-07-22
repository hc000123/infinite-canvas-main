import type { Asset } from "../../../stores/use-asset-store.ts";

type WorkflowAssetEntry = {
    asset: Asset;
    episodeId: string;
    logicalAssetId: string;
    name: string;
    projectId: string;
    workflow: Record<string, unknown>;
};

export type WorkflowAssetCanonicalView = {
    assets: Asset[];
    aliasIdsByCanonicalId: Map<string, string[]>;
};

const STABLE_LOGICAL_ASSET_ID = /^(CHAR|SCENE|PROP|COSTUME)-\d{3}$/;

export function buildWorkflowAssetCanonicalView(assets: Asset[]): WorkflowAssetCanonicalView {
    const entries = assets.map(readWorkflowAssetEntry);
    const groups = new Map<string, WorkflowAssetEntry[]>();
    entries.forEach((entry) => {
        if (!entry) return;
        const key = [entry.projectId, entry.episodeId, normalizeName(entry.name)].join(":");
        groups.set(key, [...(groups.get(key) || []), entry]);
    });

    const handled = new Set<string>();
    const aliasIdsByCanonicalId = new Map<string, string[]>();
    const canonicalAssets = assets.flatMap((asset): Asset[] => {
        if (handled.has(asset.id)) return [];
        const entry = readWorkflowAssetEntry(asset);
        if (!entry) return [asset];
        const group = groups.get([entry.projectId, entry.episodeId, normalizeName(entry.name)].join(":")) || [entry];
        if (group.length < 2 || !group.some((item) => isStableLogicalAssetId(item.logicalAssetId))) return [asset];

        group.forEach((item) => handled.add(item.asset.id));
        const canonical = [...group].sort(compareCanonicalPriority)[0];
        const aliases = group.filter((item) => item.asset.id !== canonical.asset.id);
        aliasIdsByCanonicalId.set(canonical.asset.id, aliases.map((item) => item.asset.id));
        return [mergeWorkflowAssetGroup(canonical, aliases)];
    });

    return { assets: canonicalAssets, aliasIdsByCanonicalId };
}

export function workflowAssetDeleteIds(assetId: string, aliasIdsByCanonicalId: Map<string, string[]>) {
    return Array.from(new Set([assetId, ...(aliasIdsByCanonicalId.get(assetId) || [])]));
}

function readWorkflowAssetEntry(asset: Asset): WorkflowAssetEntry | null {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    if (!workflow) return null;
    const projectId = readString(workflow.sourceProjectId) || readString(workflow.projectId);
    const episodeId = readString(workflow.sourceEpisodeId) || readString(workflow.episode);
    const name = readString(workflow.name) || asset.title;
    const logicalAssetId = readString(workflow.logicalAssetId) || readString(workflow.assetId);
    if (!projectId || !episodeId || !name || !logicalAssetId) return null;
    return { asset, episodeId, logicalAssetId, name, projectId, workflow };
}

function compareCanonicalPriority(a: WorkflowAssetEntry, b: WorkflowAssetEntry) {
    const imagePriority = Number(b.asset.kind === "image") - Number(a.asset.kind === "image");
    if (imagePriority) return imagePriority;
    const stablePriority = Number(isStableLogicalAssetId(b.logicalAssetId)) - Number(isStableLogicalAssetId(a.logicalAssetId));
    if (stablePriority) return stablePriority;
    const updatedPriority = b.asset.updatedAt.localeCompare(a.asset.updatedAt);
    return updatedPriority || a.asset.id.localeCompare(b.asset.id);
}

function mergeWorkflowAssetGroup(canonical: WorkflowAssetEntry, aliases: WorkflowAssetEntry[]): Asset {
    const group = [canonical, ...aliases];
    const stable = group.find((entry) => isStableLogicalAssetId(entry.logicalAssetId)) || canonical;
    const aliasAssetIds = aliases.map((entry) => entry.asset.id);
    const legacyLogicalAssetIds = uniqueStrings(group.filter((entry) => !isStableLogicalAssetId(entry.logicalAssetId)).map((entry) => entry.logicalAssetId));
    const legacyPrompts = uniqueStrings(group.flatMap((entry) => [readString(entry.workflow.imagePrompt), readString(entry.workflow.prompt), entry.asset.kind === "text" ? entry.asset.data.content : ""]));
    const metadata = {
        ...mergeRecords(group.map((entry) => entry.asset.metadata)),
        ...(canonical.asset.metadata || {}),
        generations: mergeUnknownLists(group.flatMap((entry) => readList(entry.asset.metadata?.generations))),
        originalWorkflow: {
            ...stable.workflow,
            ...canonical.workflow,
            assetId: stable.logicalAssetId,
            logicalAssetId: stable.logicalAssetId,
            aliasAssetIds,
            legacyLogicalAssetIds,
            legacyPrompts,
        },
    };
    const assetVersions = mergeAssetVersions(group, metadata);

    return {
        ...canonical.asset,
        coverUrl: canonical.asset.coverUrl || firstString(group.map((entry) => entry.asset.coverUrl)),
        folderId: canonical.asset.folderId || group.map((entry) => entry.asset.folderId).find(Boolean),
        metadata: { ...metadata, ...assetVersions },
        note: canonical.asset.note || firstString(group.map((entry) => entry.asset.note)),
        source: canonical.asset.source || firstString(group.map((entry) => entry.asset.source)),
        tags: uniqueStrings(group.flatMap((entry) => entry.asset.tags)),
    } as Asset;
}

function mergeAssetVersions(group: WorkflowAssetEntry[], metadata: Record<string, unknown>) {
    const existing = mergeUnknownLists(group.flatMap((entry) => readList(entry.asset.metadata?.assetVersions)));
    let versionNumber = existing.reduce((max, value) => Math.max(max, readNumber(readRecord(value)?.versionNumber)), 0);
    const aliases = group.slice(1).map((entry) => snapshotAssetVersion(entry.asset, ++versionNumber, `workflow-alias-${entry.asset.id}`));
    const currentVersionId = readString(metadata.currentAssetVersionId);
    if (currentVersionId) return { assetVersions: mergeUnknownLists([...existing, ...aliases]), currentAssetVersionId: currentVersionId };
    const canonical = snapshotAssetVersion(group[0].asset, ++versionNumber, `workflow-canonical-${group[0].asset.id}`);
    return { assetVersions: mergeUnknownLists([...existing, ...aliases, canonical]), currentAssetVersionId: canonical.id };
}

function snapshotAssetVersion(asset: Asset, versionNumber: number, id: string) {
    return {
        id,
        versionNumber,
        kind: asset.kind,
        title: asset.title,
        coverUrl: asset.coverUrl,
        data: { ...asset.data },
        createdAt: asset.updatedAt || asset.createdAt,
        changeNote: "合并旧工作流素材",
        source: "manual_edit",
    };
}

function isStableLogicalAssetId(value: string) {
    return STABLE_LOGICAL_ASSET_ID.test(value);
}

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function mergeRecords(values: Array<Record<string, unknown> | undefined>) {
    return values.reduce<Record<string, unknown>>((merged, value) => ({ ...merged, ...(value || {}) }), {});
}

function mergeUnknownLists(values: unknown[]) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const key = JSON.stringify(value) ?? String(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function uniqueStrings(values: Array<string | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function firstString(values: Array<string | undefined>) {
    return values.find((value) => value?.trim()) || "";
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readList(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
