import type { Asset, AssetKind } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { AssetVersionReference } from "../../assets/asset-version-references";
import type { CanvasNodeData, Position } from "../types.ts";
import type { AssetBreakdownItem } from "./asset-breakdown";
import type { ProductionBibleAssetRef, ProductionBibleItem } from "./production-bible";
import type { ShotGroup, StoryboardAssetRef, StoryboardTableShot } from "./storyboard-management";

export type ImageBriefKind = "scene" | "character" | "prop" | "mood";
export type ImageBriefSourceType = "asset_breakdown" | "production_bible" | "storyboard" | "manual";
export type ImageBriefMode = "standard" | "reminder" | "free";
export type ImageBriefStatus = "draft" | "prompt_ready" | "generated" | "archived";

export type ImageBriefReferenceAsset = {
    assetId: string;
    kind?: AssetKind;
    role: string;
    note?: string;
    assetVersion?: AssetVersionReference;
};

export type ImageBriefValidationResult = {
    ok: boolean;
    severity: "none" | "warning" | "error";
    messages: string[];
};

export type ImageBrief = {
    id: string;
    projectId: string;
    canvasId: string;
    episodeId: string;
    episodeTitle: string;
    sourceType: ImageBriefSourceType;
    sourceId: string;
    kind: ImageBriefKind;
    mode: ImageBriefMode;
    title: string;
    scriptText: string;
    fields: Record<string, string>;
    referenceAssets: ImageBriefReferenceAsset[];
    validationResult: ImageBriefValidationResult;
    prompt: string;
    finalPrompt: string;
    resultAssetIds: string[];
    primaryAssetId?: string;
    status: ImageBriefStatus;
    metadata?: {
        productionBibleItemId?: string;
        assetBreakdownItemId?: string;
        agentRunId?: string;
        agentConfigId?: string;
        agentConfigVersion?: string;
        agentAssetKind?: string;
        suggestedBriefKind?: string;
        tags?: string[];
        warnings?: string[];
        shotGroupId?: string;
        shotIds?: string[];
        briefSnapshot?: Record<string, unknown>;
    };
    createdAt: string;
    updatedAt: string;
};

export type ImageBriefWriteInput = Omit<ImageBrief, "id" | "createdAt" | "updatedAt" | "validationResult" | "prompt" | "status"> & {
    validationResult?: ImageBriefValidationResult;
    prompt?: string;
    status?: ImageBriefStatus;
};

export type NormalizedImageBriefInput = Omit<ImageBrief, "id" | "createdAt" | "updatedAt">;

const kindLabels: Record<ImageBriefKind, string> = {
    scene: "场景图",
    character: "角色图",
    prop: "道具图",
    mood: "氛围参考图",
};

const requiredFieldLabels: Record<ImageBriefKind, Array<{ keys: string[]; label: string }>> = {
    scene: [
        { keys: ["location"], label: "场景地点" },
        { keys: ["atmosphere", "composition"], label: "氛围或构图" },
        { keys: ["lighting"], label: "光影" },
    ],
    character: [
        { keys: ["appearance"], label: "外貌特征" },
        { keys: ["costume"], label: "服装造型" },
        { keys: ["consistency"], label: "一致性要求" },
    ],
    prop: [
        { keys: ["material"], label: "材质" },
        { keys: ["shape"], label: "形态" },
        { keys: ["usage"], label: "用途" },
    ],
    mood: [
        { keys: ["mood"], label: "情绪氛围" },
        { keys: ["lighting", "palette"], label: "光影或色彩" },
    ],
};

export function defaultImageBriefFields(kind: ImageBriefKind): Record<string, string> {
    if (kind === "scene") return { location: "", timeOfDay: "", atmosphere: "", composition: "", lighting: "" };
    if (kind === "character") return { appearance: "", costume: "", expression: "", pose: "", consistency: "" };
    if (kind === "prop") return { material: "", shape: "", scale: "", usage: "", details: "" };
    return { mood: "", palette: "", lighting: "", texture: "", reference: "" };
}

export function validateImageBrief(brief: Pick<ImageBrief, "kind" | "mode" | "fields" | "title">): ImageBriefValidationResult {
    if (brief.mode === "free") return { ok: true, severity: "none", messages: [] };
    const missing = requiredFieldLabels[brief.kind].filter((group) => !group.keys.some((key) => nonEmpty(brief.fields[key]))).map((group) => `缺少${group.label}`);
    if (!brief.title.trim()) missing.unshift("缺少 Brief 标题");
    if (!missing.length) return { ok: true, severity: "none", messages: [] };
    return {
        ok: brief.mode === "reminder",
        severity: brief.mode === "reminder" ? "warning" : "error",
        messages: missing,
    };
}

export function buildImageBriefPrompt(brief: Pick<ImageBrief, "kind" | "title" | "scriptText" | "fields" | "referenceAssets">): string {
    const fieldLines = Object.entries(brief.fields)
        .filter(([, value]) => nonEmpty(value))
        .map(([key, value]) => `${fieldLabel(key)}：${value.trim()}`);
    const referenceLines = brief.referenceAssets.length ? [`参考素材：${brief.referenceAssets.map((ref) => `${ref.role || "reference"}(${ref.assetId})`).join("、")}`] : [];
    return [
        `请生成一张短剧制作参考${kindLabels[brief.kind]}。`,
        `标题：${brief.title.trim() || "未命名 Brief"}`,
        brief.scriptText.trim() ? `剧本依据：${brief.scriptText.trim()}` : "",
        ...fieldLines,
        ...referenceLines,
        "要求：真实自然、结构清晰、可作为后续画布生图参考。",
    ]
        .filter(Boolean)
        .join("\n");
}

export function normalizeImageBriefInput(input: ImageBriefWriteInput): NormalizedImageBriefInput {
    const fields = { ...defaultImageBriefFields(input.kind), ...trimRecord(input.fields) };
    const validationResult = validateImageBrief({ ...input, title: input.title.trim(), fields });
    const prompt = buildImageBriefPrompt({ ...input, title: input.title.trim(), scriptText: input.scriptText.trim(), fields });
    const finalPrompt = input.finalPrompt?.trim() || prompt;
    return {
        ...input,
        title: input.title.trim() || `${kindLabels[input.kind]} Brief`,
        scriptText: input.scriptText.trim(),
        fields,
        referenceAssets: dedupeReferenceAssets(input.referenceAssets),
        prompt,
        finalPrompt,
        validationResult,
        resultAssetIds: uniqueStrings(input.resultAssetIds || []),
        primaryAssetId: input.primaryAssetId?.trim() || undefined,
        status: input.status === "generated" || input.status === "archived" ? input.status : validationResult.ok && finalPrompt ? "prompt_ready" : "draft",
    };
}

export function buildImageBriefFromAssetBreakdown(item: AssetBreakdownItem, id = `brief-${Date.now()}`, now = new Date().toISOString()): ImageBrief {
    const kind = imageBriefKindFromAssetBreakdownItem(item);
    const fields = {
        ...defaultImageBriefFields(kind),
        description: item.description,
        sourceText: item.sourceText,
        ...(kind === "scene" ? { location: item.name, atmosphere: item.description } : {}),
        ...(kind === "character" ? { appearance: item.description, consistency: item.tags.join("、") } : {}),
        ...(kind === "prop" ? { details: item.description, usage: item.sourceText } : {}),
        ...(kind === "mood" ? { mood: item.name, reference: item.description || item.sourceText } : {}),
    };
    return buildBrief({
        id,
        now,
        input: {
            projectId: item.projectId,
            canvasId: item.canvasId,
            episodeId: item.episodeId,
            episodeTitle: item.episodeTitle,
            sourceType: "asset_breakdown",
            sourceId: item.id,
            kind,
            mode: "standard",
            title: `${item.name} · ${kindLabels[kind]}`,
            scriptText: item.sourceText,
            fields,
            referenceAssets: item.assetIds.map((assetId) => ({ assetId, role: "reference" })),
            finalPrompt: "",
            resultAssetIds: [],
            metadata: {
                assetBreakdownItemId: item.id,
                productionBibleItemId: item.productionBibleItemId,
                agentRunId: item.agentRunId,
                agentConfigId: item.agentConfigId,
                agentConfigVersion: item.agentConfigVersion,
                agentAssetKind: item.agentAssetKind,
                suggestedBriefKind: item.suggestedBriefKind,
                tags: item.tags,
                warnings: item.warnings || [],
            },
        },
    });
}

export function buildImageBriefFromProductionBible(item: ProductionBibleItem, context: { canvasId?: string; episodeId?: string; episodeTitle?: string } = {}, id = `brief-${Date.now()}`, now = new Date().toISOString()): ImageBrief {
    const fields = {
        ...defaultImageBriefFields(item.kind),
        description: item.description,
        positive: item.promptSnippets.positive || "",
        negative: item.promptSnippets.negative || "",
        consistency: item.promptSnippets.consistency || "",
        ...(item.kind === "scene" ? { location: item.name, atmosphere: item.description } : {}),
        ...(item.kind === "character" ? { appearance: item.description, consistency: item.promptSnippets.consistency || item.description } : {}),
        ...(item.kind === "prop" ? { details: item.description, usage: item.promptSnippets.positive || item.description } : {}),
    };
    return buildBrief({
        id,
        now,
        input: {
            projectId: item.projectId,
            canvasId: context.canvasId || "",
            episodeId: context.episodeId || "",
            episodeTitle: context.episodeTitle || "",
            sourceType: "production_bible",
            sourceId: item.id,
            kind: item.kind,
            mode: "standard",
            title: `${item.name} · ${kindLabels[item.kind]}`,
            scriptText: item.description,
            fields,
            referenceAssets: item.assetRefs.map((ref) => ({ ...ref, role: ref.role || "reference" })),
            finalPrompt: "",
            resultAssetIds: [],
            metadata: { productionBibleItemId: item.id },
        },
    });
}

export function buildImageBriefFromShotGroup(group: ShotGroup, shots: StoryboardTableShot[], id = `brief-${Date.now()}`, now = new Date().toISOString()): ImageBrief {
    const orderedShots = [...shots].filter((shot) => group.shotIds.includes(shot.id)).sort((a, b) => a.order - b.order);
    const scriptText = orderedShots
        .map((shot) => shot.scriptText || shot.visualDescription)
        .filter(Boolean)
        .join("\n");
    const fields = {
        ...defaultImageBriefFields("mood"),
        mood: group.prompt || group.effectivePrompt,
        lighting: uniqueStrings(orderedShots.map((shot) => shot.timeOfDay)).join("、"),
        reference: group.sceneName,
        texture: uniqueStrings(orderedShots.flatMap((shot) => [shot.emotion, shot.cameraMovement, shot.shotSize])).join("、"),
    };
    return buildBrief({
        id,
        now,
        input: {
            projectId: group.projectId,
            canvasId: group.canvasId,
            episodeId: group.episodeId,
            episodeTitle: "",
            sourceType: "storyboard",
            sourceId: group.id,
            kind: "mood",
            mode: "standard",
            title: `${group.sceneName} · 氛围参考图`,
            scriptText,
            fields,
            referenceAssets: [...group.assetRefs, ...group.audioRefs].map(storyboardRefToBriefRef),
            finalPrompt: "",
            resultAssetIds: [],
            metadata: { shotGroupId: group.id, shotIds: [...group.shotIds] },
        },
    });
}

export function imageBriefKindLabel(kind: ImageBriefKind) {
    return kindLabels[kind];
}

export function imageBriefModeLabel(mode: ImageBriefMode) {
    if (mode === "standard") return "标准";
    if (mode === "reminder") return "提醒";
    return "自由";
}

export function imageBriefGenerationGate(brief: ImageBrief) {
    if (brief.mode === "free") return { allowed: true, needsConfirmation: false, messages: [] };
    if (brief.validationResult.severity === "error") return { allowed: false, needsConfirmation: false, messages: brief.validationResult.messages };
    if (brief.validationResult.severity === "warning") return { allowed: true, needsConfirmation: true, messages: brief.validationResult.messages };
    return { allowed: true, needsConfirmation: false, messages: [] };
}

export function imageBriefKindFromAssetBreakdownItem(item: Pick<AssetBreakdownItem, "kind" | "agentAssetKind" | "suggestedBriefKind">): ImageBriefKind {
    if (isImageBriefKind(item.suggestedBriefKind)) return item.suggestedBriefKind;
    if (item.agentAssetKind === "scene") return "scene";
    if (item.agentAssetKind === "prop") return "prop";
    if (item.agentAssetKind === "mood" || item.agentAssetKind === "effect") return "mood";
    if (item.agentAssetKind === "character" || item.agentAssetKind === "costume" || item.agentAssetKind === "makeup") return "character";
    if (item.kind === "style") return "mood";
    return item.kind;
}

export function buildImageBriefGenerationMetadata(brief: ImageBrief) {
    return {
        briefId: brief.id,
        briefKind: brief.kind,
        briefMode: brief.mode,
        briefSnapshot: imageBriefSnapshot(brief),
        finalPrompt: brief.finalPrompt || brief.prompt,
        sourceType: brief.sourceType,
        sourceId: brief.sourceId,
        episodeId: brief.episodeId,
        episodeTitle: brief.episodeTitle,
        assetBreakdownItemId: brief.metadata?.assetBreakdownItemId,
        agentRunId: brief.metadata?.agentRunId,
        agentConfigId: brief.metadata?.agentConfigId,
        agentConfigVersion: brief.metadata?.agentConfigVersion,
        productionBibleItemId: brief.metadata?.productionBibleItemId,
        shotGroupId: brief.metadata?.shotGroupId,
        shotIds: brief.metadata?.shotIds || [],
        referenceAssets: brief.referenceAssets,
    };
}

export function buildImageBriefImageConfigNode({ brief, config, position, id = `config-${Date.now()}` }: { brief: ImageBrief; config: AiConfig; position: Position; id?: string }): CanvasNodeData {
    return {
        id,
        type: "config" as CanvasNodeData["type"],
        title: brief.title || "生图 Brief",
        position,
        width: 340,
        height: 240,
        metadata: {
            generationMode: "image",
            prompt: brief.finalPrompt || brief.prompt,
            model: config.imageModel || config.model,
            size: config.size,
            count: 1,
            ...buildImageBriefGenerationMetadata(brief),
        },
    };
}

export function mergeImageBriefResultAssetIds(brief: ImageBrief, assetId: string, status: ImageBriefStatus = "generated"): Pick<ImageBrief, "resultAssetIds" | "status"> {
    return {
        resultAssetIds: uniqueStrings([...brief.resultAssetIds, assetId]),
        status,
    };
}

export function buildImageBriefPrimaryAssetPatch(brief: ImageBrief, assetId: string): Pick<ImageBrief, "resultAssetIds" | "primaryAssetId"> {
    return {
        primaryAssetId: assetId,
        resultAssetIds: uniqueStrings([assetId, ...brief.resultAssetIds]),
    };
}

export function buildImageBriefResultSummaries(brief: ImageBrief, assets: Asset[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const primaryAssetId = brief.primaryAssetId || brief.resultAssetIds[0];
    return uniqueStrings([primaryAssetId || "", ...brief.resultAssetIds])
        .flatMap((assetId) => {
            const asset = assetsById.get(assetId);
            if (!asset) return [];
            const generation = readRecord(asset.metadata?.generation);
            return [
                {
                    assetId,
                    title: asset.title,
                    kind: asset.kind,
                    coverUrl: asset.coverUrl,
                    createdAt: readString(generation.createdAt) || asset.createdAt,
                    model: readString(generation.model),
                    provider: readString(generation.provider),
                    finalPrompt: readString(generation.finalPrompt) || readString(generation.effectivePrompt) || readString(generation.prompt),
                    referenceAssets: Array.isArray(generation.referenceAssets) ? generation.referenceAssets : [],
                    currentVersionNumber: currentBriefAssetVersionNumber(asset),
                    isPrimary: assetId === primaryAssetId,
                },
            ];
        })
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.createdAt.localeCompare(a.createdAt));
}

export function buildImageBriefResultPatch(item: AssetBreakdownItem, assetId: string): Pick<AssetBreakdownItem, "assetIds" | "status"> {
    return {
        assetIds: uniqueStrings([...item.assetIds, assetId]),
        status: "generated",
    };
}

export function buildImageBriefPrimaryAssetBreakdownPatch(item: AssetBreakdownItem, assetId: string): Pick<AssetBreakdownItem, "assetIds" | "status"> {
    return {
        assetIds: uniqueStrings([assetId, ...item.assetIds]),
        status: "linked",
    };
}

export function buildProductionBibleBriefAssetRefs(item: ProductionBibleItem, assetId: string): { assetRefs: ProductionBibleAssetRef[] } {
    const refs = dedupeBibleAssetRefs([...item.assetRefs, { assetId, role: "reference" }]);
    return { assetRefs: refs };
}

export function buildProductionBibleBriefPrimaryAssetRefs(item: ProductionBibleItem, assetId: string): { assetRefs: ProductionBibleAssetRef[] } {
    const refs = dedupeBibleAssetRefs([{ assetId, role: "primary_reference" }, ...item.assetRefs.filter((ref) => ref.assetId !== assetId)]);
    return { assetRefs: refs };
}

export function imageBriefSnapshot(brief: ImageBrief) {
    return {
        id: brief.id,
        kind: brief.kind,
        mode: brief.mode,
        title: brief.title,
        sourceType: brief.sourceType,
        sourceId: brief.sourceId,
        fields: brief.fields,
        referenceAssets: brief.referenceAssets,
        validationResult: brief.validationResult,
        prompt: brief.prompt,
        finalPrompt: brief.finalPrompt,
        metadata: brief.metadata,
        updatedAt: brief.updatedAt,
    };
}

function buildBrief({ id, now, input }: { id: string; now: string; input: ImageBriefWriteInput }): ImageBrief {
    const normalized = normalizeImageBriefInput(input);
    return { ...normalized, id, createdAt: now, updatedAt: now };
}

function storyboardRefToBriefRef(ref: StoryboardAssetRef): ImageBriefReferenceAsset {
    return { assetId: ref.assetId, kind: ref.kind, role: ref.role, assetVersion: ref.assetVersion };
}

function isImageBriefKind(value: unknown): value is ImageBriefKind {
    return value === "scene" || value === "character" || value === "prop" || value === "mood";
}

function fieldLabel(key: string) {
    const labels: Record<string, string> = {
        location: "地点",
        timeOfDay: "时间",
        atmosphere: "氛围",
        composition: "构图",
        lighting: "光影",
        appearance: "外貌",
        costume: "服装",
        expression: "表情",
        pose: "姿态",
        consistency: "一致性",
        material: "材质",
        shape: "形态",
        scale: "尺度",
        usage: "用途",
        details: "细节",
        mood: "情绪",
        palette: "色彩",
        texture: "质感",
        reference: "参考",
        description: "描述",
        sourceText: "来源文本",
        positive: "正向片段",
        negative: "反向片段",
    };
    return labels[key] || key;
}

function trimRecord(record: Record<string, string>) {
    return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [key, String(value || "").trim()]));
}

function dedupeReferenceAssets(refs: ImageBriefReferenceAsset[]) {
    const seen = new Set<string>();
    const result: ImageBriefReferenceAsset[] = [];
    for (const ref of refs || []) {
        const assetId = ref.assetId.trim();
        if (!assetId) continue;
        const key = `${assetId}:${ref.role || "reference"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ ...ref, assetId, role: ref.role?.trim() || "reference" });
    }
    return result;
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function currentBriefAssetVersionNumber(asset: Asset) {
    const versions = Array.isArray(asset.metadata?.assetVersions) ? asset.metadata.assetVersions : [];
    const currentId = typeof asset.metadata?.currentAssetVersionId === "string" ? asset.metadata.currentAssetVersionId : "";
    const current = versions.find((item) => readRecord(item).id === currentId) || [...versions].sort((a, b) => Number(readRecord(b).versionNumber || 0) - Number(readRecord(a).versionNumber || 0))[0];
    const versionNumber = readRecord(current).versionNumber;
    return typeof versionNumber === "number" ? versionNumber : versions.length ? undefined : 1;
}

function readRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && Boolean(value) && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function dedupeBibleAssetRefs(refs: ProductionBibleAssetRef[]) {
    const seen = new Set<string>();
    const result: ProductionBibleAssetRef[] = [];
    for (const ref of refs) {
        const assetId = ref.assetId.trim();
        if (!assetId) continue;
        const key = `${assetId}:${ref.role || "reference"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ ...ref, assetId, role: ref.role?.trim() || "reference" });
    }
    return result;
}

function nonEmpty(value?: string) {
    return Boolean(value?.trim());
}
