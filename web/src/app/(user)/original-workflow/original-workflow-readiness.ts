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
    if (hasCopyOnly && stage3Validation?.state !== "passed") {
        return {
            disabled: true,
            label: "先校验 Copy-only",
            mode: "needs-stage3-validation" as const,
            notice: stage3Validation?.state === "failed" ? "Copy-only 质量门未通过，请先修正并重新校验，再同步视频生产包。" : stage3Validation?.state === "stale" ? "Copy-only 文件在上次校验后有更新，请重新校验后再同步视频生产包。" : "Copy-only 尚未通过质量门，请先校验 Copy-only，再同步视频生产包。",
        };
    }
    if (hasCopyOnly) {
        return {
            disabled: false,
            label: "同步生产包",
            mode: "sync-existing" as const,
            notice: "",
        };
    }
    if (hasStage3) {
        return {
            disabled: false,
            label: "导出旧版 Copy-only",
            mode: "export" as const,
            notice: "检测到旧版分镜缓存，可导出为 Copy-only 后同步。",
        };
    }
    return {
        disabled: true,
        label: "同步生产包",
        mode: "blocked" as const,
        notice: "缺少 outputs/{episode}/02-seedance-copy-only.md；请先启动 Copy-only，或切换到已有 Copy-only 的集数。",
    };
}
