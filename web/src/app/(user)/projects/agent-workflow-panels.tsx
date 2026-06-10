import { Button, Tag } from "antd";

import type {
    AgentWorkflowReviewEvidence,
    AgentWorkflowRunRecord,
    AgentWorkflowStageOutput,
} from "./agent-runner-types";
import { summarizeWorkflowStageDisplayState, workflowStageStatusLabel } from "./agent-runner-workflow-display";
import {
    getWorkflowStageRequiredReadings,
    type WorkflowGateCheckResult,
    type WorkflowQualityGateManifest,
    type WorkflowReadingSourceType,
    type WorkflowReadingStatus,
} from "./workflow-quality-gates";

export { WorkflowMappingPreviewPanel } from "./agent-workflow-mapping-preview-panel";

export function WorkflowStageStatePanel({ stageId, workflowRun, workflowOutputs, workflowEvidences }: { stageId: string; workflowRun?: AgentWorkflowRunRecord; workflowOutputs: AgentWorkflowStageOutput[]; workflowEvidences: AgentWorkflowReviewEvidence[] }) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    const displayState = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, stageId) : undefined;
    const output = stageState?.outputId ? workflowOutputs.find((item) => item.outputId === stageState.outputId) : workflowOutputs.find((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const evidences = workflowEvidences.filter((item) => item.workflowRunId === workflowRun?.id && item.stageId === stageId);
    const latestEvidence = evidences[0];
    return (
        <div className="grid gap-2 rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-white/5">
            <div className="flex flex-wrap items-center gap-2">
                <Tag className="m-0">{workflowStageStatusLabel(displayState?.displayStatus || "idle")}</Tag>
                {displayState?.hasSceneStates ? <span>{displayState.summaryText}</span> : null}
                <span>阶段产物：{output ? "1 条" : "0 条"}</span>
                <span>审核证据：{evidences.length} 条</span>
                {latestEvidence ? <span>最近审核：{latestEvidence.createdAt}</span> : null}
            </div>
            <div>最近产物：{output?.summary || "暂无阶段产物"}</div>
            {displayState?.blockedReason ? <div className="text-amber-600">阻塞原因：{displayState.blockedReason}</div> : null}
            {stageState?.errorMessage ? <div className="text-rose-500">错误：{stageState.errorMessage}</div> : null}
            {output ? (
                <details>
                    <summary className="cursor-pointer text-stone-500">查看产物详情</summary>
                    <div className="mt-2 grid gap-2">
                        <div className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                            <div>输出格式：{output.outputFormat}</div>
                            <div>生成时间：{output.createdAt}</div>
                            <div className="mt-1">摘要：{output.summary}</div>
                        </div>
                        {output.structuredOutput !== undefined ? (
                            <details className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                                <summary className="cursor-pointer text-stone-500">查看 rawJson</summary>
                                <pre className="mt-2 overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50">{JSON.stringify(output.structuredOutput, null, 2)}</pre>
                            </details>
                        ) : null}
                        <details className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                            <summary className="cursor-pointer text-stone-500">查看 rawText / sourceFiles / qualityGateIds</summary>
                            <div className="mt-2 grid gap-2">
                                <pre className="overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50 whitespace-pre-wrap">{output.rawText}</pre>
                                <div>sourceFiles：{output.sourceFiles.join("；") || "（无）"}</div>
                                <div>qualityGateIds：{output.qualityGateIds.join("；") || "（无）"}</div>
                            </div>
                        </details>
                    </div>
                </details>
            ) : null}
            {evidences.length ? (
                <details>
                    <summary className="cursor-pointer text-stone-500">查看审核证据</summary>
                    <div className="mt-2 grid gap-2">
                        {evidences.map((evidence) => (
                            <div key={evidence.evidenceId} className="rounded-md bg-white px-2 py-1.5 dark:bg-black/20">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className="m-0" color={evidence.decision === "approved" ? "green" : "red"}>
                                        {evidence.decision === "approved" ? "已批准" : "已驳回"}
                                    </Tag>
                                    <span>{evidence.createdAt}</span>
                                    <span>{evidence.reviewer}</span>
                                </div>
                                <div className="mt-1">摘要：{evidence.outputSummary}</div>
                                {evidence.reviewerNote ? <div className="mt-1 text-stone-500">备注：{evidence.reviewerNote}</div> : null}
                                <details className="mt-1">
                                    <summary className="cursor-pointer text-stone-500">查看追溯信息</summary>
                                    <div className="mt-1 grid gap-1 text-stone-500">
                                        <div>outputHash：{evidence.outputHash}</div>
                                        <div>sourceFiles：{evidence.sourceFiles.join("；") || "（无）"}</div>
                                        <div>qualityGateIds：{evidence.qualityGateIds.join("；") || "（无）"}</div>
                                    </div>
                                </details>
                            </div>
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}

export function WorkflowQualityGatePanel({
    stageId,
    workflowRun,
    manifest,
    gateResults,
    onMarkReadingsRead,
}: {
    stageId: string;
    workflowRun?: AgentWorkflowRunRecord;
    manifest: WorkflowQualityGateManifest;
    gateResults: WorkflowGateCheckResult[];
    onMarkReadingsRead: () => void;
}) {
    const stageState = workflowRun?.stageStates.find((stage) => stage.stageId === stageId);
    const requiredReadings = getWorkflowStageRequiredReadings(manifest, stageId);
    const readingRows = requiredReadings.map((reading) => {
        const record = stageState?.readingRecords.find((item) => item.readingId === reading.readingId || item.sourceFile === reading.sourceFile);
        return { reading, status: record?.status || ("missing" as WorkflowReadingStatus), readAt: record?.readAt };
    });
    const readCount = readingRows.filter((row) => row.status === "read").length;
    const missingCount = readingRows.length - readCount;
    const errorCount = gateResults.filter((result) => result.status === "error").length;
    const warningCount = gateResults.filter((result) => result.status === "warning").length;
    return (
        <div className="grid gap-2 rounded-md border border-stone-200 p-2 text-xs leading-5 dark:border-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Tag className="m-0">
                        已读 {readCount}/{requiredReadings.length}
                    </Tag>
                    <Tag className="m-0" color={missingCount ? "orange" : "green"}>
                        缺失 {missingCount}
                    </Tag>
                    <Tag className="m-0" color={errorCount ? "red" : "green"}>
                        error {errorCount}
                    </Tag>
                    <Tag className="m-0" color={warningCount ? "orange" : "default"}>
                        warning {warningCount}
                    </Tag>
                </div>
                <Button size="small" disabled={!workflowRun} onClick={onMarkReadingsRead}>
                    按 manifest 标记已读
                </Button>
            </div>
            <details>
                <summary className="cursor-pointer text-stone-500">查看 required readings 与缺失原因</summary>
                <div className="mt-2 grid gap-1">
                    {readingRows.map(({ reading, status, readAt }) => (
                        <div key={reading.readingId} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag className="m-0" color={status === "read" ? "green" : status === "missing" ? "red" : "default"}>
                                    {readingStatusLabel(status)}
                                </Tag>
                                <span>
                                    [{readingSourceTypeLabel(reading.sourceType)}] {reading.sourceFile}
                                </span>
                            </div>
                            <div className="mt-1 text-stone-500">
                                {reading.label}
                                {readAt ? ` · ${readAt}` : ""}
                            </div>
                        </div>
                    ))}
                </div>
            </details>
            <details>
                <summary className="cursor-pointer text-stone-500">查看 gate result 详情</summary>
                <div className="mt-2 grid gap-1">
                    {gateResults.map((result) => (
                        <div key={result.resultId} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Tag className="m-0" color={result.status === "error" ? "red" : result.status === "warning" ? "orange" : "green"}>
                                    {result.status.toUpperCase()}
                                </Tag>
                                <span>{result.name}</span>
                                <Tag className="m-0">{qualityGateCheckKindLabel(result.checkKind)}</Tag>
                            </div>
                            <div className="mt-1 text-stone-500">{result.message}</div>
                        </div>
                    ))}
                </div>
            </details>
        </div>
    );
}

function readingSourceTypeLabel(sourceType: WorkflowReadingSourceType) {
    if (sourceType === "agent") return "agent";
    if (sourceType === "skill") return "skill";
    if (sourceType === "template") return "template";
    if (sourceType === "example") return "example";
    if (sourceType === "tool") return "tool";
    return "rule";
}

function readingStatusLabel(status: WorkflowReadingStatus) {
    if (status === "read") return "已读";
    if (status === "skipped") return "跳过";
    return "缺失";
}

function qualityGateCheckKindLabel(checkKind: WorkflowGateCheckResult["checkKind"]) {
    if (checkKind === "required_reading") return "规范读取";
    if (checkKind === "artifact_field") return "阶段产物";
    if (checkKind === "manual_review") return "审核证据";
    return "manifest";
}
