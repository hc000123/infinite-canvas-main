import { type Dispatch, type SetStateAction } from "react";
import { Alert, Button, Card, Input, Space, Tag } from "antd";
import { Workflow } from "lucide-react";

import type { AgentWorkflowMappingPreview, AgentWorkflowReviewEvidence, AgentWorkflowRunRecord, AgentWorkflowStageOutput } from "./agent-runner-types";
import { canGenerateWorkflowMappingPreview } from "./agent-runner-workflow-preview";
import { summarizeWorkflowStageDisplayState, workflowStageStatusLabel } from "./agent-runner-workflow-display";
import { WorkflowMappingPreviewPanel, WorkflowQualityGatePanel, WorkflowStageStatePanel } from "./agent-workflow-panels";
import { workflowStageDetail, type AgentWorkflowPreset, type AgentWorkflowStage } from "./agent-workflow-presets";
import { evaluateWorkflowQualityGates, type WorkflowQualityGateManifest } from "./workflow-quality-gates";

type AgentWorkflowExecutionPanelProps = {
    selectedWorkflowPreset: AgentWorkflowPreset;
    selectedWorkflowStages: AgentWorkflowStage[];
    selectedWorkflowRun?: AgentWorkflowRunRecord;
    selectedStagePreviews: AgentWorkflowMappingPreview[];
    qualityGateManifest: WorkflowQualityGateManifest;
    workflowOutputs: AgentWorkflowStageOutput[];
    workflowEvidences: AgentWorkflowReviewEvidence[];
    workflowAppliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    runningStageIds: Record<string, boolean>;
    expandedStageIds: string[];
    setExpandedStageIds: Dispatch<SetStateAction<string[]>>;
    reviewNotes: Record<string, string>;
    setReviewNotes: Dispatch<SetStateAction<Record<string, string>>>;
    hasCanvasContext: boolean;
    hasStoryboardContext: boolean;
    onMarkReadingsRead: (stageId: string) => void;
    onApplyProductionBiblePreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyStoryboardPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyVideoNodePreview: (preview: AgentWorkflowMappingPreview) => void;
    onGenerateWorkflowMappingPreview: (stageId: string, stageName: string) => void;
    onRunWorkflowStageText: (stageId: string) => void;
    onApproveStage: (stageId: string) => void;
    onRejectStage: (stageId: string) => void;
};

export function AgentWorkflowExecutionPanel({
    selectedWorkflowPreset,
    selectedWorkflowStages,
    selectedWorkflowRun,
    selectedStagePreviews,
    qualityGateManifest,
    workflowOutputs,
    workflowEvidences,
    workflowAppliedPreviewItemIds,
    applyingPreviewIds,
    runningStageIds,
    expandedStageIds,
    setExpandedStageIds,
    reviewNotes,
    setReviewNotes,
    hasCanvasContext,
    hasStoryboardContext,
    onMarkReadingsRead,
    onApplyProductionBiblePreview,
    onApplyStoryboardPreview,
    onApplyVideoNodePreview,
    onGenerateWorkflowMappingPreview,
    onRunWorkflowStageText,
    onApproveStage,
    onRejectStage,
}: AgentWorkflowExecutionPanelProps) {
    return (
        <Card
            size="small"
            title={
                <span className="inline-flex items-center gap-2">
                    <Workflow className="size-4" /> Seedance 工作流
                </span>
            }
            extra={<Tag className="m-0">内置流程</Tag>}
        >
            <Alert className="mb-4" type="info" showIcon title="仅运行文本草案；图片、视频生成与业务写入仍需人工确认。" />
            <div className="grid gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{selectedWorkflowPreset.name}</span>
                        <Tag className="m-0">v{selectedWorkflowPreset.version}</Tag>
                        <Tag className="m-0">阶段 {selectedWorkflowStages.length}</Tag>
                        <Tag className="m-0">Agent {selectedWorkflowPreset.agents.length}</Tag>
                        <Tag className="m-0">质量门 {selectedWorkflowPreset.qualityGates.length}</Tag>
                        {selectedWorkflowRun ? <Tag className="m-0">当前阶段：{workflowStageName(selectedWorkflowStages, selectedWorkflowRun.currentStageId)}</Tag> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm dark:bg-white/5">
                        {selectedWorkflowStages.map((stage, index) => (
                            <span key={stage.stageId} className="inline-flex items-center gap-2">
                                <Tag className="m-0">阶段 {stage.order}</Tag>
                                <span className="font-medium">{stage.name}</span>
                                {index < selectedWorkflowStages.length - 1 ? <span className="text-stone-400">→</span> : null}
                            </span>
                        ))}
                        <span className="text-stone-400">→</span>
                        <Tag className="m-0">生成预览</Tag>
                        <span className="text-stone-400">→</span>
                        <Tag className="m-0">确认写入</Tag>
                    </div>
                </div>

                <div className="grid gap-3">
                    {selectedWorkflowStages.map((stage) => {
                        const detail = workflowStageDetail(selectedWorkflowPreset, stage);
                        const stageState = selectedWorkflowRun?.stageStates.find((item) => item.stageId === stage.stageId);
                        const displayState = selectedWorkflowRun ? summarizeWorkflowStageDisplayState(selectedWorkflowRun, stage.stageId) : undefined;
                        const mappingPreviewStatus = selectedWorkflowRun ? canGenerateWorkflowMappingPreview(selectedWorkflowRun, stage.stageId) : { allowed: false, reason: "尚未初始化 workflow run" };
                        const stagePreviews = selectedStagePreviews.filter((preview) => preview.sourceStageId === stage.stageId);
                        const qualityGateResults = selectedWorkflowRun ? evaluateWorkflowQualityGates({ manifest: qualityGateManifest, workflowRun: selectedWorkflowRun, stageId: stage.stageId, outputs: workflowOutputs, evidences: workflowEvidences }) : [];
                        const errorCount = qualityGateResults.filter((result) => result.status === "error").length;
                        const warningCount = qualityGateResults.filter((result) => result.status === "warning").length;
                        const dependencySummary = summarizeWorkflowDependencies(selectedWorkflowStages, selectedWorkflowRun, stage.stageId);
                        const isExpanded = expandedStageIds.includes(stage.stageId);
                        return (
                            <details
                                key={stage.stageId}
                                open={isExpanded}
                                className="rounded-lg border border-stone-200 p-3 dark:border-stone-800"
                                onToggle={(event) => {
                                    const nextOpen = event.currentTarget.open;
                                    setExpandedStageIds((current) => (nextOpen ? (current.includes(stage.stageId) ? current : [...current, stage.stageId]) : current.filter((item) => item !== stage.stageId)));
                                }}
                            >
                                <summary className="cursor-pointer list-none">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">阶段 {stage.order}</Tag>
                                        <span className="font-medium">{stage.name}</span>
                                        <Tag className="m-0">{workflowStageStatusLabel(displayState?.displayStatus || "idle")}</Tag>
                                        {displayState?.hasSceneStates ? <Tag className="m-0">{displayState.summaryText}</Tag> : null}
                                        {selectedWorkflowRun?.currentStageId === stage.stageId && displayState?.displayStatus !== "approved" ? (
                                            <Tag className="m-0" color="blue">
                                                当前阶段
                                            </Tag>
                                        ) : null}
                                        {detail.agent ? <Tag className="m-0">{detail.agent.name}</Tag> : null}
                                        <Tag className="m-0">预览 {stagePreviews.length}</Tag>
                                        <Tag className="m-0" color={errorCount ? "red" : "green"}>
                                            error {errorCount}
                                        </Tag>
                                        <Tag className="m-0" color={warningCount ? "orange" : "default"}>
                                            warning {warningCount}
                                        </Tag>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
                                        <span>输入：{stage.inputSummary}</span>
                                        <span>输出：{stage.outputSummary}</span>
                                    </div>
                                    {displayState?.blockedReason ? <div className="mt-2 text-xs text-amber-600">阻塞原因：{displayState.blockedReason}</div> : null}
                                    {dependencySummary ? <div className="mt-1 text-xs text-stone-500">前置依赖：{dependencySummary}</div> : null}
                                    {stageState?.errorMessage ? <div className="mt-1 text-xs text-rose-500">错误：{stageState.errorMessage}</div> : null}
                                </summary>

                                <div className="mt-3 grid gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Tag className="m-0">{stage.purpose}</Tag>
                                        {detail.skills.length ? <Tag className="m-0">技能 {detail.skills.length}</Tag> : null}
                                        {detail.qualityGates.length ? <Tag className="m-0">质量门 {detail.qualityGates.length}</Tag> : null}
                                    </div>
                                    {detail.agent ? (
                                        <details className="rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                                            <summary className="cursor-pointer font-medium text-stone-600 dark:text-stone-300">查看阶段说明与 Agent</summary>
                                            <div className="mt-2 grid gap-1.5">
                                                <div>{detail.agent.role}</div>
                                                <div>{detail.agent.responsibility}</div>
                                                <div className="text-stone-500">系统提示摘要：{detail.agent.systemPromptSummary}</div>
                                                <div className="text-stone-500">来源：{detail.agent.sourceFile}</div>
                                            </div>
                                        </details>
                                    ) : null}
                                    <WorkflowStageStatePanel stageId={stage.stageId} workflowRun={selectedWorkflowRun} workflowOutputs={workflowOutputs} workflowEvidences={workflowEvidences} />
                                    <WorkflowQualityGatePanel stageId={stage.stageId} workflowRun={selectedWorkflowRun} manifest={qualityGateManifest} gateResults={qualityGateResults} onMarkReadingsRead={() => onMarkReadingsRead(stage.stageId)} />
                                    {stagePreviews.length ? (
                                        <WorkflowMappingPreviewPanel
                                            previews={stagePreviews}
                                            appliedPreviewItemIds={workflowAppliedPreviewItemIds}
                                            applyingPreviewIds={applyingPreviewIds}
                                            hasCanvasContext={hasCanvasContext}
                                            hasStoryboardContext={hasStoryboardContext}
                                            onApplyProductionBiblePreview={onApplyProductionBiblePreview}
                                            onApplyStoryboardPreview={onApplyStoryboardPreview}
                                            onApplyVideoNodePreview={onApplyVideoNodePreview}
                                        />
                                    ) : null}
                                    {stageState?.status === "review" ? (
                                        <div className="grid gap-2 rounded-md bg-stone-50 p-2 dark:bg-white/5">
                                            <Input.TextArea rows={2} value={reviewNotes[stage.stageId] || ""} placeholder="可选：填写本阶段审核备注" onChange={(event) => setReviewNotes((current) => ({ ...current, [stage.stageId]: event.target.value }))} />
                                            <Space size={6} wrap>
                                                <Button size="small" type="primary" onClick={() => onApproveStage(stage.stageId)}>
                                                    批准阶段
                                                </Button>
                                                <Button size="small" danger onClick={() => onRejectStage(stage.stageId)}>
                                                    驳回阶段
                                                </Button>
                                            </Space>
                                        </div>
                                    ) : null}
                                    <Space size={[6, 6]} wrap>
                                        <Button size="small" disabled={!mappingPreviewStatus.allowed} onClick={() => onGenerateWorkflowMappingPreview(stage.stageId, stage.name)}>
                                            生成预览
                                        </Button>
                                        <Button size="small" type="primary" disabled={stageState?.status === "blocked"} loading={Boolean(runningStageIds[stage.stageId])} onClick={() => onRunWorkflowStageText(stage.stageId)}>
                                            运行草案
                                        </Button>
                                        {!mappingPreviewStatus.allowed ? <span className="text-xs text-stone-500">{mappingPreviewStatus.reason}</span> : null}
                                    </Space>
                                </div>
                            </details>
                        );
                    })}
                </div>

                <details>
                    <summary className="cursor-pointer text-sm text-stone-500">查看 preset 来源与文件清单</summary>
                    <div className="mt-2 grid gap-2 text-xs text-stone-500">
                        <div>说明：{selectedWorkflowPreset.description}</div>
                        <div>来源目录：{selectedWorkflowPreset.sourceRoot}</div>
                        {selectedWorkflowPreset.sourceFiles.map((file) => (
                            <div key={file.path} className="rounded-md bg-stone-50 px-2 py-1 dark:bg-white/5">
                                [{sourceCategoryLabel(file.category)}] {file.path}：{file.summary}
                            </div>
                        ))}
                    </div>
                </details>
            </div>
        </Card>
    );
}

function sourceCategoryLabel(category: string) {
    if (category === "agent") return "Agent";
    if (category === "skill") return "Skill";
    if (category === "template") return "Template";
    if (category === "example") return "Example";
    if (category === "tool") return "Tool";
    if (category === "config") return "Config";
    return "Guide";
}

function workflowStageName(stages: AgentWorkflowStage[], stageId?: string) {
    return stages.find((stage) => stage.stageId === stageId)?.name || "未开始";
}

function summarizeWorkflowDependencies(stages: AgentWorkflowStage[], workflowRun: AgentWorkflowRunRecord | undefined, stageId: string) {
    const stageState = workflowRun?.stageStates.find((item) => item.stageId === stageId);
    if (!stageState?.dependsOnStageIds.length) return "";
    return stageState.dependsOnStageIds
        .map((dependencyId) => {
            const dependencyStage = stages.find((item) => item.stageId === dependencyId);
            const dependencyDisplay = workflowRun ? summarizeWorkflowStageDisplayState(workflowRun, dependencyId) : undefined;
            return `${dependencyStage?.name || dependencyId}：${workflowStageStatusLabel(dependencyDisplay?.displayStatus || "idle")}`;
        })
        .join("；");
}
