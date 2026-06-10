"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag } from "antd";
import { ArrowDown, ArrowUp, Clapperboard, Download, Film, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { saveAs } from "file-saver";

import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";
import { hasNewerAssetVersion, preserveOrCreateAssetVersionReferences, updateAssetRefListToLatest } from "../../assets/asset-version-references";
import { useGenerationQueueStore } from "../stores/use-generation-queue-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import type { CanvasProject } from "../stores/use-canvas-store";
import type { CanvasNodeData } from "../types";
import { ShotGroupFormModal, ShotGroupRowCard, StoryboardTableShotCard, TableShotFormModal } from "./storyboard-shot-group-components";
import { buildGenerationQueuePlan, summarizeGenerationQueue, type GenerationQueueItem, type GenerationQueueMissingItem, type GenerationQueueSummary } from "../utils/generation-queue";
import { itemsForProductionBibleProject, productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import { buildStoryboardClipExportPlan, type StoryboardClipExportPlan } from "../utils/storyboard-clip-export";
import {
    buildShotGroupGenerationTableRows,
    orderedShotGroups,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    orderedStoryboardTableShots,
    type ShotGroup,
    type StoryboardAssetKind,
    type StoryboardAssetRef,
    type StoryboardGroup,
    type StoryboardProductionBibleRef,
    type StoryboardShot,
    type StoryboardTableShot,
} from "../utils/storyboard-management";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    initialGroupId?: string;
    canvases?: CanvasProject[];
    canvasNodes: CanvasNodeData[];
    onClose: () => void;
    onAddGroupToCanvas: (groupId: string) => void;
    onAddShotGroupToCanvas?: (groupId: string) => void;
};

type GroupFormValues = {
    title: string;
    description?: string;
};

type ShotFormValues = {
    title: string;
    description?: string;
    prompt?: string;
    effectivePrompt?: string;
    assetIds?: string[];
    productionBibleIds?: string[];
};

const mediaKinds = new Set<AssetKind>(["image", "video", "audio"]);
const emptySelection: string[] = [];

export function StoryboardManagerDrawer({ open, projectId, projectTitle, initialGroupId, canvases = [], canvasNodes, onClose, onAddGroupToCanvas, onAddShotGroupToCanvas }: Props) {
    const { message } = App.useApp();
    const groups = useStoryboardStore((state) => state.groups);
    const shots = useStoryboardStore((state) => state.shots);
    const tableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const addGroup = useStoryboardStore((state) => state.addGroup);
    const updateGroup = useStoryboardStore((state) => state.updateGroup);
    const removeGroup = useStoryboardStore((state) => state.removeGroup);
    const addShot = useStoryboardStore((state) => state.addShot);
    const updateShot = useStoryboardStore((state) => state.updateShot);
    const removeShot = useStoryboardStore((state) => state.removeShot);
    const moveShot = useStoryboardStore((state) => state.moveShot);
    const generateTableShotsFromScript = useStoryboardStore((state) => state.generateTableShotsFromScript);
    const addTableShot = useStoryboardStore((state) => state.addTableShot);
    const updateTableShot = useStoryboardStore((state) => state.updateTableShot);
    const removeTableShot = useStoryboardStore((state) => state.removeTableShot);
    const moveTableShot = useStoryboardStore((state) => state.moveTableShot);
    const createShotGroup = useStoryboardStore((state) => state.createShotGroup);
    const updateShotGroup = useStoryboardStore((state) => state.updateShotGroup);
    const removeShotGroup = useStoryboardStore((state) => state.removeShotGroup);
    const queueItems = useGenerationQueueStore((state) => state.items);
    const queuePaused = useGenerationQueueStore((state) => state.paused);
    const queueConcurrency = useGenerationQueueStore((state) => state.concurrency);
    const setQueueConcurrency = useGenerationQueueStore((state) => state.setConcurrency);
    const replaceGroupQueueItems = useGenerationQueueStore((state) => state.replaceGroupItems);
    const startQueue = useGenerationQueueStore((state) => state.startQueue);
    const pauseQueue = useGenerationQueueStore((state) => state.pauseQueue);
    const resumeQueue = useGenerationQueueStore((state) => state.resumeQueue);
    const cancelQueue = useGenerationQueueStore((state) => state.cancelQueue);
    const retryQueueItem = useGenerationQueueStore((state) => state.retryItem);
    const retryFailedQueue = useGenerationQueueStore((state) => state.retryFailed);
    const createBriefFromShotGroup = useImageBriefStore((state) => state.createFromShotGroup);
    const assets = useAssetStore((state) => state.assets);
    const bibleItems = useProductionBibleStore((state) => state.items);
    const projectGroups = useMemo(() => orderedStoryboardGroups(groups, projectId), [groups, projectId]);
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(bibleItems, projectId), [bibleItems, projectId]);
    const mediaAssets = useMemo(() => assets.filter((asset) => mediaKinds.has(asset.kind)), [assets]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const bibleById = useMemo(() => new Map(projectBibleItems.map((item) => [item.id, item])), [projectBibleItems]);
    const [activeGroupId, setActiveGroupId] = useState("");
    const [editingGroup, setEditingGroup] = useState<StoryboardGroup | null>(null);
    const [groupFormOpen, setGroupFormOpen] = useState(false);
    const [editingShot, setEditingShot] = useState<StoryboardShot | null>(null);
    const [shotFormOpen, setShotFormOpen] = useState(false);
    const [activeTableCanvasId, setActiveTableCanvasId] = useState("");
    const [selectedTableShotIds, setSelectedTableShotIds] = useState<string[]>([]);
    const [editingTableShot, setEditingTableShot] = useState<StoryboardTableShot | null>(null);
    const [tableShotFormOpen, setTableShotFormOpen] = useState(false);
    const [editingShotGroup, setEditingShotGroup] = useState<ShotGroup | null>(null);
    const [shotGroupFormOpen, setShotGroupFormOpen] = useState(false);
    const [exportingClipPackage, setExportingClipPackage] = useState(false);
    const boundCanvases = useMemo(() => canvases.filter((canvas) => canvas.episodeId && canvas.scriptSnapshot), [canvases]);
    const activeTableCanvas = boundCanvases.find((canvas) => canvas.id === activeTableCanvasId) || boundCanvases[0] || null;
    const activeTableShots = useMemo(() => (activeTableCanvas?.episodeId ? orderedStoryboardTableShots(tableShots, activeTableCanvas.id, activeTableCanvas.episodeId) : []), [activeTableCanvas, tableShots]);
    const activeShotGroups = useMemo(() => (activeTableCanvas?.episodeId ? orderedShotGroups(shotGroups, activeTableCanvas.id, activeTableCanvas.episodeId) : []), [activeTableCanvas, shotGroups]);
    const shotGroupRows = useMemo(() => buildShotGroupGenerationTableRows(activeShotGroups, activeTableShots), [activeShotGroups, activeTableShots]);
    const activeGroup = projectGroups.find((group) => group.id === activeGroupId) || projectGroups[0] || null;
    const activeShots = useMemo(() => (activeGroup ? orderedStoryboardShots(shots, activeGroup.id) : []), [activeGroup, shots]);
    const queuePlan = useMemo(
        () => (activeGroup ? buildGenerationQueuePlan({ projectId, group: activeGroup, shots: activeShots, nodes: canvasNodes, idFactory: (index) => `queue-${activeGroup.id}-${Date.now()}-${index}` }) : null),
        [activeGroup, activeShots, canvasNodes, projectId],
    );
    const activeQueueItems = useMemo(() => (activeGroup ? queueItems.filter((item) => item.projectId === projectId && item.storyboardGroupId === activeGroup.id).sort((a, b) => a.priority - b.priority) : []), [activeGroup, projectId, queueItems]);
    const activeQueueSummary = useMemo(() => summarizeGenerationQueue(activeQueueItems.length ? activeQueueItems : queuePlan?.items || [], queuePlan?.missing || []), [activeQueueItems, queuePlan]);

    useEffect(() => {
        if (!open) return;
        setActiveGroupId((current) => (initialGroupId && projectGroups.some((group) => group.id === initialGroupId) ? initialGroupId : current && projectGroups.some((group) => group.id === current) ? current : projectGroups[0]?.id || ""));
    }, [initialGroupId, open, projectGroups]);

    useEffect(() => {
        if (!open) return;
        setActiveTableCanvasId((current) => (current && boundCanvases.some((canvas) => canvas.id === current) ? current : boundCanvases[0]?.id || ""));
    }, [boundCanvases, open]);

    useEffect(() => {
        setSelectedTableShotIds((current) => current.filter((id) => activeTableShots.some((shot) => shot.id === id)));
    }, [activeTableShots]);

    const startCreateGroup = () => {
        setEditingGroup(null);
        setGroupFormOpen(true);
    };

    const startCreateShot = () => {
        if (!activeGroup) return message.warning("请先创建分镜组");
        setEditingShot(null);
        setShotFormOpen(true);
    };

    const generateTableDrafts = () => {
        if (!activeTableCanvas?.episodeId || !activeTableCanvas.scriptSnapshot) return message.warning("请先选择已绑定本集剧本的画布");
        const count = generateTableShotsFromScript({
            projectId,
            canvasId: activeTableCanvas.id,
            episodeId: activeTableCanvas.episodeId,
            scriptText: activeTableCanvas.scriptSnapshot,
        });
        setSelectedTableShotIds([]);
        message.success(`已生成 ${count} 条分镜头草案`);
    };

    const createSelectedShotGroup = () => {
        const result = createShotGroup(selectedTableShotIds);
        if (result.errors?.length) {
            message.warning(result.errors.join("；"));
            return;
        }
        setSelectedTableShotIds([]);
        message.success("已创建生成镜头组");
    };

    const exportClipPackage = async () => {
        if (!activeGroup || !activeShots.length) return message.warning("请先选择包含分镜条目的分镜组");
        const plan = buildStoryboardClipExportPlan({ group: activeGroup, shots: activeShots, assets });
        if (plan.manifest.warnings.length) {
            Modal.confirm({
                title: "导出前检查",
                content: (
                    <div className="max-h-72 overflow-auto text-sm leading-6">
                        <div className="mb-2 text-stone-500">发现 {plan.manifest.warnings.length} 个需要注意的问题。继续导出会保留清单，但缺失的媒体文件不会进入压缩包。</div>
                        {plan.manifest.warnings.map((item, index) => (
                            <div key={`${item.shotId}:${item.type}:${index}`}>- {item.message}</div>
                        ))}
                    </div>
                ),
                okText: "继续导出",
                cancelText: "返回检查",
                onOk: () => runClipPackageExport(plan),
            });
            return;
        }
        await runClipPackageExport(plan);
    };

    const runClipPackageExport = async (plan: StoryboardClipExportPlan) => {
        setExportingClipPackage(true);
        try {
            const files: { name: string; data: BlobPart }[] = [{ name: "shots.json", data: JSON.stringify(plan.manifest, null, 2) }, { name: "shots.csv", data: plan.csv }, ...plan.promptFiles];
            const fileNames = new Set(files.map((file) => file.name));
            let attachedMediaCount = 0;
            for (const request of plan.mediaRequests) {
                if (fileNames.has(request.path)) continue;
                const blob = request.kind === "image" ? await getImageBlob(request.storageKey) : await getMediaBlob(request.storageKey);
                if (!blob) continue;
                files.push({ name: request.path, data: blob });
                fileNames.add(request.path);
                attachedMediaCount += 1;
            }
            const zip = await createZip(files);
            saveAs(zip, plan.fileName);
            message.success(`已导出剪辑包，包含 ${plan.manifest.shots.length} 条分镜和 ${attachedMediaCount} 个媒体文件`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导出剪辑包失败");
        } finally {
            setExportingClipPackage(false);
        }
    };

    return (
        <Drawer title="分镜管理" open={open} onClose={onClose} size={1080} destroyOnHidden>
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前画布：{projectTitle}</div>
            <Card
                size="small"
                className="mb-4"
                title="分镜头表 / 生成表"
                extra={
                    <Space size={6} wrap>
                        <Button size="small" disabled={!activeTableCanvas} onClick={generateTableDrafts}>
                            从本集剧本生成草案
                        </Button>
                        <Button
                            size="small"
                            disabled={!activeTableCanvas}
                            icon={<Plus className="size-3.5" />}
                            onClick={() => {
                                setEditingTableShot(null);
                                setTableShotFormOpen(true);
                            }}
                        >
                            新增分镜头
                        </Button>
                        <Button size="small" type="primary" disabled={selectedTableShotIds.length === 0} onClick={createSelectedShotGroup}>
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
                            onChange={(value) => setActiveTableCanvasId(value)}
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
                                            onCheckedChange={(checked) => setSelectedTableShotIds((current) => (checked ? [...current, shot.id] : current.filter((id) => id !== shot.id)))}
                                            onEdit={() => {
                                                setEditingTableShot(shot);
                                                setTableShotFormOpen(true);
                                            }}
                                            onDelete={() => removeTableShot(shot.id)}
                                            onMoveUp={() => moveTableShot(shot.id, "up")}
                                            onMoveDown={() => moveTableShot(shot.id, "down")}
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
                                            onEdit={() => {
                                                setEditingShotGroup(row.group);
                                                setShotGroupFormOpen(true);
                                            }}
                                            onDelete={() => removeShotGroup(row.group.id)}
                                            onAddToCanvas={() => {
                                                if (!onAddShotGroupToCanvas) return message.warning("请在具体画布中执行打组加入画布");
                                                Modal.confirm({
                                                    title: "确认打组加入画布？",
                                                    content: `将创建提示词节点、参考素材节点和视频生成配置节点，不会自动开始生成。`,
                                                    okText: "加入画布",
                                                    cancelText: "取消",
                                                    onOk: () => onAddShotGroupToCanvas(row.group.id),
                                                });
                                            }}
                                            onCreateBrief={() => {
                                                createBriefFromShotGroup(row.group, row.shots);
                                                message.success("已创建氛围参考 Brief");
                                            }}
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
            <div className="grid h-full min-h-[680px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <Card
                    size="small"
                    title="分镜组"
                    extra={
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={startCreateGroup}>
                            新增
                        </Button>
                    }
                >
                    {projectGroups.length ? (
                        <div className="space-y-2">
                            {projectGroups.map((group) => (
                                <StoryboardGroupCard
                                    key={group.id}
                                    group={group}
                                    active={group.id === activeGroup?.id}
                                    shotCount={orderedStoryboardShots(shots, group.id).length}
                                    onSelect={() => setActiveGroupId(group.id)}
                                    onEdit={() => {
                                        setEditingGroup(group);
                                        setGroupFormOpen(true);
                                    }}
                                    onDelete={() => removeGroup(group.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分镜组" className="py-16" />
                    )}
                </Card>

                <Card
                    size="small"
                    title={activeGroup ? `${activeGroup.title} · 分镜条目` : "分镜条目"}
                    extra={
                        <Space size={6}>
                            <Button size="small" icon={<Download className="size-3.5" />} disabled={!activeGroup || !activeShots.length} loading={exportingClipPackage} onClick={() => void exportClipPackage()}>
                                导出剪辑包
                            </Button>
                            <Button size="small" icon={<Film className="size-3.5" />} disabled={!activeGroup || !activeShots.length} onClick={() => activeGroup && onAddGroupToCanvas(activeGroup.id)}>
                                打组加入画布
                            </Button>
                            <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={!activeGroup} onClick={startCreateShot}>
                                新增分镜
                            </Button>
                        </Space>
                    }
                >
                    {activeGroup ? (
                        <div className="mb-4 rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            {activeGroup.description || "暂无分镜组说明"}
                            {Object.keys(activeGroup.preset || {}).length ? <div className="mt-1 text-xs text-stone-400">已记录项目预设参数</div> : null}
                        </div>
                    ) : null}
                    {activeGroup && queuePlan ? (
                        <GenerationQueuePanel
                            group={activeGroup}
                            items={activeQueueItems}
                            planItems={queuePlan.items}
                            missing={queuePlan.missing}
                            summary={activeQueueSummary}
                            paused={queuePaused}
                            concurrency={queueConcurrency}
                            onConcurrencyChange={setQueueConcurrency}
                            onCreateQueue={() => {
                                replaceGroupQueueItems(projectId, activeGroup.id, queuePlan.items);
                                message.success(`已创建 ${queuePlan.items.length} 个队列项`);
                            }}
                            onStart={() => startQueue(projectId, activeGroup.id)}
                            onPause={() => pauseQueue(projectId, activeGroup.id)}
                            onResume={() => resumeQueue(projectId, activeGroup.id)}
                            onCancel={() => cancelQueue(projectId, activeGroup.id)}
                            onRetryFailed={() => retryFailedQueue(projectId, activeGroup.id)}
                            onRetryItem={retryQueueItem}
                        />
                    ) : null}
                    {activeShots.length ? (
                        <div className="space-y-3">
                            {activeShots.map((shot) => (
                                <StoryboardShotCard
                                    key={shot.id}
                                    shot={shot}
                                    assetsById={assetsById}
                                    bibleById={bibleById}
                                    onUpdateAssetRef={(assetId) => {
                                        const asset = assetsById.get(assetId);
                                        if (!asset) return;
                                        updateShot(shot.id, { assetRefs: updateAssetRefListToLatest(shot.assetRefs, asset) });
                                        message.success("已更新分镜引用版本");
                                    }}
                                    onEdit={() => {
                                        setEditingShot(shot);
                                        setShotFormOpen(true);
                                    }}
                                    onDelete={() => removeShot(shot.id)}
                                    onMoveUp={() => moveShot(shot.id, "up")}
                                    onMoveDown={() => moveShot(shot.id, "down")}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeGroup ? "暂无分镜条目" : "请先创建分镜组"} className="py-16" />
                    )}
                </Card>
            </div>

            <GroupFormModal
                open={groupFormOpen}
                editingGroup={editingGroup}
                onCancel={() => setGroupFormOpen(false)}
                onSubmit={(values) => {
                    const payload = { projectId, title: values.title, description: values.description || "", preset: {} };
                    if (editingGroup) {
                        updateGroup(editingGroup.id, { ...payload, order: editingGroup.order });
                    } else {
                        const id = addGroup(payload);
                        setActiveGroupId(id);
                    }
                    setGroupFormOpen(false);
                }}
            />
            <ShotFormDrawer
                open={shotFormOpen}
                projectId={projectId}
                editingShot={editingShot}
                assets={mediaAssets}
                bibleItems={projectBibleItems}
                onClose={() => setShotFormOpen(false)}
                onSubmit={(values, assetRefs, productionBibleRefs) => {
                    if (!activeGroup) return;
                    const versionedAssetRefs = preserveOrCreateAssetVersionReferences(assetRefs, assets, editingShot?.assetRefs || []);
                    const payload = {
                        groupId: activeGroup.id,
                        title: values.title,
                        description: values.description || "",
                        prompt: values.prompt || "",
                        effectivePrompt: values.effectivePrompt || "",
                        assetRefs: versionedAssetRefs,
                        productionBibleRefs,
                        nodeRefs: editingShot?.nodeRefs || [],
                        resultAssetIds: editingShot?.resultAssetIds || [],
                        primaryAssetId: editingShot?.primaryAssetId,
                        status: editingShot?.status || "draft",
                    };
                    if (editingShot) {
                        updateShot(editingShot.id, { ...payload, order: editingShot.order });
                    } else {
                        addShot(payload);
                    }
                    setShotFormOpen(false);
                }}
            />
            <TableShotFormModal
                open={tableShotFormOpen}
                editingShot={editingTableShot}
                assets={mediaAssets}
                onCancel={() => setTableShotFormOpen(false)}
                onSubmit={(values, assetRefs) => {
                    if (!activeTableCanvas?.episodeId) return;
                    const payload = {
                        projectId,
                        canvasId: activeTableCanvas.id,
                        episodeId: activeTableCanvas.episodeId,
                        sceneName: values.sceneName,
                        location: values.location || values.sceneName,
                        timeOfDay: values.timeOfDay || "",
                        title: values.title,
                        scriptText: values.scriptText || "",
                        visualDescription: values.visualDescription || "",
                        characters: values.characters || [],
                        dialogue: values.dialogue || "",
                        action: values.action || "",
                        emotion: values.emotion || "",
                        shotSize: values.shotSize || "",
                        cameraMovement: values.cameraMovement || "",
                        estimatedDuration: values.estimatedDuration || 5,
                        assetNeeds: values.assetNeeds || [],
                        assetRefs: preserveOrCreateAssetVersionReferences(assetRefs, assets, editingTableShot?.assetRefs || []),
                        productionBibleRefs: editingTableShot?.productionBibleRefs || [],
                    };
                    if (editingTableShot) updateTableShot(editingTableShot.id, { ...payload, order: editingTableShot.order });
                    else addTableShot(payload);
                    setTableShotFormOpen(false);
                }}
            />
            <ShotGroupFormModal
                open={shotGroupFormOpen}
                editingGroup={editingShotGroup}
                assets={mediaAssets}
                bibleItems={projectBibleItems}
                onCancel={() => setShotGroupFormOpen(false)}
                onSubmit={(values, assetRefs, audioRefs, productionBibleRefs) => {
                    if (!editingShotGroup) return;
                    updateShotGroup(editingShotGroup.id, {
                        prompt: values.prompt || "",
                        effectivePrompt: values.effectivePrompt || "",
                        assetRefs: preserveOrCreateAssetVersionReferences(assetRefs, assets, editingShotGroup.assetRefs),
                        audioRefs: preserveOrCreateAssetVersionReferences(audioRefs, assets, editingShotGroup.audioRefs),
                        productionBibleRefs,
                        status: values.effectivePrompt || values.prompt ? "prompt_ready" : "draft",
                    });
                    setShotGroupFormOpen(false);
                }}
            />
        </Drawer>
    );
}

function StoryboardGroupCard({ group, active, shotCount, onSelect, onEdit, onDelete }: { group: StoryboardGroup; active: boolean; shotCount: number; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
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

function StoryboardShotCard({
    shot,
    assetsById,
    bibleById,
    onUpdateAssetRef,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    shot: StoryboardShot;
    assetsById: Map<string, Asset>;
    bibleById: Map<string, ProductionBibleItem>;
    onUpdateAssetRef: (assetId: string) => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
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

function GenerationQueuePanel({
    group,
    items,
    planItems,
    missing,
    summary,
    paused,
    concurrency,
    onConcurrencyChange,
    onCreateQueue,
    onStart,
    onPause,
    onResume,
    onCancel,
    onRetryFailed,
    onRetryItem,
}: {
    group: StoryboardGroup;
    items: GenerationQueueItem[];
    planItems: GenerationQueueItem[];
    missing: GenerationQueueMissingItem[];
    summary: GenerationQueueSummary;
    paused: boolean;
    concurrency: number;
    onConcurrencyChange: (value: number) => void;
    onCreateQueue: () => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
    onRetryFailed: () => void;
    onRetryItem: (id: string) => void;
}) {
    const visibleItems = items.length ? items : planItems;
    const hasFailed = items.some((item) => item.status === "failed");
    const hasRunnable = items.some((item) => item.status === "queued" || item.status === "paused" || item.status === "cancelled");
    return (
        <Card size="small" className="mb-4" title="生成队列">
            <div className="space-y-3">
                <div className="grid gap-2 text-xs text-stone-500 sm:grid-cols-4">
                    <QueueMetric label="视频数" value={`${summary.videoCount}`} />
                    <QueueMetric label="预计时长" value={`${summary.totalDurationSeconds}s`} />
                    <QueueMetric label="预计点数" value={`${summary.totalEstimatedCredits}`} />
                    <QueueMetric label="缺失项" value={`${summary.missingCount}`} />
                </div>
                {missing.length ? (
                    <div className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        {missing.map((item) => (
                            <div key={`${item.storyboardShotId}:${item.reason}`}>
                                {item.storyboardShotId}：{item.reason}
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="small" onClick={onCreateQueue} disabled={!planItems.length}>
                        创建队列
                    </Button>
                    <Button size="small" type="primary" icon={<Play className="size-3.5" />} onClick={onStart} disabled={!items.length || !hasRunnable}>
                        开始队列
                    </Button>
                    <Button size="small" onClick={onPause} disabled={!items.some((item) => item.status === "queued")}>
                        暂停
                    </Button>
                    <Button size="small" onClick={onResume} disabled={!paused && !items.some((item) => item.status === "paused")}>
                        继续
                    </Button>
                    <Button size="small" danger onClick={onCancel} disabled={!items.some((item) => item.status === "queued" || item.status === "paused")}>
                        取消
                    </Button>
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetryFailed} disabled={!hasFailed}>
                        重试失败项
                    </Button>
                    <span className="ml-auto inline-flex items-center gap-2 text-xs text-stone-500">
                        并发
                        <InputNumber size="small" min={1} max={10} value={concurrency} onChange={(value) => onConcurrencyChange(Number(value) || 1)} className="w-16" />
                    </span>
                </div>
                {visibleItems.length ? (
                    <div className="space-y-1.5">
                        {visibleItems.map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 text-xs dark:bg-stone-900">
                                <Tag className="m-0">{queueStatusLabel(item.status)}</Tag>
                                <span className="min-w-0 flex-1 truncate">
                                    {group.title} / {item.storyboardShotId}
                                </span>
                                <span className="text-stone-400">{item.estimatedDurationSeconds || item.estimatedCredits}s</span>
                                <span className="text-stone-400">{item.estimatedCredits} 点</span>
                                {item.error ? <span className="text-red-500">{item.error}</span> : null}
                                {item.status === "failed" || item.status === "cancelled" ? (
                                    <Button size="small" type="text" onClick={() => onRetryItem(item.id)}>
                                        重试
                                    </Button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </Card>
    );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-900">
            <div>{label}</div>
            <div className="mt-1 text-base font-semibold text-stone-800 dark:text-stone-100">{value}</div>
        </div>
    );
}

function GroupFormModal({ open, editingGroup, onCancel, onSubmit }: { open: boolean; editingGroup: StoryboardGroup | null; onCancel: () => void; onSubmit: (values: GroupFormValues) => void }) {
    const [form] = Form.useForm<GroupFormValues>();
    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({ title: editingGroup?.title || "", description: editingGroup?.description || "" });
    }, [editingGroup, form, open]);
    return (
        <Modal title={editingGroup ? "编辑分镜组" : "新增分镜组"} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="保存" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
                    <Input placeholder="例如：第一集操场毕业典礼" />
                </Form.Item>
                <Form.Item name="description" label="说明">
                    <Input.TextArea rows={4} placeholder="记录本组分镜目标、节奏和关键画面" />
                </Form.Item>
            </Form>
        </Modal>
    );
}

function ShotFormDrawer({
    open,
    projectId,
    editingShot,
    assets,
    bibleItems,
    onClose,
    onSubmit,
}: {
    open: boolean;
    projectId: string;
    editingShot: StoryboardShot | null;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onClose: () => void;
    onSubmit: (values: ShotFormValues, assetRefs: StoryboardAssetRef[], productionBibleRefs: StoryboardProductionBibleRef[]) => void;
}) {
    const [form] = Form.useForm<ShotFormValues>();
    const [assetRoles, setAssetRoles] = useState<Record<string, string>>({});
    const [promptOpen, setPromptOpen] = useState(false);
    const watchedAssetIds = Form.useWatch("assetIds", form);
    const watchedBibleIds = Form.useWatch("productionBibleIds", form);
    const selectedAssetIdsKey = Array.isArray(watchedAssetIds) ? watchedAssetIds.join("\u0000") : "";
    const selectedBibleIdsKey = Array.isArray(watchedBibleIds) ? watchedBibleIds.join("\u0000") : "";
    const selectedAssetIds = useMemo(() => (Array.isArray(watchedAssetIds) ? watchedAssetIds : emptySelection), [selectedAssetIdsKey]);
    const selectedBibleIds = useMemo(() => (Array.isArray(watchedBibleIds) ? watchedBibleIds : emptySelection), [selectedBibleIdsKey]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const bibleById = useMemo(() => new Map(bibleItems.map((item) => [item.id, item])), [bibleItems]);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            title: editingShot?.title || "",
            description: editingShot?.description || "",
            prompt: editingShot?.prompt || "",
            effectivePrompt: editingShot?.effectivePrompt || "",
            assetIds: editingShot?.assetRefs.map((ref) => ref.assetId) || [],
            productionBibleIds: editingShot?.productionBibleRefs?.map((ref) => ref.itemId) || [],
        });
        setAssetRoles(Object.fromEntries((editingShot?.assetRefs || []).map((ref) => [ref.assetId, ref.role])));
    }, [editingShot, form, open]);

    useEffect(() => {
        if (!open) return;
        setAssetRoles((current) => {
            const next: Record<string, string> = {};
            for (const assetId of selectedAssetIds) next[assetId] = current[assetId] || defaultAssetRole(assetsById.get(assetId)?.kind);
            if (sameAssetRoles(current, next)) return current;
            return next;
        });
    }, [assetsById, open, selectedAssetIds]);

    return (
        <Drawer
            title={editingShot ? "编辑分镜" : "新增分镜"}
            open={open}
            onClose={onClose}
            size={680}
            destroyOnHidden
            extra={
                <Button type="primary" onClick={() => form.submit()}>
                    保存
                </Button>
            }
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => {
                    const assetRefs = (values.assetIds || []).flatMap((assetId): StoryboardAssetRef[] => {
                        const asset = assetsById.get(assetId);
                        if (!asset || !mediaKinds.has(asset.kind)) return [];
                        return [{ assetId, kind: asset.kind as StoryboardAssetKind, role: assetRoles[assetId] || defaultAssetRole(asset.kind) }];
                    });
                    const productionBibleRefs = (values.productionBibleIds || []).flatMap((itemId): StoryboardProductionBibleRef[] => {
                        const item = bibleById.get(itemId);
                        return item ? [{ itemId, kind: item.kind }] : [];
                    });
                    onSubmit(values, assetRefs, productionBibleRefs);
                }}
            >
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
                    <Input placeholder="例如：魏梁走上主席台" />
                </Form.Item>
                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="分镜画面、构图、运动或情绪说明" />
                </Form.Item>
                <Form.Item label="提示词">
                    <div className="space-y-2">
                        <Form.Item name="prompt" noStyle>
                            <Input.TextArea rows={6} placeholder="写入用于生成视频的分镜提示词" />
                        </Form.Item>
                        <Button size="small" onClick={() => setPromptOpen(true)}>
                            从提示词库插入
                        </Button>
                    </div>
                </Form.Item>
                <Form.Item name="effectivePrompt" label="实际提交提示词">
                    <Input.TextArea rows={4} placeholder="可选。留空时使用提示词" />
                </Form.Item>
                <Form.Item name="assetIds" label="参考素材">
                    <Select mode="multiple" placeholder="选择图片、视频或音频素材" options={assets.map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id }))} />
                </Form.Item>
                {selectedAssetIds.length ? (
                    <div className="mb-4 space-y-2">
                        {selectedAssetIds.map((assetId) => (
                            <div key={assetId} className="grid gap-2 rounded-lg bg-stone-50 p-2 text-sm dark:bg-stone-900 sm:grid-cols-[minmax(0,1fr)_160px]">
                                <span className="truncate">{assetsById.get(assetId)?.title || assetId}</span>
                                <Select
                                    size="small"
                                    value={assetRoles[assetId] || defaultAssetRole(assetsById.get(assetId)?.kind)}
                                    options={assetRoleOptions(assetsById.get(assetId)?.kind)}
                                    onChange={(role) => setAssetRoles((current) => ({ ...current, [assetId]: role }))}
                                />
                            </div>
                        ))}
                    </div>
                ) : null}
                <Form.Item name="productionBibleIds" label="引用设定">
                    <Select mode="multiple" placeholder="选择角色、场景、道具设定" options={bibleItems.map((item) => ({ label: `${productionBibleKindLabel(item.kind)} · ${item.name}`, value: item.id }))} />
                </Form.Item>
                {selectedBibleIds.length ? <div className="mb-4 text-xs text-stone-500">提示词库变量填写时也可以选择这些设定项。</div> : null}
            </Form>
            <PromptSelectDialog
                open={promptOpen}
                projectId={projectId}
                nodeGroup="video"
                allowedTypes={["video", "positive", "workflow"]}
                onOpenChange={setPromptOpen}
                onSelect={(prompt) => {
                    const current = form.getFieldValue("prompt") || "";
                    form.setFieldValue("prompt", [current.trim(), prompt.trim()].filter(Boolean).join("\n\n"));
                }}
            />
        </Drawer>
    );
}

function defaultAssetRole(kind?: string) {
    if (kind === "audio") return "reference_audio";
    if (kind === "video") return "reference_video";
    return "reference_image";
}

function sameAssetRoles(left: Record<string, string>, right: Record<string, string>) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
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

function assetRoleLabel(role: string) {
    return assetRoleOptions(role.includes("audio") ? "audio" : role.includes("video") || role === "source_video" ? "video" : "image").find((item) => item.value === role)?.label || role || "参考";
}

function assetKindLabel(kind: string) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "素材";
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

function queueStatusLabel(status: string) {
    if (status === "running") return "运行中";
    if (status === "succeeded") return "已完成";
    if (status === "failed") return "失败";
    if (status === "cancelled") return "已取消";
    if (status === "paused") return "已暂停";
    return "排队中";
}
