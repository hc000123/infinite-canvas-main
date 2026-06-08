"use client";

import { Button, Card, Popconfirm, Space, Tag } from "antd";
import { FileText, Pencil, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { hasNewerAssetVersion } from "../../assets/asset-version-references";
import { productionBibleAssetRoleLabel, productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";

export function ProductionBibleCard({
    item,
    assetsById,
    onUpdateAssetRef,
    onCreateBrief,
    onEdit,
    onDelete,
}: {
    item: ProductionBibleItem;
    assetsById: Map<string, Asset>;
    onUpdateAssetRef: (assetId: string) => void;
    onCreateBrief: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const snippets = [
        item.promptSnippets.positive ? `正向：${item.promptSnippets.positive}` : "",
        item.promptSnippets.negative ? `反向：${item.promptSnippets.negative}` : "",
        item.promptSnippets.consistency ? `一致性：${item.promptSnippets.consistency}` : "",
    ].filter(Boolean);

    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Tag className="m-0 shrink-0">{productionBibleKindLabel(item.kind)}</Tag>
                    <span className="truncate">{item.name}</span>
                </div>
            }
            extra={
                <Space size={4}>
                    <Button size="small" type="text" icon={<FileText className="size-4" />} onClick={onCreateBrief} />
                    <Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={onEdit} />
                    <Popconfirm title="删除这个设定？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                {item.description ? <p className="m-0 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{item.description}</p> : <p className="m-0 text-stone-400">暂无描述</p>}
                {item.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                            <Tag key={tag} className="m-0">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                ) : null}
                {item.assetRefs.length ? (
                    <div className="flex flex-wrap gap-1.5">
                        {item.assetRefs.map((ref) => {
                            const asset = assetsById.get(ref.assetId);
                            const hasNewVersion = hasNewerAssetVersion(ref.assetVersion, asset);
                            return (
                                <Tag key={ref.assetId} color={hasNewVersion ? "gold" : undefined} className="m-0">
                                    {asset?.title || ref.assetId} · {productionBibleAssetRoleLabel(ref.role)}
                                    {hasNewVersion ? (
                                        <button
                                            type="button"
                                            className="ml-1 text-amber-700 underline underline-offset-2 dark:text-amber-300"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onUpdateAssetRef(ref.assetId);
                                            }}
                                        >
                                            更新
                                        </button>
                                    ) : null}
                                </Tag>
                            );
                        })}
                    </div>
                ) : null}
                {snippets.length ? <div className="line-clamp-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{snippets.join(" / ")}</div> : null}
            </div>
        </Card>
    );
}
