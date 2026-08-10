"use client";

import { Button, Empty } from "antd";
import { History, Sparkles } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";

export function AssetVersionPanel({ assets, currentAssetId, onRevise, onSetCurrent }: { assets: Asset[]; currentAssetId?: string; onRevise: (asset: Asset) => void; onSetCurrent: (assetId: string) => void }) {
    const historyAssets = assets.filter((asset) => asset.id !== currentAssetId);
    return (
        <section className="rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="mb-3 flex items-center gap-2"><History className="size-4 text-[var(--studio-text-muted)]" /><h2 className="text-sm font-semibold">历史版本</h2><span className="text-xs text-[var(--studio-text-muted)]">{historyAssets.length}</span></div>
            {historyAssets.length ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                    {historyAssets.map((asset) => <div key={asset.id} className="w-36 shrink-0 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)]"><div className="relative aspect-square bg-[var(--studio-elevated-bg)]"><img src={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")} alt={asset.title} className="h-full w-full object-cover" /></div><div className="grid gap-1 p-2"><div className="truncate text-xs font-medium">{asset.title}</div><Button block type="text" size="small" icon={<Sparkles className="size-3" />} onClick={() => onRevise(asset)}>继续修改</Button><Button block type="text" size="small" onClick={() => onSetCurrent(asset.id)}>设为当前版本</Button></div></div>)}
                </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-xs">当前还没有历史版本</span>} className="!my-4" />}
        </section>
    );
}
