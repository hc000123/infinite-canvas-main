"use client";

import { useRouter } from "next/navigation";
import { Button, Popover, Tag } from "antd";
import { Check, ChevronRight, ImageOff, Layers3 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImageAsset } from "@/stores/use-asset-store";
import { assetCategoryLabel } from "../../assets/asset-subjects";
import { resolveSubjectPickerAsset, type AssetSubjectPickerItem } from "../utils/asset-subject-picker";

export function AssetSubjectPickerCard({ item, selectedKeys, disabled, onSelect }: { item: AssetSubjectPickerItem; selectedKeys: ReadonlySet<string>; disabled?: boolean; onSelect: (asset: ImageAsset) => void }) {
    const router = useRouter();
    const current = item.currentAsset;
    const selected = item.assets.some((asset) => selectedKeys.has(`local:${asset.id}`));
    const openOrSelect = () => {
        if (!current) return router.push(`/assets/${item.subject.id}`);
        onSelect(current);
    };
    const versions = (
        <div className="grid max-h-80 min-w-72 gap-3 overflow-y-auto pr-1">
            {item.variants.map((variant) => {
                const variantAssets = item.assets.filter((asset) => asset.assetBinding?.variantId === variant.id || (!asset.assetBinding?.variantId && asset.assetBinding?.variantName === variant.name));
                const currentAsset = resolveSubjectPickerAsset(item, { variantId: variant.id });
                if (!variantAssets.length) return null;
                return (
                    <section key={variant.id}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium"><span>{variant.name}</span><span className="text-[var(--studio-text-muted)]">{variantAssets.length} 个版本</span></div>
                        <div className="grid grid-cols-3 gap-2">
                            {variantAssets.map((asset) => {
                                const isCurrent = asset.id === currentAsset?.id;
                                const isSelected = selectedKeys.has(`local:${asset.id}`);
                                return <button key={asset.id} type="button" disabled={disabled} title={asset.title} className={cn("relative overflow-hidden rounded-md border text-left", isSelected ? "border-[var(--studio-accent)] ring-2 ring-[var(--studio-focus-ring)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-accent)]")} onClick={() => onSelect(asset)}><img src={asset.coverUrl || asset.data.dataUrl} alt={asset.title} className="aspect-square w-full object-cover" />{isCurrent ? <span className="absolute bottom-1 left-1 rounded bg-[var(--studio-media-overlay)] px-1.5 py-0.5 text-[9px] text-[var(--studio-on-media)]">当前</span> : null}{isSelected ? <Check className="absolute right-1 top-1 size-4 rounded-full bg-[var(--studio-accent)] p-0.5 text-[var(--primary-foreground)]" /> : null}</button>;
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );

    return (
        <article className={cn("group overflow-hidden rounded-lg border bg-[var(--studio-panel-bg)] transition", selected ? "border-[var(--studio-accent)] ring-2 ring-[var(--studio-focus-ring)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)]")}>
            <button type="button" disabled={disabled} className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--studio-panel-muted-bg)] text-left" onClick={openOrSelect}>
                {current ? <img src={current.coverUrl || current.data.dataUrl} alt={item.subject.name} className="size-full object-cover transition group-hover:scale-[1.02]" /> : <span className="flex size-full flex-col items-center justify-center gap-2 text-[var(--studio-text-muted)]"><ImageOff className="size-7" /><span className="text-xs">尚无当前版本</span></span>}
                <Tag bordered={false} className="!absolute !left-2 !top-2 !m-0">{assetCategoryLabel(item.subject.category)}</Tag>
                {selected ? <Check className="absolute right-2 top-2 size-5 rounded-full bg-[var(--studio-accent)] p-1 text-[var(--primary-foreground)]" /> : null}
            </button>
            <div className="p-2.5">
                <button type="button" disabled={disabled} className="block w-full text-left" onClick={openOrSelect}>
                    <span className="block truncate text-sm font-semibold text-[var(--studio-text-primary)]">{item.subject.name}</span>
                    <span className="mt-1 block truncate text-[11px] text-[var(--studio-text-muted)]">{item.subject.code} · {item.variants.length} 个形态</span>
                </button>
                {item.status === "ready" ? <Popover trigger="click" placement="bottom" content={versions}><Button block type="text" size="small" className="!mt-2 !justify-between" icon={<Layers3 className="size-3.5" />}>选择形态或版本 <ChevronRight className="size-3.5" /></Button></Popover> : <Button block type="text" size="small" className="!mt-2 !justify-between" onClick={openOrSelect}>去完善资产 <ChevronRight className="size-3.5" /></Button>}
            </div>
        </article>
    );
}
