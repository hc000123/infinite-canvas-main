"use client";

import { Empty } from "antd";

import type { AssetCenterSubjectSummary } from "../asset-gallery";
import type { OutdatedAssetVersionUsage } from "../asset-version-outdated-references";
import { AssetSubjectCard } from "./asset-subject-card";
import { OutdatedReferencesPanel } from "./outdated-references-panel";

type Props = {
    summaries: AssetCenterSubjectSummary[];
    referenceVersionFilter: "all" | "outdated";
    usages: OutdatedAssetVersionUsage[];
    selectedOutdatedUsageIds: Set<string>;
    onToggleOutdatedUsage: (usageId: string) => void;
    onSelectOutdatedUsages: () => void;
    onClearOutdatedSelection: () => void;
    onUpdateOutdatedUsage: (usage: OutdatedAssetVersionUsage) => void;
    onOpenBulkOutdated: () => void;
};

export function AssetResultsSection(props: Props) {
    return (
        <div className="mx-auto max-w-[1680px]">
            {props.referenceVersionFilter === "outdated" ? (
                <OutdatedReferencesPanel usages={props.usages} selectedIds={props.selectedOutdatedUsageIds} onToggle={props.onToggleOutdatedUsage} onSelectAll={props.onSelectOutdatedUsages} onClear={props.onClearOutdatedSelection} onUpdateOne={props.onUpdateOutdatedUsage} onOpenBatch={props.onOpenBulkOutdated} />
            ) : props.summaries.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {props.summaries.map((summary) => <AssetSubjectCard key={summary.subject.id} summary={summary} />)}
                </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到资产主体" className="py-20" />}
        </div>
    );
}
