import type { ProductionPackage, WorkflowContinuityReference, WorkflowReferenceBinding, WorkflowShotDraft } from "../../../../../video/use-video-package-store.ts";
import { workflowPromptInputHash } from "../../../../../video/video-package-builders.ts";

export const CONTINUITY_REFERENCE_INSTRUCTION = "以上一镜尾帧作为剧情连续性参考，本镜从该画面之后继续发展；保持场景、角色身份、服装、光线、材质与画风一致，不要求第一帧复刻参考图，不重新诠释视觉设定。";

export function promptInputHash(item: ProductionPackage) {
    return workflowPromptInputHash(item);
}

export function updateShotDraft(item: ProductionPackage, patch: Partial<WorkflowShotDraft>): ProductionPackage {
    return stalePrompt({ ...item, shotDraft: { ...defaultShotDraft(item), ...patch }, shotStatus: "draft" });
}

export function confirmShotDraft(item: ProductionPackage): ProductionPackage {
    return { ...item, shotStatus: "confirmed", promptStatus: !item.prompt.trim() ? "待审核" : item.promptInputHash === promptInputHash(item) ? item.promptStatus : "需修改" };
}

export function updateReferenceBindings(item: ProductionPackage, referenceBindings: WorkflowReferenceBinding[]): ProductionPackage {
    return stalePrompt({ ...item, referenceBindings });
}

export function updateContinuityReference(item: ProductionPackage, continuityReference?: WorkflowContinuityReference | null): ProductionPackage {
    const next = { ...item };
    if (continuityReference) next.continuityReference = continuityReference;
    else delete next.continuityReference;
    return stalePrompt(next);
}

export function buildContinuityReference(previous: ProductionPackage): WorkflowContinuityReference | null {
    if (!previous.lastFrameAssetId || !previous.lastFrameVersion || previous.generation?.status !== "succeeded") return null;
    return {
        sourceShotId: previous.id,
        sourceVideoVersion: previous.generation.taskId || previous.generation.assetId || previous.generation.updatedAt,
        libraryAssetId: previous.lastFrameAssetId,
        version: previous.lastFrameVersion,
        role: "continuity_reference",
    };
}

export function refreshContinuityReference(item: ProductionPackage, previous?: ProductionPackage) {
    if (!item.continuityReference?.updateAvailable || !previous || item.continuityReference.sourceShotId !== previous.id) return item;
    const reference = buildContinuityReference(previous);
    return reference ? updateContinuityReference(item, reference) : item;
}

export function isPromptFresh(item: ProductionPackage) {
    return Boolean(item.promptInputHash && item.promptInputHash === promptInputHash(item) && item.promptStatus === "已确认");
}

export function isShotPromptOutputCurrent(item: ProductionPackage, outputHash: string) {
    return Boolean(outputHash && outputHash === promptInputHash(item));
}

function stalePrompt(item: ProductionPackage): ProductionPackage {
    return { ...item, promptInputHash: "", promptStatus: item.prompt ? "需修改" : "待审核" };
}

function defaultShotDraft(item: ProductionPackage): WorkflowShotDraft {
    return item.shotDraft || { shotSize: "中景", camera: "平视", movement: "固定机位", action: item.segment, performance: "自然克制", dialogue: "", durationSeconds: Number.parseFloat(item.duration) || 6, continuityMode: "cut" };
}
