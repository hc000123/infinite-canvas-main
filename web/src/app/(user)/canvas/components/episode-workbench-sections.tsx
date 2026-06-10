"use client";

import { Button, Card, Empty, Input, Space, Tag } from "antd";
import { Link2 } from "lucide-react";

import { productionStatusLabel, type EpisodeProductionStatus, type EpisodeWorkbenchStats } from "../utils/episode-workbench";

export function EpisodeOverviewSection({ stats, status }: { stats: EpisodeWorkbenchStats; status: EpisodeProductionStatus }) {
    return (
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            <EpisodeStatCard label="当前状态" value={productionStatusLabel(status)} tone={status === "failed" ? "danger" : status === "generating" ? "warning" : "default"} />
            <EpisodeStatCard label="剧本" value={stats.hasScript ? "已有剧本" : "未绑定"} tone={stats.hasScript ? "default" : "warning"} />
            <EpisodeStatCard label="资产拆解" value={stats.assetBreakdownCount} />
            <EpisodeStatCard label="分镜头" value={stats.tableShotCount} />
            <EpisodeStatCard label="生成组" value={stats.shotGroupCount} />
            <EpisodeStatCard label="已生成视频" value={stats.generatedVideoCount} />
            <EpisodeStatCard label="失败" value={stats.failedCount} tone={stats.failedCount ? "danger" : "default"} />
        </div>
    );
}

export function WorkModeSection({ modes }: { modes: Array<{ key: string; title: string; active: boolean; description: string }> }) {
    return (
        <div className="grid gap-3 md:grid-cols-3">
            {modes.map((mode) => (
                <Card key={mode.key} size="small" className={mode.active ? "" : "opacity-60"}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{mode.title}</div>
                        <Tag className="m-0" color={mode.active ? "green" : "default"}>
                            {mode.active ? "可用" : "待准备"}
                        </Tag>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{mode.description}</p>
                </Card>
            ))}
        </div>
    );
}

export function EpisodeScriptSection({
    hasEpisode,
    episodeLabel,
    scriptDraft,
    onScriptDraftChange,
    onSaveScriptSnapshot,
    onOpenBind,
}: {
    hasEpisode: boolean;
    episodeLabel: string;
    scriptDraft: string;
    onScriptDraftChange: (value: string) => void;
    onSaveScriptSnapshot: () => void;
    onOpenBind: () => void;
}) {
    return (
        <Card
            size="small"
            title="剧本"
            extra={
                <Space>
                    <Button size="small" icon={<Link2 className="size-3.5" />} onClick={onOpenBind}>
                        {hasEpisode ? "重新绑定 / 导入" : "绑定或导入"}
                    </Button>
                    <Button size="small" type="primary" disabled={!hasEpisode} onClick={onSaveScriptSnapshot}>
                        保存剧本快照
                    </Button>
                </Space>
            }
        >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <Tag color={hasEpisode ? "blue" : undefined} className="m-0">
                    {episodeLabel}
                </Tag>
                <span className="text-stone-500">{hasEpisode ? "剧本快照可编辑，保存前不会覆盖分镜头。" : "未绑定剧本时仍可自由画布制作。"}</span>
            </div>
            {hasEpisode ? <Input.TextArea value={scriptDraft} rows={8} onChange={(event) => onScriptDraftChange(event.target.value)} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前画布未绑定本集剧本" className="py-8" />}
        </Card>
    );
}

function EpisodeStatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }) {
    const toneClass =
        tone === "danger"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
            : tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300"
              : "border-stone-200 bg-white text-stone-900 dark:border-stone-800 dark:bg-white/5 dark:text-stone-100";
    return (
        <div className={`rounded-xl border p-3 ${toneClass}`}>
            <div className="text-xs opacity-60">{label}</div>
            <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
    );
}

export { AssetExtractionSection, EpisodeImageNeedsSection } from "./episode-workbench-asset-sections";
export { EpisodeTableSection, GenerationManagementSection, ShotGroupReferencePreview, ShotGroupSection } from "./episode-workbench-storyboard-sections";
export { TableShotFormModal, ShotGroupFormModal } from "./storyboard-shot-group-components";
export type { ShotGroupFormValues, TableShotFormValues } from "./storyboard-shot-group-components";
export type { StoryboardAssetRef, StoryboardProductionBibleRef } from "../utils/storyboard-management";
