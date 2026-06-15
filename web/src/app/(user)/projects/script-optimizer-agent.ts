import { normalizeStructuredEpisodeScript, structuredEpisodeScriptToText, type StructuredEpisodeScript } from "../canvas/utils/script-management.ts";

export type ScriptOptimizerResult = {
    productionScript: string;
    structuredScript?: StructuredEpisodeScript;
};

export const SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES =
    "《剧本转 AI 剧本白皮书 v1.0》内置规则：\n" +
    "1. AI 剧本母版 = 常规剧本正文 + 每场生产备注；正文给人读，备注给 Agent 读，正文负责叙事，备注负责生产。\n" +
    "2. AI 剧本不是 Prompt，不是提示词集合，也不是分镜脚本；母版中不要写镜头号、焦段、模型参数、负面词、生成秒数或审核标签。\n" +
    "3. 优化目标是把原始剧本转成可被导演分析、服化道、分镜和 Seedance 原格式流程继续派生的母版，而不是提前输出导演分析或视频提示词。\n" +
    "4. 每场必须能派生出结构化场景、人物资产、情绪曲线、视觉方向、声音设计、连续性约束、风险提示、禁止项和下游派生规则。\n" +
    "5. 生产备注必须按场填写视觉方向、连续性、风险提示、禁止项；这些备注服务下游 Agent，不替代正文，不破坏阅读顺序。\n" +
    "6. 七层信息必须可追踪：故事理解层、场景结构层、人物资产层、视觉方向层、声音设计层、生产约束层、审核追踪层。\n" +
    "7. 自检按 100 分口径执行：叙事清晰度 20、人物连续性 15、情绪递进 15、视觉可派生性 15、声音与转场 10、生产备注完整度 15、合规可追踪性 10。";

export const SCRIPT_OPTIMIZER_PRODUCTION_RULES =
    "生产稿标准化硬性规则：\n" +
    "1. 不要只做轻微润色，必须把原始剧本整理成后续导演分析可直接读取的 AI 剧本母版。\n" +
    "2. 删除重复标题、重复摘要、重复集数、粘贴残留；同一标题只保留一次。\n" +
    "3. 每个场次必须使用清晰结构：场次编号 / 地点 / 时间 / 内外 / 出场人物 / 场记 / 动作视觉 / 对白 / 声音 / 转场 / 制作备注。\n" +
    "4. 制作备注必须逐场包含：视觉方向、连续性、风险提示、禁止项；缺失信息也要写“无明确风险”或“禁止新增未出现资产”。\n" +
    "5. 场记必须描述空间、人物位置、关键道具、光线氛围和连续性，不要省略。\n" +
    "6. 对白保留为“人物：对白”；动作视觉写成可读段落，台词前后补足表演锚点，但不改变台词原意和说话顺序。\n" +
    "7. 不允许原样返回、只改标点、只改换行或只补标题；必须让生产稿比原稿更结构化、更可拍。\n" +
    "8. 不做导演分析、不输出资产清单、不输出分镜提示词；productionScript 只放优化后的完整剧本正文。";

export const SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES =
    "结构化输出硬性规则：\n" +
    "1. 最终回复必须是一个 JSON 对象，不要 Markdown，不要代码围栏，不要解释文字。\n" +
    "2. 顶层只包含 productionScript 和 structuredScript。\n" +
    "3. productionScript 是优化后的完整 AI 剧本母版正文，供人阅读和确认。\n" +
    "4. structuredScript.schemaVersion 固定为 episode-script.v1。\n" +
    "5. structuredScript 必须包含 episodeTitle、summary、characters、scenes。\n" +
    "6. 每个 scenes 条目必须包含 sceneId、location、timeOfDay、space、characters、sceneNote、beats、assets、productionNotes。\n" +
    "7. productionNotes 必须包含 visualDirection、continuity、riskNotes、forbiddenItems；对应 productionScript 每场制作备注。\n" +
    "8. beats 只能使用 type=action/dialogue/visual/note；dialogue 必须写 speaker 和 text。\n" +
    "9. assets 必须包含 characters、locations、props、costumes、mood 数组，缺失时给空数组。";

export function parseScriptOptimizerResult(text: string, episodeTitle: string): ScriptOptimizerResult {
    const payload = parseJsonObjectFromText(text);
    if (!payload) return { productionScript: cleanOptimizedScriptText(text, episodeTitle), structuredScript: undefined };
    const structuredScript = normalizeStructuredEpisodeScript(payload.structuredScript || payload);
    const productionScript = cleanOptimizedScriptText(stringFromPayload(payload, ["productionScript", "optimizedScript", "script", "text"]) || (structuredScript ? structuredEpisodeScriptToText(structuredScript) : text), episodeTitle);
    return { productionScript, structuredScript };
}

export function isMeaningfullyOptimizedScript(source: string, optimized: string) {
    const sourceNormalized = normalizeComparableScriptText(source);
    const optimizedNormalized = normalizeComparableScriptText(optimized);
    if (!sourceNormalized || !optimizedNormalized) return false;
    if (sourceNormalized === optimizedNormalized) return false;
    const sourceLength = sourceNormalized.length;
    const optimizedLength = optimizedNormalized.length;
    const lengthGrowth = optimizedLength / Math.max(sourceLength, 1);
    const productionMarkers = ["出场人物", "场记", "动作视觉", "对白", "内外", "制作备注", "视觉方向", "连续性", "风险提示", "禁止项"].filter((marker) => optimized.includes(marker)).length;
    if (lengthGrowth >= 1.18 || productionMarkers >= 3) return true;
    if (lengthGrowth < 1.08 && productionMarkers < 2) return false;
    return normalizedTextSimilarity(sourceNormalized, optimizedNormalized) < 0.9;
}

export function hasScriptOptimizerWhitePaperProductionNotes(script: string) {
    const markers = ["制作备注", "视觉方向", "连续性", "风险提示", "禁止项"];
    return markers.every((marker) => script.includes(marker));
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | undefined {
    const candidates = [text.trim()];
    for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
        if (match[1]) candidates.push(match[1].trim());
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
            // try next candidate
        }
    }
    return undefined;
}

function stringFromPayload(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function cleanOptimizedScriptText(text: string, episodeTitle: string) {
    const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/(#{1,6}\s*第\s*\d+\s*集\s*摘要[:：]\s*){2,}/g, "# ")
        .replace(/(第\s*\d+\s*集\s*摘要[:：]\s*){2,}/g, "$1")
        .split("\n")
        .map((line) => line.trimEnd());
    const seenHeadings = new Set<string>();
    const cleaned: string[] = [];
    for (const line of lines) {
        const normalized = line.replace(/^#+\s*/, "").trim();
        const headingKey = normalized.replace(/\s+/g, "");
        const isDuplicateHeading = /^第\s*\d+\s*集/.test(normalized) || normalized === episodeTitle.trim();
        if (isDuplicateHeading) {
            if (seenHeadings.has(headingKey)) continue;
            seenHeadings.add(headingKey);
        }
        cleaned.push(line);
    }
    return cleaned
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeComparableScriptText(text: string) {
    return text
        .replace(/\s+/g, "")
        .replace(/[，。！？；：、“”‘’《》（）()#\-—_]/g, "")
        .trim();
}

function normalizedTextSimilarity(left: string, right: string) {
    const leftChars = new Map<string, number>();
    for (const char of left) leftChars.set(char, (leftChars.get(char) || 0) + 1);
    let shared = 0;
    for (const char of right) {
        const count = leftChars.get(char) || 0;
        if (!count) continue;
        shared += 1;
        if (count === 1) leftChars.delete(char);
        else leftChars.set(char, count - 1);
    }
    return shared / Math.max(left.length, right.length, 1);
}
