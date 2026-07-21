export type BatchPackageLike = {
    assetStatus: string;
    generation?: { status?: string };
    id: string;
    prompt: string;
    promptStatus: string;
    risks: Array<{ level: string }>;
};

export function eligibleBatchPackages<T extends BatchPackageLike>(items: T[]) {
    const included: T[] = [];
    const excluded: Array<{ item: T; reason: string }> = [];
    for (const item of items) {
        const reason = batchExclusionReason(item);
        if (reason) excluded.push({ item, reason });
        else included.push(item);
    }
    return { excluded, included };
}

function batchExclusionReason(item: BatchPackageLike) {
    if (!item.prompt.trim()) return "提示词为空";
    if (item.generation?.status === "succeeded") return "已有成功版本";
    if (["checking", "creating", "queued", "running"].includes(item.generation?.status || "")) return "任务正在运行";
    if (item.promptStatus !== "已确认") return "提示词待审核";
    if (item.assetStatus !== "完整" || item.risks.some((risk) => risk.level === "阻断")) return "存在资产或风险阻断";
    return "";
}
