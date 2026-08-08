export type WorkflowAssetAutomationStage = {
    gatePassed?: boolean;
    status: string;
};

export type WorkflowAssetAutomationAction =
    | { type: "start-extraction" }
    | { type: "start-prompts" }
    | { type: "idle"; reason: string };

export function nextWorkflowAssetAction(input: {
    enabled: boolean;
    extraction: WorkflowAssetAutomationStage | null;
    prompts: WorkflowAssetAutomationStage | null;
    workerReady: boolean;
}): WorkflowAssetAutomationAction {
    if (!input.enabled) return { type: "idle", reason: "未进入资产设计" };
    if (!input.workerReady) return { type: "idle", reason: "工作流执行器暂不可用" };
    const prompts = input.prompts;
    if (prompts && ["approved", "applied"].includes(prompts.status)) return { type: "idle", reason: "资产卡片已准备完成" };
    if (prompts?.status === "needs_review") return { type: "idle", reason: prompts.gatePassed ? "请确认资产提示词后批准" : "资产提示词未通过质量检查" };
    if (prompts && active(prompts.status)) return { type: "idle", reason: "正在生成资产提示词" };
    if (prompts && terminal(prompts.status)) return { type: "idle", reason: "资产提示词生成失败" };

    const extraction = input.extraction;
    if (!extraction || extraction.status === "ready") return { type: "start-extraction" };
    if (extraction.status === "needs_review") return { type: "idle", reason: extraction.gatePassed ? "请确认资产槽位后批准" : "资产提取未通过质量检查" };
    if (active(extraction.status)) return { type: "idle", reason: "正在从剧本整理资产" };
    if (terminal(extraction.status)) return { type: "idle", reason: "资产提取失败" };
    if (["approved", "applied"].includes(extraction.status) && (!prompts || ["ready", "blocked"].includes(prompts.status))) return { type: "start-prompts" };
    return { type: "idle", reason: "正在准备资产卡片" };
}

function active(status: string) {
    return ["queued", "running", "cancel_requested"].includes(status);
}

function terminal(status: string) {
    return ["cancelled", "failed", "rejected"].includes(status);
}
