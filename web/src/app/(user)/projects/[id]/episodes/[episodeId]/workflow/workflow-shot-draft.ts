import type { ProductionPackage, WorkflowShotDraft } from "../../../../../video/use-video-package-store.ts";

export type WorkflowShotBreakdownItem = { shotId: string; sceneKey: string; sourceScript: string; shotDraft: WorkflowShotDraft };

export function parseShotBreakdown(contentJson: string): WorkflowShotBreakdownItem[] {
    try {
        const content = JSON.parse(contentJson) as { shots?: unknown[] };
        return (Array.isArray(content.shots) ? content.shots : []).flatMap((item): WorkflowShotBreakdownItem[] => {
            const shot = record(item);
            const draft = record(shot.shotDraft);
            const shotId = text(shot.shotId);
            const sceneKey = text(shot.sceneKey);
            const sourceScript = text(shot.sourceScript);
            if (!shotId || !sceneKey || !sourceScript || !Object.keys(draft).length) return [];
            return [{
                shotId,
                sceneKey,
                sourceScript,
                shotDraft: {
                    shotSize: text(draft.shotSize), camera: text(draft.camera), movement: text(draft.movement), action: text(draft.action), performance: text(draft.performance), dialogue: text(draft.dialogue),
                    durationSeconds: Math.max(4, Math.min(15, Number(draft.durationSeconds) || 6)),
                    continuityMode: draft.continuityMode === "continuous" ? "continuous" : "cut",
                },
            }];
        });
    } catch { return []; }
}

export function prepareWorkflowShotPackage(item: ProductionPackage): ProductionPackage {
    return { ...item, promptInputHash: "", promptStatus: "待审核", shotStatus: "confirmed" };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
