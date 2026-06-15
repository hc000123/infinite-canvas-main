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
        <div className="rounded-md border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 shadow-[var(--studio-shadow)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-sm font-medium text-[var(--studio-text-primary)]">过期引用 {usages.length} 处</div>
                    <div className="mt-1 text-xs text-[var(--studio-text-muted)]">只会更新画布、分镜、镜头组或设定库里的版本引用，不修改素材本体。</div>
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
                    <div key={usage.id} className="flex flex-col gap-3 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-3 transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Checkbox checked={selectedIds.has(usage.id)} onChange={() => onToggle(usage.id)} />
                                <Tag className="m-0">{outdatedUsageKindLabel(usage)}</Tag>
                                <span className="font-medium text-[var(--studio-text-primary)]">{usage.objectTitle}</span>
                                <Tag color="gold">
                                    v{usage.assetVersion?.versionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </Tag>
                            </div>
                            <div className="mt-1 break-words pl-7 text-xs text-[var(--studio-text-muted)]">{[usage.projectTitle, usage.contextTitle, outdatedUsageRoleLabel(usage), `素材：${usage.assetTitle}`].filter(Boolean).join(" · ")}</div>
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
    if (usage.kind === "storyboard-table-shot") return "分镜头表";
    if (usage.kind === "shot-group") return "镜头组";
    if (usage.objectType === "character") return "设定库角色";
    if (usage.objectType === "scene") return "设定库场景";
    if (usage.objectType === "prop") return "设定库道具";
    return "设定库";
}

function outdatedUsageRoleLabel(usage: OutdatedAssetVersionUsage) {
    if (usage.kind === "canvas-node") return usage.role ? `${usage.role} 节点` : "";
    if (usage.kind === "storyboard-table-shot" || usage.kind === "shot-group") return usage.role || usage.objectType || "";
    return usage.role || usage.objectType || "";
}
