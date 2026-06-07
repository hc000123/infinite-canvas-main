import type { CanvasNodeData } from "../types";
import type { ShotGroup, StoryboardTableShot } from "./storyboard-management";

export type ShotInspectionPhase = "todo" | "ready" | "linked" | "running" | "done" | "error";
export type ShotInspectionHealth = "warning" | "ready" | "linked" | "done" | "danger";

export type ShotInspection = {
    groups: ShotGroup[];
    node?: CanvasNodeData;
    phase: ShotInspectionPhase;
    health: ShotInspectionHealth;
    statusLabel: string;
    healthLabel: string;
    referenceCount: number;
};

export function inspectStoryboardShot(shot: StoryboardTableShot, shotGroups: ShotGroup[], nodes: CanvasNodeData[]): ShotInspection {
    const groups = shotGroups.filter((group) => group.shotIds.includes(shot.id));
    const node = findShotNode(shot, groups, nodes);
    const phase = shotInspectionPhase(shot, groups, node);
    const referenceCount = groups.reduce((total, group) => total + group.assetRefs.length + group.audioRefs.length, 0);
    const health = shotInspectionHealth(phase, groups);
    return {
        groups,
        node,
        phase,
        health,
        statusLabel: shotInspectionStatusLabel(shot, phase),
        healthLabel: shotInspectionHealthLabel(phase, groups, referenceCount),
        referenceCount,
    };
}

export function summarizeShotInspections(inspections: ShotInspection[]) {
    return inspections.reduce(
        (summary, inspection) => {
            summary.all += 1;
            summary[inspection.phase] += 1;
            return summary;
        },
        { all: 0, todo: 0, ready: 0, linked: 0, running: 0, done: 0, error: 0 } as Record<"all" | ShotInspectionPhase, number>,
    );
}

function findShotNode(shot: StoryboardTableShot, groups: ShotGroup[], nodes: CanvasNodeData[]) {
    const groupIds = groups.map((group) => group.id);
    return nodes.find(
        (node) =>
            node.metadata?.storyboardTableShotIds?.includes(shot.id) ||
            node.metadata?.storyboardShotId === shot.id ||
            (node.metadata?.shotGroupId && groupIds.includes(node.metadata.shotGroupId)) ||
            (node.metadata?.storyboardShotGroupId && groupIds.includes(node.metadata.storyboardShotGroupId)),
    );
}

function shotInspectionPhase(shot: StoryboardTableShot, groups: ShotGroup[], node?: CanvasNodeData): ShotInspectionPhase {
    if (node?.metadata?.status === "error" || groups.some((group) => group.status === "error")) return "error";
    if (node?.metadata?.status === "loading" || groups.some((group) => group.status === "generating")) return "running";
    if (node?.metadata?.status === "success" || groups.some((group) => group.status === "done")) return "done";
    if (node || groups.some((group) => group.status === "in_canvas")) return "linked";
    if (groups.some((group) => group.effectivePrompt || group.prompt || group.status === "prompt_ready")) return "ready";
    if (shot.workflowSource) return "todo";
    return "todo";
}

function shotInspectionHealth(phase: ShotInspectionPhase, groups: ShotGroup[]): ShotInspectionHealth {
    if (phase === "error") return "danger";
    if (phase === "done") return "done";
    if (phase === "linked" || phase === "running") return "linked";
    if (phase === "ready") return "ready";
    if (!groups.length) return "warning";
    if (!groups.some((group) => group.assetRefs.length || group.audioRefs.length)) return "warning";
    return "ready";
}

function shotInspectionStatusLabel(shot: StoryboardTableShot, phase: ShotInspectionPhase) {
    if (phase === "error") return "失败";
    if (phase === "running") return "生成中";
    if (phase === "done") return "已生成";
    if (phase === "linked") return "已入画布";
    if (phase === "ready") return "提示词就绪";
    if (shot.workflowSource) return "已审核";
    return "待承接";
}

function shotInspectionHealthLabel(phase: ShotInspectionPhase, groups: ShotGroup[], referenceCount: number) {
    if (phase === "error") return "需要重试";
    if (phase === "done") return "成片可查";
    if (phase === "running") return "生成中";
    if (phase === "linked") return "节点已承接";
    if (phase === "ready") return referenceCount ? `${referenceCount} 个参考` : "提示词就绪";
    if (!groups.length) return "待补承接";
    return "待补参考";
}
