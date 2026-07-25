"use client";

import { reportActivity } from "@/services/api/activity";
import { useUserStore } from "@/stores/use-user-store";
import { activityReportPayload, type ActivityReportInput, type ClientActivityAction } from "./activity-audit";

export function useActivityAudit() {
    const token = useUserStore((state) => state.token);
    return (action: ClientActivityAction, input: ActivityReportInput = {}) => {
        if (!token) return;
        const eventId = crypto.randomUUID();
        const payload = activityReportPayload(action, input, eventId);
        void reportActivity(token, payload.action, payload, eventId).catch(() => undefined);
    };
}
