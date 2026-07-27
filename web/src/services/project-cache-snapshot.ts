type Item = { id: string; [key: string]: unknown };

export function buildProjectCacheSnapshot(input: { projectId: string; projects: Item[]; canvases: Item[]; episodes: Item[]; scenes: Item[]; storyboardShots: Item[]; storyboardGroups: Item[]; assets: Item[]; folders: Item[] }) {
    const episodeIds = new Set(input.episodes.filter((item) => item.projectId === input.projectId).map((item) => item.id));
    const folderIds = new Set(input.folders.filter((item) => item.projectId === input.projectId).map((item) => item.id));
    return {
        project: sanitizeSnapshotValue(input.projects.find((item) => item.id === input.projectId)),
        canvases: input.canvases.filter((item) => item.projectId === input.projectId).map(sanitizeSnapshotValue),
        scripts: {
            episodes: input.episodes.filter((item) => item.projectId === input.projectId).map(sanitizeSnapshotValue),
            scenes: input.scenes.filter((item) => episodeIds.has(String(item.episodeId || ""))).map(sanitizeSnapshotValue),
        },
        storyboards: {
            shots: input.storyboardShots.filter((item) => item.projectId === input.projectId).map(sanitizeSnapshotValue),
            groups: input.storyboardGroups.filter((item) => item.projectId === input.projectId).map(sanitizeSnapshotValue),
        },
        assets: input.assets.filter((item) => assetProjectId(item) === input.projectId || folderIds.has(String(item.folderId || ""))).map(sanitizeSnapshotValue),
    };
}

function assetProjectId(item: Item) {
    const metadata = recordValue(item.metadata);
    const generation = recordValue(metadata.generation);
    const canvasSource = recordValue(metadata.canvasSource);
    const binding = recordValue(item.assetBinding);
    return String(metadata.projectId || generation.projectId || canvasSource.projectId || binding.projectId || "");
}

function sanitizeSnapshotValue<T>(value: T): T {
    if (Array.isArray(value)) return value.map(sanitizeSnapshotValue) as T;
    if (!value || typeof value !== "object") return value;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (/apiKey|token|secret/i.test(key)) continue;
        if (typeof child === "string" && child.startsWith("blob:")) continue;
        if (key === "dataUrl" && typeof child === "string" && child.startsWith("data:")) continue;
        result[key] = sanitizeSnapshotValue(child);
    }
    return result as T;
}

function recordValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
