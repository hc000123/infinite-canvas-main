"use client";

import { useEffect, useMemo, useState } from "react";
import { Empty, Input, Modal, Segmented, Tag } from "antd";
import { Search } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { filterReferenceAssets, referenceAssetProjectId, type AssetReferenceScope } from "../../asset-workbench";

export function AssetReferencePicker({ assets, currentProjectId, open, projectTitles, onCancel, onSelect }: { assets: Asset[]; currentProjectId: string; open: boolean; projectTitles: Record<string, string>; onCancel: () => void; onSelect: (asset: Asset) => void }) {
    const [scope, setScope] = useState<AssetReferenceScope>("project");
    const [keyword, setKeyword] = useState("");
    useEffect(() => {
        if (!open) return;
        setScope("project");
        setKeyword("");
    }, [open]);
    const visibleAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return filterReferenceAssets(assets, currentProjectId, scope).filter((asset) => !query || [asset.title, asset.assetBinding?.variantName, asset.assetBinding?.subjectId].filter(Boolean).join(" ").toLowerCase().includes(query));
    }, [assets, currentProjectId, keyword, scope]);

    return (
        <Modal open={open} title="从资产版本添加参考图" footer={null} width={820} onCancel={onCancel} destroyOnHidden>
            <div className="mb-4 mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Segmented value={scope} options={[{ label: "当前项目", value: "project" }, { label: "全部项目", value: "all" }]} onChange={(value) => setScope(value as AssetReferenceScope)} />
                <Input allowClear className="sm:w-64" prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} value={keyword} placeholder="搜索主体、形态或资产" onChange={(event) => setKeyword(event.target.value)} />
            </div>
            {visibleAssets.length ? (
                <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                    {visibleAssets.map((asset) => {
                        const projectId = referenceAssetProjectId(asset);
                        return (
                            <button key={asset.id} type="button" className="group overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-left transition hover:border-[var(--studio-accent)]" onClick={() => onSelect(asset)}>
                                <div className="aspect-square overflow-hidden bg-[var(--studio-elevated-bg)]"><img src={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")} alt={asset.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /></div>
                                <div className="p-2.5"><div className="truncate text-sm font-medium">{asset.title}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--studio-text-muted)]"><span>来源项目</span><Tag variant="filled" className="!m-0 !max-w-28 !truncate">{projectTitles[projectId] || projectId || "未归属"}</Tag></div></div>
                            </button>
                        );
                    })}
                </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围没有可引用的图片资产" className="!my-16" />}
        </Modal>
    );
}
