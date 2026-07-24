export const clientActivityActions = [
    "project.created",
    "project.renamed",
    "project.deleted",
    "canvas.created",
    "canvas.renamed",
    "canvas.deleted",
    "asset.uploaded",
    "asset.created",
    "asset.renamed",
    "asset.deleted",
    "transfer.import_completed",
    "transfer.export_completed",
    "transfer.download_completed",
    "account.logout",
] as const;
export type ClientActivityAction = (typeof clientActivityActions)[number];
export type ActivityReportInput = { targetType?: string; targetId?: string; targetName?: string; summary?: string; metadata?: Record<string, unknown> };

export function activityReportPayload(action: ClientActivityAction, input: ActivityReportInput, clientEventId: string) {
    if (!(clientActivityActions as readonly string[]).includes(action)) throw new Error("不支持的操作类型");
    return { action, targetType: input.targetType || "", targetId: input.targetId || "", targetName: input.targetName || "", summary: input.summary || "", metadata: input.metadata || {}, clientEventId };
}
