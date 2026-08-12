export type WorkflowShotAction = { type: "approve" | "load" } | { type: "idle"; reason: string };

export function nextWorkflowShotAction(input: { stageStatus?: string; gatePassed?: boolean; shotCount: number }): WorkflowShotAction {
    if (!input.shotCount) return { type: "idle", reason: "分镜结果为空" };
    if (input.stageStatus === "needs_review") return input.gatePassed ? { type: "approve" } : { type: "idle", reason: "分镜未通过质量检查" };
    if (input.stageStatus === "approved" && input.gatePassed) return { type: "load" };
    return { type: "idle", reason: "等待分镜结果" };
}
