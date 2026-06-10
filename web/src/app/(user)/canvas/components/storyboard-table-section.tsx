"use client";

import { Button, Card, Empty, Select, Space } from "antd";
import { Plus } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import type { CanvasProject } from "../stores/use-canvas-store";
import { buildShotGroupGenerationTableRows, type StoryboardTableShot } from "../utils/storyboard-management";
import { ShotGroupRowCard, StoryboardTableShotCard } from "./storyboard-shot-group-components";

type ShotGroupRow = ReturnType<typeof buildShotGroupGenerationTableRows>[number];

export function StoryboardTableSection({
    boundCanvases,
    activeTableCanvas,
    activeTableShots,
    selectedTableShotIds,
    shotGroupRows,
    assetsById,
    onActiveTableCanvasChange,
    onAddTableShot,
    onCreateBrief,
    onCreateSelectedShotGroup,
    onDeleteShotGroup,
    onDeleteTableShot,
    onEditShotGroup,
    onEditTableShot,
    onGenerateTableDrafts,
    onMoveTableShot,
    onToggleTableShot,
    onAddShotGroupToCanvas,
}: {
    boundCanvases: CanvasProject[];
    activeTableCanvas: CanvasProject | null;
    activeTableShots: StoryboardTableShot[];
    selectedTableShotIds: string[];
    shotGroupRows: ShotGroupRow[];
    assetsById: Map<string, Asset>;
    onActiveTableCanvasChange: (canvasId: string) => void;
    onAddTableShot: () => void;
    onCreateBrief: (row: ShotGroupRow) => void;
    onCreateSelectedShotGroup: () => void;
    onDeleteShotGroup: (groupId: string) => void;
    onDeleteTableShot: (shotId: string) => void;
    onEditShotGroup: (row: ShotGroupRow) => void;
    onEditTableShot: (shot: StoryboardTableShot) => void;
    onGenerateTableDrafts: () => void;
    onMoveTableShot: (shotId: string, direction: "up" | "down") => void;
    onToggleTableShot: (shotId: string, checked: boolean) => void;
    onAddShotGroupToCanvas: (groupId: string) => void;
}) {
    return (
        <Card
            size="small"
            className="mb-4"
            title="分镜头表 / 生成表"
            extra={
                <Space size={6} wrap>
                    <Button size="small" disabled={!activeTableCanvas} onClick={onGenerateTableDrafts}>
                        从本集剧本生成草案
                    </Button>
                    <Button size="small" disabled={!activeTableCanvas} icon={<Plus className="size-3.5" />} onClick={onAddTableShot}>
                        新增分镜头
                    </Button>
                    <Button size="small" type="primary" disabled={selectedTableShotIds.length === 0} onClick={onCreateSelectedShotGroup}>
                        组合生成镜头组
                    </Button>
                </Space>
            }
        >
            {boundCanvases.length ? (
                <div className="space-y-4">
                    <Select
                        size="small"
                        className="min-w-64"
                        value={activeTableCanvas?.id}
                        options={boundCanvases.map((canvas) => ({ label: `${canvas.episodeTitle || "本集"} · ${canvas.title}`, value: canvas.id }))}
                        onChange={onActiveTableCanvasChange}
                    />
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-stone-500">
                                <span>分镜头表：{activeTableShots.length} 条</span>
                                <span>已选择 {selectedTableShotIds.length} 条连续镜头可组合</span>
                            </div>
                            {activeTableShots.length ? (
                                activeTableShots.map((shot) => (
                                    <StoryboardTableShotCard
                                        key={shot.id}
                                        shot={shot}
                                        checked={selectedTableShotIds.includes(shot.id)}
                                        onCheckedChange={(checked) => onToggleTableShot(shot.id, checked)}
                                        onEdit={() => onEditTableShot(shot)}
                                        onDelete={() => onDeleteTableShot(shot.id)}
                                        onMoveUp={() => onMoveTableShot(shot.id, "up")}
                                        onMoveDown={() => onMoveTableShot(shot.id, "down")}
                                    />
                                ))
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分镜头草案" className="py-8" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <div className="text-xs text-stone-500">生成表：{shotGroupRows.length} 组</div>
                            {shotGroupRows.length ? (
                                shotGroupRows.map((row) => (
                                    <ShotGroupRowCard
                                        key={row.group.id}
                                        row={row}
                                        assetsById={assetsById}
                                        onEdit={() => onEditShotGroup(row)}
                                        onDelete={() => onDeleteShotGroup(row.group.id)}
                                        onAddToCanvas={() => onAddShotGroupToCanvas(row.group.id)}
                                        onCreateBrief={() => onCreateBrief(row)}
                                    />
                                ))
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生成镜头组" className="py-8" />
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目暂无绑定本集剧本的画布" className="py-8" />
            )}
        </Card>
    );
}
