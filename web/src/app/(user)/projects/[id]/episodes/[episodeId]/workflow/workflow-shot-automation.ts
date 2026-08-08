export function shouldAutoLoadStoryboard(input: { stageStatus?: string; gatePassed?: boolean; shotCount: number }) {
    return input.stageStatus === "approved" && input.gatePassed === true && input.shotCount > 0;
}
