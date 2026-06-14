import { enterpriseVideoChannelReadiness } from "../video/video-package-builders.ts";

export type OriginalWorkflowChainFile = {
    exists: boolean;
    key: string;
};

export type OriginalWorkflowChainValidation = {
    state?: "failed" | "passed" | "stale";
};

export type OriginalWorkflowChainHealthItem = {
    detail: string;
    key: "script" | "stage1" | "stage2" | "stage3" | "copyOnly" | "videoPackages" | "enterpriseVideo";
    status: "blocked" | "checking" | "ready";
    title: string;
};

export type OriginalWorkflowEnterprisePreflight = {
    checkedAt: string;
    message: string;
    status: "failed" | "passed";
};

export function buildOriginalWorkflowChainHealth(input: {
    enterprisePreflight?: OriginalWorkflowEnterprisePreflight | null;
    files: OriginalWorkflowChainFile[];
    isPublicSettingsLoading?: boolean;
    validations?: Partial<Record<"stage1" | "stage2" | "stage3", OriginalWorkflowChainValidation>>;
    videoPackageCount: number;
    videoProtocol?: string;
}): OriginalWorkflowChainHealthItem[] {
    const files = new Map(input.files.map((file) => [file.key, file]));
    const stage1Ready = ["stage1A", "stage1B", "stage1C", "stage1D"].every((key) => files.get(key)?.exists);
    const stage2Ready = ["characters", "scenes"].every((key) => files.get(key)?.exists);
    const stage3Ready = Boolean(files.get("stage3")?.exists);
    const copyOnlyReady = Boolean(files.get("copyOnly")?.exists);
    const enterprise = enterpriseVideoChannelReadiness({ isPublicSettingsLoading: input.isPublicSettingsLoading, videoProtocol: input.videoProtocol });
    const enterpriseStatus = input.enterprisePreflight?.status === "failed" ? "blocked" : input.enterprisePreflight?.status === "passed" ? "ready" : enterprise.status === "ready" ? "ready" : enterprise.status;
    const enterpriseDetail = input.enterprisePreflight?.message || enterprise.message;
    return [
        {
            detail: files.get("script")?.exists ? "本集剧本已写入本地 markdown。" : "先在剧本页签粘贴并保存本集剧本。",
            key: "script",
            status: files.get("script")?.exists ? "ready" : "blocked",
            title: "剧本",
        },
        stageHealth("stage1", "Stage 1 导演分析", stage1Ready, input.validations?.stage1),
        stageHealth("stage2", "Stage 2 资产提示词", stage2Ready, input.validations?.stage2),
        stageHealth("stage3", "Stage 3 Seedance", stage3Ready, input.validations?.stage3),
        {
            detail: copyOnlyReady ? "Copy-only 文件已存在，可同步到视频生产包。" : "Stage 3 通过后导出 Copy-only。",
            key: "copyOnly",
            status: copyOnlyReady ? "ready" : "blocked",
            title: "Copy-only",
        },
        {
            detail: input.videoPackageCount > 0 ? `已同步 ${input.videoPackageCount} 条视频生产包。` : "还没有同步到视频生成界面。",
            key: "videoPackages",
            status: input.videoPackageCount > 0 ? "ready" : "blocked",
            title: "视频生产包",
        },
        {
            detail: enterpriseDetail,
            key: "enterpriseVideo",
            status: enterpriseStatus,
            title: "企业视频 API",
        },
    ];
}

function stageHealth(key: "stage1" | "stage2" | "stage3", title: string, filesReady: boolean, validation?: OriginalWorkflowChainValidation): OriginalWorkflowChainHealthItem {
    if (!filesReady) {
        return {
            detail: `${title} 产物还不完整。`,
            key,
            status: "blocked",
            title,
        };
    }
    if (validation?.state === "passed") {
        return {
            detail: "阶段文件已生成，质量门已通过。",
            key,
            status: "ready",
            title,
        };
    }
    const detail = validation?.state === "failed" ? "质量门未通过，需要修正后重跑校验。" : validation?.state === "stale" ? "阶段文件在上次校验后更新，需要重新校验。" : "阶段文件已生成，但还没有通过质量门。";
    return {
        detail,
        key,
        status: "blocked",
        title,
    };
}
