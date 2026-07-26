export type WorkflowArtItem = {
    logicalAssetId: string;
    id: string;
    kind: string;
    name: string;
    scriptEvidence: string;
    description: string;
    imagePrompt: string;
    prompt: string;
    status: string;
    parentLogicalAssetId: string;
    variantType: "costume" | "hair" | "makeup" | "age" | "injury" | "other" | "";
    variantName: string;
};

export type WorkflowArtifactAsset = { id: string; kind: string; metadata?: Record<string, unknown>; title: string };
export type WorkflowArtifactMappingRow = WorkflowArtItem & { action: "create" | "update_metadata"; importKey: string; libraryAssetId?: string; preserveImage: boolean; targetAssetId?: string };

export function mapAssetDesignArtifactToAssets(contentJson: string, existingAssets: WorkflowArtifactAsset[], scope: { episodeId: string; projectId: string }) {
    const warnings: string[] = [];
    const items = parseAssetItems(contentJson).flatMap((item, index): WorkflowArtifactMappingRow[] => {
        if (!item.logicalAssetId || !item.kind || !item.name || !item.imagePrompt) {
            warnings.push(`第 ${index + 1} 条资产缺少 logicalAssetId、kind、name 或 imagePrompt，已跳过`);
            return [];
        }
        const importKey = `${scope.projectId}:${scope.episodeId}:${item.logicalAssetId}`;
        const existing =
            existingAssets.find((asset) => {
                if (readImportKey(asset.metadata) === importKey) return true;
                const workflow = readWorkflowMetadata(asset.metadata);
                const projectId = readString(workflow?.sourceProjectId) || readString(workflow?.projectId);
                const episodeId = readString(workflow?.sourceEpisodeId) || readString(workflow?.episode);
                return readLogicalAssetID(asset.metadata) === item.logicalAssetId && projectId === scope.projectId && episodeId === scope.episodeId;
            }) || existingAssets.find((asset) => matchesScopedWorkflowName(asset, item.name, scope));
        return [{ ...item, action: existing ? "update_metadata" : "create", importKey, libraryAssetId: existing?.id, preserveImage: existing?.kind === "image", targetAssetId: existing?.id }];
    });
    return { items, warnings };
}

/** @deprecated Use mapAssetDesignArtifactToAssets for workflow v2. */
export function mapArtArtifactToAssets(contentJson: string, existingAssets: WorkflowArtifactAsset[], scope: { episodeId: string; projectId: string }) {
    return mapAssetDesignArtifactToAssets(contentJson, existingAssets, scope);
}

function parseAssetItems(contentJson: string): WorkflowArtItem[] {
    try {
        const parsed = JSON.parse(contentJson) as { items?: unknown };
        if (!Array.isArray(parsed.items)) return [];
        return parsed.items.map((item) => {
            const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const logicalAssetId = readString(row.logicalAssetId) || readString(row.assetId) || readString(row.id);
            const imagePrompt = readString(row.imagePrompt) || readString(row.brief) || readString(row.prompt);
            return {
                logicalAssetId,
                id: logicalAssetId,
                kind: readString(row.kind),
                name: readString(row.name),
                scriptEvidence: readString(row.scriptEvidence) || readStringArray(row.sourceEvidence).join("\n") || readString(row.sourceText),
                description: readString(row.description) || readStringArray(row.coreFacts).join("；"),
                imagePrompt,
                prompt: imagePrompt,
                status: readString(row.status) || "ready",
                parentLogicalAssetId: readString(row.parentLogicalAssetId),
                variantType: normalizeVariantType(readString(row.variantType)),
                variantName: readString(row.variantName),
            };
        });
    } catch {
        return [];
    }
}

function normalizeVariantType(value: string): WorkflowArtItem["variantType"] {
    return ["costume", "hair", "makeup", "age", "injury", "other"].includes(value) ? (value as WorkflowArtItem["variantType"]) : "";
}

function readWorkflowMetadata(metadata?: Record<string, unknown>) {
    const workflow = metadata?.originalWorkflow;
    return workflow && typeof workflow === "object" ? (workflow as Record<string, unknown>) : null;
}

function readImportKey(metadata?: Record<string, unknown>) {
    return readString(readWorkflowMetadata(metadata)?.importKey);
}

function readLogicalAssetID(metadata?: Record<string, unknown>) {
    return readString(readWorkflowMetadata(metadata)?.logicalAssetId);
}

function matchesScopedWorkflowName(asset: WorkflowArtifactAsset, name: string, scope: { episodeId: string; projectId: string }) {
    const workflow = readWorkflowMetadata(asset.metadata);
    if (!workflow) return false;
    const projectId = readString(workflow.sourceProjectId) || readString(workflow.projectId);
    const episodeId = readString(workflow.sourceEpisodeId) || readString(workflow.episode);
    const workflowName = readString(workflow.name) || asset.title;
    return projectId === scope.projectId && episodeId === scope.episodeId && normalizeName(workflowName) === normalizeName(name);
}

function normalizeName(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }

function readString(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function readStringArray(value: unknown) { return Array.isArray(value) ? value.map(readString).filter(Boolean) : []; }
