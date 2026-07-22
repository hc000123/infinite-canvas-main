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
    return cards.flatMap((card) => card.variants.filter((variant) => !variant.missingParent && variant.row.imagePrompt && variant.asset?.kind !== "image").map((variant) => variant.logicalAssetId));
}

export function workflowAssetGenerationProgress(cards: WorkflowAssetCard[]) {
    const required = cards.flatMap((card) => card.variants).filter((variant) => !variant.missingParent && variant.row.imagePrompt);
    const generated = required.filter((variant) => variant.asset?.kind === "image").length;
    return { generated, pending: required.length - generated, ready: required.length > 0 && generated === required.length, required: required.length };
}

export function workflowAssetVersionChoices(asset: Asset): AssetVersionRecord[] {
    return assetVersionRecords(asset).filter((version) => version.kind === "image").sort((left, right) => right.versionNumber - left.versionNumber);
}

export function workflowAssetEditPatch(asset: Asset, input: { description: string; imagePrompt: string }): Partial<Asset> {
    const description = input.description.trim();
    const imagePrompt = input.imagePrompt.trim();
    const workflow = readRecord(asset.metadata?.originalWorkflow);
    const patch: Partial<Asset> = {
        metadata: {
            ...(asset.metadata || {}),
            prompt: imagePrompt,
            originalWorkflow: { ...workflow, description, imagePrompt, prompt: imagePrompt, manuallyEdited: true },
        },
        note: imagePrompt,
    };
    if (asset.kind === "text") patch.data = { content: imagePrompt };
    return patch;
}

function normalizeCategory(kind: string): Exclude<WorkflowAssetCategory, "all"> {
    if (kind === "character" || kind === "costume") return "character";
    if (kind === "scene") return "scene";
    return "prop";
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
