import { apiPost } from "@/services/api/request";
import type { ClientActivityAction, ActivityReportInput } from "@/hooks/activity-audit";

export function reportActivity(token: string, action: ClientActivityAction, input: ActivityReportInput, clientEventId: string) {
    return apiPost("/api/v1/activity-logs", { action, ...input, clientEventId }, token);
}
