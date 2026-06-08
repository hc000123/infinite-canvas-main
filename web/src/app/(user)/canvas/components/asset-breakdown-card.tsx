"use client";

import { useState } from "react";
import { Button, Card, Popconfirm, Select, Space, Tag } from "antd";
import { FileText, Link2, Pencil, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import type { AssetBreakdownItem, AssetBreakdownKind } from "../utils/asset-breakdown";
import { productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";

export function AssetBreakdownCard({
    item,
    assets,
    bibleItems,
    onEdit,
    onDelete,
    onMatchBible,
    onBrief,
    onBindAssets,
}: {
    item: AssetBreakdownItem;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onEdit: () => void;
    onDelete: () => void;
    onMatchBible: () => void;
    onBrief: () => void;
    onBindAssets: (assetIds: string[]) => void;
}) {
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const bibleItem = bibleItems.find((bible) => bible.id === item.productionBibleItemId);
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Tag className="m-0">{cardKindLabel(item.kind)}</Tag>
                    <span className="truncate">{item.name}</span>
                    <Tag className="m-0">{statusLabel(item.status)}</Tag>
                </div>
            }
            extra={
                <Space size={4}>
                    <Button size="small" type="text" icon={<FileText className="size-4" />} onClick={onBrief} />
                    <Button size="small" type="text" icon={<Link2 className="size-4" />} onClick={onMatchBible} disabled={item.kind === "style"} />
                    <Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={onEdit} />
                    <Popconfirm title="删除这个资产条目？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-3 text-sm">
                <p className="m-0 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{item.description || item.sourceText || "暂无描述"}</p>
                <Space size={[4, 4]} wrap>
                    {item.tags.map((tag) => (
                        <Tag key={tag} className="m-0">
                            {tag}
                        </Tag>
                    ))}
                    {bibleItem ? (
                        <Tag color="blue" className="m-0">
                            设定库：{productionBibleKindLabel(bibleItem.kind)} · {bibleItem.name}
                        </Tag>
                    ) : null}
                    {item.briefDraft ? (
                        <Tag color="purple" className="m-0">
                            Brief：{item.briefDraft.title}
                        </Tag>
                    ) : null}
                    {item.assetIds.map((assetId) => (
                        <Tag key={assetId} color="green" className="m-0">
                            素材：{assets.find((asset) => asset.id === assetId)?.title || assetId}
                        </Tag>
                    ))}
                </Space>
                {item.briefDraft ? <pre className="max-h-32 overflow-auto rounded bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-stone-900 dark:text-stone-400">{item.briefDraft.prompt}</pre> : null}
                <div className="flex flex-wrap items-center gap-2">
                    <Select mode="tags" className="min-w-72 flex-1" placeholder="选择或粘贴素材 ID 绑定到该资产" value={selectedAssetIds} options={assets.map((asset) => ({ label: asset.title, value: asset.id }))} onChange={setSelectedAssetIds} />
                    <Button size="small" disabled={!selectedAssetIds.length} onClick={() => onBindAssets(selectedAssetIds)}>
                        绑定素材
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function statusLabel(status: AssetBreakdownItem["status"]) {
    if (status === "brief_ready") return "Brief 草稿";
    if (status === "generated") return "已生成";
    if (status === "linked") return "已关联";
    return "草稿";
}

function cardKindLabel(kind: AssetBreakdownKind) {
    if (kind === "character") return "角色";
    if (kind === "scene") return "场景";
    if (kind === "prop") return "道具";
    return "风格 / 光影";
}
