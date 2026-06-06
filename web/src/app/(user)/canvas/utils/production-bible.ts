import type { AssetVersionReference } from "../../assets/asset-version-references";

export type ProductionBibleKind = "character" | "scene" | "prop";

export type ProductionBibleAssetRef = {
    assetId: string;
    role: string;
    assetVersion?: AssetVersionReference;
};

export type ProductionBiblePromptSnippets = {
    positive?: string;
    negative?: string;
    consistency?: string;
};

export type ProductionBibleSourceMetadata = {
    sourceType: "workflow_mapping_preview";
    workflowId: string;
    workflowRunId: string;
    workflowVersion: string;
    stageId: string;
    agentId: string;
    sourceOutputId: string;
    previewId: string;
    previewItemId: string;
    sourceFiles: string[];
    qualityGateIds: string[];
    createdFromText: string;
};

export type ProductionBibleItemMetadata = {
    source?: ProductionBibleSourceMetadata;
};

export type ProductionBibleItem = {
    id: string;
    projectId: string;
    kind: ProductionBibleKind;
    name: string;
    description: string;
    tags: string[];
    assetRefs: ProductionBibleAssetRef[];
    promptSnippets: ProductionBiblePromptSnippets;
    metadata?: ProductionBibleItemMetadata;
    createdAt: string;
    updatedAt: string;
};

export type ProductionBibleWriteInput = Omit<ProductionBibleItem, "id" | "createdAt" | "updatedAt">;

export const productionBibleKindOptions: Array<{ label: string; value: ProductionBibleKind }> = [
    { label: "角色", value: "character" },
    { label: "场景", value: "scene" },
    { label: "道具", value: "prop" },
];

export const productionBibleAssetRoleOptions = [
    { label: "参考", value: "reference" },
    { label: "形象", value: "portrait" },
    { label: "环境", value: "environment" },
    { label: "风格", value: "style" },
    { label: "一致性", value: "consistency" },
    { label: "反向", value: "negative" },
];

export function productionBibleKindLabel(kind: ProductionBibleKind) {
    return productionBibleKindOptions.find((item) => item.value === kind)?.label || "设定";
}

export function productionBibleAssetRoleLabel(role: string) {
    return productionBibleAssetRoleOptions.find((item) => item.value === role)?.label || role || "参考";
}

export function normalizeProductionBibleInput(input: ProductionBibleWriteInput): ProductionBibleWriteInput {
    return {
        ...input,
        name: input.name.trim(),
        description: input.description.trim(),
        tags: uniqueStrings(input.tags.map((tag) => tag.trim()).filter(Boolean)),
        assetRefs: dedupeAssetRefs(input.assetRefs),
        promptSnippets: {
            positive: input.promptSnippets.positive?.trim() || "",
            negative: input.promptSnippets.negative?.trim() || "",
            consistency: input.promptSnippets.consistency?.trim() || "",
        },
        metadata: input.metadata?.source
            ? {
                  source: {
                      ...input.metadata.source,
                      sourceFiles: uniqueStrings((input.metadata.source.sourceFiles || []).map((item) => item.trim()).filter(Boolean)),
                      qualityGateIds: uniqueStrings((input.metadata.source.qualityGateIds || []).map((item) => item.trim()).filter(Boolean)),
                      createdFromText: input.metadata.source.createdFromText.trim(),
                  },
              }
            : input.metadata,
    };
}

export function itemsForProductionBibleProject(items: ProductionBibleItem[], projectId: string, kind?: ProductionBibleKind) {
    return items.filter((item) => item.projectId === projectId && (!kind || item.kind === kind)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function dedupeAssetRefs(refs: ProductionBibleAssetRef[]) {
    const seen = new Set<string>();
    const result: ProductionBibleAssetRef[] = [];
    for (const ref of refs) {
        const assetId = ref.assetId.trim();
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        result.push({ assetId, role: ref.role.trim() || "reference", ...(ref.assetVersion ? { assetVersion: ref.assetVersion } : {}) });
    }
    return result;
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}
