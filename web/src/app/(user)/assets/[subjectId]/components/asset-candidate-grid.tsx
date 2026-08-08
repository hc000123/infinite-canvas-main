"use client";

import { Button, Dropdown, Empty, Tag, type MenuProps } from "antd";
import { Check, Download, ImagePlus, LoaderCircle, MoreHorizontal, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";

import type { AssetWorkbenchImage } from "@/stores/use-asset-store";
import type { WorkbenchGenerationSlot } from "../use-asset-workbench-generation";

export function AssetCandidateGrid({ candidates, running, slots = [], onCopy, onDelete, onGenerate, onPromote, onRetry, onUpload, onUseAsReference }: { candidates: AssetWorkbenchImage[]; running?: boolean; slots?: WorkbenchGenerationSlot[]; onCopy: (image: AssetWorkbenchImage) => void; onDelete: (image: AssetWorkbenchImage) => void; onGenerate: () => void; onPromote: (image: AssetWorkbenchImage) => void; onRetry: (slotId: string) => void; onUpload: () => void; onUseAsReference: (image: AssetWorkbenchImage) => void }) {
    return (
        <section className="rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-[var(--studio-text-primary)]">候选池</h2>
                    <p className="mt-1 text-xs text-[var(--studio-text-muted)]">生成和上传的图片先在这里挑选，不会直接污染正式资产。</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button icon={<Upload className="size-4" />} onClick={onUpload}>上传候选</Button>
                    <Button type="primary" icon={<Sparkles className="size-4" />} loading={running} onClick={onGenerate}>生成候选</Button>
                </div>
            </div>
            {candidates.length || slots.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                    {slots.map((slot) => <div key={slot.id} className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4 text-center">{slot.status === "pending" ? <><LoaderCircle className="mb-3 size-6 animate-spin text-[var(--studio-accent)]" /><div className="text-sm font-medium">正在生成候选</div></> : <><div className="line-clamp-3 text-xs text-[var(--studio-danger)]">{slot.error || "生成失败"}</div><Button className="!mt-3" size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => onRetry(slot.id)}>重试</Button></>}</div>)}
                    {candidates.map((image) => {
                        const menu: MenuProps = {
                            items: [
                                { key: "reference", icon: <ImagePlus className="size-3.5" />, label: "作为参考图" },
                                { key: "copy", icon: <Sparkles className="size-3.5" />, label: "复制到其他形态" },
                                { key: "download", icon: <Download className="size-3.5" />, label: "下载" },
                                { type: "divider" },
                                { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除候选" },
                            ],
                            onClick: ({ key }) => {
                                if (key === "reference") onUseAsReference(image);
                                else if (key === "copy") onCopy(image);
                                else if (key === "delete") onDelete(image);
                                else downloadImage(image);
                            },
                        };
                        return (
                            <article key={image.id} className="group overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                                <div className="relative aspect-square overflow-hidden bg-[var(--studio-elevated-bg)]">
                                    <img src={image.dataUrl} alt={image.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                                    <div className="absolute left-2 top-2"><Tag bordered={false} color={image.source === "generated" ? "blue" : "default"}>{image.source === "generated" ? "生成" : "上传"}</Tag></div>
                                    <Dropdown menu={menu} trigger={["click"]}><Button type="text" className="!absolute !right-2 !top-2 !h-8 !w-8 !min-w-8 !bg-[var(--studio-media-overlay)] !p-0 !text-[var(--studio-on-media)]" icon={<MoreHorizontal className="size-4" />} /></Dropdown>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-2.5">
                                    <div className="min-w-0"><div className="truncate text-sm font-medium">{image.title}</div><div className="mt-0.5 text-[11px] text-[var(--studio-text-muted)]">{image.width} × {image.height}</div></div>
                                    <Button type={image.selectedAssetId ? "default" : "primary"} size="small" disabled={Boolean(image.selectedAssetId)} icon={<Check className="size-3.5" />} onClick={() => onPromote(image)}>{image.selectedAssetId ? "已选" : "选为资产"}</Button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : <Empty image={<ImagePlus className="mx-auto size-10 text-[var(--studio-text-muted)]" />} description="还没有候选图，上传图片或开始第一次生成" className="!my-14" />}
        </section>
    );
}

function downloadImage(image: AssetWorkbenchImage) {
    const anchor = document.createElement("a");
    anchor.href = image.dataUrl;
    anchor.download = `${image.title || "候选图"}.png`;
    anchor.click();
}
