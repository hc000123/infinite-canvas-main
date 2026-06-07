import { SEEDANCE_WORKFLOW_PRESET_ID, type AgentWorkflowPreset } from "./agent-workflow-presets.ts";
import type { AgentWorkflowReviewEvidence, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner.ts";

export type WorkflowQualityGateSeverity = "error" | "warning";
export type WorkflowQualityGateCheckKind = "manifest_only" | "required_reading" | "artifact_field" | "manual_review";
export type WorkflowReadingSourceType = "agent" | "skill" | "template" | "example" | "tool" | "rule";
export type WorkflowReadingStatus = "read" | "missing" | "skipped";
export type WorkflowIndustrialQualityCallNode = "stage_start" | "scene_start" | "prompt_generated" | "before_director_review";

export type WorkflowRequiredReading = {
    readingId: string;
    stageId: string;
    sourceFile: string;
    sourceType: WorkflowReadingSourceType;
    label: string;
    note?: string;
    industrialCallNode?: WorkflowIndustrialQualityCallNode;
};

export type WorkflowQualityGate = {
    gateId: string;
    stageId: string;
    name: string;
    description: string;
    severity: WorkflowQualityGateSeverity;
    requiredReadings: WorkflowRequiredReading[];
    checkKind: WorkflowQualityGateCheckKind;
    sourceFiles: string[];
};

export type WorkflowQualityGateManifest = {
    manifestId: string;
    workflowId: string;
    version: string;
    stageIds: string[];
    requiredReadings: WorkflowRequiredReading[];
    gates: WorkflowQualityGate[];
    sourceFiles: string[];
};

export type WorkflowReadingRecord = {
    recordId: string;
    workflowRunId: string;
    stageId: string;
    sourceFile: string;
    sourceType: WorkflowReadingSourceType;
    readAt: string;
    status: WorkflowReadingStatus;
    note?: string;
    readingId?: string;
};

export type WorkflowGateCheckResult = {
    resultId: string;
    gateId: string;
    stageId: string;
    name: string;
    description: string;
    severity: WorkflowQualityGateSeverity;
    checkKind: WorkflowQualityGateCheckKind;
    status: "pass" | "error" | "warning";
    message: string;
    sourceFiles: string[];
    readingId?: string;
};

type MinimalWorkflowOutput = Pick<AgentWorkflowStageOutput, "outputId" | "workflowRunId" | "stageId">;
type MinimalWorkflowEvidence = Pick<AgentWorkflowReviewEvidence, "evidenceId" | "workflowRunId" | "stageId">;

export function buildSeedanceQualityGateManifest(preset?: Pick<AgentWorkflowPreset, "workflowId" | "version">): WorkflowQualityGateManifest {
    const workflowId = preset?.workflowId || SEEDANCE_WORKFLOW_PRESET_ID;
    const version = preset?.version || "1.0.0";
    const stageIds = ["director-analysis", "art-design", "seedance-storyboard"];
    const requiredReadings = [...directorReadings(), ...artDesignReadings(), ...storyboardReadings()];
    const gates = stageIds.flatMap((stageId) => {
        const stageReadings = requiredReadings.filter((reading) => reading.stageId === stageId);
        return [
            gate(`${stageId}-required-reading`, stageId, "规范读取记录", "检查本阶段必读 agent / skill / template / review / compliance 文件是否已有读取记录。", "required_reading", stageReadings),
            gate(
                `${stageId}-stage-output`,
                stageId,
                "阶段产物存在",
                "检查本阶段是否已经生成 workflow 文本产物快照。",
                "artifact_field",
                [],
                stageReadings.map((reading) => reading.sourceFile),
            ),
            gate(
                `${stageId}-review-evidence`,
                stageId,
                "审核证据存在",
                "检查本阶段是否已经保留人工审核 evidence；质量门结果不能替代人工批准。",
                "manual_review",
                [],
                stageReadings.map((reading) => reading.sourceFile),
            ),
        ];
    });
    return {
        manifestId: "seedance-workflow-quality-gates",
        workflowId,
        version,
        stageIds,
        requiredReadings,
        gates,
        sourceFiles: unique(requiredReadings.map((reading) => reading.sourceFile)),
    };
}

export function getWorkflowStageRequiredReadings(manifest: WorkflowQualityGateManifest, stageId: string) {
    return manifest.requiredReadings.filter((reading) => reading.stageId === stageId);
}

export function buildWorkflowReadingRecords({
    manifest = buildSeedanceQualityGateManifest(),
    workflowRunId,
    stageId,
    now = new Date().toISOString(),
    status = "read",
}: {
    manifest?: WorkflowQualityGateManifest;
    workflowRunId: string;
    stageId: string;
    now?: string;
    status?: WorkflowReadingStatus;
}): WorkflowReadingRecord[] {
    return getWorkflowStageRequiredReadings(manifest, stageId).map((reading) => ({
        recordId: `${workflowRunId}:${stageId}:${reading.readingId}`,
        workflowRunId,
        stageId,
        sourceFile: reading.sourceFile,
        sourceType: reading.sourceType,
        readAt: now,
        status,
        note: reading.note || reading.label,
        readingId: reading.readingId,
    }));
}

export function evaluateWorkflowQualityGates({
    manifest = buildSeedanceQualityGateManifest(),
    workflowRun,
    stageId,
    outputs,
    evidences,
}: {
    manifest?: WorkflowQualityGateManifest;
    workflowRun: Pick<AgentWorkflowRunRecord, "id" | "stageStates">;
    stageId: string;
    outputs?: MinimalWorkflowOutput[];
    evidences?: MinimalWorkflowEvidence[];
}): WorkflowGateCheckResult[] {
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === stageId);
    const records = stageState?.readingRecords || [];
    const gates = manifest.gates.filter((gate) => gate.stageId === stageId);
    return gates.flatMap((gate) => {
        if (gate.checkKind === "required_reading") return evaluateReadingGate(gate, records);
        if (gate.checkKind === "artifact_field") return [evaluateOutputGate(gate, workflowRun.id, stageState?.outputId, outputs)];
        if (gate.checkKind === "manual_review") return [evaluateEvidenceGate(gate, workflowRun.id, stageState?.evidenceIds || [], evidences)];
        return [passResult(gate, "Manifest 已载入。")];
    });
}

function evaluateReadingGate(gate: WorkflowQualityGate, records: WorkflowReadingRecord[]): WorkflowGateCheckResult[] {
    const missing = gate.requiredReadings.filter((reading) => {
        const matchedRecord = records.find((record) => (record.readingId ? record.readingId === reading.readingId : record.sourceFile === reading.sourceFile));
        return !matchedRecord || matchedRecord.status !== "read";
    });
    if (!missing.length) return [passResult(gate, "本阶段规范读取记录已齐全。")];
    return missing.map((reading) => failResult(gate, `缺少已读记录：${reading.label}（${reading.sourceFile}）`, reading.readingId));
}

function evaluateOutputGate(gate: WorkflowQualityGate, workflowRunId: string, outputId?: string, outputs?: MinimalWorkflowOutput[]) {
    const outputExists = Boolean(outputId) && (!outputs || outputs.some((output) => output.outputId === outputId && output.workflowRunId === workflowRunId && output.stageId === gate.stageId));
    if (outputExists) return passResult(gate, "本阶段产物快照已存在。");
    return failResult(gate, "缺少本阶段 workflow 文本产物快照。");
}

function evaluateEvidenceGate(gate: WorkflowQualityGate, workflowRunId: string, evidenceIds: string[], evidences?: MinimalWorkflowEvidence[]) {
    const evidenceExists = evidenceIds.length > 0 && (!evidences || evidences.some((evidence) => evidenceIds.includes(evidence.evidenceId) && evidence.workflowRunId === workflowRunId && evidence.stageId === gate.stageId));
    if (evidenceExists) return passResult(gate, "本阶段人工审核 evidence 已存在。");
    return failResult(gate, "缺少本阶段人工审核 evidence。");
}

function gate(gateId: string, stageId: string, name: string, description: string, checkKind: WorkflowQualityGateCheckKind, requiredReadings: WorkflowRequiredReading[], sourceFiles?: string[]): WorkflowQualityGate {
    return {
        gateId,
        stageId,
        name,
        description,
        severity: "error",
        requiredReadings,
        checkKind,
        sourceFiles: unique(sourceFiles || requiredReadings.map((reading) => reading.sourceFile)),
    };
}

function reading(stageId: string, readingId: string, sourceFile: string, sourceType: WorkflowReadingSourceType, label: string, note?: string, industrialCallNode?: WorkflowIndustrialQualityCallNode): WorkflowRequiredReading {
    return { stageId, readingId: `${stageId}:${readingId}`, sourceFile, sourceType, label, note, industrialCallNode };
}

function directorReadings() {
    return [
        reading("director-analysis", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("director-analysis", "director-agent", "agents/director.md", "agent", "director agent 文件"),
        reading("director-analysis", "director-skill", "skills/director-skill/SKILL.md", "skill", "导演分析技能"),
        reading("director-analysis", "director-template", "skills/director-skill/templates/director-analysis-template.md", "template", "导演分析模板"),
        reading("director-analysis", "script-review", "skills/script-analysis-review-skill/SKILL.md", "skill", "阶段一导演自审技能"),
        reading("director-analysis", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}

function artDesignReadings() {
    return [
        reading("art-design", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("art-design", "art-agent", "agents/art-designer.md", "agent", "art-designer agent 文件"),
        reading("art-design", "director-agent", "agents/director.md", "agent", "director 审核 agent 文件"),
        reading("art-design", "art-skill", "skills/art-design-skill/SKILL.md", "skill", "服化道设计技能"),
        reading("art-design", "gemini-image-guide", "skills/art-design-skill/gemini-image-prompt-guide.md", "rule", "Gemini 图片提示词指南"),
        reading("art-design", "character-examples", "skills/art-design-skill/examples/character-prompt-examples.md", "example", "角色提示词示例"),
        reading("art-design", "scene-examples", "skills/art-design-skill/examples/scene-prompt-examples.md", "example", "场景提示词示例"),
        reading("art-design", "art-template", "skills/art-design-skill/templates/art-design-template.md", "template", "服化道输出模板"),
        reading("art-design", "art-review", "skills/art-direction-review-skill/SKILL.md", "skill", "阶段二服化道审核技能"),
        reading("art-design", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}

function storyboardReadings() {
    return [
        reading("seedance-storyboard", "agents", "AGENTS.md", "rule", "主工作流规范"),
        reading("seedance-storyboard", "storyboard-agent", "agents/storyboard-artist.md", "agent", "storyboard-artist agent 文件"),
        reading("seedance-storyboard", "director-agent", "agents/director.md", "agent", "director 审核 agent 文件"),
        reading("seedance-storyboard", "storyboard-skill", "skills/seedance-storyboard-skill/SKILL.md", "skill", "Seedance 分镜技能"),
        reading("seedance-storyboard", "methodology", "skills/seedance-storyboard-skill/seedance-prompt-methodology.md", "rule", "Seedance 提示词方法论"),
        reading("seedance-storyboard", "industrial-stage-start", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：阶段开始前", "记录阶段三开始前读取 industrial-quality-rules。", "stage_start"),
        reading("seedance-storyboard", "industrial-scene-start", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：场次开写前", "记录每个场次 / 子场次开写前调用 industrial-quality-rules。", "scene_start"),
        reading("seedance-storyboard", "industrial-prompt-generated", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：每条生成 P 后", "记录每条生成 P 写完后调用 industrial-quality-rules。", "prompt_generated"),
        reading("seedance-storyboard", "industrial-before-review", "skills/seedance-storyboard-skill/industrial-quality-rules.md", "rule", "工业化质检：导演审核前", "记录导演审核前调用 industrial-quality-rules。", "before_director_review"),
        reading("seedance-storyboard", "seedance-examples", "skills/seedance-storyboard-skill/examples/seedance-prompt-examples.md", "example", "Seedance 提示词示例"),
        reading("seedance-storyboard", "seedance-template", "skills/seedance-storyboard-skill/templates/seedance-prompts-template.md", "template", "Seedance 输出模板"),
        reading("seedance-storyboard", "seedance-review", "skills/seedance-prompt-review-skill/SKILL.md", "skill", "阶段三 Seedance 提示词审核技能"),
        reading("seedance-storyboard", "compliance-review", "skills/compliance-review-skill/SKILL.md", "skill", "合规审核技能"),
    ];
}

function passResult(gate: WorkflowQualityGate, message: string): WorkflowGateCheckResult {
    return result(gate, "pass", message);
}

function failResult(gate: WorkflowQualityGate, message: string, readingId?: string): WorkflowGateCheckResult {
    return result(gate, gate.severity, message, readingId);
}

function result(gate: WorkflowQualityGate, status: WorkflowGateCheckResult["status"], message: string, readingId?: string): WorkflowGateCheckResult {
    return {
        resultId: readingId ? `${gate.gateId}:${readingId}` : gate.gateId,
        gateId: gate.gateId,
        stageId: gate.stageId,
        name: gate.name,
        description: gate.description,
        severity: gate.severity,
        checkKind: gate.checkKind,
        status,
        message,
        sourceFiles: gate.sourceFiles,
        readingId,
    };
}

function unique(values: string[]) {
    return Array.from(new Set(values));
}
