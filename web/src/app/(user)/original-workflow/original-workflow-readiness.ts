export type WorkflowFileStatus = {
    exists: boolean;
    key: string;
};

export type WorkflowValidationStatus = {
    state?: "failed" | "passed" | "stale";
};

export function getCopyOnlySyncState(files: WorkflowFileStatus[], stage3Validation?: WorkflowValidationStatus) {
    const hasStage3 = files.some((file) => file.key === "stage3" && file.exists);
    const hasCopyOnly = files.some((file) => file.key === "copyOnly" && file.exists);
    if (hasStage3 && stage3Validation?.state !== "passed") {
        return {
            disabled: true,
            label: "先校验 Stage 3",
            mode: "needs-stage3-validation" as const,
            notice: stage3Validation?.state === "failed" ? "Stage 3 质量门未通过，请先修正并重新校验，再导出或同步视频生产包。" : stage3Validation?.state === "stale" ? "Stage 3 文件在上次校验后有更新，请重新校验后再导出或同步视频生产包。" : "Stage 3 尚未通过质量门，请先校验 Stage 3，再导出或同步视频生产包。",
        };
    }
    if (hasStage3) {
        return {
            disabled: false,
            label: "导出并同步生产包",
            mode: "export" as const,
            notice: "",
        };
    }
    if (hasCopyOnly) {
        return {
            disabled: false,
            label: "同步现有生产包",
            mode: "sync-existing" as const,
            notice: "当前缺少 Stage 3 标准输出，将使用现有 Copy-only 文件同步到视频生产包。",
        };
    }
    return {
        disabled: true,
        label: "导出并同步生产包",
        mode: "blocked" as const,
        notice: "缺少 outputs/{episode}/02-seedance-prompts.md；请先启动 Stage 3，或切换到已有 Copy-only 的集数。",
    };
}
