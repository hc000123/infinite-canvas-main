import type { ProjectCacheSummary } from "@/services/api/project-cache";

export type ProjectCacheDisplayStatus = "active" | "deleted" | "orphaned" | "unassigned";

export function mergeProjectCacheState<T extends ProjectCacheSummary>(diskProjects: T[], localProjects: Array<{ id: string }>) {
    const localIds = new Set(localProjects.map((item) => item.id));
    return diskProjects.map((item) => ({
        ...item,
        displayStatus: (!item.projectId ? "unassigned" : item.status === "deleted" ? "deleted" : localIds.has(item.projectId) ? "active" : "orphaned") as ProjectCacheDisplayStatus,
    }));
}

export function filterProjectCacheFiles<T extends { category: string; context: { episodeId?: string }; kind: string; originalName: string; id: string }>(files: T[], filters: { episodeId?: string; category?: string; kind?: string; keyword?: string }) {
    const keyword = filters.keyword?.trim().toLowerCase() || "";
    return files.filter((item) => {
        if (filters.episodeId && item.context.episodeId !== filters.episodeId) return false;
        if (filters.category && item.category !== filters.category) return false;
        if (filters.kind && item.kind !== filters.kind) return false;
        return !keyword || `${item.originalName} ${item.id}`.toLowerCase().includes(keyword);
    });
}

export function projectCacheStatusLabel(status: ProjectCacheDisplayStatus) {
    return status === "deleted" ? "项目已删除" : status === "orphaned" ? "未关联当前项目" : status === "unassigned" ? "未归属" : "正常";
}

export function toggleVisibleCacheSelection(selected: ReadonlySet<string>, visibleIds: string[]) {
    const next = new Set(selected);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
    visibleIds.forEach((id) => allVisibleSelected ? next.delete(id) : next.add(id));
    return next;
}

export function pruneCacheSelection(selected: ReadonlySet<string>, validIds: string[]) {
    const valid = new Set(validIds);
    return new Set([...selected].filter((id) => valid.has(id)));
}
