"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Tabs, Tag } from "antd";
import { Layers3, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetCategory } from "@/stores/use-asset-store";
import { assetCategoryLabel } from "../../assets/asset-subjects";
import { buildInsertAssetPayload, type InsertAssetPayload } from "../utils/asset-insert-payload";
import { buildAssetSubjectPickerItems } from "../utils/asset-subject-picker";
import { AssetSubjectPickerCard } from "./asset-subject-picker-card";

export type AssetPickerTab = "episode-assets" | "my-assets";
type AssetPickerKind = InsertAssetPayload["kind"];
type PickerSelection = { key: string; kind: AssetPickerKind; title: string; resolve: () => Promise<InsertAssetPayload> };
type SelectionControls = {
    disabled: boolean;
    onSetMany: (items: PickerSelection[], selected: boolean) => void;
    onToggle: (item: PickerSelection) => void;
    selectedKeys: ReadonlySet<string>;
};
export type { InsertAssetPayload } from "../utils/asset-insert-payload";

type Props = {
    open: boolean;
    title?: string;
    defaultTab?: AssetPickerTab;
    allowedKinds?: AssetPickerKind[];
    projectId?: string;
    episodeId?: string;
    onInsert: (payload: InsertAssetPayload) => void | Promise<void>;
    onClose: () => void;
};

export function AssetPickerModal({ open, title = "选择素材", defaultTab = "my-assets", allowedKinds, projectId, episodeId, onInsert, onClose }: Props) {
    const { message } = App.useApp();
    const contextualTab = projectId && episodeId && defaultTab === "my-assets" ? "episode-assets" : defaultTab;
    const [activeTab, setActiveTab] = useState<AssetPickerTab>(contextualTab);
    const [selected, setSelected] = useState<Map<string, PickerSelection>>(new Map());
    const [importing, setImporting] = useState(false);
    const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);

    useEffect(() => {
        if (!open) return;
        setActiveTab(contextualTab);
        setSelected(new Map());
        setImporting(false);
    }, [contextualTab, open]);

    const toggleSelection = useCallback((item: PickerSelection) => {
        setSelected((current) => {
            const next = new Map(current);
            if (next.has(item.key)) next.delete(item.key);
            else next.set(item.key, item);
            return next;
        });
    }, []);

    const setManySelected = useCallback((items: PickerSelection[], shouldSelect: boolean) => {
        setSelected((current) => {
            const next = new Map(current);
            items.forEach((item) => (shouldSelect ? next.set(item.key, item) : next.delete(item.key)));
            return next;
        });
    }, []);

    const insertSelected = async () => {
        if (!selected.size || importing) return;
        setImporting(true);
        let inserted = 0;
        let failed = 0;
        for (const item of selected.values()) {
            try {
                await onInsert(await item.resolve());
                inserted += 1;
            } catch {
                failed += 1;
            }
        }
        setImporting(false);
        if (inserted) {
            if (failed) message.warning(`已导入 ${inserted} 个素材，${failed} 个失败`);
            else message.success(`已导入 ${inserted} 个素材`);
            onClose();
        } else {
            message.error("所选素材导入失败，请检查素材文件后重试");
        }
    };

    const selection: SelectionControls = { disabled: importing, onSetMany: setManySelected, onToggle: toggleSelection, selectedKeys };

    return (
        <Modal
            rootClassName="studio-modal"
            title={title}
            open={open}
            onCancel={() => {
                if (!importing) onClose();
            }}
            footer={null}
            width={980}
            closable={!importing}
            keyboard={!importing}
            mask={{ closable: !importing }}
            destroyOnHidden
            styles={{ body: { padding: "0 24px 20px", minHeight: 560 } }}
        >
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as AssetPickerTab)}
                items={[
                    ...(projectId && episodeId ? [{ key: "episode-assets", label: "本集资产", children: <SubjectAssetsTab projectId={projectId} episodeId={episodeId} allowedKinds={allowedKinds} selection={selection} /> }] : []),
                    { key: "my-assets", label: "全部本地资产", children: <SubjectAssetsTab projectId={projectId} allowedKinds={allowedKinds} selection={selection} /> },
                ]}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--studio-border-subtle)] pt-4">
                <div className="text-sm text-[var(--studio-text-secondary)]">
                    已选 <span className="font-semibold text-[var(--studio-accent)]">{selected.size}</span> 个素材
                    <span className="ml-2 text-xs text-[var(--studio-text-muted)]">切换 Tab、筛选或翻页不会丢失选择</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button disabled={!selected.size || importing} onClick={() => setSelected(new Map())}>
                        清空选择
                    </Button>
                    <Button type="primary" icon={<Layers3 className="size-4" />} loading={importing} disabled={!selected.size} onClick={() => void insertSelected()}>
                        导入所选（{selected.size}）
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function SubjectAssetsTab({ projectId, episodeId, allowedKinds, selection }: { projectId?: string; episodeId?: string; allowedKinds?: AssetPickerKind[]; selection: SelectionControls }) {
    const assets = useAssetStore((state) => state.assets);
    const subjects = useAssetStore((state) => state.subjects);
    const variants = useAssetStore((state) => state.variants);
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState<AssetCategory | "all">("all");
    const supportsImages = !allowedKinds || allowedKinds.includes("image");
    const items = useMemo(() => supportsImages ? buildAssetSubjectPickerItems({ subjects, variants, assets, projectId, episodeId }) : [], [assets, episodeId, projectId, subjects, supportsImages, variants]);
    const visible = useMemo(() => {
        const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return items.filter((item) => (category === "all" || item.subject.category === category) && matchesTerms([item.subject.name, item.subject.code, ...item.subject.tags, ...item.variants.map((variant) => variant.name)], terms));
    }, [category, items, keyword]);
    const currentSelections = useMemo(() => visible.flatMap((item) => item.currentAsset ? [localAssetSelection(item.currentAsset)] : []), [visible]);
    const allCurrentSelected = currentSelections.length > 0 && currentSelections.every((item) => selection.selectedKeys.has(item.key));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input className="min-w-56 flex-1" size="small" allowClear prefix={<Search className="size-3.5 text-[var(--studio-text-muted)]" />} placeholder="搜索资产主体、编号、标签或形态" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                <div className="flex flex-wrap gap-1.5">
                    {(["all", "character", "scene", "prop", "blocking", "other"] as const).map((value) => <Tag.CheckableTag key={value} checked={category === value} className={cn("prompt-filter-tag", category === value && "is-active")} onChange={() => setCategory(value)}>{value === "all" ? "全部分类" : assetCategoryLabel(value)}</Tag.CheckableTag>)}
                </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
                <span className="text-xs text-[var(--studio-text-muted)]">{visible.length} 个主体 · 点击卡片默认选择基础形态当前版本</span>
                <Button size="small" disabled={!currentSelections.length || selection.disabled} onClick={() => selection.onSetMany(currentSelections, !allCurrentSelected)}>{allCurrentSelected ? "取消全选" : "选择全部当前版本"}</Button>
            </div>
            {visible.length ? <div className="grid max-h-[405px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">{visible.map((item) => <AssetSubjectPickerCard key={item.subject.id} item={item} selectedKeys={selection.selectedKeys} disabled={selection.disabled} onSelect={(asset) => selection.onToggle(localAssetSelection(asset))} />)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={supportsImages ? "没有符合条件的资产主体" : "当前插入类型不支持主体图片"} className="py-16" />}
        </div>
    );
}

function localAssetSelection(asset: Asset): PickerSelection {
    return { key: `local:${asset.id}`, kind: asset.kind, title: asset.title, resolve: async () => buildInsertAssetPayload(asset) };
}

function matchesTerms(values: Array<string | undefined>, terms: string[]) {
    if (!terms.length) return true;
    const text = values.filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
}
