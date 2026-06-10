import { Button, Checkbox, Empty, Tag } from "antd";

import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";

export function OutdatedReferencesPanel({
    usages,
    selectedIds,
    onToggle,
    onSelectAll,
    onClear,
    onUpdateOne,
    onOpenBatch,
}: {
    usages: OutdatedAssetVersionUsage[];
    selectedIds: Set<string>;
    onToggle: (usageId: string) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onUpdateOne: (usage: OutdatedAssetVersionUsage) => void;
    onOpenBatch: () => void;
}) {
    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">过期引用 {usages.length} 处</div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">只会更新画布节点、分镜条目或设定库绑定中的版本引用，不修改素材本体。</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="middle" disabled={!usages.length || selectedIds.size === usages.length} onClick={onSelectAll}>
                        全选
                    </Button>
                    <Button size="middle" disabled={!selectedIds.size} onClick={onClear}>
                        清空
                    </Button>
                    <Button size="middle" type="primary" disabled={!selectedIds.size} onClick={onOpenBatch}>
                        批量更新{selectedIds.size ? ` ${selectedIds.size}` : ""}
                    </Button>
                </div>
            </div>
            <div className="mt-3 space-y-2">
                {usages.map((usage) => (
                    <div key={usage.id} className="flex flex-col gap-3 rounded-md border border-stone-200 bg-background px-3 py-3 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Checkbox checked={selectedIds.has(usage.id)} onChange={() => onToggle(usage.id)} />
                                <Tag className="m-0">{outdatedUsageKindLabel(usage)}</Tag>
                                <span className="font-medium text-stone-900 dark:text-stone-100">{usage.objectTitle}</span>
                                <Tag color="gold">
                                    v{usage.assetVersion?.versionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </Tag>
                            </div>
                            <div className="mt-1 break-words pl-7 text-xs text-stone-500 dark:text-stone-400">{[usage.projectTitle, usage.contextTitle, outdatedUsageRoleLabel(usage), `素材：${usage.assetTitle}`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Button size="middle" onClick={() => onUpdateOne(usage)}>
                            更新到最新版
                        </Button>
                    </div>
                ))}
                {!usages.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目没有过期素材引用" className="py-10" /> : null}
            </div>
        </div>
    );
}

function outdatedUsageKindLabel(usage: OutdatedAssetVersionUsage) {
    if (usage.kind === "canvas-node") return "画布节点";
    if (usage.kind === "storyboard-shot") return "分镜条目";
    if (usage.objectType === "character") return "设定库角色";
    if (usage.objectType === "scene") return "设定库场景";
    if (usage.objectType === "prop") return "设定库道具";
    return "设定库";
}

function outdatedUsageRoleLabel(usage: OutdatedAssetVersionUsage) {
    if (usage.kind === "canvas-node") return usage.role ? `${usage.role} 节点` : "";
    return usage.role || usage.objectType || "";
}
