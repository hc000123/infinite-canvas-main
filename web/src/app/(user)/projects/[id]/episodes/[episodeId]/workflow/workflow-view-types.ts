import type { RemoteWorkflowStageStatus } from "@/services/api/workflow-runs";

export type WorkflowViewStageKey = "script" | "asset-extraction" | "asset-production" | "storyboard" | "prompt" | "video";
export type WorkflowViewStatus = RemoteWorkflowStageStatus | "idle" | "complete";

export type WorkflowStageView = {
    key: WorkflowViewStageKey;
    label: string;
    description: string;
    status: WorkflowViewStatus;
    count?: string;
    blockingReason?: string;
};
