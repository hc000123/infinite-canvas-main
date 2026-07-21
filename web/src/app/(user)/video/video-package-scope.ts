export type ProductionPackageScope = {
    episodeId: string;
    id: string;
    projectId: string;
};

export function sameProductionPackageScope(left: ProductionPackageScope, right: ProductionPackageScope) {
    return left.projectId === right.projectId && left.episodeId === right.episodeId && left.id === right.id;
}

export function upsertScopedPackages<T extends ProductionPackageScope>(current: T[], incoming: T[]) {
    const next = [...current];
    for (const item of incoming) {
        const index = next.findIndex((existing) => sameProductionPackageScope(existing, item));
        if (index >= 0) next[index] = { ...next[index], ...item };
        else next.push(item);
    }
    return next;
}

export function updateScopedPackage<T extends ProductionPackageScope>(current: T[], target: ProductionPackageScope, patch: Partial<T>) {
    return current.map((item) => (sameProductionPackageScope(item, target) ? { ...item, ...patch } : item));
}
