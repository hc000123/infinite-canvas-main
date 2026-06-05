import type { Asset } from "@/stores/use-asset-store";

export type AssetProjectLibraryEntry = {
    projectId: string;
    visibility: "project";
    role: "owner" | "editor" | "viewer";
    syncStatus: "local" | "pending" | "synced" | "error";
    addedAt: string;
    updatedAt: string;
    remoteAssetId?: string;
    remoteFileId?: string;
    error?: string;
};

export function assetProjectLibraryEntries(asset: Pick<Asset, "metadata"> | null | undefined): AssetProjectLibraryEntry[] {
    const entries = asset?.metadata?.projectLibraries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry): AssetProjectLibraryEntry[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const record = entry as Partial<AssetProjectLibraryEntry>;
        if (!record.projectId || typeof record.projectId !== "string") return [];
        return [
            {
                projectId: record.projectId,
                visibility: "project",
                role: record.role === "owner" || record.role === "editor" || record.role === "viewer" ? record.role : "editor",
                syncStatus: record.syncStatus === "pending" || record.syncStatus === "synced" || record.syncStatus === "error" ? record.syncStatus : "local",
                addedAt: typeof record.addedAt === "string" ? record.addedAt : "",
                updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
                remoteAssetId: typeof record.remoteAssetId === "string" ? record.remoteAssetId : undefined,
                remoteFileId: typeof record.remoteFileId === "string" ? record.remoteFileId : undefined,
                error: typeof record.error === "string" ? record.error : undefined,
            },
        ];
    });
}

export function assetInProjectLibrary(asset: Pick<Asset, "metadata"> | null | undefined, projectId: string) {
    return Boolean(projectId) && assetProjectLibraryEntries(asset).some((entry) => entry.projectId === projectId);
}

export function buildProjectLibraryAssetPatch(asset: Asset, projectId: string, now: string, role: AssetProjectLibraryEntry["role"] = "editor") {
    const entries = assetProjectLibraryEntries(asset);
    const existing = entries.find((entry) => entry.projectId === projectId);
    const nextEntry: AssetProjectLibraryEntry = existing ? { ...existing, role, syncStatus: existing.syncStatus || "local", updatedAt: now } : { projectId, visibility: "project", role, syncStatus: "local", addedAt: now, updatedAt: now };
    return {
        metadata: {
            ...(asset.metadata || {}),
            projectLibraries: existing ? entries.map((entry) => (entry.projectId === projectId ? nextEntry : entry)) : [...entries, nextEntry],
        },
    };
}

export function buildRemoveProjectLibraryAssetPatch(asset: Asset, projectId: string) {
    return {
        metadata: {
            ...(asset.metadata || {}),
            projectLibraries: assetProjectLibraryEntries(asset).filter((entry) => entry.projectId !== projectId),
        },
    };
}

export function projectLibraryRoleLabel(role: string) {
    if (role === "owner") return "所有者";
    if (role === "viewer") return "只读";
    return "可编辑";
}

export function projectLibrarySyncStatusLabel(status: string) {
    if (status === "pending") return "待同步";
    if (status === "synced") return "已同步";
    if (status === "error") return "同步失败";
    return "本地";
}

export function projectLibrarySearchText(asset: Asset) {
    return assetProjectLibraryEntries(asset)
        .flatMap((entry) => [entry.projectId, entry.role, entry.syncStatus, entry.remoteAssetId, entry.remoteFileId])
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}
