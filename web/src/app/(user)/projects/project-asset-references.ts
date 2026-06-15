import type { Asset, AssetKind } from "@/stores/use-asset-store";
import { assetGenerationRecords, readString } from "../assets/asset-generation.ts";
import { assetInProjectLibrary } from "../assets/asset-project-library.ts";
import { collectAssetVersionUsageReferences, hasNewerAssetVersion, type AssetVersionUsageReference } from "../assets/asset-version-references.ts";
import type { CanvasProject } from "../canvas/stores/use-canvas-store.ts";
import type { ProductionBibleItem, ProductionBibleKind } from "../canvas/utils/production-bible.ts";
import type { ShotGroup, StoryboardAssetRef, StoryboardGroup, StoryboardShot, StoryboardTableShot } from "../canvas/utils/storyboard-management.ts";

export type ProjectAssetReferenceType = "canvas" | "storyboard" | "production-bible" | "generation-result";
export type ProjectAssetVersionFilter = "all" | "outdated" | "latest";
export type ProjectAssetLibraryFilter = "all" | "shared" | "not_shared";

export type ProjectAssetReferenceItem = {
    id: string;
    type: ProjectAssetReferenceType;
    label: string;
    contextLabel?: string;
    role?: string;
    canvasId?: string;
    episodeId?: string;
    nodeId?: string;
    storyboardGroupId?: string;
    storyboardShotId?: string;
    productionBibleItemId?: string;
    productionBibleKind?: ProductionBibleKind;
    hasOutdatedVersion?: boolean;
};

export type ProjectAssetReferenceSummary = {
    asset: Asset;
    references: ProjectAssetReferenceItem[];
    referenceCount: number;
    hasOutdatedVersion: boolean;
    hasMissingLocalFile: boolean;
    inProjectLibrary: boolean;
    updatedAt: string;
};

export type ProjectAssetReferenceSources = {
    assets: Asset[];
    projectId: string;
    projectTitle?: string;
    canvasIds?: string[];
    canvasProjects: CanvasProject[];
    storyboardGroups: StoryboardGroup[];
    storyboardShots: StoryboardShot[];
    storyboardTableShots?: StoryboardTableShot[];
    shotGroups?: ShotGroup[];
    productionBibleItems: ProductionBibleItem[];
    missingStorageKeys?: Set<string>;
};

export type ProjectAssetReferenceFilters = {
    assetKind?: AssetKind | "all";
    fileStatus?: "all" | "missing" | "available";
    referenceType?: ProjectAssetReferenceType | "all";
    versionStatus?: ProjectAssetVersionFilter;
    projectLibraryStatus?: ProjectAssetLibraryFilter;
};

export function collectProjectAssetReferences(sources: ProjectAssetReferenceSources): ProjectAssetReferenceSummary[] {
    const canvasIds = new Set(sources.canvasIds || []);
    const projectCanvases = sources.canvasProjects.filter((canvas) => canvas.projectId === sources.projectId || canvasIds.has(canvas.id));
    const projectGroups = sources.storyboardGroups.filter((group) => group.projectId === sources.projectId);
    const projectGroupIds = new Set(projectGroups.map((group) => group.id));
    const projectShots = sources.storyboardShots.filter((shot) => projectGroupIds.has(shot.groupId));
    const projectTableShots = (sources.storyboardTableShots || []).filter((shot) => shot.projectId === sources.projectId);
    const projectShotGroups = (sources.shotGroups || []).filter((group) => group.projectId === sources.projectId);
    const projectBibleItems = sources.productionBibleItems.filter((item) => item.projectId === sources.projectId);
    const projectTitles = sources.projectTitle ? { [sources.projectId]: sources.projectTitle } : {};
    const assetsById = new Map(sources.assets.map((asset) => [asset.id, asset]));
    const rows = new Map<string, ProjectAssetReferenceSummary>();

    for (const asset of sources.assets) {
        const versionUsages = collectAssetVersionUsageReferences(asset, {
            canvasProjects: projectCanvases,
            storyboardGroups: projectGroups,
            storyboardShots: projectShots,
            productionBibleItems: projectBibleItems,
            projectTitles,
        }).filter((usage) => usage.projectId === sources.projectId || (usage.kind === "canvas-node" && Boolean(usage.id.startsWith("canvas:") && canvasIds.has(canvasIdFromUsageId(usage.id) || ""))));
        versionUsages.forEach((usage) => addReference(rows, asset, versionUsageToReference(usage), sources));
    }

    for (const shot of projectShots) {
        const group = projectGroups.find((item) => item.id === shot.groupId);
        const resultAssetIds = uniqueStrings([...(shot.resultAssetIds || []), shot.primaryAssetId || ""]);
        for (const assetId of resultAssetIds) {
            const asset = assetsById.get(assetId);
            if (!asset) continue;
            addReference(
                rows,
                asset,
                {
                    id: `storyboard-result:${shot.id}:${asset.id}`,
                    type: "generation-result",
                    label: shot.title || `分镜 ${shot.order}`,
                    contextLabel: group?.title || "未命名分镜组",
                    role: shot.primaryAssetId === asset.id ? "主版本" : "生成结果",
                    storyboardGroupId: shot.groupId,
                    storyboardShotId: shot.id,
                },
                sources,
            );
        }
    }

    for (const shot of projectTableShots) {
        for (const ref of shot.assetRefs || []) {
            const asset = assetsById.get(ref.assetId);
            if (!asset) continue;
            addReference(rows, asset, tableShotAssetRefToReference(shot, ref, asset), sources);
        }
    }

    for (const group of projectShotGroups) {
        for (const ref of [...(group.assetRefs || []), ...(group.audioRefs || [])]) {
            const asset = assetsById.get(ref.assetId);
            if (!asset) continue;
            addReference(rows, asset, shotGroupAssetRefToReference(group, ref, asset), sources);
        }
        const resultAssetIds = uniqueStrings([...(group.resultAssetIds || []), group.primaryAssetId || ""]);
        for (const assetId of resultAssetIds) {
            const asset = assetsById.get(assetId);
            if (!asset) continue;
            addReference(
                rows,
                asset,
                {
                    id: `shot-group-result:${group.id}:${asset.id}`,
                    type: "generation-result",
                    label: group.sceneName || "生成镜头组",
                    contextLabel: "生成镜头组",
                    role: group.primaryAssetId === asset.id ? "主版本" : "生成结果",
                    canvasId: group.canvasId,
                    episodeId: group.episodeId,
                    storyboardGroupId: group.id,
                },
                sources,
            );
        }
    }

    for (const asset of sources.assets) {
        for (const generation of assetGenerationRecords(asset)) {
            const storyboardGroupId = readString(generation.storyboardGroupId);
            const storyboardShotId = readString(generation.storyboardShotId);
            const group = storyboardGroupId ? projectGroups.find((item) => item.id === storyboardGroupId) : undefined;
            const shot = storyboardShotId ? projectShots.find((item) => item.id === storyboardShotId) : undefined;
            const generationProjectId = readString(generation.projectId);
            const inProject = generationProjectId === sources.projectId || Boolean(group) || Boolean(shot);
            if (!inProject) continue;
            addReference(
                rows,
                asset,
                {
                    id: `generation:${asset.id}:${readString(generation.nodeId) || readString(generation.taskId) || readString(generation.createdAt) || rows.size}`,
                    type: "generation-result",
                    label: readString(generation.nodeId) || readString(generation.taskId) || "生成记录",
                    contextLabel: [group?.title, shot?.title].filter(Boolean).join(" · ") || readString(generation.projectTitle),
                    role: readString(generation.actionType) || "generate",
                    canvasId: readString(generation.canvasId),
                    episodeId: readString(generation.episodeId),
                    nodeId: readString(generation.nodeId),
                    storyboardGroupId,
                    storyboardShotId,
                },
                sources,
            );
        }
    }

    return Array.from(rows.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.asset.title.localeCompare(b.asset.title, "zh-Hans-CN"));
}

export function filterProjectAssetReferences(rows: ProjectAssetReferenceSummary[], filters: ProjectAssetReferenceFilters) {
    return rows.filter((row) => {
        if (filters.assetKind && filters.assetKind !== "all" && row.asset.kind !== filters.assetKind) return false;
        if (filters.fileStatus === "missing" && !row.hasMissingLocalFile) return false;
        if (filters.fileStatus === "available" && row.hasMissingLocalFile) return false;
        if (filters.referenceType && filters.referenceType !== "all" && !row.references.some((reference) => reference.type === filters.referenceType)) return false;
        if (filters.versionStatus === "outdated" && !row.hasOutdatedVersion) return false;
        if (filters.versionStatus === "latest" && row.hasOutdatedVersion) return false;
        if (filters.projectLibraryStatus === "shared" && !row.inProjectLibrary) return false;
        if (filters.projectLibraryStatus === "not_shared" && row.inProjectLibrary) return false;
        return true;
    });
}

function addReference(rows: Map<string, ProjectAssetReferenceSummary>, asset: Asset, reference: ProjectAssetReferenceItem, sources: ProjectAssetReferenceSources) {
    const current = rows.get(asset.id) || {
        asset,
        references: [],
        referenceCount: 0,
        hasOutdatedVersion: false,
        hasMissingLocalFile: assetHasMissingLocalFile(asset, sources.missingStorageKeys),
        inProjectLibrary: assetInProjectLibrary(asset, sources.projectId),
        updatedAt: asset.updatedAt,
    };
    if (!current.references.some((item) => item.id === reference.id)) current.references.push(reference);
    current.referenceCount = current.references.length;
    current.hasOutdatedVersion = current.references.some((item) => item.hasOutdatedVersion);
    rows.set(asset.id, current);
}

function versionUsageToReference(usage: AssetVersionUsageReference): ProjectAssetReferenceItem {
    if (usage.kind === "canvas-node")
        return {
            id: usage.id,
            type: "canvas",
            label: usage.objectTitle,
            contextLabel: usage.contextTitle,
            role: usage.role,
            canvasId: canvasIdFromUsageId(usage.id),
            nodeId: usage.objectId,
            hasOutdatedVersion: usage.hasNewVersion,
        };
    if (usage.kind === "storyboard-shot")
        return {
            id: usage.id,
            type: "storyboard",
            label: usage.objectTitle,
            contextLabel: usage.contextTitle,
            role: usage.role || usage.objectType,
            storyboardShotId: usage.objectId,
            hasOutdatedVersion: usage.hasNewVersion,
        };
    return {
        id: usage.id,
        type: "production-bible",
        label: usage.objectTitle,
        contextLabel: usage.projectTitle,
        role: usage.role,
        productionBibleItemId: usage.objectId,
        productionBibleKind: usage.objectType as ProductionBibleKind,
        hasOutdatedVersion: usage.hasNewVersion,
    };
}

function tableShotAssetRefToReference(shot: StoryboardTableShot, ref: StoryboardAssetRef, asset: Asset): ProjectAssetReferenceItem {
    return {
        id: `storyboard-table:${shot.id}:${ref.assetId}`,
        type: "storyboard",
        label: shot.title || `镜头 ${shot.order}`,
        contextLabel: shot.sceneName || "分镜头表",
        role: ref.role || ref.kind,
        canvasId: shot.canvasId,
        episodeId: shot.episodeId,
        storyboardShotId: shot.id,
        hasOutdatedVersion: hasNewerAssetVersion(ref.assetVersion, asset),
    };
}

function shotGroupAssetRefToReference(group: ShotGroup, ref: StoryboardAssetRef, asset: Asset): ProjectAssetReferenceItem {
    return {
        id: `shot-group:${group.id}:${ref.assetId}:${ref.role || ref.kind}`,
        type: "storyboard",
        label: group.sceneName || "生成镜头组",
        contextLabel: "生成镜头组",
        role: ref.role || ref.kind,
        canvasId: group.canvasId,
        episodeId: group.episodeId,
        storyboardGroupId: group.id,
        hasOutdatedVersion: hasNewerAssetVersion(ref.assetVersion, asset),
    };
}

function assetHasMissingLocalFile(asset: Asset, missingStorageKeys?: Set<string>) {
    if (asset.kind === "text") return false;
    const storageKey = asset.data.storageKey || "";
    if (storageKey && missingStorageKeys?.has(storageKey)) return true;
    if (asset.kind === "image") return !storageKey && !asset.data.dataUrl;
    return !storageKey && !asset.data.url;
}

function canvasIdFromUsageId(id: string) {
    const parts = id.split(":");
    return parts[0] === "canvas" ? parts[1] : undefined;
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}
