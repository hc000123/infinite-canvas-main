export type WorkflowArtItem = { id: string; kind: string; name: string; prompt: string };
export type WorkflowArtifactAsset = { id: string; kind: string; metadata?: Record<string, unknown>; title: string };
export type WorkflowArtifactMappingRow = WorkflowArtItem & { action: "create" | "update_metadata"; importKey: string; preserveImage: boolean; targetAssetId?: string };

export function mapArtArtifactToAssets(contentJson: string, existingAssets: WorkflowArtifactAsset[], scope: { episodeId: string; projectId: string }) {
    const warnings: string[] = [];
    const items = parseArtItems(contentJson).flatMap((item, index): WorkflowArtifactMappingRow[] => {
        if (!item.id || !item.kind || !item.name || !item.prompt) {
            warnings.push(`第 ${index + 1} 条资产缺少 id、kind、name 或 prompt，已跳过`);
            return [];
        }
        const importKey = `${scope.projectId}:${scope.episodeId}:${item.id}`;
        const existing = existingAssets.find((asset) => readImportKey(asset.metadata) === importKey) || existingAssets.find((asset) => asset.title.trim() === item.name.trim());
        return [{ ...item, action: existing ? "update_metadata" : "create", importKey, preserveImage: existing?.kind === "image", targetAssetId: existing?.id }];
    });
    return { items, warnings };
}

function parseArtItems(contentJson: string): WorkflowArtItem[] {
    try {
        const parsed = JSON.parse(contentJson) as { items?: unknown };
        if (!Array.isArray(parsed.items)) return [];
        return parsed.items.map((item) => {
            const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return { id: readString(row.id), kind: readString(row.kind), name: readString(row.name), prompt: readString(row.prompt) };
        });
    } catch {
        return [];
    }
}

function readImportKey(metadata?: Record<string, unknown>) {
    const workflow = metadata?.originalWorkflow;
    return workflow && typeof workflow === "object" ? readString((workflow as Record<string, unknown>).importKey) : "";
}

function readString(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
