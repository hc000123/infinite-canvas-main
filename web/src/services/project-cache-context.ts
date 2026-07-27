export type ProjectCacheCategory = "character" | "scene" | "prop" | "storyboard" | "other";
export type ProjectCacheMediaKind = "image" | "video" | "audio";

export type ProjectCacheContext = {
    projectId: string;
    projectName: string;
    episodeId: string;
    episodeName: string;
    canvasId: string;
    canvasName: string;
    nodeId: string;
    assetId: string;
    versionId: string;
    source: string;
    category: ProjectCacheCategory;
    prompt: string;
    model: string;
    provider: string;
    freeCanvas: boolean;
};

type GenerationContextInput = Partial<Omit<ProjectCacheContext, "category" | "freeCanvas">> & {
    kind: ProjectCacheMediaKind;
    metadata?: Record<string, unknown>;
    category?: string;
    freeCanvas?: boolean;
};

export function projectCacheContextFromGeneration(input: GenerationContextInput): ProjectCacheContext {
    const metadata = input.metadata || {};
    const binding = recordValue(metadata.assetBinding);
    const generation = recordValue(metadata.generation);
    const category = normalizeProjectCacheCategory(input.category || stringValue(binding.category) || storyboardCategory(metadata) || stringValue(generation.category));
    const projectId = input.projectId || stringValue(generation.projectId) || stringValue(metadata.projectId);
    const episodeId = input.episodeId || stringValue(generation.episodeId) || stringValue(metadata.episodeId);
    return {
        projectId,
        projectName: input.projectName || stringValue(generation.projectTitle),
        episodeId,
        episodeName: input.episodeName || stringValue(generation.episodeTitle) || stringValue(metadata.episodeTitle),
        canvasId: input.canvasId || stringValue(generation.canvasId),
        canvasName: input.canvasName || stringValue(generation.canvasTitle),
        nodeId: input.nodeId || stringValue(metadata.nodeId) || stringValue(generation.nodeId),
        assetId: input.assetId || "",
        versionId: input.versionId || stringValue(generation.productionVideoVersionId) || stringValue(generation.assetVersionNumber),
        source: input.source || stringValue(metadata.source) || stringValue(generation.source),
        category,
        prompt: input.prompt || stringValue(generation.prompt) || stringValue(metadata.prompt),
        model: input.model || stringValue(generation.model) || stringValue(metadata.model),
        provider: input.provider || stringValue(generation.provider) || stringValue(metadata.provider),
        freeCanvas: Boolean(projectId && !episodeId && input.freeCanvas),
    };
}

export function normalizeProjectCacheCategory(value?: string): ProjectCacheCategory {
    return value === "character" || value === "scene" || value === "prop" || value === "storyboard" ? value : "other";
}

export function projectCacheRetryFailure<T extends { attempts: number; status: string }>(item: T, error: string, maxAttempts = 3) {
    const attempts = item.attempts + 1;
    return { ...item, attempts, error, status: attempts >= maxAttempts ? ("pending" as const) : ("queued" as const) };
}

export function recoverProjectCacheRetryingItems<T extends { status: string }>(items: T[]) {
    return items.map((item) => (item.status === "retrying" ? { ...item, status: "queued" } : item));
}

function storyboardCategory(metadata: Record<string, unknown>) {
    return metadata.storyboardShotId || metadata.storyboardGroupId || metadata.shotGroupId ? "storyboard" : "";
}

function recordValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
