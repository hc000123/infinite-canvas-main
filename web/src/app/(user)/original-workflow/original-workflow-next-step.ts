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
    if (!["characters", "scenes", "props"].every((key) => files.get(key)?.exists)) {
        return {
            actionLabel: "启动服化道",
            description: "剧本已就绪，服化道会内置导演方法，并行生成角色、场景和道具资产提示词。",
            kind: "start-stage",
            stage: "stage2",
            title: "下一步：生成服化道资产",
        };
    }
    if (!isValidationPassed(input.validations?.stage2)) {
        return validationStep("stage2", input.validations?.stage2);
    }
    if (!files.get("copyOnly")?.exists && !files.get("stage3")?.exists) {
        return {
            actionLabel: "启动 Copy-only",
            description: "服化道资产已就绪，后台会完成必要分镜拆解，只交付可复制的 Seedance 提示词。",
            kind: "start-stage",
            stage: "stage3",
            title: "下一步：生成 Copy-only",
        };
    }
    const stage3Validation = input.validations?.stage3;
    if (stage3Validation?.state === "failed" || stage3Validation?.state === "stale") {
        return {
            actionLabel: "重新生成 Copy-only",
            description: stage3Validation.state === "failed" ? "Copy-only 上次质量门未通过，可以重新运行生成。" : "Copy-only 文件已更新，可以重新运行生成。",
            kind: "start-stage",
            stage: "stage3",
            title: "下一步：重跑 Copy-only",
        };
    }
    if (!isValidationPassed(stage3Validation)) {
        return validationStep("stage3", stage3Validation);
    }
    if (!files.get("copyOnly")?.exists) {
        return {
            actionLabel: "导出并同步生产包",
            description: "检测到旧版过程缓存，下一步导出 Copy-only 并拆分为视频生产包。",
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
    const label = stage === "stage2" ? "服化道" : stage === "stage3" ? "Copy-only" : "导演方法";
    const reason = validation?.state === "failed" ? "上次质量门未通过，先重新校验或修正输出。" : validation?.state === "stale" ? "阶段文件在上次校验后有更新，需要重新跑质量门。" : "阶段文件已生成，继续跑质量门确认格式和内容。";
    return {
        actionLabel: `校验 ${label}`,
        description: reason,
        kind: "validate-stage",
        stage,
        title: `下一步：校验 ${label}`,
    };
}
