import { normalizeStructuredEpisodeScript, structuredEpisodeScriptToText, type StructuredEpisodeScript } from "../canvas/utils/script-management.ts";

export type ScriptOptimizerResult = {
    productionScript: string;
    structuredScript?: StructuredEpisodeScript;
};

export const SCRIPT_TO_AI_SCRIPT_WHITE_PAPER_RULES =
    "《剧本转 AI 剧本白皮书 v1.1》内置规则：\n" +
    "1. AI 剧本母版 = 常规剧本正文 + 每场生产备注 + 母版质检；正文给人读，备注给 Agent 读，质检给交付验收用。\n" +
    "2. AI 剧本不是 Prompt，不是提示词集合，也不是分镜脚本；母版中禁止写镜头号、焦段、模型参数、负面词、生成秒数、分镜提示词或视频生成提示词。\n" +
    "3. 母版目标不是把原剧本扩写得更满，而是在不改变原剧情事实的前提下，让剧情更易读、信息更可识别、生产边界更清楚。\n" +
    "4. 标准母版必须包含项目、原始场次、当前母版场次、标题、版本号、改写用途、类型、主要人物、核心情绪、场次顺序和叙事功能。\n" +
    "5. 每场必须使用【场次编号｜地点｜时间｜内/外】开场，并分为剧情正文、对白 / 旁白、声音、转场、制作备注、【母版质检记录｜不进入视频生成提示】。\n" +
    "6. 正文保持常规剧本阅读体验，动作和对白自然穿插；不得反复插入“动作视觉”“AI 视觉提示”“Prompt”“模型参数”“焦段”“镜头号”等生产标签。\n" +
    "7. 制作备注必须分层书写：视觉方向、连续性、风险提示、隐喻处理、画面生成禁止项、母版文档禁止项，不得挤成一个长段落。\n" +
    "8. 母版质检必须覆盖来源编号、剧情事实、人物状态、声音来源、正文可读性、备注结构化、隐喻处理和禁止项分类，并明确不进入视频生成提示。\n" +
    "9. 改写边界：可以补充空间、动作衔接、连续性和生产边界；不得新增重要人物、剧情事件、道具功能、情感承诺、解释性旁白或额外冲突。\n" +
    "10. 禁止项必须区分两类：画面生成禁止项约束 AI 画面；母版文档禁止项约束本文档输出，避免误伤后期对白字幕和成片包装。\n" +
    "11. 质检记录只给项目管理、人工审阅和导演分析参考；视觉派生和 Seedance 提示词不得把质检记录当作生成正文。";

export const SCRIPT_OPTIMIZER_PRODUCTION_RULES =
    "生产稿标准化硬性规则：\n" +
    "1. 不要只做轻微润色，必须把原始剧本整理成后续导演分析可直接读取的 AI 剧本母版。\n" +
    "2. 删除重复标题、重复摘要、重复集数、粘贴残留；同一标题只保留一次，但原稿中的来源场次必须保留为“原始场次”。\n" +
    "3. 如果原稿出现 EP50-2、ep50-2、50-2 等来源编号，而当前导入标题是第 1 集，必须同时写“原始场次”和“当前母版场次”，不得互相覆盖。\n" +
    "4. 出场人物必须补充可防止 AI 误判的身份信息；性别能从原稿推断时必须写明，例如“魏梁：女，优秀毕业生代表”。\n" +
    "5. 场景正文必须保持常规剧本语言，不使用“动作视觉：”作为反复标签；动作与对白自然穿插，正文可直接给人审读。\n" +
    "6. 只补足空间、站位、动作衔接、道具连续、声音来源和生产边界；减少次要人物微表情，禁止让次要人物抢戏或改变剧情重心。\n" +
    "7. 必须检查坐/站、台上/台下、远端/近处、是否持有道具、动作是否完成等人物状态；例如后文要“起立”，前文必须是就坐或先说明坐下。\n" +
    "8. 声音字段必须注明来源，区分话筒扩音、台下发声、群体声、环境声、转场声和 OS；不得把未使用话筒的人写成话筒扩音。\n" +
    "9. 场景关键物件必须具体，不写“毕业典礼布置物”等泛词；可写主席台、发言台、话筒、毕业生座椅、学士帽、学士袍、博士袍、简洁背景板，但不要新增可读横幅文字。\n" +
    "10. 典礼发言场景必须统一使用“发言台”：写“主席台中央设有发言台，发言台上立着开启状态的话筒”，后文统一写“发言台前 / 发言台边缘”，不要混用“讲台”或“发言位置”。\n" +
    "11. 高风险下台动作必须转成稳定可生成动作；全文统一写“从主席台侧边台阶快步下来，向目标人物跑去”，不要在正文、备注或质检记录中逐字复述原稿里的危险跳台说法。\n" +
    "12. 如果当前母版场次是第 1 集首场或第1集-01，结尾消散用“周遭的一切开始消散”；正文、转场、备注和质检记录都不要再逐字写出带“再次”的旧消散说法。\n" +
    "13. 主要人物字段必须分行，每人一行写姓名、性别、身份、关系和本场位置，避免长段混写。\n" +
    "14. 制作备注必须分行分层，至少包含视觉方向、连续性、风险提示、隐喻处理、画面生成禁止项、母版文档禁止项。\n" +
    "15. 母版文档禁止项固定包含：禁止输出镜头号、焦段、模型参数、分镜提示词、视频生成提示词。\n" +
    "16. 画面生成禁止项用于约束画面内元素，写成“禁止画面内新增字幕、logo、水印和无关可读文字；后期对白字幕另行处理”。\n" +
    "17. 台词中的隐喻和抽象表达必须写入隐喻处理，不得自动生成实物画面；例如“一粥一饭”“便士”“星空”不生成食物、硬币或夜空。\n" +
    "18. 涉及虚构学校、机构、品牌时必须禁止真实标识；例如清北大学禁止生成真实高校校徽、校门、真实高校名称和校园地标；如需出现校名，仅作为虚构文本设定处理，不生成真实高校视觉识别系统。\n" +
    "19. 不允许原样返回、只改标点、只改换行或只补标题；必须让生产稿比原稿更结构化，但不能过度扩写。\n" +
    "20. 不做导演分析、不输出资产清单、不输出分镜提示词；productionScript 只放优化后的完整剧本母版。";

export const SCRIPT_OPTIMIZER_STRUCTURED_JSON_RULES =
    "结构化输出硬性规则：\n" +
    "1. 最终回复必须是一个 JSON 对象，不要 Markdown，不要代码围栏，不要解释文字。\n" +
    "2. 顶层只包含 productionScript 和 structuredScript。\n" +
    "3. productionScript 是优化后的完整 AI 剧本母版正文，供人阅读和确认。\n" +
    "4. structuredScript.schemaVersion 固定为 episode-script.v1。\n" +
    "5. structuredScript 必须包含 episodeTitle、summary、characters、scenes。\n" +
    "6. 每个 scenes 条目必须包含 sceneId、location、timeOfDay、space、characters、sceneNote、beats、assets、productionNotes。\n" +
    "7. productionNotes 必须包含 visualDirection、continuity、riskNotes、metaphorHandling、visualForbiddenItems、documentForbiddenItems、qualityChecks；对应 productionScript 每场制作备注和不进入视频生成提示的母版质检记录。\n" +
    "8. beats 只能使用 type=action/dialogue/visual/note；dialogue 必须写 speaker 和 text。\n" +
    "9. assets 必须包含 characters、locations、props、costumes、mood 数组，缺失时给空数组。\n" +
    "10. characters 中的人物条目应尽量包含 identity、gender、relationship、positionHint，避免后续资产和分镜误判。";

export function parseScriptOptimizerResult(text: string, episodeTitle: string): ScriptOptimizerResult {
    const payload = parseJsonObjectFromText(text);
    if (!payload) return { productionScript: normalizeScriptOptimizerProductionScript(text, episodeTitle), structuredScript: undefined };
    const structuredScript = normalizeStructuredEpisodeScript(payload.structuredScript || payload);
    const productionScript = normalizeScriptOptimizerProductionScript(stringFromPayload(payload, ["productionScript", "optimizedScript", "script", "text"]) || (structuredScript ? structuredEpisodeScriptToText(structuredScript) : text), episodeTitle);
    return { productionScript, structuredScript };
}

export function normalizeScriptOptimizerProductionScript(text: string, episodeTitle: string) {
    return normalizeScriptOptimizerLockVersionTerms(cleanOptimizedScriptText(text, episodeTitle));
}

export function isMeaningfullyOptimizedScript(source: string, optimized: string) {
    const sourceNormalized = normalizeComparableScriptText(source);
    const optimizedNormalized = normalizeComparableScriptText(optimized);
    if (!sourceNormalized || !optimizedNormalized) return false;
    if (sourceNormalized === optimizedNormalized) return false;
    const sourceLength = sourceNormalized.length;
    const optimizedLength = optimizedNormalized.length;
    const lengthGrowth = optimizedLength / Math.max(sourceLength, 1);
    const productionMarkers = ["原始场次", "当前母版场次", "出场人物", "剧情正文", "对白", "声音", "制作备注", "视觉方向", "连续性", "风险提示", "隐喻处理", "画面生成禁止项", "母版文档禁止项", "母版质检记录", "不进入视频生成提示", "发言台"].filter((marker) => optimized.includes(marker)).length;
    if (lengthGrowth >= 1.18 || productionMarkers >= 3) return true;
    if (lengthGrowth < 1.08 && productionMarkers < 2) return false;
    return normalizedTextSimilarity(sourceNormalized, optimizedNormalized) < 0.9;
}

export function hasScriptOptimizerWhitePaperProductionNotes(script: string) {
    const markers = ["制作备注", "视觉方向", "连续性", "风险提示", "隐喻处理", "画面生成禁止项", "母版文档禁止项", "母版质检记录", "不进入视频生成提示"];
    const forbiddenResiduals = ["讲台边缘", "发言位置", "跳下主席台", "再次开始消散", "再次消散"];
    return markers.every((marker) => script.includes(marker)) && !forbiddenResiduals.some((marker) => script.includes(marker));
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

function normalizeScriptOptimizerLockVersionTerms(text: string) {
    return text
        .replace(/讲台边缘/g, "发言台边缘")
        .replace(/发言位置/g, "发言台")
        .replace(/跳下主席台/g, "从主席台侧边台阶快步下来")
        .replace(/再次开始消散/g, "开始消散")
        .replace(/再次消散/g, "开始消散")
        .replace(/不写“开始消散”/g, "首场转场使用“开始消散”")
        .replace(/原稿“从主席台侧边台阶快步下来”已调整为/g, "原危险下台动作已调整为");
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
