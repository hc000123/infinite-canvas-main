"use client";

import Link from "next/link";
import { AudioLines, ExternalLink, FileText, Video } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { assetKindLabel } from "../../asset-utils";

export function AssetRelatedMediaPanel({ assets, projectId }: { assets: Asset[]; projectId: string }) {
    if (!assets.length) return null;
    return (
        <section className="rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="mb-3 flex items-center gap-2"><h2 className="text-sm font-semibold">关联素材</h2><span className="text-xs text-[var(--studio-text-muted)]">{assets.length}</span></div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => (
                    <Link key={asset.id} href={`/assets?projectId=${encodeURIComponent(projectId)}&assetId=${encodeURIComponent(asset.id)}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 transition hover:border-[var(--studio-accent)]">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--studio-elevated-bg)] text-[var(--studio-text-muted)]">{asset.kind === "video" ? <Video className="size-4" /> : asset.kind === "audio" ? <AudioLines className="size-4" /> : <FileText className="size-4" />}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--studio-text-primary)]">{asset.title || `未命名${assetKindLabel(asset.kind)}`}</span><span className="mt-0.5 block truncate text-[11px] text-[var(--studio-text-muted)]">{assetKindLabel(asset.kind)} · {asset.assetBinding?.variantName || "主体资料"}</span></span>
                        <ExternalLink className="size-3.5 shrink-0 text-[var(--studio-text-muted)]" />
                    </Link>
                ))}
            </div>
        </section>
    );
}
