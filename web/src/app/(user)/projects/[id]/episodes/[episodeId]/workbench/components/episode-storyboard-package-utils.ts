import { workflowMappingPreviewItemKey } from "../../../../../agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview } from "../../../../../agent-runner-types";
import type { StoryboardPackageStatus, StoryboardProductionPackage, StoryboardStorySegment } from "../storyboard-production-segments";

export type StoryboardPackageDrawerTab = "shots" | "script" | "prompt" | "assets";
export type StoryboardPackageFilter = "全部" | StoryboardPackageStatus;

export function summarizeStoryboardProductionSegments(segments: StoryboardStorySegment[]) {
    const packages = segments.flatMap((segment) => segment.packages);
    return {
        missingAssets: packages.filter((pkg) => pkg.status === "缺资产").length,
        packages: packages.length,
        segments: segments.length,
        shots: packages.reduce((total, pkg) => total + pkg.shots.length, 0),
        timeout: packages.filter((pkg) => pkg.status === "超时" || pkg.duration > 15).length,
    };
}

export function filterStoryboardPackage(pkg: StoryboardProductionPackage, filter: StoryboardPackageFilter) {
    if (filter === "全部") return true;
    if (filter === "超时") return pkg.status === "超时" || pkg.duration > 15;
    return pkg.status === filter;
}

export function latestPreview(previews: AgentWorkflowMappingPreview[], targetType: AgentWorkflowMappingPreview["targetType"]) {
    return previews.filter((preview) => preview.targetType === targetType).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function previewCounts(preview: AgentWorkflowMappingPreview, appliedPreviewItemIds: string[]) {
    const creatable = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
    const applied = creatable.filter((item) => appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId))).length;
    return { applied, pending: Math.max(0, creatable.length - applied), total: creatable.length };
}

export function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
