import type { Asset } from "@/stores/use-asset-store";

import { assetVersionRecords, type AssetVersionRecord } from "../../../../../assets/asset-version-history.ts";
import type { WorkflowArtifactMappingRow } from "./workflow-artifact-mapping";

export type WorkflowAssetCategory = "all" | "character" | "scene" | "prop";

export type WorkflowAssetVariant = {
    asset?: Asset;
    logicalAssetId: string;
    missingParent: boolean;
    row: WorkflowArtifactMappingRow;
};

export type WorkflowAssetCard = {
    category: Exclude<WorkflowAssetCategory, "all">;
    logicalAssetId: string;
    name: string;
    variants: WorkflowAssetVariant[];
};

const CATEGORY_ORDER = { character: 0, scene: 1, prop: 2 } as const;

export function buildWorkflowAssetCards(rows: WorkflowArtifactMappingRow[], assets: Asset[]): WorkflowAssetCard[] {
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const cards: WorkflowAssetCard[] = [];
    const characters = new Map<string, WorkflowAssetCard>();
    const variantFor = (row: WorkflowArtifactMappingRow, missingParent = false): WorkflowAssetVariant => ({
        asset: row.targetAssetId ? assetById.get(row.targetAssetId) : undefined,
        logicalAssetId: row.logicalAssetId,
        missingParent,
        row,
    });

    for (const row of rows.filter((item) => item.kind !== "costume")) {
        const category = normalizeCategory(row.kind);
        const card: WorkflowAssetCard = { category, logicalAssetId: row.logicalAssetId, name: row.name, variants: [variantFor(row)] };
        cards.push(card);
        if (category === "character") characters.set(row.logicalAssetId, card);
    }
    for (const row of rows.filter((item) => item.kind === "costume")) {
        const parent = characters.get(row.parentLogicalAssetId);
        if (parent) {
            parent.variants.push(variantFor(row));
            continue;
        }
        cards.push({ category: "character", logicalAssetId: row.logicalAssetId, name: row.variantName || row.name, variants: [variantFor(row, true)] });
    }
    return cards.sort((left, right) => CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] || left.logicalAssetId.localeCompare(right.logicalAssetId));
}

export function workflowAssetCategoryCounts(cards: WorkflowAssetCard[]): Record<WorkflowAssetCategory, number> {
    const counts = { all: cards.length, character: 0, scene: 0, prop: 0 };
    for (const card of cards) counts[card.category] += 1;
    return counts;
}

export function defaultWorkflowAssetSelection(cards: WorkflowAssetCard[]) {
    return cards.flatMap((card) => card.variants.filter((variant) => !variant.missingParent && variant.row.imagePrompt && variant.asset?.kind !== "image" && !assetSkipped(variant.asset)).map((variant) => variant.logicalAssetId));
}

export function workflowAssetGenerationProgress(cards: WorkflowAssetCard[]) {
    const required = cards.flatMap((card) => card.variants).filter((variant) => !variant.missingParent && variant.row.imagePrompt && !assetSkipped(variant.asset));
    const generated = required.filter((variant) => variant.asset?.kind === "image").length;
    return { generated, pending: required.length - generated, ready: required.length > 0 && generated === required.length, required: required.length };
}

export function workflowAssetSelectionPatch(asset: Asset, selected: boolean): Partial<Asset> {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return { metadata: { ...(asset.metadata || {}), originalWorkflow: { ...workflow, generationSelected: selected } } };
}

export function clearWorkflowAssetFailures(failed: Record<string, string>, logicalAssetIds: string[]) {
    const retried = new Set(logicalAssetIds);
    return Object.fromEntries(Object.entries(failed).filter(([id]) => !retried.has(id)));
}

export function workflowAssetVersionChoices(asset: Asset): AssetVersionRecord[] {
    return assetVersionRecords(asset).filter((version) => version.kind === "image").sort((left, right) => right.versionNumber - left.versionNumber);
}

export function workflowAssetBindingPatch(asset: Asset, row: WorkflowArtifactMappingRow, scope: { episodeId: string; projectId: string }): Partial<Asset> {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    return {
        ...(asset.assetBinding ? { assetBinding: { ...asset.assetBinding, episodeIds: Array.from(new Set([...asset.assetBinding.episodeIds, scope.episodeId])) } } : {}),
        metadata: {
            ...(asset.metadata || {}),
            originalWorkflow: {
                ...workflow,
                assetId: row.logicalAssetId,
                description: row.description,
                episode: scope.episodeId,
                imagePrompt: row.imagePrompt,
                importKey: row.importKey,
                libraryAssetId: asset.id,
                logicalAssetId: row.logicalAssetId,
                name: row.name,
                projectId: scope.projectId,
                prompt: row.imagePrompt,
                scriptEvidence: row.scriptEvidence,
                sourceEpisodeId: scope.episodeId,
                sourceProjectId: scope.projectId,
                sourceStage: "asset-image-prompt",
            },
        },
    };
}

export function workflowAssetUnbindingPatch(asset: Asset, importKey: string): Partial<Asset> {
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    if (readString(workflow.importKey) !== importKey) return {};
    return {
        metadata: {
            ...(asset.metadata || {}),
            originalWorkflow: {
                ...workflow,
                assetId: "",
                episode: "",
                importKey: "",
                libraryAssetId: "",
                logicalAssetId: "",
                projectId: "",
                sourceEpisodeId: "",
                sourceProjectId: "",
            },
        },
    };
}

function normalizeCategory(kind: string): Exclude<WorkflowAssetCategory, "all"> {
    if (kind === "character" || kind === "costume") return "character";
    if (kind === "scene") return "scene";
    return "prop";
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function assetSkipped(asset?: Asset) {
    return readRecord(asset?.metadata?.originalWorkflow).generationSelected === false;
}
