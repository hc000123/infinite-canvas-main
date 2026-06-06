import { apiGet, apiPost } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";
import type { AdminAITaskDetailResponse } from "./admin";
import { compactTrace, type FrontendArtifactTrace } from "./ai-task-trace-utils";

export type { AiTaskLedger, AiTaskTrace, FrontendArtifactTrace } from "./ai-task-trace-utils";
export { aiTaskLedgerFromGeneration, aiTaskTraceHeaders, buildGenerationTaskLedger, generationTaskSummary, readAiTaskLedgerFromHeaders } from "./ai-task-trace-utils";

export async function fetchUserAITaskDetail(aiTaskId: string) {
    const token = useUserStore.getState().token;
    if (!token || !aiTaskId) return null;
    return apiGet<AdminAITaskDetailResponse>(`/api/v1/ai-tasks/${encodeURIComponent(aiTaskId)}`, undefined, token);
}

export async function recordAiTaskFrontendArtifact(aiTaskId: string, artifact: FrontendArtifactTrace) {
    const token = useUserStore.getState().token;
    if (!token || !aiTaskId) return null;
    return apiPost(`/api/v1/ai-tasks/${encodeURIComponent(aiTaskId)}/frontend-artifact`, compactTrace(artifact) || {}, token);
}
