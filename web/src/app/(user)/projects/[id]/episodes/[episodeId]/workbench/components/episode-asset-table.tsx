"use client";

import { EpisodeStatusPill } from "./episode-module-panel";
import type { EpisodeAssetProcessMode, EpisodeAssetRow } from "./episode-assets-module-types";

export function EpisodeAssetTable({
    assets,
    onOpenProcess,
    selectedAssetId,
}: {
    assets: EpisodeAssetRow[];
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    selectedAssetId: string;
}) {
    if (!assets.length) {
        return <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合筛选的资产。</div>;
    }
    return (
        <div className="overflow-x-auto">
            <div className="min-w-[920px]">
                <div className="grid grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-b border-slate-800 px-5 py-3 text-sm font-medium text-slate-500">
                    <div>类型</div>
                    <div>资产</div>
                    <div>项目库</div>
                    <div>生成</div>
                    <div>状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-slate-800/90">
                    {assets.map((asset) => (
                        <EpisodeAssetTableRow key={asset.id} asset={asset} onOpenProcess={onOpenProcess} selected={asset.id === selectedAssetId} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function EpisodeAssetTableRow({
    asset,
    onOpenProcess,
    selected,
}: {
    asset: EpisodeAssetRow;
    onOpenProcess: (asset: EpisodeAssetRow, mode: EpisodeAssetProcessMode) => void;
    selected: boolean;
}) {
    const defaultMode = asset.status === "已绑定" ? "bind" : asset.libraryMatchCount ? "bind" : "generate";
    return (
        <div
            role="button"
            tabIndex={0}
            className={`grid w-full grid-cols-[90px_minmax(240px,1fr)_110px_90px_100px_150px] gap-4 border-l-4 px-5 py-4 text-left text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : "border-transparent hover:bg-white/[0.025]"}`}
            onClick={() => onOpenProcess(asset, defaultMode)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onOpenProcess(asset, defaultMode);
            }}
        >
            <div className="self-center font-semibold text-slate-200">{asset.type}</div>
            <div className="min-w-0 self-center">
                <div className="break-words font-semibold text-slate-100">{asset.name}</div>
                <div className="mt-1 break-words text-slate-500">{asset.description}</div>
            </div>
            <div className="self-center font-semibold text-slate-200">{asset.libraryMatchCount ? `匹配 ${asset.libraryMatchCount}` : "无匹配"}</div>
            <div className="self-center text-slate-300">{asset.canGenerate ? "可生成" : "-"}</div>
            <div className="self-center">
                <EpisodeStatusPill status={asset.status} tone={asset.tone} />
            </div>
            <div className="flex self-center" onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className="rounded-l-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100"
                    onClick={() => onOpenProcess(asset, "bind")}
                >
                    绑定
                </button>
                <button
                    type="button"
                    className="rounded-r-md border border-l-0 border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/70 hover:text-cyan-100"
                    onClick={() => onOpenProcess(asset, "generate")}
                >
                    生成
                </button>
            </div>
        </div>
    );
}
