"use client";

import { useMemo } from "react";

import type { AgentWorkflowStageOutput } from "../../../../../agent-runner";

export function findDigestSection(digest: ReturnType<typeof buildStageOutputDigest> | undefined, labels: string[]) {
    return digest?.sections.find((section) => labels.some((label) => section.label.includes(label)))?.value || "";
}

export function findOutputKeywordLine(text: string, keywords: string[]) {
    return (
        text
            .split(/\r?\n/g)
            .map(normalizeOutputLine)
            .find((line) => keywords.some((keyword) => line.includes(keyword))) || ""
    );
}

export function StageOutputDigest({ stageId, output }: { stageId: string; output: AgentWorkflowStageOutput }) {
    const digest = useMemo(() => buildStageOutputDigest(stageId, output), [output, stageId]);
    return (
        <div className="grid gap-3">
            <div className="studio-panel-muted p-3">
                <div className="mb-1 text-xs font-medium text-stone-500">核心摘要</div>
                <div className="text-sm leading-6 whitespace-pre-line text-stone-800 dark:text-stone-100">{digest.summary}</div>
            </div>
            {digest.sections.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                    {digest.sections.map((section) => (
                        <div key={section.label} className="studio-panel-muted p-3">
                            <div className="mb-1 text-xs font-medium text-stone-500">{section.label}</div>
                            <div className="text-sm leading-6 whitespace-pre-line text-stone-700 dark:text-stone-200">{section.value}</div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function buildStageOutputDigest(stageId: string, output: AgentWorkflowStageOutput) {
    const record = parseStageOutputRecord(stageId, output);
    const rawText = stripCodeFence(output.rawText);
    const hasRecord = Object.keys(record).length > 0;
    const sections = stageOutputSectionSpecs(stageId)
        .map((section) => ({
            label: section.label,
            value: cleanOutputText(readFirstText(record, section.keys) || (hasRecord ? "" : readMarkedSection(rawText, section.markers))),
        }))
        .filter((section) => section.value);
    const summary = cleanOutputText(readDirectText(record, ["summary", "title", "overview", "摘要", "核心摘要"]) || (looksLikeStructuredText(output.summary) ? "" : output.summary) || summarizePlainText(rawText) || "已按下方分区展示完整阶段产物");
    return { summary, sections };
}

function stageOutputSectionSpecs(stageId: string) {
    if (stageId === "director-analysis") {
        return [
            { label: "导演讲戏", keys: ["directorScript", "directorNotes", "directingNotes", "storytellingScript", "讲戏本", "导演讲戏", "导演分析"], markers: ["导演讲戏", "讲戏本", "导演分析"] },
            { label: "人物清单", keys: ["characters", "characterList", "人物清单", "人物"], markers: ["人物清单", "人物"] },
            { label: "场景清单", keys: ["scenes", "sceneList", "场景清单", "场景"], markers: ["场景清单", "场景"] },
            { label: "互动道具", keys: ["props", "interactiveProps", "propList", "道具清单", "互动道具清单", "互动道具"], markers: ["互动道具", "道具清单"] },
        ];
    }
    if (stageId === "art-design") {
        return [
            { label: "人物设定", keys: ["characters", "characterPrompts", "人物设定提示词", "人物设定"], markers: ["人物设定", "角色设定"] },
            { label: "场景规划", keys: ["scenePlans", "scene2x2Plans", "scenes", "scenePrompts", "locations", "场景规划提示词", "场景 2x2"], markers: ["场景 2x2", "场景规划", "场景设定"] },
            { label: "道具提示词", keys: ["props", "interactiveProps", "propDesigns", "propPrompts", "道具提示词", "道具"], markers: ["道具提示词", "道具"] },
            { label: "服化道提示词", keys: ["costumeMakeupProps", "costumePrompts", "makeupPrompts", "artDirectionPrompts", "服化道提示词", "服化道"], markers: ["服化道", "美术设计"] },
        ];
    }
    return [
        { label: "场次视觉 DNA", keys: ["sceneVisualDna", "visualDna", "visualDnaSummary", "场次视觉DNA", "场次视觉 DNA"], markers: ["场次视觉 DNA", "视觉 DNA"] },
        { label: "拆分计划", keys: ["promptPlanSummary", "promptPlan", "shotPlan", "splitPlan", "生成P拆分表", "生成 P / 镜头 P 拆分表"], markers: ["生成 P / 镜头 P 拆分表", "生成 P 拆分", "镜头 P 拆分"] },
        { label: "Seedance 提示词", keys: ["seedancePrompt", "seedancePrompts", "singlePTaskCards", "taskCards", "items"], markers: ["Seedance 提示词", "单 P 任务卡", "一键复制"] },
        { label: "工业化预检", keys: ["industrialPrecheckSummary", "industrialPrecheck", "precheckSummary", "工业化预检记录"], markers: ["工业化预检", "预检记录"] },
    ];
}

function parseStageOutputRecord(stageId: string, output: AgentWorkflowStageOutput): Record<string, unknown> {
    const source = output.structuredOutput !== undefined ? output.structuredOutput : parseStageOutputJson(output.rawText);
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const record = source as Record<string, unknown>;
    const business = findStageBusinessRecord(stageId, record);
    return business || record;
}

function findStageBusinessRecord(stageId: string, record: Record<string, unknown>): Record<string, unknown> | undefined {
    const keys =
        stageId === "director-analysis"
            ? ["directorOutput", "directorAnalysisOutput", "directorAnalysis", "analysisOutput", "stageOutput"]
            : stageId === "art-design"
              ? ["artDesignOutput", "artDirectionOutput", "visualDesignOutput", "stageOutput"]
              : ["storyboardOutput", "seedanceOutput", "sceneOutput", "stageOutput"];
    for (const key of keys) {
        const value = record[key];
        if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    }
    for (const value of Object.values(record)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const nested = findStageBusinessRecord(stageId, value as Record<string, unknown>);
        if (nested) return nested;
    }
    return undefined;
}

function parseStageOutputJson(rawText: string) {
    const direct = safeJsonParse(rawText.trim());
    if (direct !== undefined) return direct;
    const plain = stripCodeFence(rawText);
    const plainJson = safeJsonParse(plain);
    if (plainJson !== undefined) return plainJson;
    const objectText = extractFirstJsonObjectText(plain);
    if (objectText) {
        const parsedObject = safeJsonParse(objectText);
        if (parsedObject !== undefined) return parsedObject;
    }
    const blockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(rawText))) {
        const parsed = safeJsonParse(match[1].trim());
        if (parsed !== undefined) return parsed;
    }
    return undefined;
}

function extractFirstJsonObjectText(text: string) {
    const start = text.indexOf("{");
    if (start < 0) return "";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = inString;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === "{") depth += 1;
        if (char === "}") depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
    }
    return text.slice(start);
}

function safeJsonParse(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function readFirstText(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const text = summarizeOutputValue(record[key]);
        if (text) return text;
    }
    const nested = summarizeOutputValue(findNestedOutputValue(record, keys));
    if (nested) return nested;
    const businessEntries = Object.entries(record).filter(([key]) => !isOutputMetaKey(key));
    if (businessEntries.length === 1) return summarizeOutputValue(businessEntries[0][1]);
    return "";
}

function readDirectText(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const text = summarizeOutputValue(record[key]);
        if (text) return text;
    }
    return "";
}

function findNestedOutputValue(value: unknown, keys: string[], depth = 0): unknown {
    if (!value || depth > 4) return undefined;
    if (Array.isArray(value)) {
        for (const item of value) {
            const nested = findNestedOutputValue(item, keys, depth + 1);
            if (nested !== undefined) return nested;
        }
        return undefined;
    }
    if (typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
        if (record[key] !== undefined) return record[key];
    }
    for (const [key, item] of Object.entries(record)) {
        if (isOutputMetaKey(key)) continue;
        const nested = findNestedOutputValue(item, keys, depth + 1);
        if (nested !== undefined) return nested;
    }
    return undefined;
}

function summarizeOutputValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item, index) => summarizeOutputItem(item, index))
            .filter(Boolean)
            .join("\n");
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const direct =
            Object.keys(record).length <= 2
                ? readStringValue(record, ["summary", "description", "text", "content", "appearance", "costume", "makeup", "function", "usage", "note", "visualPrompt", "imagePrompt", "designPrompt", "prompt", "promptText"])
                : "";
        if (direct) return direct;
        return Object.entries(record)
            .filter(([key]) => !isOutputMetaKey(key))
            .map(([key, item]) => `${humanizeOutputKey(key)}：${summarizeOutputValue(item)}`)
            .filter((line) => !line.endsWith("："))
            .join("\n");
    }
    return "";
}

function summarizeOutputItem(value: unknown, index: number) {
    if (typeof value === "string") return `- ${value.trim()}`;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    const title = readStringValue(record, ["characterName", "sceneName", "propName", "name", "title", "location", "role", "角色", "名称"]) || `条目 ${index + 1}`;
    const titleKeys = new Set(["characterName", "sceneName", "propName", "name", "title", "location", "role", "角色", "名称"]);
    const details = Object.entries(record)
        .filter(([key]) => !isOutputMetaKey(key) && !titleKeys.has(key))
        .map(([key, item]) => {
            const text = summarizeOutputValue(item);
            return text ? `  ${humanizeOutputKey(key)}：${text}` : "";
        })
        .filter(Boolean);
    return [`- ${title}`, ...details].join("\n");
}

function readStringValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function readMarkedSection(rawText: string, markers: string[]) {
    const lines = stripCodeFence(rawText)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const start = lines.findIndex((line) => markers.some((marker) => line.includes(marker)));
    if (start < 0) return "";
    const next = lines.findIndex((line, index) => index > start && /^#{1,4}\s+|^[一二三四五六七八九十]+[、.．]|^\d+[.、]/.test(line));
    return lines.slice(start, next > start ? next : lines.length).join("\n");
}

function summarizePlainText(text: string) {
    const plain = stripCodeFence(text);
    if (plain.startsWith("{") || plain.startsWith("[")) return "";
    return plain
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !looksLikeStructuredText(line))
        .join("\n");
}

function stripCodeFence(text: string) {
    return text
        .replace(/^```(?:json|markdown)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function cleanOutputText(text: string) {
    return text
        .split(/\r?\n/g)
        .map(normalizeOutputLine)
        .join("\n")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function normalizeOutputLine(line: string) {
    const value = line
        .trim()
        .replace(/^[-•]\s*/, "")
        .replace(/^[{[,]?\s*/, "")
        .replace(/\s*[},]?\s*$/, "")
        .trim();
    const pair = value.match(/^"?([A-Za-z][A-Za-z0-9_]*)"?\s*:\s*(.+)$/);
    if (!pair) return stripQuotedText(value);
    return stripQuotedText(pair[2]);
}

function stripQuotedText(text: string) {
    const value = text.trim().replace(/,$/, "").trim();
    if (value.startsWith('"')) {
        let escaped = false;
        for (let index = 1; index < value.length; index += 1) {
            const char = value[index];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"') return value.slice(1, index).replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
        }
    }
    const quoted = value.match(/^"([\s\S]*)"$/);
    return (quoted ? quoted[1] : value).replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
}

function looksLikeStructuredText(text: string) {
    const value = text.trim();
    return value.startsWith("{") || value.startsWith("[") || value.startsWith("```");
}

function isOutputMetaKey(key: string) {
    return [
        "workflowId",
        "workflowVersion",
        "workflowRunId",
        "stageId",
        "stageName",
        "agentId",
        "agentName",
        "metadata",
        "sourceFiles",
        "qualityGateIds",
        "qualityGates",
        "specReadingRecord",
        "readPaths",
        "verification",
        "complianceNotes",
        "createdAt",
        "updatedAt",
        "warnings",
        "notes",
        "rawText",
    ].includes(key);
}

function humanizeOutputKey(key: string) {
    const labels: Record<string, string> = {
        items: "条目",
        characters: "人物",
        scenes: "场景",
        scenePlans: "场景",
        sceneId: "场景编号",
        time: "时间",
        environment: "环境",
        props: "道具",
        interactiveProps: "道具",
        shots: "镜头",
        appearance: "外观",
        status: "状态",
        description: "描述",
        costume: "服装",
        makeup: "妆容",
        function: "功能",
        usage: "用途",
        action: "动作",
        cinematography: "摄影调度",
        conflict: "冲突",
        emotionalRhythm: "情绪节奏",
        episodeGoal: "本集目标",
        episodeTarget: "本集目标",
        performance: "表演重点",
        risk: "风险",
        risks: "风险",
        storyboardAdvice: "分镜建议",
        visualContinuity: "视觉连续性",
        visualDescription: "视觉描述",
        visualPrompt: "视觉提示词",
        imagePrompt: "图片提示词",
        designPrompt: "设计提示词",
        prompt: "提示词",
        promptText: "提示词",
    };
    return labels[key] || key;
}
