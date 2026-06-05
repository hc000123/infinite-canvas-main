import type { Asset } from "@/stores/use-asset-store";
import { assetVersionRecords } from "./asset-version-history.ts";

export type AssetReferenceMode = "fixed-version";

export type AssetVersionReferenceSnapshot = {
    assetId: string;
    assetVersionId?: string;
    versionNumber?: number;
    assetUpdatedAt?: string;
    lockedAt?: string;
    updatedAt?: string;
};

export type AssetVersionReference = AssetVersionReferenceSnapshot & {
    mode: AssetReferenceMode;
    previousVersions?: AssetVersionReferenceSnapshot[];
};

export type AssetVersionReferenceHolder = {
    assetId: string;
    assetVersion?: AssetVersionReference;
};

export type AssetVersionUsageKind = "canvas-node" | "storyboard-shot" | "production-bible";

export type AssetVersionUsageReference = {
    id: string;
    kind: AssetVersionUsageKind;
    objectId: string;
    objectTitle: string;
    contextTitle?: string;
    projectId?: string;
    projectTitle?: string;
    role?: string;
    objectType?: string;
    assetVersion?: AssetVersionReference;
    hasNewVersion: boolean;
};

type CanvasUsageProject = {
    id: string;
    projectId?: string;
    title?: string;
    nodes: Array<{
        id: string;
        type: string;
        title?: string;
        metadata?: {
            sourceAssetId?: string;
            assetVersion?: AssetVersionReference;
        };
    }>;
};

type StoryboardUsageGroup = {
    id: string;
    projectId: string;
    title?: string;
};

type StoryboardUsageShot = {
    id: string;
    groupId: string;
    order: number;
    title?: string;
    assetRefs: Array<AssetVersionReferenceHolder & { kind?: string; role?: string }>;
};

type ProductionBibleUsageItem = {
    id: string;
    projectId: string;
    kind: string;
    name?: string;
    assetRefs: Array<AssetVersionReferenceHolder & { role?: string }>;
};

export type AssetVersionUsageSources = {
    canvasProjects?: CanvasUsageProject[];
    storyboardGroups?: StoryboardUsageGroup[];
    storyboardShots?: StoryboardUsageShot[];
    productionBibleItems?: ProductionBibleUsageItem[];
    projectTitles?: Record<string, string>;
};

export function buildAssetVersionReference(asset: Pick<Asset, "id" | "updatedAt" | "metadata">, now = new Date().toISOString()): AssetVersionReference {
    const current = currentAssetVersionSnapshot(asset);
    return {
        assetId: asset.id,
        assetVersionId: current.assetVersionId,
        versionNumber: current.versionNumber,
        assetUpdatedAt: current.assetUpdatedAt,
        lockedAt: now,
        mode: "fixed-version",
    };
}

export function hasNewerAssetVersion(reference: AssetVersionReference | undefined, asset: Pick<Asset, "id" | "updatedAt" | "metadata"> | undefined) {
    if (!reference || !asset || reference.assetId !== asset.id) return false;
    const latest = currentAssetVersionSnapshot(asset);
    if (latest.assetVersionId && reference.assetVersionId) return latest.assetVersionId !== reference.assetVersionId;
    if (latest.versionNumber && reference.versionNumber) return latest.versionNumber !== reference.versionNumber;
    return Boolean(latest.assetUpdatedAt && reference.assetUpdatedAt && latest.assetUpdatedAt > reference.assetUpdatedAt);
}

export function updateAssetReferenceToLatest(reference: AssetVersionReference, asset: Pick<Asset, "id" | "updatedAt" | "metadata">, now = new Date().toISOString()): AssetVersionReference {
    const latest = buildAssetVersionReference(asset, reference.lockedAt || now);
    if (!hasNewerAssetVersion(reference, asset)) return reference;
    return {
        ...latest,
        updatedAt: now,
        previousVersions: [stripReferenceHistory(reference), ...(reference.previousVersions || [])],
    };
}

export function withAssetVersionReference<T extends AssetVersionReferenceHolder>(ref: T, asset: Pick<Asset, "id" | "updatedAt" | "metadata"> | undefined, now = new Date().toISOString(), existing?: AssetVersionReference): T {
    if (!asset || ref.assetId !== asset.id) return ref;
    return {
        ...ref,
        assetVersion: existing?.assetId === asset.id ? existing : buildAssetVersionReference(asset, now),
    };
}

export function preserveOrCreateAssetVersionReferences<T extends AssetVersionReferenceHolder>(refs: T[], assets: Pick<Asset, "id" | "updatedAt" | "metadata">[], existingRefs: AssetVersionReferenceHolder[] = [], now = new Date().toISOString()): T[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const existingById = new Map(existingRefs.map((ref) => [ref.assetId, ref.assetVersion]).filter((item): item is [string, AssetVersionReference] => Boolean(item[1])));
    return refs.map((ref) => withAssetVersionReference(ref, assetsById.get(ref.assetId), now, existingById.get(ref.assetId)));
}

export function updateAssetRefListToLatest<T extends AssetVersionReferenceHolder>(refs: T[], asset: Pick<Asset, "id" | "updatedAt" | "metadata">, now = new Date().toISOString()): T[] {
    return refs.map((ref) => {
        if (ref.assetId !== asset.id || !ref.assetVersion) return ref;
        return {
            ...ref,
            assetVersion: updateAssetReferenceToLatest(ref.assetVersion, asset, now),
        };
    });
}

export function collectAssetVersionUsageReferences(asset: Pick<Asset, "id" | "updatedAt" | "metadata">, sources: AssetVersionUsageSources = {}): AssetVersionUsageReference[] {
    const usages: AssetVersionUsageReference[] = [];
    const projectTitles = sources.projectTitles || {};
    const storyboardGroupsById = new Map((sources.storyboardGroups || []).map((group) => [group.id, group]));

    for (const project of sources.canvasProjects || []) {
        const projectId = project.projectId || project.id;
        for (const node of project.nodes) {
            if (node.metadata?.sourceAssetId !== asset.id) continue;
            usages.push({
                id: `canvas:${project.id}:${node.id}`,
                kind: "canvas-node",
                objectId: node.id,
                objectTitle: node.title || `节点 ${node.id}`,
                contextTitle: project.title || "未命名画布",
                projectId,
                projectTitle: projectTitles[projectId] || projectTitles[project.id] || project.title || "未命名项目",
                role: node.type,
                assetVersion: node.metadata.assetVersion,
                hasNewVersion: hasNewerAssetVersion(node.metadata.assetVersion, asset),
            });
        }
    }

    for (const shot of sources.storyboardShots || []) {
        const group = storyboardGroupsById.get(shot.groupId);
        for (const ref of shot.assetRefs) {
            if (ref.assetId !== asset.id) continue;
            usages.push({
                id: `storyboard:${shot.id}:${ref.assetId}`,
                kind: "storyboard-shot",
                objectId: shot.id,
                objectTitle: shot.title || `分镜 ${shot.order}`,
                contextTitle: group?.title || "未命名分镜组",
                projectId: group?.projectId,
                projectTitle: group?.projectId ? projectTitles[group.projectId] : undefined,
                role: ref.role,
                objectType: ref.kind,
                assetVersion: ref.assetVersion,
                hasNewVersion: hasNewerAssetVersion(ref.assetVersion, asset),
            });
        }
    }

    for (const item of sources.productionBibleItems || []) {
        for (const ref of item.assetRefs) {
            if (ref.assetId !== asset.id) continue;
            usages.push({
                id: `production-bible:${item.id}:${ref.assetId}`,
                kind: "production-bible",
                objectId: item.id,
                objectTitle: item.name || "未命名设定",
                projectId: item.projectId,
                projectTitle: projectTitles[item.projectId],
                role: ref.role,
                objectType: item.kind,
                assetVersion: ref.assetVersion,
                hasNewVersion: hasNewerAssetVersion(ref.assetVersion, asset),
            });
        }
    }

    return usages.sort((a, b) => {
        const kindOrder = usageKindOrder(a.kind) - usageKindOrder(b.kind);
        if (kindOrder) return kindOrder;
        return `${a.projectTitle || ""}${a.contextTitle || ""}${a.objectTitle}`.localeCompare(`${b.projectTitle || ""}${b.contextTitle || ""}${b.objectTitle}`, "zh-Hans-CN");
    });
}

function currentAssetVersionSnapshot(asset: Pick<Asset, "id" | "updatedAt" | "metadata">): AssetVersionReferenceSnapshot {
    const records = assetVersionRecords(asset as Asset);
    const current = records.find((record) => record.isCurrent) || [...records].sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const currentId = typeof asset.metadata?.currentAssetVersionId === "string" ? asset.metadata.currentAssetVersionId : "";
    return {
        assetId: asset.id,
        assetVersionId: current?.id || currentId || undefined,
        versionNumber: current?.versionNumber || 1,
        assetUpdatedAt: asset.updatedAt,
    };
}

function stripReferenceHistory(reference: AssetVersionReference): AssetVersionReferenceSnapshot {
    return {
        assetId: reference.assetId,
        assetVersionId: reference.assetVersionId,
        versionNumber: reference.versionNumber,
        assetUpdatedAt: reference.assetUpdatedAt,
        lockedAt: reference.lockedAt,
        updatedAt: reference.updatedAt,
    };
}

function usageKindOrder(kind: AssetVersionUsageKind) {
    if (kind === "canvas-node") return 1;
    if (kind === "storyboard-shot") return 2;
    return 3;
}
