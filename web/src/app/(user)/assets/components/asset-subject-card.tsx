"use client";

import Link from "next/link";
import { ArrowRight, ImageOff } from "lucide-react";

import type { AssetSubjectSummary } from "../asset-gallery";
import { assetCategoryLabel } from "../asset-subjects";

export function AssetSubjectCard({ summary }: { summary: AssetSubjectSummary }) {
    const { subject, coverAsset } = summary;
    return (
        <article className="group min-w-0 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] transition hover:border-[var(--studio-accent)]">
            <Link href={`/assets/${subject.id}`} className="relative block aspect-square overflow-hidden bg-[var(--studio-shell-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]">
                {coverAsset ? (
                    <img src={coverAsset.coverUrl || coverAsset.data.dataUrl} alt={subject.name} className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 text-[var(--studio-text-muted)]">
                        <ImageOff className="size-7" />
                        <span className="text-xs font-medium">待生产</span>
                    </span>
                )}
                <span className="absolute left-2 top-2 rounded bg-[var(--studio-media-overlay)] px-2 py-1 text-[10px] text-[var(--studio-on-media)]">{assetCategoryLabel(subject.category)}</span>
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-[var(--studio-media-overlay)] px-2 py-1 text-[10px] text-[var(--studio-on-media)] opacity-0 backdrop-blur transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
                    去生图 <ArrowRight className="size-3" />
                </span>
            </Link>
            <Link href={`/assets/${subject.id}`} className="block p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]">
                <span className="block truncate text-sm font-semibold text-[var(--studio-text-primary)]">{subject.name}</span>
                <span className="mt-2 block truncate text-[11px] text-[var(--studio-text-muted)]">{subject.code} · {summary.variantCount} 个形态 · {summary.formalImageCount} 张正式图</span>
            </Link>
        </article>
    );
}
