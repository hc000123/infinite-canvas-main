import { Database, FolderOpen, Trash2 } from "lucide-react";

import { projectCacheStatusLabel, type ProjectCacheDisplayStatus } from "../cache-view-model";

export type CacheProjectListItem = {
    projectId: string;
    projectName: string;
    bytes: number;
    fileCount: number;
    missingCount: number;
    displayStatus: ProjectCacheDisplayStatus;
};

export function CacheProjectList({ items, selectedId, onSelect }: { items: CacheProjectListItem[]; selectedId: string; onSelect: (id: string) => void }) {
    return (
        <aside className="studio-rail thin-scrollbar min-h-0 overflow-y-auto p-2">
            <div className="px-2 pb-2 text-xs font-medium text-[var(--studio-text-muted)]">项目缓存</div>
            <div className="grid gap-1">
                {items.map((item) => {
                    const id = item.projectId || "unassigned";
                    const Icon = item.displayStatus === "deleted" || item.displayStatus === "orphaned" ? Trash2 : item.displayStatus === "unassigned" ? Database : FolderOpen;
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => onSelect(id)}
                            className="flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition"
                            style={{ borderColor: selectedId === id ? "var(--studio-border-strong)" : "transparent", background: selectedId === id ? "var(--studio-active-bg)" : "transparent" }}
                        >
                            <Icon className="mt-0.5 size-4 shrink-0 text-[var(--studio-accent)]" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-[var(--studio-text-primary)]">{item.projectName || "未归属缓存"}</span>
                                <span className="mt-1 block text-xs text-[var(--studio-text-muted)]">
                                    {item.fileCount} 个文件 · {formatCompactBytes(item.bytes)}
                                </span>
                                {item.missingCount ? <span className="mt-1 block text-xs text-[var(--studio-danger)]">{item.missingCount} 个文件缺失</span> : null}
                                {item.displayStatus !== "active" ? <span className="mt-1 block text-xs text-[var(--studio-warning)]">{projectCacheStatusLabel(item.displayStatus)}</span> : null}
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

function formatCompactBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
