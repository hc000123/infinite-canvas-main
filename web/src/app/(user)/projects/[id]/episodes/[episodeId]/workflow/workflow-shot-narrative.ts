import type { WorkflowShotDraft } from "../../../../../video/use-video-package-store.ts";

export function workflowShotNarrative(draft: WorkflowShotDraft) {
    const override = draft.narrative?.trim();
    if (override) return override;
    const opening = `${draft.shotSize || "镜头"}，${draft.camera || "平视机位"}，${draft.movement || "固定拍摄"}。`;
    const action = sentence(draft.action);
    const performance = draft.performance ? `人物表演：${sentence(draft.performance)}` : "";
    const dialogue = draft.dialogue ? `声音与台词：${sentence(draft.dialogue)}` : "";
    const continuity = draft.continuityMode === "continuous" ? "画面承接上一镜的连续动作。" : "本镜独立切入。";
    return [opening, action, performance, dialogue, continuity, `预计 ${draft.durationSeconds || 6} 秒。`].filter(Boolean).join("");
}

function sentence(value: string) {
    const text = value.trim();
    if (!text) return "";
    return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}
