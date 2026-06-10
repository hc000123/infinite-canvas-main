import type { AgentWorkflowRunRecord, AgentWorkflowStageStatus } from "./agent-runner-types.ts";

export type AgentWorkflowDisplayStatus = AgentWorkflowStageStatus | "partial";

export type WorkflowStageSceneProgress = {
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    errorCount: number;
    runningCount: number;
    reviewCount: number;
    totalCount: number;
    hasSceneStates: boolean;
    summaryText: string;
};

export type WorkflowStageDisplayState = WorkflowStageSceneProgress & {
    stageId: string;
    stageStatus: AgentWorkflowStageStatus;
    displayStatus: AgentWorkflowDisplayStatus;
    blockedReason?: string;
};

export type WorkflowRunDisplayState = WorkflowStageSceneProgress & {
    displayStatus: AgentWorkflowDisplayStatus;
    stageDisplays: WorkflowStageDisplayState[];
    blockedReason?: string;
    summaryText: string;
};

export function getWorkflowStageSceneProgress(workflowRun: AgentWorkflowRunRecord, stageId: string, expectedSceneKeys: string[] = []): WorkflowStageSceneProgress {
    const sceneStates = (workflowRun.sceneStates || []).filter((scene) => scene.stageId === stageId);
    const sceneByKey = new Map(sceneStates.map((scene) => [scene.sceneKey, scene]));
    const sceneKeys = uniqueStrings([...expectedSceneKeys, ...sceneStates.map((scene) => scene.sceneKey)]);
    const totalCount = sceneStates.length ? sceneKeys.length : 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let errorCount = 0;
    let runningCount = 0;
    let reviewCount = 0;
    for (const sceneKey of sceneKeys) {
        const status = sceneByKey.get(sceneKey)?.status || "idle";
        if (status === "approved") approvedCount += 1;
        else if (status === "rejected") rejectedCount += 1;
        else if (status === "error") errorCount += 1;
        else if (status === "running") runningCount += 1;
        else if (status === "review") reviewCount += 1;
    }
    const pendingCount = Math.max(totalCount - approvedCount - rejectedCount - errorCount, 0);
    const unfinishedCount = Math.max(totalCount - approvedCount, 0);
    return {
        approvedCount,
        pendingCount,
        rejectedCount,
        errorCount,
        runningCount,
        reviewCount,
        totalCount,
        hasSceneStates: sceneStates.length > 0,
        summaryText: `已批准 ${approvedCount} / 未完成 ${unfinishedCount}`,
    };
}

export function summarizeWorkflowStageDisplayState(workflowRun: AgentWorkflowRunRecord, stageId: string, expectedSceneKeys: string[] = []): WorkflowStageDisplayState {
    const stageState = workflowRun.stageStates.find((stage) => stage.stageId === stageId);
    const stageStatus = stageState?.status || "idle";
    const progress = getWorkflowStageSceneProgress(workflowRun, stageId, expectedSceneKeys);
    if (progress.hasSceneStates) {
        const displayStatus =
            stageStatus === "blocked" && !progress.approvedCount && !progress.runningCount && !progress.reviewCount && !progress.rejectedCount && !progress.errorCount
                ? "blocked"
                : progress.errorCount
                  ? "error"
                  : progress.rejectedCount
                    ? "rejected"
                    : progress.totalCount > 0 && progress.approvedCount === progress.totalCount
                      ? "approved"
                      : progress.runningCount
                        ? "running"
                        : progress.reviewCount
                          ? "review"
                          : "partial";
        const summaryText =
            displayStatus === "approved"
                ? `全部场次已批准：${progress.summaryText}`
                : displayStatus === "rejected"
                  ? `场次被驳回：${progress.summaryText}`
                  : displayStatus === "error"
                    ? `场次执行失败：${progress.summaryText}`
                    : displayStatus === "running"
                      ? `场次推进中：${progress.summaryText}`
                      : displayStatus === "review"
                        ? `场次待审核：${progress.summaryText}`
                        : displayStatus === "blocked"
                          ? `场次已阻塞：${progress.summaryText}`
                          : `${progress.approvedCount ? "部分完成" : "场次未完成"}：${progress.summaryText}`;
        return {
            stageId,
            stageStatus,
            displayStatus,
            blockedReason: normalizeWorkflowBlockedReason(stageState?.blockedReason),
            ...progress,
            summaryText,
        };
    }
    return {
        stageId,
        stageStatus,
        displayStatus: stageStatus,
        blockedReason: normalizeWorkflowBlockedReason(stageState?.blockedReason),
        ...progress,
        summaryText: workflowStageStatusLabel(stageStatus),
    };
}

export function summarizeWorkflowRunDisplayState(workflowRun: AgentWorkflowRunRecord, expectedSceneKeysByStageId: Record<string, string[]> = {}): WorkflowRunDisplayState {
    const stageDisplays = workflowRun.stageStates.map((stage) => summarizeWorkflowStageDisplayState(workflowRun, stage.stageId, expectedSceneKeysByStageId[stage.stageId] || []));
    const displayStatus =
        stageDisplays.find((stage) => stage.displayStatus === "error")?.displayStatus ||
        stageDisplays.find((stage) => stage.displayStatus === "rejected")?.displayStatus ||
        stageDisplays.find((stage) => stage.displayStatus === "running")?.displayStatus ||
        stageDisplays.find((stage) => stage.displayStatus === "review")?.displayStatus ||
        stageDisplays.find((stage) => stage.displayStatus === "partial")?.displayStatus ||
        stageDisplays.find((stage) => stage.displayStatus === "blocked")?.displayStatus ||
        (stageDisplays.length && stageDisplays.every((stage) => stage.displayStatus === "approved") ? "approved" : "idle");
    const activeDisplay = stageDisplays.find((stage) => stage.displayStatus === displayStatus);
    const totals = stageDisplays.reduce(
        (acc, stage) => ({
            approvedCount: acc.approvedCount + stage.approvedCount,
            pendingCount: acc.pendingCount + stage.pendingCount,
            rejectedCount: acc.rejectedCount + stage.rejectedCount,
            errorCount: acc.errorCount + stage.errorCount,
            runningCount: acc.runningCount + stage.runningCount,
            reviewCount: acc.reviewCount + stage.reviewCount,
            totalCount: acc.totalCount + stage.totalCount,
            hasSceneStates: acc.hasSceneStates || stage.hasSceneStates,
        }),
        { approvedCount: 0, pendingCount: 0, rejectedCount: 0, errorCount: 0, runningCount: 0, reviewCount: 0, totalCount: 0, hasSceneStates: false },
    );
    return {
        displayStatus,
        stageDisplays,
        blockedReason: activeDisplay?.blockedReason,
        summaryText: displayStatus === "approved" ? "全部阶段已批准" : activeDisplay?.summaryText || workflowStageStatusLabel(displayStatus),
        ...totals,
    };
}

export function workflowStageStatusLabel(status: AgentWorkflowDisplayStatus) {
    if (status === "idle") return "未开始";
    if (status === "running") return "运行中";
    if (status === "review") return "待审核";
    if (status === "approved") return "已批准";
    if (status === "rejected") return "已驳回";
    if (status === "error") return "异常";
    if (status === "partial") return "部分完成";
    return "已阻塞";
}

export function workflowStageDisplayName(stageId: string) {
    if (stageId === "director-analysis") return "导演分析";
    if (stageId === "art-design") return "服化道美术设计";
    if (stageId === "seedance-storyboard") return "Seedance 分镜";
    return stageId;
}

function normalizeWorkflowBlockedReason(reason?: string) {
    if (!reason) return undefined;
    return ["director-analysis", "art-design", "seedance-storyboard"].reduce((text, stageId) => text.replaceAll(stageId, workflowStageDisplayName(stageId)), reason);
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
