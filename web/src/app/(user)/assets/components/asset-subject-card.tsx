"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AudioLines, ImageOff, Sparkles, Upload } from "lucide-react";

import type { AssetCenterSubjectSummary } from "../asset-gallery";
import { assetSubjectHref } from "../asset-navigation";
import { assetCategoryLabel } from "../asset-subjects";

export function AssetSubjectCard({ summary, onMatchVoice, onUpload }: { summary: AssetCenterSubjectSummary; onMatchVoice: (summary: AssetCenterSubjectSummary) => void; onUpload: (summary: AssetCenterSubjectSummary) => void }) {
    const { subject, coverAsset } = summary;
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const subjectHref = assetSubjectHref(subject.id, pathname, searchParams.toString());
    return (
        <article className="group min-w-0 overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] transition hover:border-[var(--studio-accent)]">
            <Link href={subjectHref} className="relative block aspect-square overflow-hidden bg-[var(--studio-shell-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]">
                {coverAsset ? (
                    <img src={coverAsset.coverUrl || coverAsset.data.dataUrl} alt={subject.name} className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 text-[var(--studio-text-muted)]">
                        <ImageOff className="size-7" />
                        <span className="text-xs font-medium">{summary.readiness === "pending" ? "有待选结果" : "待生产"}</span>
                    </span>
                )}
                <span className="absolute left-2 top-2 rounded bg-[var(--studio-media-overlay)] px-2 py-1 text-[10px] text-[var(--studio-on-media)]">{assetCategoryLabel(subject.category)}</span>
            </Link>
            <Link href={subjectHref} className="block p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-accent)]">
                <span className="block truncate text-sm font-semibold text-[var(--studio-text-primary)]">{subject.name}</span>
                <span className="mt-2 block min-h-8 line-clamp-2 text-xs leading-4 text-[var(--studio-text-secondary)]">{summary.prompt || "待补充提示词"}</span>
                <span className="mt-2 block truncate text-[11px] text-[var(--studio-text-muted)]">{subject.code} · {summary.variantCount} 个形态 · {summary.versionCount} 个版本</span>
                <span className="mt-1 block truncate text-[11px] text-[var(--studio-text-secondary)]">待选 {summary.pendingCount} · 关联资料 {summary.relatedMediaCount}</span>
            </Link>
            <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--studio-border-subtle)] p-2">
                <button type="button" className="inline-flex h-8 items-center justify-center gap-1 rounded text-xs text-[var(--studio-text-secondary)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]" onClick={() => onUpload(summary)}><Upload className="size-3.5" />上传</button>
                <Link href={subjectHref} className="inline-flex h-8 items-center justify-center gap-1 rounded text-xs text-[var(--studio-text-secondary)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"><Sparkles className="size-3.5" />生成</Link>
                {subject.category === "character" ? <button type="button" className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded text-xs text-[var(--studio-text-secondary)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]" onClick={() => onMatchVoice(summary)}><AudioLines className="size-3.5" />匹配声音</button> : null}
            </div>
        </article>
    );
}
