import type { AgentConfig } from "../../projects/agent-settings.ts";
import type { AgentDraftOutput, AgentRunInput, AgentRunRecord } from "../../projects/agent-runner.ts";
import type { AssetBreakdownKind, AssetBreakdownWriteInput } from "./asset-breakdown.ts";
import type { EpisodeWorkbenchCanvas } from "./episode-workbench.ts";

export type AgentAssetDraftKind = "character" | "scene" | "prop" | "costume" | "makeup" | "mood" | "effect";
export type AgentAssetImportance = "high" | "medium" | "low";
export type AgentAssetSuggestedBriefKind = "character" | "scene" | "prop" | "mood";

export type AgentAssetDraftItem = {
    id: string;
    kind: AgentAssetDraftKind;
    name: string;
    description: string;
    scriptEvidence: string;
    importance: AgentAssetImportance;
    suggestedBriefKind: AgentAssetSuggestedBriefKind;
    tags: string[];
    source: "local_rule";
    warnings: string[];
};

export type AgentAssetExtractorContext = {
    projectId: string;
    canvas: EpisodeWorkbenchCanvas;
};

export function canRunAssetExtractor(canvas?: EpisodeWorkbenchCanvas | null) {
    if (!canvas) return { canRun: false, reason: "请先选择画布" };
    if (!canvas.episodeId) return { canRun: false, reason: "请先绑定或导入本集剧本" };
    if (!canvas.scriptSnapshot?.trim()) return { canRun: false, reason: "请先导入本集剧本内容" };
    return { canRun: true, reason: "" };
}

export function buildAssetExtractorRunInput(context: AgentAssetExtractorContext): AgentRunInput {
    return {
        projectId: context.projectId,
        canvasId: context.canvas.id,
        episodeId: context.canvas.episodeId,
        episodeTitle: context.canvas.episodeTitle,
        scriptId: context.canvas.scriptId || context.projectId,
        scriptSnapshot: context.canvas.scriptSnapshot || "",
        sourceType: "episode_script",
        sourceId: context.canvas.episodeId,
        variables: {
            episodeTitle: context.canvas.episodeTitle || context.canvas.title,
            scriptSnapshot: context.canvas.scriptSnapshot || "",
        },
    };
}

export function buildLocalAssetExtractorDraftOutput(context: AgentAssetExtractorContext): AgentDraftOutput {
    const scriptText = context.canvas.scriptSnapshot || "";
    const items = buildLocalAssetDraftItems(scriptText);
    const warnings = items.length ? [] : ["本地规则没有识别到明确资产，可手动补充本集生图需求。"];
    return {
        summary: `从《${context.canvas.episodeTitle || context.canvas.title}》提取 ${items.length} 条资产草案`,
        items,
        rawJson: { assets: items, sourceType: "episode_script" },
        warnings,
        schemaVersion: "asset-extractor.v1",
    };
}

export function buildAssetBreakdownInputsFromAgentRun(run: AgentRunRecord, context: AgentAssetExtractorContext): AssetBreakdownWriteInput[] {
    if (run.status !== "approved") throw new Error("资产提取 run 必须先批准，才能写入本集生图需求");
    return normalizeAgentAssetDraftItems(run.draftOutput.items).map((item) => ({
        projectId: context.projectId,
        canvasId: context.canvas.id,
        episodeId: context.canvas.episodeId || "",
        episodeTitle: context.canvas.episodeTitle || context.canvas.title,
        scriptId: context.canvas.scriptId || context.projectId,
        kind: assetBreakdownKindFromAgentDraft(item.kind),
        name: item.name,
        description: item.description,
        sourceText: item.scriptEvidence,
        tags: uniqueStrings([...item.tags, agentAssetKindLabel(item.kind), importanceLabel(item.importance)]),
        assetIds: [],
        status: "draft",
        agentRunId: run.id,
        agentConfigId: run.agentConfigId,
        agentConfigVersion: run.agentConfigVersion,
        sourceType: "agent_asset_extractor",
        agentAssetKind: item.kind,
        suggestedBriefKind: item.suggestedBriefKind,
        importance: item.importance,
        warnings: item.warnings,
    }));
}

export function normalizeAgentAssetDraftItems(items: unknown[]): AgentAssetDraftItem[] {
    return items.map((item, index) => normalizeAgentAssetDraftItem(item, index)).filter((item): item is AgentAssetDraftItem => Boolean(item));
}

export function assetBreakdownKindFromAgentDraft(kind: AgentAssetDraftKind): AssetBreakdownKind {
    if (kind === "scene") return "scene";
    if (kind === "prop") return "prop";
    if (kind === "mood" || kind === "effect") return "style";
    return "character";
}

export function shouldAllowAssetExtractorRun(config?: AgentConfig) {
    if (!config) return { allowed: false, reason: "没有找到资产提取 Agent 配置" };
    if (!config.enabled) return { allowed: false, reason: "资产提取 Agent 已禁用，请先在 Agent 设置中心启用" };
    return { allowed: true, reason: "" };
}

function buildLocalAssetDraftItems(scriptText: string): AgentAssetDraftItem[] {
    const items: AgentAssetDraftItem[] = [];
    addMatches(items, scriptText, "character", [/图片\s*\d+\s*([\u4e00-\u9fa5A-Za-z0-9_]{2,10})/g, /(?:角色|人物)[：:]\s*([^\n，,；;]+)/g], "character", ["角色"]);
    addMatches(items, scriptText, "scene", [/(?:场景|地点|环境)[：:]\s*([^\n，,；;]+)/g, /([\u4e00-\u9fa5A-Za-z0-9_]{2,16}(?:现场|操场|教室|主席台|观礼区|办公室|街道|房间|宿舍|走廊))/g], "scene", ["场景"]);
    addMatches(items, scriptText, "prop", [/(?:道具|物件)[：:]\s*([^\n，,；;]+)/g, /(话筒|学士袍|手机|照片|戒指|奖杯|书包|信|伞|车钥匙)/g], "prop", ["道具"]);
    addMatches(items, scriptText, "costume", [/(学士袍|校服|西装|婚纱|制服|礼服|风衣|外套)/g], "character", ["服装"]);
    addMatches(items, scriptText, "makeup", [/(妆发|发型|淡妆|浓妆|素颜|泪痕|伤痕)/g], "character", ["妆发"]);
    addKeywordItems(items, scriptText, "mood", ["紧张", "克制", "坚定", "温暖", "压抑", "安静", "真实", "短剧"], "mood", ["情绪氛围"]);
    addKeywordItems(items, scriptText, "effect", ["雨", "风", "烟雾", "火光", "闪回", "慢动作", "虚化"], "mood", ["特效"]);
    return dedupeDraftItems(items);
}

function addMatches(items: AgentAssetDraftItem[], text: string, kind: AgentAssetDraftKind, patterns: RegExp[], suggestedBriefKind: AgentAssetSuggestedBriefKind, tags: string[]) {
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const name = cleanName(match[1] || match[0]);
            if (!name || name.length < 2) continue;
            items.push(buildDraftItem({ kind, name, suggestedBriefKind, tags, evidence: sourceSnippet(text, match.index || 0) }));
        }
    }
}

function addKeywordItems(items: AgentAssetDraftItem[], text: string, kind: AgentAssetDraftKind, keywords: string[], suggestedBriefKind: AgentAssetSuggestedBriefKind, tags: string[]) {
    for (const keyword of keywords) {
        const index = text.indexOf(keyword);
        if (index < 0) continue;
        items.push(buildDraftItem({ kind, name: keyword, suggestedBriefKind, tags, evidence: sourceSnippet(text, index) }));
    }
}

function buildDraftItem(input: { kind: AgentAssetDraftKind; name: string; suggestedBriefKind: AgentAssetSuggestedBriefKind; tags: string[]; evidence: string }): AgentAssetDraftItem {
    return {
        id: `asset-draft-${input.kind}-${slug(input.name)}`,
        kind: input.kind,
        name: input.name,
        description: `${agentAssetKindLabel(input.kind)}：${input.name}`,
        scriptEvidence: input.evidence,
        importance: input.kind === "character" || input.kind === "scene" ? "high" : "medium",
        suggestedBriefKind: input.suggestedBriefKind,
        tags: uniqueStrings(input.tags),
        source: "local_rule",
        warnings: [],
    };
}

function normalizeAgentAssetDraftItem(value: unknown, index: number): AgentAssetDraftItem | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const kind = normalizeAgentAssetKind(record.kind);
    const name = String(record.name || record.title || "").trim();
    if (!kind || !name) return null;
    const suggestedBriefKind = normalizeSuggestedBriefKind(record.suggestedBriefKind) || suggestedBriefKindForAgentAsset(kind);
    return {
        id: String(record.id || `agent-asset-${index + 1}`),
        kind,
        name,
        description: String(record.description || ""),
        scriptEvidence: String(record.scriptEvidence || record.sourceText || ""),
        importance: normalizeImportance(record.importance),
        suggestedBriefKind,
        tags: Array.isArray(record.tags) ? uniqueStrings(record.tags.map(String)) : [],
        source: "local_rule",
        warnings: Array.isArray(record.warnings) ? record.warnings.map(String).filter(Boolean) : [],
    };
}

function dedupeDraftItems(items: AgentAssetDraftItem[]) {
    const map = new Map<string, AgentAssetDraftItem>();
    for (const item of items) {
        const key = `${item.kind}:${item.name.trim().toLowerCase()}`;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, item);
            continue;
        }
        map.set(key, {
            ...existing,
            scriptEvidence: uniqueStrings([existing.scriptEvidence, item.scriptEvidence]).join("\n"),
            tags: uniqueStrings([...existing.tags, ...item.tags]),
            warnings: uniqueStrings([...existing.warnings, ...item.warnings]),
        });
    }
    return Array.from(map.values());
}

function normalizeAgentAssetKind(value: unknown): AgentAssetDraftKind | undefined {
    const kind = String(value || "");
    return ["character", "scene", "prop", "costume", "makeup", "mood", "effect"].includes(kind) ? (kind as AgentAssetDraftKind) : undefined;
}

function normalizeSuggestedBriefKind(value: unknown): AgentAssetSuggestedBriefKind | undefined {
    const kind = String(value || "");
    return ["character", "scene", "prop", "mood"].includes(kind) ? (kind as AgentAssetSuggestedBriefKind) : undefined;
}

function suggestedBriefKindForAgentAsset(kind: AgentAssetDraftKind): AgentAssetSuggestedBriefKind {
    if (kind === "scene") return "scene";
    if (kind === "prop") return "prop";
    if (kind === "mood" || kind === "effect") return "mood";
    return "character";
}

function normalizeImportance(value: unknown): AgentAssetImportance {
    const importance = String(value || "");
    return importance === "high" || importance === "low" ? importance : "medium";
}

function agentAssetKindLabel(kind: AgentAssetDraftKind) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    if (kind === "prop") return "道具";
    if (kind === "costume") return "服装 / 服化道";
    if (kind === "makeup") return "妆发";
    if (kind === "mood") return "情绪氛围";
    return "特效需求";
}

function importanceLabel(importance: AgentAssetImportance) {
    if (importance === "high") return "高优先级";
    if (importance === "low") return "低优先级";
    return "中优先级";
}

function sourceSnippet(text: string, index: number) {
    const start = Math.max(0, index - 36);
    const end = Math.min(text.length, index + 96);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function cleanName(value: string) {
    return (
        value
            .replace(/[。,.，、；;：:]/g, " ")
            .trim()
            .split(/[穿看坐走站抬注视来到进入位于拿着手持准备\s]+/)[0]
            .trim() || ""
    );
}

function slug(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
