"use client";

import { Badge, Tag } from "antd";

import type { AssetCategory } from "@/stores/use-asset-store";

export type AssetCenterView = "all" | AssetCategory | "inbox";

const items: Array<{ value: AssetCenterView; label: string }> = [
    { value: "all", label: "全部主体" },
    { value: "character", label: "角色" },
    { value: "scene", label: "场景" },
    { value: "prop", label: "道具" },
    { value: "blocking", label: "站位" },
    { value: "other", label: "其他" },
    { value: "inbox", label: "待整理" },
];

export function AssetCenterNav({ value, counts, inboxCount, onChange }: { value: AssetCenterView; counts: Record<"all" | AssetCategory, number>; inboxCount: number; onChange: (value: AssetCenterView) => void }) {
    return (
        <nav aria-label="资产中心分类" className="mx-auto mb-5 flex max-w-[1680px] flex-wrap items-center gap-1 border-b border-[var(--studio-border-subtle)] pb-3">
            {items.map((item) => {
                const count = item.value === "inbox" ? inboxCount : counts[item.value];
                return (
                    <Tag.CheckableTag key={item.value} checked={value === item.value} className="!m-0 !rounded-md !px-3 !py-1.5 !text-sm" onChange={() => onChange(item.value)}>
                        <span className="inline-flex items-center gap-2">{item.label}<Badge count={count} showZero color="var(--studio-accent)" overflowCount={999} /></span>
                    </Tag.CheckableTag>
                );
            })}
        </nav>
    );
}
