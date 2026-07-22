import type { RemoteWorkflowStageStatus } from "@/services/api/workflow-runs";

export type WorkflowViewStageKey = "script" | "assets" | "video" | "delivery";
export type WorkflowViewStatus = RemoteWorkflowStageStatus | "idle" | "complete";

export type WorkflowStageView = {
    key: WorkflowViewStageKey;
    label: string;
    description: string;
    status: WorkflowViewStatus;
    count?: string;
    blockingReason?: string;
};
