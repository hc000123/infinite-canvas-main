import { parseWorkflowTextJson } from "./agent-runner-text-utils.ts";
import type { AgentWorkflowMappingPreviewItem, AgentWorkflowStageOutput, WorkflowMappingPreviewTargetType } from "./agent-runner-types.ts";

const WORKFLOW_MAPPING_RAW_TEXT_FALLBACK_WARNING = "当前预览基于原始文本 fallback 生成，结构化解析不足，请人工筛选后再写入。";
const WORKFLOW_MAPPING_JSON_NO_BUSINESS_WARNING = "已识别到 JSON，但未找到可映射的业务数组，请检查模型输出结构。";
const WORKFLOW_MAPPING_META_FILTER_WARNING = "已过滤 workflow / metadata 等非业务字段。";
const WORKFLOW_MAPPING_META_FIELD_NAMES = new Set(["workflowId", "workflowVersion", "workflowRunId", "stageId", "agentId", "metadata", "sourceFiles", "qualityGateIds", "qualityGates", "createdAt", "updatedAt", "summary", "warnings", "notes", "rawText"]);
const WORKFLOW_MAPPING_BUSINESS_ARRAY_KEYS: Record<WorkflowMappingPreviewTargetType, string[]> = {
    production_bible: ["characters", "characterSettings", "scenes", "sceneSettings", "props", "costumes", "makeup", "moods", "styleSettings", "assets", "items"],
    storyboard_table: ["shots", "storyboard", "storyboardShots", "shotList", "tableShots", "items"],
    video_node: ["videoNodes", "videoPrompts", "shotGroups", "shots", "items"],
};

export type WorkflowMappingAnalysis = {
    record: Record<string, unknown>;
    rawLines: string[];
    candidates: unknown[];
    warnings: string[];
};

export function analyzeWorkflowStageOutput(output: AgentWorkflowStageOutput, targetType: WorkflowMappingPreviewTargetType): WorkflowMappingAnalysis {
    const rawLines = output.rawText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);
    const structuredSource = output.structuredOutput === undefined ? undefined : collectWorkflowMappingCandidates(output.structuredOutput, targetType);
    if (structuredSource) return { record: structuredSource.record, rawLines, candidates: structuredSource.candidates, warnings: structuredSource.warnings };
    const rawJson = parseWorkflowMappingRawJson(output.rawText);
    if (rawJson !== undefined) {
        const parsedSource = collectWorkflowMappingCandidates(rawJson, targetType);
        return { record: parsedSource.record, rawLines, candidates: parsedSource.candidates, warnings: parsedSource.warnings };
    }
    const candidates = rawLines.map((line, index) => ({
        id: `raw-${index + 1}`,
        title: line.slice(0, 36),
        text: line,
    }));
    const warnings = [WORKFLOW_MAPPING_RAW_TEXT_FALLBACK_WARNING];
    const record: Record<string, unknown> = {};
    return { record, rawLines, candidates, warnings };
}

export function parseWorkflowMappingRawJson(rawText: string) {
    const trimmed = rawText.trim();
    const direct = parseWorkflowTextJson(trimmed);
    if (direct !== undefined) return direct;
    const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(rawText))) {
        const parsed = parseWorkflowTextJson(match[1].trim());
        if (parsed !== undefined) return parsed;
    }
    return undefined;
}

export function stringField(value: unknown) {
    return String(value || "").trim();
}

export function stringListField(value: unknown) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    const text = String(value || "").trim();
    return text
        ? text
              .split(/[，,、/]/)
              .map((item) => item.trim())
              .filter(Boolean)
        : [];
}

export function numberField(value: unknown, fallback: number) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

export function objectListField(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

export function buildPreviewItems(candidates: unknown[], targetType: WorkflowMappingPreviewTargetType, mapper: (item: unknown, index: number) => Omit<AgentWorkflowMappingPreviewItem, "itemId" | "targetType" | "action" | "warnings"> & { confidence?: number }) {
    return candidates.map((item, index) => {
        const mapped = mapper(item, index);
        const title = isWorkflowMappingMetaField(String(mapped.title || "")) ? "" : String(mapped.title || "").trim();
        const hasBusinessContent = hasWorkflowMappingBusinessContent(item);
        const warnings = hasBusinessContent && title ? [] : ["未识别到可写入的业务标题或内容，已跳过。"];
        return {
            itemId: `${targetType}-${index + 1}`,
            targetType,
            action: hasBusinessContent && title ? ("create" as const) : ("skip" as const),
            title: title || "未识别业务条目",
            reason: mapped.reason,
            sourceText: mapped.sourceText,
            mappedFields: mapped.mappedFields,
            confidence: mapped.confidence,
            warnings,
        };
    });
}

export function readCandidateTitle(item: unknown, fallback: string) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const title = pickFirstStringField(record, ["name", "title", "sceneName", "characterName", "shotTitle", "prompt", "videoPrompt", "description", "label"]);
        return title || fallback;
    }
    return typeof item === "string" ? item.slice(0, 36) : fallback;
}

export function readCandidateText(item: unknown) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return pickFirstStringField(record, ["text", "description", "prompt", "videoPrompt", "finalPrompt", "effectivePrompt", "visualDescription", "action", "output", "title", "name", "sceneName", "characterName", "shotTitle"]);
    }
    return typeof item === "string" ? item : JSON.stringify(item);
}

export function readCandidateField(item: unknown, key: string) {
    if (isWorkflowMappingMetaField(key)) return "";
    if (!item || typeof item !== "object" || Array.isArray(item)) return "";
    const value = (item as Record<string, unknown>)[key];
    return typeof value === "string" || typeof value === "number" || Array.isArray(value) || (value && typeof value === "object") ? value : "";
}

export function readCandidateTags(item: unknown) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const tags = (item as Record<string, unknown>).tags;
    return Array.isArray(tags) ? tags.map((tag) => String(tag)).filter(Boolean) : [];
}

function collectWorkflowMappingCandidates(value: unknown, targetType: WorkflowMappingPreviewTargetType) {
    const warnings: string[] = [];
    if (Array.isArray(value)) {
        const sanitized = sanitizeWorkflowMappingCandidateList(value);
        if (sanitized.filteredMetaFields) warnings.push(WORKFLOW_MAPPING_META_FILTER_WARNING);
        return { record: {}, candidates: sanitized.candidates, warnings };
    }
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const hasMetaFields = Object.keys(record).some(isWorkflowMappingMetaField);
    const candidates: unknown[] = [];
    for (const key of WORKFLOW_MAPPING_BUSINESS_ARRAY_KEYS[targetType]) {
        const list = record[key];
        if (!Array.isArray(list)) continue;
        const sanitized = sanitizeWorkflowMappingCandidateList(list);
        candidates.push(...sanitized.candidates);
        if (sanitized.filteredMetaFields) warnings.push(WORKFLOW_MAPPING_META_FILTER_WARNING);
        if (targetType !== "production_bible" && candidates.length) break;
    }
    if (hasMetaFields) warnings.push(WORKFLOW_MAPPING_META_FILTER_WARNING);
    if (!candidates.length) warnings.push(WORKFLOW_MAPPING_JSON_NO_BUSINESS_WARNING);
    return { record, candidates, warnings: Array.from(new Set(warnings)) };
}

function sanitizeWorkflowMappingCandidateList(items: unknown[]) {
    let filteredMetaFields = false;
    const candidates = items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const next: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            if (isWorkflowMappingMetaField(key)) {
                filteredMetaFields = true;
                continue;
            }
            next[key] = value;
        }
        return next;
    });
    return { candidates, filteredMetaFields };
}

function isWorkflowMappingMetaField(key: string) {
    return WORKFLOW_MAPPING_META_FIELD_NAMES.has(key);
}

function pickFirstStringField(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        if (isWorkflowMappingMetaField(key)) continue;
        const value = record[key];
        if (typeof value !== "string" && typeof value !== "number") continue;
        const text = String(value).trim();
        if (text && !isWorkflowMappingMetaField(text)) return text;
    }
    return "";
}

function hasWorkflowMappingBusinessContent(item: unknown) {
    if (typeof item === "string") return Boolean(item.trim());
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return Boolean(pickFirstStringField(record, ["name", "title", "sceneName", "characterName", "shotTitle", "prompt", "videoPrompt", "finalPrompt", "effectivePrompt", "description", "visualDescription", "text", "action", "output"]));
}
