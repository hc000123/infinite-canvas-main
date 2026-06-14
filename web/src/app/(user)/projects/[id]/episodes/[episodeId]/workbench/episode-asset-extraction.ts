import type { Asset } from "@/stores/use-asset-store";
import type { ProductionBibleItem } from "../../../../../canvas/utils/production-bible";
import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import { buildCharacterImagePrompt } from "../../../../../canvas/utils/character-image-prompt";
import type { AgentWorkflowMappingPreview, AgentWorkflowMappingPreviewItem } from "../../../../agent-runner-types";
import type { EpisodeStatusTone } from "./components/episode-module-panel";
import { listSafeText, mappedFieldText, padEpisodeOrder, uniqueTextList } from "./episode-workbench-display";

export type EpisodeExtractedAsset = {
    boundAssetIds: string[];
    canGenerate: boolean;
    candidates: Asset[];
    description: string;
    episodeLabel: string;
    id: string;
    item?: AgentWorkflowMappingPreviewItem;
    libraryMatchCount: number;
    name: string;
    productionBibleItem?: ProductionBibleItem;
    promptDraft: string;
    previewAsset?: Asset;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    tone: EpisodeStatusTone;
    type: "角色" | "场景" | "道具" | "服装";
};

export function buildEpisodeExtractedAssets({
    assetLibrary,
    episode,
    episodeTableShots,
    preview,
    productionBibleItems,
    projectId,
}: {
    appliedPreviewItemIds: string[];
    assetLibrary: Asset[];
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    preview?: AgentWorkflowMappingPreview;
    productionBibleItems: ProductionBibleItem[];
    projectId: string;
}): EpisodeExtractedAsset[] {
    if (!preview?.items.length) return [];
    const rows = preview.items.map((item, index) => {
        const type = episodeAssetTypeFromPreviewItem(item);
        const name = mappedFieldText(item.mappedFields.name) || item.title || `资产 ${index + 1}`;
        const sourceText = mappedFieldText(item.mappedFields.sourceText);
        const usage = mappedFieldText(item.mappedFields.usage);
        const fullDescription = mappedFieldText(item.mappedFields.description) || usage || sourceText || item.sourceText || item.reason || "待确认资产描述。";
        const description = listSafeText(fullDescription, "待确认资产描述。");
        const productionBibleItem = findProductionBibleItemForPreviewItem({ item, preview, productionBibleItems, projectId });
        const boundAssetIds = productionBibleItem?.assetRefs.map((ref) => ref.assetId).filter(Boolean) || [];
        const boundAssets = boundAssetIds.flatMap((assetId) => {
            const asset = assetLibrary.find((item) => item.id === assetId);
            return asset ? [asset] : [];
        });
        const candidates = matchProjectAssetCandidates(assetLibrary, { boundAssetIds, description, name, productionBibleItemId: productionBibleItem?.id, sourceItemId: item.itemId, type });
        const generatedPreviewAsset = candidates.find((asset) => asset.kind === "image" && isExactEpisodeGeneratedAsset(asset, item.itemId, productionBibleItem?.id));
        const previewAsset = boundAssets.find((asset) => asset.kind === "image") || boundAssets[0] || generatedPreviewAsset;
        const canGenerate = item.action !== "skip" && Boolean(fullDescription.trim());
        const status = episodeExtractedAssetStatus({ canGenerate, candidates, item, productionBibleItem });
        return {
            boundAssetIds,
            canGenerate,
            candidates,
            description,
            episodeLabel: `第 ${padEpisodeOrder(episode.order)} 集`,
            id: item.itemId,
            item,
            libraryMatchCount: candidates.length,
            name,
            productionBibleItem,
            previewAsset,
            promptDraft: makeAssetPromptDraft({ description: fullDescription, name, promptSnippets: item.mappedFields.promptSnippets, type }),
            referencedShotLabels: referencedShotLabelsForAsset(episodeTableShots, name, description),
            sourceReason: sourceText || item.reason,
            status,
            tone: episodeExtractedAssetTone(status),
            type,
        };
    });
    return ensureEpisodeSceneAsset({ assetLibrary, episode, existingRows: rows });
}

export function productionBibleRoleForExtractedAsset(row: EpisodeExtractedAsset) {
    if (row.type === "角色") return "portrait";
    if (row.type === "场景") return "environment";
    return "reference";
}

function findProductionBibleItemForPreviewItem({ item, preview, productionBibleItems, projectId }: { item: AgentWorkflowMappingPreviewItem; preview: AgentWorkflowMappingPreview; productionBibleItems: ProductionBibleItem[]; projectId: string }) {
    return productionBibleItems.find((entry) => {
        if (entry.projectId !== projectId) return false;
        const source = entry.metadata?.source;
        if (source?.previewId === preview.previewId && source.previewItemId === item.itemId) return true;
        return entry.name === item.title;
    });
}

function episodeAssetTypeFromPreviewItem(item: AgentWorkflowMappingPreviewItem): EpisodeExtractedAsset["type"] {
    const kindText = `${mappedFieldText(item.mappedFields.assetCardKind)} ${mappedFieldText(item.mappedFields.typeLabel)} ${mappedFieldText(item.mappedFields.kind)} ${mappedFieldText(item.mappedFields.type)} ${mappedFieldText(item.mappedFields.category)} ${mappedFieldText(item.mappedFields.tags)}`.toLowerCase();
    const contentText = stripNegativeAssetSignalText(`${item.title} ${mappedFieldText(item.mappedFields.name)} ${mappedFieldText(item.mappedFields.description)} ${mappedFieldText(item.mappedFields.prompt)} ${mappedFieldText(item.mappedFields.promptSnippets)} ${item.sourceText}`.toLowerCase());
    if (hasCharacterDesignSignal(contentText)) return "角色";
    if (hasScenePlanningSignal(contentText)) return "场景";
    if (hasPropAssetSignal(contentText)) return "道具";
    if (hasCostumeAssetSignal(kindText) || (!hasCharacterAssetSignal(contentText) && hasCostumeAssetSignal(contentText))) return "服装";
    if (hasPropAssetSignal(kindText)) return "道具";
    if (hasCharacterAssetSignal(contentText)) return "角色";
    if (hasSceneAssetSignal(kindText) || hasSceneAssetSignal(contentText)) return "场景";
    return "角色";
}

function stripNegativeAssetSignalText(text: string) {
    return text
        .replace(/\b(no|without)\s+(humans?|characters?|people|persons?|faces?|clothing|costumes?|limbs?|hands?)\b/gi, " ")
        .replace(/禁止[^。；;,.，、\n]{0,20}(人物|角色|人类|脸|服装|肢体|手指)/g, " ");
}

function hasCharacterDesignSignal(text: string) {
    return /(角色图|角色设定板|character design sheet|turnaround sheet|front view|side view|back view|portrait close-up|headshot)/i.test(text);
}

function hasScenePlanningSignal(text: string) {
    return /(场景规划|场景参考图|场记|2x2|四宫格|top-down layout|scene planning|scene reference|environment reference|location reference)/i.test(text);
}

function hasCharacterAssetSignal(text: string) {
    return /(角色|人物|演员|主角|配角|女主|男主|反派|爱人|男性|女性|男子|女子|青年|中年|老人|外貌|五官|脸型|肤色|发型|发色|眼神|妆容|身形|身材|体型|表演|character|person|actor|male|female|portrait|character design sheet|turnaround sheet|front view|side view|back view)/i.test(text);
}

function hasSceneAssetSignal(text: string) {
    return /(场景|场记|地点|空间|环境|内景|外景|海底|仓库|道路|房间|scene|location|environment|set)/i.test(text);
}

function hasPropAssetSignal(text: string) {
    return /(道具|物件|器物|工具|手持|prop|item|object)/i.test(text);
}

function hasCostumeAssetSignal(text: string) {
    return /(服装|服化|妆发|发型|衣着|鞋子|costume|makeup|clothing|hair|wardrobe)/i.test(text);
}

function episodeExtractedAssetStatus({
    canGenerate,
    candidates,
    item,
    productionBibleItem,
}: {
    canGenerate: boolean;
    candidates: Asset[];
    item: AgentWorkflowMappingPreviewItem;
    productionBibleItem?: ProductionBibleItem;
}): EpisodeExtractedAsset["status"] {
    if (productionBibleItem?.assetRefs.length) return "已绑定";
    if (item.action === "skip" || item.warnings.length) return "待确认";
    if (candidates.length) return "待绑定";
    return canGenerate ? "待生成" : "缺素材";
}

function episodeExtractedAssetTone(status: EpisodeExtractedAsset["status"]): EpisodeStatusTone {
    if (status === "已绑定") return "green";
    if (status === "待绑定" || status === "待生成") return "cyan";
    if (status === "缺素材" || status === "待确认") return "amber";
    return "slate";
}

function matchProjectAssetCandidates(assetLibrary: Asset[], asset: Pick<EpisodeExtractedAsset, "description" | "name" | "type"> & { boundAssetIds?: string[]; productionBibleItemId?: string; sourceItemId?: string }) {
    const terms = uniqueTextList(`${asset.name} ${asset.description} ${asset.type}`.split(/[\s,，、/·:：。；;（）()]+/).filter((term) => term.length >= 2));
    const boundAssetIds = new Set(asset.boundAssetIds || []);
    return assetLibrary
        .filter((candidate) => !boundAssetIds.has(candidate.id))
        .map((candidate) => ({ asset: candidate, score: scoreAssetCandidate(candidate, terms, asset.type, asset.sourceItemId, asset.productionBibleItemId) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.asset.updatedAt.localeCompare(a.asset.updatedAt))
        .slice(0, 8)
        .map((item) => item.asset);
}

function scoreAssetCandidate(asset: Asset, terms: string[], type: EpisodeExtractedAsset["type"], sourceItemId?: string, productionBibleItemId?: string) {
    const source = asset.metadata?.source;
    if (source === "episode-assets") {
        if (!isExactEpisodeGeneratedAsset(asset, sourceItemId, productionBibleItemId)) return 0;
    }
    const haystack = `${asset.title} ${(asset.tags || []).join(" ")} ${asset.note || ""} ${asset.source || ""}`.toLowerCase();
    let score = 0;
    if (isExactEpisodeGeneratedAsset(asset, sourceItemId, productionBibleItemId)) score += 100;
    terms.forEach((term) => {
        if (haystack.includes(term.toLowerCase())) score += term.length > 3 ? 3 : 2;
    });
    if (asset.kind === "image") score += 1;
    if (type === "场景" && (haystack.includes("场景") || haystack.includes("环境"))) score += 2;
    if (type === "角色" && (haystack.includes("角色") || haystack.includes("人物"))) score += 2;
    if (type === "道具" && haystack.includes("道具")) score += 2;
    if (type === "服装" && (haystack.includes("服装") || haystack.includes("服化"))) score += 2;
    return score;
}

function isExactEpisodeGeneratedAsset(asset: Asset, sourceItemId?: string, productionBibleItemId?: string) {
    const metadata = asset.metadata as Record<string, unknown> | undefined;
    if (!metadata || (metadata.source !== "episode-assets" && !hasEpisodeAssetGeneration(metadata))) return false;
    return [metadata, readRecord(metadata.generation), ...readRecordList(metadata.generations)].some((record) => matchesEpisodeGeneratedAsset(record, sourceItemId, productionBibleItemId));
}

function hasEpisodeAssetGeneration(metadata: Record<string, unknown>) {
    const generation = readRecord(metadata.generation);
    if (generation.source === "episode-assets") return true;
    return readRecordList(metadata.generations).some((record) => record.source === "episode-assets");
}

function matchesEpisodeGeneratedAsset(record: Record<string, unknown>, sourceItemId?: string, productionBibleItemId?: string) {
    return Boolean((sourceItemId && record.assetExtractionItemId === sourceItemId) || (productionBibleItemId && record.productionBibleItemId === productionBibleItemId));
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readRecordList(value: unknown) {
    return Array.isArray(value) ? value.map(readRecord).filter((record) => Object.keys(record).length > 0) : [];
}

function referencedShotLabelsForAsset(shots: StoryboardTableShot[], name: string, description: string) {
    const terms = uniqueTextList([name, ...description.split(/[，,、。\s]+/)].filter((term) => term.length >= 2));
    return shots
        .filter((shot) => {
            const text = `${shot.title} ${shot.sceneName} ${shot.scriptText} ${shot.visualDescription} ${shot.characters.join(" ")} ${shot.assetNeeds?.join(" ") || ""}`;
            return terms.some((term) => text.includes(term));
        })
        .slice(0, 6)
        .map((shot) => `P${padEpisodeOrder(shot.order)}`);
}

function makeAssetPromptDraft({ description, name, promptSnippets, type }: { description: string; name: string; promptSnippets?: unknown; type: EpisodeExtractedAsset["type"] }) {
    const existing = mappedFieldText(promptSnippets);
    if (type === "角色") return buildCharacterImagePrompt({ title: name, description, sourcePrompt: existing });
    if (existing) return existing;
    return `${name}，${type}参考图，${description}，电影级写实质感，低对比深色影像风格，保持本集视觉连续性，清晰可作为后续分镜和画布承接参考。`;
}

function ensureEpisodeSceneAsset({ assetLibrary, episode, existingRows }: { assetLibrary: Asset[]; episode: ScriptEpisode; existingRows: EpisodeExtractedAsset[] }) {
    if (existingRows.some((row) => row.type === "场景")) return existingRows;
    const sceneLine = pickSceneLineFromScript(episode.summary);
    if (!sceneLine) return existingRows;
    const name = sceneNameFromScriptLine(sceneLine, episode.title);
    const description = listSafeText(sceneLine, "待确认场景描述。");
    const candidates = matchProjectAssetCandidates(assetLibrary, { boundAssetIds: [], description, name, type: "场景" });
    const sceneAsset: EpisodeExtractedAsset = {
        boundAssetIds: [],
        canGenerate: true,
        candidates,
        description,
        episodeLabel: `第 ${padEpisodeOrder(episode.order)} 集`,
        id: `script-scene-${episode.id}`,
        libraryMatchCount: candidates.length,
        name,
        promptDraft: makeAssetPromptDraft({ description, name, type: "场景" }),
        referencedShotLabels: [],
        sourceReason: "从剧本正文自动补出的场景/场记卡，等待用户确认或重新运行资产分析。",
        status: "待生成",
        tone: "cyan",
        type: "场景",
    };
    return [
        ...existingRows,
        sceneAsset,
    ];
}

function pickSceneLineFromScript(script: string) {
    const lines = script
        .split(/\n+/)
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .filter((line) => line.length >= 6)
        .slice(0, 80);
    return (
        lines.find((line) => /(ep\s*\d+|第?\s*\d+\s*[场幕]|场\s*\d+|内|外|夜|日|卧房|客厅|办公室|教室|街|门口|车内|房间)/i.test(line)) ||
        lines.find((line) => /摘要|地点|空间|场景/.test(line)) ||
        lines[0] ||
        ""
    );
}

function sceneNameFromScriptLine(line: string, fallback: string) {
    const normalized = line.replace(/^摘要[:：]\s*/, "").trim();
    const locationMatch = normalized.match(/(?:EP\s*\d+\s*)?(?:第?\s*\d+\s*[场幕]|场\s*\d+)[、：:\s-]*([^，。,.;；]{2,24})/i);
    if (locationMatch?.[1]) return locationMatch[1].trim();
    const firstPhrase = normalized.split(/[，。,.;；]/)[0]?.trim();
    return firstPhrase ? firstPhrase.slice(0, 24) : `${fallback} 场景/场记`;
}
