export type WorkflowShotPrimaryStatus = "running" | "queued" | "blocked" | "failed" | "review" | "ready" | "completed";
export type WorkflowShotListItem = { id: string; prompt: string; sceneKey: string; segment: string; status: WorkflowShotPrimaryStatus };

const nextPriority: WorkflowShotPrimaryStatus[] = ["blocked", "failed", "review", "running", "queued", "ready", "completed"];

export function selectNextWorkflowShot<T extends WorkflowShotListItem>(shots: T[]) {
    for (const status of nextPriority) {
        const item = shots.find((shot) => shot.status === status);
        if (item) return item;
    }
    return undefined;
}

export function filterWorkflowShots<T extends WorkflowShotListItem>(shots: T[], filter: { keyword?: string; sceneKey?: string; status?: WorkflowShotPrimaryStatus | "all" }) {
    const keyword = filter.keyword?.trim().toLocaleLowerCase() || "";
    return shots.filter((shot) => {
        if (filter.status && filter.status !== "all" && shot.status !== filter.status) return false;
        if (filter.sceneKey && shot.sceneKey !== filter.sceneKey) return false;
        if (keyword && !`${shot.id} ${shot.sceneKey} ${shot.segment} ${shot.prompt}`.toLocaleLowerCase().includes(keyword)) return false;
        return true;
    });
}

export function workflowVirtualWindow(total: number, scrollTop: number, viewportHeight: number, rowHeight = 76, overscan = 6) {
    const visibleStart = Math.floor(Math.max(0, scrollTop) / rowHeight);
    const visibleCount = Math.ceil(Math.max(rowHeight, viewportHeight) / rowHeight);
    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(total, visibleStart + visibleCount + overscan);
    return { bottomSpacer: Math.max(0, (total - end) * rowHeight), end, start, topSpacer: start * rowHeight };
}
