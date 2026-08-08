"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Empty, Spin, Tag } from "antd";
import { AudioLines, ExternalLink, FileQuestion, FolderInput, ImageIcon, Trash2, Video } from "lucide-react";

import type { ProjectCacheFile } from "@/services/api/project-cache";
import { useCacheFileObjectUrl } from "../use-cache-file-object-url";

const categoryLabels: Record<ProjectCacheFile["category"], string> = { character: "角色", scene: "场景", prop: "道具", storyboard: "分镜", other: "其他" };
const kindLabels: Record<ProjectCacheFile["kind"], string> = { image: "图片", video: "视频", audio: "音频" };

export function CacheFileGrid({ files, onDelete, onMove, onPreview }: { files: ProjectCacheFile[]; onDelete: (file: ProjectCacheFile) => void; onMove?: (file: ProjectCacheFile) => void; onPreview: (file: ProjectCacheFile) => void }) {
    if (!files.length) return <Empty className="py-16" description="当前分类没有缓存文件" />;
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
            {files.map((file) => <CacheFileCard key={file.id} file={file} onDelete={onDelete} onMove={onMove} onPreview={onPreview} />)}
        </div>
    );
}

function CacheFileCard({ file, onDelete, onMove, onPreview }: { file: ProjectCacheFile; onDelete: (file: ProjectCacheFile) => void; onMove?: (file: ProjectCacheFile) => void; onPreview: (file: ProjectCacheFile) => void }) {
    const missing = file.status === "missing";
    return (
        <article className="group min-w-0 overflow-hidden rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] transition [content-visibility:auto] [contain-intrinsic-size:340px] hover:border-[var(--studio-border-strong)]">
            <button
                type="button"
                disabled={missing}
                onClick={() => onPreview(file)}
                className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--studio-panel-muted-bg)] text-[var(--studio-text-secondary)] disabled:cursor-not-allowed"
                aria-label={missing ? `${file.originalName || file.id} 文件缺失` : `预览 ${file.originalName || file.id}`}
            >
                <CacheFileCover file={file} />
                {!missing ? <span className="absolute inset-x-0 bottom-0 translate-y-full bg-[color-mix(in_srgb,var(--studio-panel-bg)_88%,transparent)] py-2 text-xs text-[var(--studio-text-primary)] backdrop-blur transition group-hover:translate-y-0">点击预览</span> : null}
            </button>
            <div className="p-3">
                <div className="truncate text-sm font-semibold text-[var(--studio-text-primary)]" title={file.originalName || file.id}>{file.originalName || file.id}</div>
                <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]" title={file.relativePath}>{file.context.episodeName || "项目共享"}</div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Tag className="m-0">{categoryLabels[file.category]}</Tag>
                    <Tag className="m-0">{kindLabels[file.kind]}</Tag>
                    <span className="ml-auto text-xs text-[var(--studio-text-muted)]">{formatBytes(file.bytes)}</span>
                </div>
                <div className="mt-3 flex min-h-8 items-center gap-1 border-t border-[var(--studio-border-subtle)] pt-2">
                    {missing ? (
                        <Tag color="error" className="m-0">文件缺失</Tag>
                    ) : (
                        <Button
                            type="text"
                            size="small"
                            icon={<ExternalLink className="size-3.5" />}
                            href={`/cache/files/${encodeURIComponent(file.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                        >
                            新标签查看原文件
                        </Button>
                    )}
                    <span className="ml-auto flex items-center">
                        {onMove ? <Button type="text" size="small" icon={<FolderInput className="size-4" />} onClick={(event) => { event.stopPropagation(); onMove(file); }} aria-label="归属到项目" title="归属到项目" /> : null}
                        <Button type="text" size="small" danger icon={<Trash2 className="size-4" />} onClick={(event) => { event.stopPropagation(); onDelete(file); }} aria-label="删除缓存文件" title="删除缓存文件" />
                    </span>
                </div>
            </div>
        </article>
    );
}

function CacheFileCover({ file }: { file: ProjectCacheFile }) {
    if (file.status === "missing") return <TypeCover icon={<FileQuestion className="size-10" />} label="文件缺失" />;
    if (file.kind === "image") return <CacheImageThumbnail file={file} />;
    if (file.kind === "video") return <TypeCover icon={<Video className="size-10" />} label="视频" />;
    return <TypeCover icon={<AudioLines className="size-10" />} label="音频" />;
}

function CacheImageThumbnail({ file }: { file: ProjectCacheFile }) {
    const targetRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const { url, loading, error } = useCacheFileObjectUrl(file.id, visible);

    useEffect(() => {
        const target = targetRef.current;
        if (!target) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            setVisible(true);
            observer.disconnect();
        }, { rootMargin: "160px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={targetRef} className="grid h-full w-full place-items-center">
            {url ? <img src={url} alt={file.originalName || "缓存图片"} loading="lazy" className="h-full w-full object-contain" /> : loading ? <Spin size="small" /> : error ? <TypeCover icon={<ImageIcon className="size-9" />} label="缩略图读取失败" /> : <ImageIcon className="size-9" />}
        </div>
    );
}

function TypeCover({ icon, label }: { icon: ReactNode; label: string }) {
    return <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--studio-text-muted)]">{icon}<span className="text-xs">{label}</span></span>;
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
