"use client";

import type { ReactNode } from "react";

export function EpisodeDetailBody({ body }: { body: string }) {
    const parsed = parseDetailJson(body);
    if (!parsed) {
        return <div className="thin-scrollbar max-h-[68vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950/70 p-5 text-base leading-8">{body || "暂无详情"}</div>;
    }
    const businessRecord = selectBusinessDetailRecord(parsed);
    const readableText = buildReadableDetailText(businessRecord);
    return (
        <div className="thin-scrollbar max-h-[68vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 p-5">
            <article className="whitespace-pre-wrap break-words text-base leading-8 text-slate-100">{readableText || "暂无详情"}</article>
            <details className="mt-5 rounded-lg border border-slate-800 bg-slate-900/35 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-slate-400">结构化字段</summary>
                <div className="mt-3">{renderHumanDetail(businessRecord)}</div>
            </details>
        </div>
    );
}

function parseDetailJson(body: string) {
    const text = stripJsonFence(body).trim();
    return safeParseJson(text) || safeParseJson(extractFirstJsonObject(text));
}

function stripJsonFence(value: string) {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function extractFirstJsonObject(value: string) {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    return start >= 0 && end > start ? value.slice(start, end + 1) : "";
}

function safeParseJson(value: string) {
    if (!value) return undefined;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
}

function selectBusinessDetailRecord(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    for (const key of businessDetailKeys) {
        if (record[key]) return selectBusinessDetailRecord(record[key]);
    }
    const visibleEntries = Object.entries(record).filter(([key]) => !technicalDetailKeys.has(key));
    return Object.fromEntries(visibleEntries.length ? visibleEntries : Object.entries(record));
}

function renderHumanDetail(value: unknown): ReactNode {
    if (Array.isArray(value)) {
        return (
            <div className="grid gap-3">
                {value.map((item, index) => (
                    <div key={index} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                        {renderHumanDetail(item)}
                    </div>
                ))}
            </div>
        );
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => hasDisplayValue(item));
        if (!entries.length) return <div className="text-sm text-slate-500">暂无可展示内容</div>;
        return (
            <div className="grid gap-3">
                {entries.map(([key, item]) => (
                    <section key={key} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                        <div className="mb-2 text-xs font-semibold text-cyan-200">{humanDetailLabel(key)}</div>
                        {renderHumanDetail(item)}
                    </section>
                ))}
            </div>
        );
    }
    return <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{String(value || "暂无内容")}</div>;
}

function buildReadableDetailText(value: unknown): string {
    const paragraphs = flattenReadableParagraphs(value);
    return paragraphs.join("\n\n");
}

function flattenReadableParagraphs(value: unknown, heading = ""): string[] {
    if (value === undefined || value === null) return [];
    if (typeof value === "string") {
        const text = value.trim();
        return text ? [heading ? `${heading}：${text}` : text] : [];
    }
    if (typeof value === "number" || typeof value === "boolean") return [heading ? `${heading}：${String(value)}` : String(value)];
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => flattenReadableParagraphs(item, heading && value.length > 1 ? `${heading} ${index + 1}` : heading));
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).filter(([key, item]) => !technicalDetailKeys.has(key) && hasDisplayValue(item));
        const directText = readableObjectSentence(entries);
        if (directText) return [heading ? `${heading}：${directText}` : directText];
        return entries.flatMap(([key, item]) => flattenReadableParagraphs(item, humanDetailLabel(key)));
    }
    return [];
}

function readableObjectSentence(entries: Array<[string, unknown]>) {
    if (!entries.length) return "";
    const simpleEntries = entries.filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean");
    if (simpleEntries.length < 2 || simpleEntries.length !== entries.length) return "";
    return simpleEntries.map(([key, value]) => `${humanDetailLabel(key)}：${String(value).trim()}`).join("；");
}

function hasDisplayValue(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).some((key) => !technicalDetailKeys.has(key));
    return true;
}

function humanDetailLabel(key: string) {
    const label = detailLabels[key];
    if (label) return label;
    return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

const businessDetailKeys = [
    "directorOutput",
    "director_output",
    "directorAnalysisOutput",
    "director_analysis_output",
    "directorAnalysis",
    "director_analysis",
    "analysisOutput",
    "analysis_output",
    "stageOutput",
    "stage_output",
    "storyboardOutput",
    "storyboard_output",
    "artDesignOutput",
    "art_design_output",
];

const detailLabels: Record<string, string> = {
    action_summary: "动作概要",
    acting_notes: "表演提示",
    cardId: "卡片编号",
    card_id: "卡片编号",
    cardTitle: "卡片标题",
    card_title: "卡片标题",
    camera_language_suggestions: "镜头语言建议",
    character_list: "人物清单",
    character_notes: "人物表演",
    characters: "人物清单",
    details: "说明",
    environment: "环境",
    interactive_prop_list: "互动道具",
    name: "名称",
    overall_tone: "整体氛围",
    plot_segments: "剧情段落",
    plotSummary: "剧情概要",
    plot_summary: "剧情概要",
    prop_name: "道具",
    relatedScenes: "关联场景",
    related_scenes: "关联场景",
    role: "角色",
    scene_id: "场景编号",
    scene_list: "场景清单",
    segment_id: "段落编号",
    status: "状态",
    summary: "摘要",
    time: "时间",
    title: "标题",
    usage: "用途",
    visualContinuity: "视觉连续性",
    visual_continuity: "视觉连续性",
};

const technicalDetailKeys = new Set(["stage_info", "stageInfo", "workflowId", "workflow_id", "runId", "stageId", "stage_id", "model", "raw", "metadata"]);
