import type { ProductionBibleKind } from "../canvas/utils/production-bible.ts";
import { readCandidateField, readCandidateTags, readCandidateText, readCandidateTitle, stringListField } from "./agent-runner-mapping-utils.ts";

export type WorkflowAssetCardKind = "character" | "scene" | "prop" | "costume";

export type WorkflowAssetCard = {
    confidence: number;
    consistency: string;
    description: string;
    kind: WorkflowAssetCardKind;
    name: string;
    negativePrompt: string;
    prompt: string;
    reason: string;
    riskNotes: string[];
    sourceText: string;
    tags: string[];
    typeLabel: string;
    usage: string;
};

const nameKeys = ["name", "assetName", "asset_id", "characterName", "sceneName", "propName", "costumeName", "itemName", "title", "label"];
const descriptionKeys = ["description", "visualDescription", "appearance", "sceneDescription", "characterDescription", "propDescription", "costumeDescription", "character_fields", "scene_fields", "space", "material", "clothing", "makeup", "hair", "atmosphere", "state", "actionRelation"];
const promptKeys = ["prompt", "prompt_text", "imagePrompt", "positivePrompt", "generationPrompt", "visualPrompt", "finalPrompt", "effectivePrompt"];
const usageKeys = ["usage", "use", "purpose", "function", "role", "actionRelation"];
const sourceKeys = ["sourceText", "source", "sourceFragment", "evidence", "scriptEvidence", "originalText"];
const riskKeys = ["risk", "risks", "riskNotes", "warnings", "reviewNotes"];

export function normalizeWorkflowAssetCard(item: unknown, index: number): WorkflowAssetCard {
    const kind = inferWorkflowAssetCardKind(item);
    const typeLabel = workflowAssetCardKindLabel(kind);
    const name = cleanAssetCardName(firstFieldText(item, nameKeys) || readCandidateTitle(item, ""), typeLabel, index);
    const usage = firstFieldText(item, usageKeys) || defaultAssetUsage(kind);
    const sourceText = listSafeText(firstFieldText(item, sourceKeys) || readCandidateText(item), "未标注来源片段。");
    const description = listSafeText(
        uniqueTextList([
            firstFieldText(item, descriptionKeys),
            kind === "scene" ? firstFieldText(item, ["location", "timeOfDay", "lighting", "environment"]) : "",
            kind === "character" ? firstFieldText(item, ["age", "temperament", "costume", "identity"]) : "",
            usage,
        ]).join("；"),
        sourceText || `${name}的${typeLabel}描述待补充。`,
    );
    const prompt = listSafeText(firstFieldText(item, promptKeys) || buildAssetImagePrompt({ description, kind, name, typeLabel, usage }), buildAssetImagePrompt({ description, kind, name, typeLabel, usage }));
    const riskNotes = uniqueTextList(riskKeys.flatMap((key) => stringListField(readCandidateField(item, key))));
    const tags = uniqueTextList([typeLabel, ...readCandidateTags(item), ...stringListField(firstFieldText(item, ["tags", "keywords", "labels"]))]).slice(0, 8);
    const fallbackName = name === `${typeLabel} ${index + 1}`;
    return {
        confidence: fallbackName || description.length < 12 ? 0.54 : 0.84,
        consistency: firstFieldText(item, ["style", "continuity", "consistency"]) || "",
        description,
        kind,
        name,
        negativePrompt: firstFieldText(item, ["negativePrompt", "avoid", "forbidden"]) || "",
        prompt,
        reason: `已整理为${typeLabel}资产卡：名称、用途、描述、提示词和来源分离，等待用户确认。`,
        riskNotes,
        sourceText,
        tags,
        typeLabel,
        usage,
    };
}

export function workflowAssetCardKindLabel(kind: WorkflowAssetCardKind) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景/场记";
    if (kind === "costume") return "服装";
    return "道具";
}

export function assetCardKindToProductionBibleKind(kind: WorkflowAssetCardKind): ProductionBibleKind {
    if (kind === "character") return "character";
    if (kind === "scene") return "scene";
    return "prop";
}

function inferWorkflowAssetCardKind(item: unknown): WorkflowAssetCardKind {
    const kindText = [firstFieldText(item, ["kind", "type", "category", "group", "assetType", "asset_type"]), readCandidateTags(item).join(" ")].join(" ").toLowerCase();
    const contentText = stripNegativeAssetSignalText([firstFieldText(item, nameKeys), firstFieldText(item, promptKeys), readCandidateText(item)].join(" ").toLowerCase());
    if (hasCharacterDesignSignal(contentText)) return "character";
    if (hasScenePlanningSignal(contentText)) return "scene";
    if (hasPropAssetSignal(contentText)) return "prop";
    if (hasCostumeAssetSignal(kindText) || (!hasCharacterAssetSignal(contentText) && hasCostumeAssetSignal(contentText))) return "costume";
    if (hasPropAssetSignal(kindText)) return "prop";
    if (hasCharacterAssetSignal(contentText)) return "character";
    if (hasSceneAssetSignal(kindText) || hasSceneAssetSignal(contentText)) return "scene";
    return "prop";
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

function firstFieldText(item: unknown, keys: string[]) {
    for (const key of keys) {
        const text = valueText(readCandidateField(item, key));
        if (text) return text;
    }
    return "";
}

function valueText(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("，");
    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => {
                const text = valueText(item);
                return text ? `${key}：${text}` : "";
            })
            .filter(Boolean)
            .join("；");
    }
    return "";
}

function cleanAssetCardName(value: string, typeLabel: string, index: number) {
    const fallback = `${typeLabel} ${index + 1}`;
    const text = value
        .replace(/^#+\s*/, "")
        .replace(/^(名称|标题|提示词|描述)[:：]\s*/, "")
        .replace(/\*\*/g, "")
        .trim();
    if (!text || text === "---") return fallback;
    if (text.length > 28 || /[。；;，,\n]/.test(text)) return fallback;
    return text;
}

function buildAssetImagePrompt({ description, kind, name, typeLabel, usage }: { description: string; kind: WorkflowAssetCardKind; name: string; typeLabel: string; usage: string }) {
    const focus = kind === "scene" ? "空间结构、材质、光线和氛围" : kind === "character" ? "外貌、服装、气质和当前状态" : kind === "costume" ? "服装层次、面料、妆发和颜色" : "形态、材质、使用痕迹和与人物互动关系";
    return `${name}，${typeLabel}参考图，${usage}，${description}，突出${focus}，电影级写实质感，清晰可复用，避免混入其他无关资产。`;
}

function defaultAssetUsage(kind: WorkflowAssetCardKind) {
    if (kind === "character") return "作为本集人物形象参考，用于后续生图、分镜和视频生成保持一致。";
    if (kind === "scene") return "作为本集场景/场记参考，用于统一空间、光线和镜头连续性。";
    if (kind === "costume") return "作为角色服装/妆发参考，用于保持造型连续性。";
    return "作为镜头重点互动道具参考，用于后续生图和分镜匹配。";
}

function listSafeText(value: string, fallback: string) {
    const text = value.trim();
    return text || fallback;
}

function uniqueTextList(items: string[]) {
    return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
