"use client";

import { Button, Card, Popconfirm, Space, Tag } from "antd";
import { ArrowDown, ArrowUp, Clapperboard, Pencil, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { hasNewerAssetVersion } from "../../assets/asset-version-references";
import { productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import type { StoryboardGroup, StoryboardShot } from "../utils/storyboard-management";

type StoryboardGroupCardProps = {
    group: StoryboardGroup;
    active: boolean;
    shotCount: number;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
};

export function StoryboardGroupCard({ group, active, shotCount, onSelect, onEdit, onDelete }: StoryboardGroupCardProps) {
    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-3 text-left transition ${active ? "border-stone-900 bg-stone-100 dark:border-stone-200 dark:bg-stone-800" : "border-stone-200 hover:border-stone-400 dark:border-stone-700"}`}
            onClick={onSelect}
        >
            <div className="flex items-start gap-2">
                <Clapperboard className="mt-0.5 size-4 shrink-0 text-stone-500" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{group.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{group.description || "暂无说明"}</div>
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-stone-400">{shotCount} 条分镜</span>
                <Space size={2} onClick={(event) => event.stopPropagation()}>
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个分镜组？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            </div>
        </button>
    );
}

type StoryboardShotCardProps = {
    shot: StoryboardShot;
    assetsById: Map<string, Asset>;
    bibleById: Map<string, ProductionBibleItem>;
    onUpdateAssetRef: (assetId: string) => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
};

export function StoryboardShotCard({ shot, assetsById, bibleById, onUpdateAssetRef, onEdit, onDelete, onMoveUp, onMoveDown }: StoryboardShotCardProps) {
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Tag className="m-0">镜 {shot.order}</Tag>
                    <span className="truncate">{shot.title}</span>
                </div>
            }
            extra={
                <Space size={2}>
                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} onClick={onMoveUp} />
                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} onClick={onMoveDown} />
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个分镜？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                <div className="line-clamp-3 whitespace-pre-wrap leading-6 text-stone-700 dark:text-stone-300">{shot.prompt || shot.description || "暂无提示词"}</div>
                <Space size={[4, 4]} wrap>
                    <Tag className="m-0">{shotStatusLabel(shot.status)}</Tag>
                    {shot.primaryAssetId ? <Tag className="m-0">主版本：{assetsById.get(shot.primaryAssetId)?.title || shot.primaryAssetId}</Tag> : null}
                    {shot.assetRefs.map((ref) => {
                        const asset = assetsById.get(ref.assetId);
                        const hasNewVersion = hasNewerAssetVersion(ref.assetVersion, asset);
                        return (
                            <Tag key={ref.assetId} color={hasNewVersion ? "gold" : undefined} className="m-0">
                                {asset?.title || ref.assetId} · {assetRoleLabel(ref.role)}
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
                    {(shot.productionBibleRefs || []).map((ref) => (
                        <Tag key={`${ref.kind}:${ref.itemId}`} className="m-0">
                            {productionBibleKindLabel(ref.kind)} · {bibleById.get(ref.itemId)?.name || ref.itemId}
                        </Tag>
                    ))}
                    {shot.nodeRefs.length ? <Tag className="m-0">已加入画布</Tag> : null}
                </Space>
                {shot.resultAssetIds.length ? (
                    <div className="rounded-lg bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-stone-900 dark:text-stone-400">
                        <div className="mb-1 font-medium text-stone-600 dark:text-stone-300">生成结果</div>
                        <div className="flex flex-wrap gap-1.5">
                            {shot.resultAssetIds.map((assetId) => (
                                <Tag key={assetId} className="m-0">
                                    {assetsById.get(assetId)?.title || assetId}
                                    {assetId === shot.primaryAssetId ? " · 主版本" : ""}
                                </Tag>
                            ))}
                        </div>
                    </div>
                ) : null}
                {shot.errorMessage ? <div className="rounded-lg bg-red-50 p-2 text-xs leading-5 text-red-600 dark:bg-red-950/30 dark:text-red-300">失败原因：{shot.errorMessage}</div> : null}
            </div>
        </Card>
    );
}

function assetRoleLabel(role: string) {
    return assetRoleOptions(role.includes("audio") ? "audio" : role.includes("video") || role === "source_video" ? "video" : "image").find((item) => item.value === role)?.label || role || "参考";
}

function assetRoleOptions(kind?: string) {
    if (kind === "audio") return [{ label: "音频参考", value: "reference_audio" }];
    if (kind === "video")
        return [
            { label: "视频参考", value: "reference_video" },
            { label: "源视频", value: "source_video" },
        ];
    return [
        { label: "普通参考", value: "reference_image" },
        { label: "首帧", value: "first_frame" },
        { label: "尾帧", value: "last_frame" },
    ];
}

function shotStatusLabel(status: string) {
    if (status === "ready") return "待生成";
    if (status === "in_canvas") return "已加入画布";
    if (status === "generating") return "生成中";
    if (status === "review") return "待复核";
    if (status === "done") return "已完成";
    if (status === "error") return "失败";
    return "草稿";
}
