import { Tag } from "antd";

import { cn } from "@/lib/utils";
import { workflowVideoGenerationReadiness } from "./video-package-builders";
import type { AssetStatus, CanvasStatus, PackageGenerationStatus, ProductionPackageConfig, PromptStatus } from "./use-video-package-store";
import type { PackageConfigPatch } from "./video-page-types";
import { generationStatusLabel } from "./video-page-utils";

export function SettingSummaryChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 py-1.5">
            <div className="truncate text-[11px] text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-0.5 truncate text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}

export function packageConfigPatchFromVideoSetting(key: string, value: string): PackageConfigPatch {
    if (key === "size") return { ratio: value, size: value };
    if (key === "videoSeconds") return { duration: `${value}秒`, videoSeconds: value };
    if (key === "vquality") return { resolution: `${value.replace(/p$/i, "")}p`, vquality: value };
    if (key === "videoTaskMode") return { videoTaskMode: value as ProductionPackageConfig["videoTaskMode"] };
    if (key === "videoEditType") return { videoEditType: value as ProductionPackageConfig["videoEditType"] };
    if (key === "videoExtendDirection") return { videoExtendDirection: value as ProductionPackageConfig["videoExtendDirection"] };
    if (key === "videoReferenceImageMode") return { frames: videoReferenceImageModeLabel(value), videoReferenceImageMode: value as ProductionPackageConfig["videoReferenceImageMode"] };
    return { [key]: value } as PackageConfigPatch;
}

export function videoReferenceImageModeLabel(value: string) {
    if (value === "first_last_frame") return "首尾帧";
    if (value === "first_frame") return "首帧";
    return "普通参考";
}

export function videoTaskModeLabel(value: string) {
    if (value === "edit") return "编辑视频";
    if (value === "extend") return "延长视频";
    return "生成新视频";
}

export function StatusTag({ label }: { label: PromptStatus | AssetStatus | CanvasStatus | "缺参考" | "完整" }) {
    const colorClass =
        label === "已确认" || label === "完整" || label === "已生成"
            ? studioSemanticTagClass("success")
            : label === "待审核" || label === "已导入"
              ? studioSemanticTagClass("info")
              : label === "未导入"
                ? studioSemanticTagClass("neutral")
                : studioSemanticTagClass("warning");

    return <Tag className={cn("m-0 rounded px-1.5 py-0 text-xs leading-5", colorClass)}>{label}</Tag>;
}

export function GenerationTag({ status }: { status?: PackageGenerationStatus }) {
    const label = generationStatusLabel(status);
    const colorClass =
        status === "succeeded"
            ? studioSemanticTagClass("success")
            : status === "running" || status === "queued" || status === "creating" || status === "checking"
              ? studioSemanticTagClass("info")
              : status === "failed" || status === "cancelled"
                ? studioSemanticTagClass("danger")
                : studioSemanticTagClass("neutral");
    return <Tag className={cn("m-0 rounded px-1.5 py-0 text-xs leading-5", colorClass)}>{label}</Tag>;
}

export type StudioSemanticTone = "danger" | "info" | "neutral" | "success" | "warning";

export function studioSemanticNoticeClass(tone: StudioSemanticTone) {
    return `studio-semantic-notice studio-semantic-${tone}`;
}

export function studioSemanticTagClass(tone: StudioSemanticTone) {
    return `studio-semantic-tag studio-semantic-${tone}`;
}

export function readinessStatusTone(status: ReturnType<typeof workflowVideoGenerationReadiness>["status"]): StudioSemanticTone {
    if (status === "blocked") return "warning";
    if (status === "warning") return "info";
    return "success";
}
