export type OriginalWorkflowFileState = {
    exists: boolean;
    key: string;
};

export type OriginalWorkflowJobState = {
    jobStatus?: string;
};

export type OriginalWorkflowValidationState = {
    state?: "failed" | "passed" | "stale";
};

export type OriginalWorkflowNextStep =
    | { actionLabel: string; description: string; kind: "connect"; title: string }
    | { actionLabel: string; description: string; kind: "edit-script"; title: string }
    | { actionLabel: string; description: string; kind: "wait-runner"; title: string }
    | { actionLabel: string; description: string; kind: "start-stage"; stage: "stage1" | "stage2" | "stage3"; title: string }
    | { actionLabel: string; description: string; kind: "validate-stage"; stage: "stage1" | "stage2" | "stage3"; title: string }
    | { actionLabel: string; description: string; kind: "export-copy"; title: string }
    | { actionLabel: string; description: string; kind: "sync-video"; title: string };

export function getOriginalWorkflowNextStep(input: { files: OriginalWorkflowFileState[]; job?: OriginalWorkflowJobState; rootExists?: boolean; validations?: Partial<Record<"stage1" | "stage2" | "stage3", OriginalWorkflowValidationState>> }): OriginalWorkflowNextStep {
    const files = new Map(input.files.map((file) => [file.key, file]));
    if (!input.rootExists) {
        return {
            actionLabel: "刷新目录",
            description: "先确认本地三阶段工作流根目录存在，连接后才能读取剧本和产物。",
            kind: "connect",
            title: "下一步：连接工作流目录",
        };
    }
    if (input.job?.jobStatus === "running") {
        return {
            actionLabel: "查看运行报告",
            description: "后台 Runner 正在执行，先观察日志和状态；完成后再继续下一阶段。",
            kind: "wait-runner",
            title: "下一步：等待 Runner 完成",
        };
    }
    if (!files.get("script")?.exists) {
        return {
            actionLabel: "编辑剧本",
            description: "当前集还没有剧本文件，先粘贴或保存剧本到本地项目目录。",
            kind: "edit-script",
            title: "下一步：写入剧本",
        };
    }
    if (!["stage1A", "stage1B", "stage1C", "stage1D"].every((key) => files.get(key)?.exists)) {
        return {
            actionLabel: "启动 Stage 1",
            description: "剧本已就绪，先生成导演分析、Beat Board、导演分镜脚本和用户修改轨。",
            kind: "start-stage",
            stage: "stage1",
            title: "下一步：运行导演分析",
        };
    }
    if (!isValidationPassed(input.validations?.stage1)) {
        return validationStep("stage1", input.validations?.stage1);
    }
    if (!["characters", "scenes"].every((key) => files.get(key)?.exists)) {
        return {
            actionLabel: "启动 Stage 2",
            description: "导演分析已就绪，继续生成角色、场景和道具资产提示词。",
            kind: "start-stage",
            stage: "stage2",
            title: "下一步：生成资产提示词",
        };
    }
    if (!isValidationPassed(input.validations?.stage2)) {
        return validationStep("stage2", input.validations?.stage2);
    }
    if (!files.get("stage3")?.exists) {
        return {
            actionLabel: "启动 Stage 3",
            description: "资产提示词已就绪，继续生成 Seedance 分镜提示词和素材对应表。",
            kind: "start-stage",
            stage: "stage3",
            title: "下一步：生成 Seedance 提示词",
        };
    }
    if (!isValidationPassed(input.validations?.stage3)) {
        return validationStep("stage3", input.validations?.stage3);
    }
    if (!files.get("copyOnly")?.exists) {
        return {
            actionLabel: "导出并同步生产包",
            description: "Stage 3 已存在，下一步导出 Copy-only 并拆分为视频生产包。",
            kind: "export-copy",
            title: "下一步：导出 Copy-only",
        };
    }
    return {
        actionLabel: "进入视频生成",
        description: "Copy-only 已就绪，可以同步到视频生产界面并使用企业 Seedance 生成。",
        kind: "sync-video",
        title: "下一步：视频生成",
    };
}

function isValidationPassed(validation?: OriginalWorkflowValidationState) {
    return validation?.state === "passed";
}

function validationStep(stage: "stage1" | "stage2" | "stage3", validation?: OriginalWorkflowValidationState): OriginalWorkflowNextStep {
    const label = stage.replace("stage", "Stage ");
    const reason = validation?.state === "failed" ? "上次质量门未通过，先重新校验或修正输出。" : validation?.state === "stale" ? "阶段文件在上次校验后有更新，需要重新跑质量门。" : "阶段文件已生成，继续跑质量门确认格式和内容。";
    return {
        actionLabel: `校验 ${label}`,
        description: reason,
        kind: "validate-stage",
        stage,
        title: `下一步：校验 ${label}`,
    };
}
