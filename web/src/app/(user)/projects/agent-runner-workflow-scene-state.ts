import {
    collectWorkflowSceneOutputItems,
    refreshWorkflowStageBlocks,
    summarizeWorkflowSceneOutput,
    uniqueStrings,
    upsertWorkflowSceneState,
} from "./agent-runner-workflow-scene-utils.ts";
import type {
    AgentWorkflowReviewEvidence,
    AgentWorkflowRunRecord,
    AgentWorkflowSceneRunStatus,
    AgentWorkflowStageOutput,
} from "./agent-runner-types";

export function startAgentWorkflowSceneRun(
    workflowRun: AgentWorkflowRunRecord,
    {
        stageId,
        sceneKey,
        sceneLabel,
        subSceneKey,
        runnerRunId,
        now,
    }: {
        stageId: string;
        sceneKey: string;
        sceneLabel: string;
        subSceneKey?: string;
        runnerRunId: string;
        now: string;
    },
): AgentWorkflowRunRecord {
    const checked = refreshWorkflowStageBlocks(workflowRun, now);
    const stageState = checked.stageStates.find((stage) => stage.stageId === stageId);
    const blockedReason = !stageState ? "未找到阶段状态" : stageState.status === "blocked" ? stageState.blockedReason || "前置阶段未批准" : "";
    const sceneState = upsertWorkflowSceneState(checked.sceneStates, {
        stageId,
        sceneKey,
        sceneLabel,
        subSceneKey,
        status: blockedReason ? "blocked" : "running",
        runnerRunId,
        outputId: undefined,
        warnings: [],
        errorMessage: undefined,
        blockedReason,
        updatedAt: now,
    });
    if (blockedReason) return { ...checked, sceneStates: sceneState, updatedAt: now };
    return {
        ...checked,
        currentStageId: stageId,
        stageStates: checked.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "running", runnerRunId, errorMessage: undefined, blockedReason: undefined } : stage)),
        sceneStates: sceneState,
        updatedAt: now,
    };
}

export function completeAgentWorkflowSceneRun(workflowRun: AgentWorkflowRunRecord, { stageId, sceneKey, output, now }: { stageId: string; sceneKey: string; output: AgentWorkflowStageOutput; now: string }): AgentWorkflowRunRecord {
    const existing = workflowRun.sceneStates?.find((scene) => scene.stageId === stageId && scene.sceneKey === sceneKey);
    const summaries = summarizeWorkflowSceneOutput(output);
    const validation = validateAgentWorkflowSceneOutput(output);
    const nextStatus: AgentWorkflowSceneRunStatus = validation.valid ? "review" : "error";
    return {
        ...workflowRun,
        currentStageId: stageId,
        stageStates: workflowRun.stageStates.map((stage) =>
            stage.stageId === stageId ? { ...stage, status: nextStatus, runnerRunId: output.runnerRunId, errorMessage: validation.valid ? undefined : validation.errors.join("；"), blockedReason: undefined } : stage,
        ),
        sceneStates: upsertWorkflowSceneState(workflowRun.sceneStates, {
            stageId,
            sceneKey,
            sceneLabel: existing?.sceneLabel || sceneKey,
            subSceneKey: existing?.subSceneKey,
            status: nextStatus,
            visualDnaSummary: summaries.visualDnaSummary,
            promptPlanSummary: summaries.promptPlanSummary,
            promptTextSummary: summaries.promptTextSummary,
            industrialPrecheckSummary: summaries.industrialPrecheckSummary,
            runnerRunId: output.runnerRunId,
            outputId: output.outputId,
            evidenceIds: existing?.evidenceIds || [],
            warnings: validation.errors,
            errorMessage: validation.valid ? undefined : validation.errors.join("；"),
            blockedReason: undefined,
            updatedAt: now,
        }),
        updatedAt: now,
    };
}

export function failAgentWorkflowSceneRun(workflowRun: AgentWorkflowRunRecord, stageId: string, sceneKey: string, runnerRunId: string, errorMessage: string, now: string): AgentWorkflowRunRecord {
    const existing = workflowRun.sceneStates?.find((scene) => scene.stageId === stageId && scene.sceneKey === sceneKey);
    return {
        ...workflowRun,
        currentStageId: stageId,
        stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === stageId ? { ...stage, status: "error", runnerRunId, errorMessage, blockedReason: undefined } : stage)),
        sceneStates: upsertWorkflowSceneState(workflowRun.sceneStates, {
            stageId,
            sceneKey,
            sceneLabel: existing?.sceneLabel || sceneKey,
            subSceneKey: existing?.subSceneKey,
            status: "error",
            runnerRunId,
            warnings: [errorMessage],
            errorMessage,
            blockedReason: undefined,
            updatedAt: now,
        }),
        updatedAt: now,
    };
}

export function reviewAgentWorkflowSceneRun(workflowRun: AgentWorkflowRunRecord, evidence: AgentWorkflowReviewEvidence, now: string): AgentWorkflowRunRecord {
    const sceneKey = evidence.sceneKey || "";
    if (!sceneKey) return workflowRun;
    const status: AgentWorkflowSceneRunStatus = evidence.decision === "approved" ? "approved" : "rejected";
    const sceneStates = (workflowRun.sceneStates || []).map((scene) =>
        scene.stageId === evidence.stageId && scene.sceneKey === sceneKey
            ? {
                  ...scene,
                  status,
                  runnerRunId: evidence.runnerRunId,
                  evidenceIds: Array.from(new Set([...scene.evidenceIds, evidence.evidenceId])),
                  errorMessage: undefined,
                  blockedReason: undefined,
                  updatedAt: now,
              }
            : scene,
    );
    return {
        ...workflowRun,
        currentStageId: evidence.stageId,
        stageStates: workflowRun.stageStates.map((stage) => (stage.stageId === evidence.stageId ? { ...stage, status: "idle", runnerRunId: evidence.runnerRunId, errorMessage: undefined, blockedReason: undefined } : stage)),
        sceneStates,
        updatedAt: now,
    };
}

export function validateAgentWorkflowSceneOutput(output: AgentWorkflowStageOutput) {
    const summaries = summarizeWorkflowSceneOutput(output);
    const errors: string[] = [];
    if (!summaries.visualDnaSummary) errors.push("缺少场次视觉 DNA");
    if (!summaries.promptPlanSummary) errors.push("缺少生成 P / 镜头 P 拆分表摘要");
    if (!summaries.promptTextSummary) errors.push("缺少单 P 任务卡 / Seedance 提示词");
    if (!summaries.industrialPrecheckSummary) errors.push("缺少工业化预检记录摘要");
    return { valid: errors.length === 0, errors, summaries };
}

export function buildApprovedWorkflowSceneAggregateOutput({
    workflowRun,
    outputs,
    outputId,
    now,
}: {
    workflowRun: AgentWorkflowRunRecord;
    outputs: AgentWorkflowStageOutput[];
    outputId: string;
    now: string;
}): { ok: true; output: AgentWorkflowStageOutput; sceneCount: number } | { ok: false; reason: string } {
    const approvedScenes = (workflowRun.sceneStates || []).filter((scene) => scene.stageId === "seedance-storyboard" && scene.status === "approved" && scene.outputId);
    if (!approvedScenes.length) return { ok: false, reason: "尚无已批准场次，不能汇总阶段三 preview" };
    const outputById = new Map(outputs.map((output) => [output.outputId, output]));
    const sceneOutputs = approvedScenes.map((scene) => outputById.get(scene.outputId || "")).filter((output): output is AgentWorkflowStageOutput => Boolean(output));
    if (!sceneOutputs.length) return { ok: false, reason: "未找到已批准场次产物快照" };
    const sourceFiles = uniqueStrings(sceneOutputs.flatMap((output) => output.sourceFiles));
    const qualityGateIds = uniqueStrings(sceneOutputs.flatMap((output) => output.qualityGateIds));
    const scenes = approvedScenes.map((scene) => {
        const output = outputById.get(scene.outputId || "");
        return {
            sceneKey: scene.sceneKey,
            sceneLabel: scene.sceneLabel,
            visualDnaSummary: scene.visualDnaSummary,
            promptPlanSummary: scene.promptPlanSummary,
            promptTextSummary: scene.promptTextSummary,
            industrialPrecheckSummary: scene.industrialPrecheckSummary,
            outputId: scene.outputId,
            rawText: output?.rawText || "",
        };
    });
    const items = sceneOutputs.flatMap((output) => collectWorkflowSceneOutputItems(output));
    const structuredOutput = {
        summary: `已汇总 ${approvedScenes.length} 个已批准场次的 Seedance 分镜产物。`,
        scenes,
        items,
    };
    return {
        ok: true,
        sceneCount: approvedScenes.length,
        output: {
            outputId,
            workflowRunId: workflowRun.id,
            stageId: "seedance-storyboard",
            runnerRunId: `workflow-scene-aggregate-${workflowRun.id}`,
            rawText: JSON.stringify(structuredOutput, null, 2),
            summary: structuredOutput.summary,
            structuredOutput,
            outputFormat: "json",
            sourceFiles,
            qualityGateIds,
            createdAt: now,
        },
    };
}
