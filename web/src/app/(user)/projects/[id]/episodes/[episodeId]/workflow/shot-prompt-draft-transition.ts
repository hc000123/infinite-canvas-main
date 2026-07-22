export type PromptDraftTransitionStatus = "clean" | "dirty" | "saving" | "saved" | "failed";

export function promptDraftTransition(status: PromptDraftTransitionStatus, action: "confirm") {
    if (action === "confirm") return status === "dirty" || status === "failed" ? (["save", "confirm"] as const) : (["confirm"] as const);
    return [] as const;
}
