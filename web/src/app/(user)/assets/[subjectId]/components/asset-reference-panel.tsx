"use client";

import { Button, Empty, Tooltip } from "antd";
import { Images, Link2, Trash2, Upload } from "lucide-react";

import type { AssetWorkbenchImage } from "@/stores/use-asset-store";

export function AssetReferencePanel({ references, sourceMissing, onOpenPicker, onRemove, onUpload }: { references: AssetWorkbenchImage[]; sourceMissing: (image: AssetWorkbenchImage) => boolean; onOpenPicker: () => void; onRemove: (id: string) => void; onUpload: () => void }) {
    return (
        <section className="rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-[var(--studio-text-primary)]">参考资料</h2>
                    <p className="mt-0.5 text-xs text-[var(--studio-text-muted)]">仅作用于当前形态</p>
                </div>
                <div className="flex items-center gap-1">
                    <Button type="text" size="small" icon={<Link2 className="size-3.5" />} onClick={onOpenPicker}>从资产引用</Button>
                    <Button type="text" size="small" icon={<Upload className="size-3.5" />} onClick={onUpload}>上传</Button>
                </div>
            </div>
            {references.length ? (
                <div className="grid grid-cols-3 gap-2">
                    {references.map((image) => (
                        <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--studio-elevated-bg)]">
                            <img src={image.dataUrl} alt={image.title} className="h-full w-full object-cover" />
                            {sourceMissing(image) ? <span className="absolute bottom-1 left-1 rounded bg-[var(--studio-media-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--studio-on-media)]">来源已删除</span> : null}
                            <Tooltip title="移除参考图"><Button type="text" size="small" className="!absolute !right-1 !top-1 !h-7 !w-7 !min-w-7 !bg-[var(--studio-media-overlay)] !p-0 !text-[var(--studio-on-media)] opacity-0 group-hover:opacity-100" icon={<Trash2 className="size-3.5" />} onClick={() => onRemove(image.id)} /></Tooltip>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={<Images className="mx-auto size-7 text-[var(--studio-text-muted)]" />} description={<span className="text-xs">暂无参考图</span>} className="!my-4" />
            )}
        </section>
    );
}
