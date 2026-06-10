"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Empty, Modal, Space } from "antd";
import { Download, Film, Plus } from "lucide-react";
import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences, updateAssetRefListToLatest } from "../../assets/asset-version-references";
import { useGenerationQueueStore } from "../stores/use-generation-queue-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import type { CanvasProject } from "../stores/use-canvas-store";
import type { CanvasNodeData } from "../types";
import { ShotGroupFormModal, TableShotFormModal } from "./storyboard-shot-group-components";
import { buildGenerationQueuePlan, summarizeGenerationQueue } from "../utils/generation-queue";
import { itemsForProductionBibleProject } from "../utils/production-bible";
import { buildStoryboardClipExportPlan, type StoryboardClipExportPlan } from "../utils/storyboard-clip-export";
import {
    buildShotGroupGenerationTableRows,
    orderedShotGroups,
    orderedStoryboardGroups,
    orderedStoryboardShots,
    orderedStoryboardTableShots,
    type ShotGroup,
    type StoryboardGroup,
    type StoryboardShot,
    type StoryboardTableShot,
} from "../utils/storyboard-management";
import { GroupFormModal, mediaKinds, ShotFormDrawer } from "./storyboard-manager-form-modals";
import { StoryboardGenerationQueuePanel } from "./storyboard-generation-queue-panel";
import { StoryboardGroupCard, StoryboardShotCard } from "./storyboard-manager-cards";
import { StoryboardTableSection } from "./storyboard-table-section";

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

    const addShotGroupToCanvas = (shotGroupId: string) => {
        if (!onAddShotGroupToCanvas) {
            message.warning("请在具体画布中执行打组加入画布");
            return;
        }
        Modal.confirm({
            title: "确认打组加入画布？",
            content: `将创建提示词节点、参考素材节点和视频生成配置节点，不会自动开始生成。`,
            okText: "加入画布",
            cancelText: "取消",
            onOk: () => onAddShotGroupToCanvas(shotGroupId),
        });
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
            <StoryboardTableSection
                boundCanvases={boundCanvases}
                activeTableCanvas={activeTableCanvas}
                activeTableShots={activeTableShots}
                selectedTableShotIds={selectedTableShotIds}
                shotGroupRows={shotGroupRows}
                assetsById={assetsById}
                onActiveTableCanvasChange={setActiveTableCanvasId}
                onAddTableShot={() => {
                    setEditingTableShot(null);
                    setTableShotFormOpen(true);
                }}
                onCreateBrief={(row) => {
                    createBriefFromShotGroup(row.group, row.shots);
                    message.success("已创建氛围参考 Brief");
                }}
                onCreateSelectedShotGroup={createSelectedShotGroup}
                onDeleteShotGroup={removeShotGroup}
                onDeleteTableShot={removeTableShot}
                onEditShotGroup={(row) => {
                    setEditingShotGroup(row.group);
                    setShotGroupFormOpen(true);
                }}
                onEditTableShot={(shot) => {
                    setEditingTableShot(shot);
                    setTableShotFormOpen(true);
                }}
                onGenerateTableDrafts={generateTableDrafts}
                onMoveTableShot={moveTableShot}
                onToggleTableShot={(shotId, checked) => setSelectedTableShotIds((current) => (checked ? [...current, shotId] : current.filter((id) => id !== shotId)))}
                onAddShotGroupToCanvas={addShotGroupToCanvas}
            />
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
                        <StoryboardGenerationQueuePanel
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
