export function shouldAutoLoadStoryboard(input: { stageStatus?: string; gatePassed?: boolean; shotCount: number }) {
    return input.stageStatus === "needs_review" && input.gatePassed === true && input.shotCount > 0;
}
