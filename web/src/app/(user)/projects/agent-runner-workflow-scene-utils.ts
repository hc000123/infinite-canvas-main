import type { AgentWorkflowPreset } from "./agent-workflow-presets";
import type { AgentWorkflowRunRecord, AgentWorkflowSceneRunState, AgentWorkflowStageOutput } from "./agent-runner-types";
import { parseWorkflowMappingRawJson, stringField } from "./agent-runner-mapping-preview.ts";
import { workflowStageDisplayName } from "./agent-runner-workflow-display.ts";

export function summarizeWorkflowSceneOutput(output: AgentWorkflowStageOutput) {
    const record = output.structuredOutput && typeof output.structuredOutput === "object" && !Array.isArray(output.structuredOutput) ? (output.structuredOutput as Record<string, unknown>) : parseWorkflowMappingRawJson(output.rawText);
    return {
        visualDnaSummary: readSceneSummaryField(record, ["sceneVisualDna", "visualDna", "visualDnaSummary", "场次视觉DNA", "场次视觉 DNA"], output.rawText, ["场次视觉 DNA", "视觉 DNA"]),
        promptPlanSummary: readSceneSummaryField(record, ["promptPlanSummary", "promptPlan", "shotPlan", "splitPlan", "生成P拆分表", "生成 P / 镜头 P 拆分表"], output.rawText, ["生成 P / 镜头 P 拆分表", "生成 P 拆分", "镜头 P 拆分表"]),
        promptTextSummary: readSceneSummaryField(record, ["promptTextSummary", "seedancePrompt", "seedancePrompts", "singlePTaskCards", "taskCards", "items"], output.rawText, ["单 P 任务卡", "Seedance 提示词", "一键复制"]),
        industrialPrecheckSummary: readSceneSummaryField(record, ["industrialPrecheckSummary", "industrialPrecheck", "precheckSummary", "工业化预检记录"], output.rawText, ["工业化预检记录", "工业化预检", "预检记录"]),
    };
}

export function collectWorkflowSceneOutputItems(output: AgentWorkflowStageOutput) {
    const source = output.structuredOutput !== undefined ? output.structuredOutput : parseWorkflowMappingRawJson(output.rawText);
    if (Array.isArray(source)) return source;
    if (!source || typeof source !== "object") return [];
    const record = source as Record<string, unknown>;
    for (const key of ["items", "shots", "storyboard", "storyboardShots", "videoPrompts", "seedancePrompts", "shotGroups"]) {
        if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [];
}

export function upsertWorkflowSceneState(sceneStates: AgentWorkflowSceneRunState[] | undefined, patch: Partial<AgentWorkflowSceneRunState> & { stageId: string; sceneKey: string; sceneLabel: string; updatedAt: string }) {
    const current = sceneStates || [];
    const existing = current.find((scene) => scene.stageId === patch.stageId && scene.sceneKey === patch.sceneKey);
    const next: AgentWorkflowSceneRunState = {
        stageId: patch.stageId,
        sceneKey: patch.sceneKey,
        sceneLabel: patch.sceneLabel,
        subSceneKey: patch.subSceneKey ?? existing?.subSceneKey,
        status: patch.status || existing?.status || "idle",
        visualDnaSummary: patch.visualDnaSummary ?? existing?.visualDnaSummary ?? "",
        promptPlanSummary: patch.promptPlanSummary ?? existing?.promptPlanSummary ?? "",
        promptTextSummary: patch.promptTextSummary ?? existing?.promptTextSummary ?? "",
        industrialPrecheckSummary: patch.industrialPrecheckSummary ?? existing?.industrialPrecheckSummary ?? "",
        runnerRunId: patch.runnerRunId ?? existing?.runnerRunId,
        outputId: patch.outputId ?? existing?.outputId,
        evidenceIds: patch.evidenceIds ?? existing?.evidenceIds ?? [],
        warnings: patch.warnings ?? existing?.warnings ?? [],
        errorMessage: patch.errorMessage,
        blockedReason: patch.blockedReason,
        updatedAt: patch.updatedAt,
    };
    if (existing) return current.map((scene) => (scene.stageId === patch.stageId && scene.sceneKey === patch.sceneKey ? next : scene));
    return [...current, next];
}

export function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function refreshWorkflowStageBlocks(workflowRun: AgentWorkflowRunRecord, now: string): AgentWorkflowRunRecord {
    const stageById = new Map(workflowRun.stageStates.map((stage) => [stage.stageId, stage]));
    const stageNameById = new Map(workflowRun.stageStates.map((stage) => [stage.stageId, workflowStageDisplayName(stage.stageId)]));
    let changed = false;
    const stageStates = workflowRun.stageStates.map((stage) => {
        const missingDependency = stage.dependsOnStageIds.find((stageId) => stageById.get(stageId)?.status !== "approved");
        if (!missingDependency) {
            if (stage.status === "blocked") {
                changed = true;
                return { ...stage, status: "idle" as const, blockedReason: undefined };
            }
            return stage;
        }
        const blockedReason = `需先批准前置阶段：${stageNameById.get(missingDependency) || missingDependency}`;
        if (stage.status === "blocked" && stage.blockedReason === blockedReason) return stage;
        changed = true;
        return { ...stage, status: "blocked" as const, blockedReason };
    });
    return changed ? { ...workflowRun, stageStates, updatedAt: now } : workflowRun;
}

export function stableWorkflowSnapshotHash(value: unknown) {
    const text = JSON.stringify(value, Object.keys((value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>).sort());
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return `wf-${hash.toString(16).padStart(8, "0")}`;
}

export function orderedWorkflowPresetStages(preset: Pick<AgentWorkflowPreset, "stages">) {
    return [...preset.stages].sort((a, b) => a.order - b.order);
}

function readSceneSummaryField(record: unknown, keys: string[], rawText: string, markers: string[]) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
        for (const key of keys) {
            const value = (record as Record<string, unknown>)[key];
            const text = summarizeUnknownSceneValue(value);
            if (text) return text;
        }
    }
    return summarizeMarkedRawText(rawText, markers);
}

function summarizeUnknownSceneValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
        return value
            .map((item) => summarizeUnknownSceneValue(item))
            .filter(Boolean)
            .slice(0, 3)
            .join("；");
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const direct = stringField(record.summary) || stringField(record.text) || stringField(record.prompt) || stringField(record.title) || stringField(record.description);
        if (direct) return direct;
        return Object.values(record)
            .map((item) => summarizeUnknownSceneValue(item))
            .filter(Boolean)
            .slice(0, 3)
            .join("；");
    }
    return "";
}

function summarizeMarkedRawText(rawText: string, markers: string[]) {
    const lines = rawText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const index = lines.findIndex((line) => markers.some((marker) => line.includes(marker)));
    if (index < 0) return "";
    return lines
        .slice(index, index + 4)
        .join(" ")
        .slice(0, 240);
}
