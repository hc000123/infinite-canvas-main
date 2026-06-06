"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Drawer, Form, Input, Modal, Select, Space } from "antd";
import { Bot, FileText } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import type { CanvasProject } from "../stores/use-canvas-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useScriptStore } from "../stores/use-script-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import { activeEpisodeShotGroups, activeEpisodeTableShots, buildEpisodeWorkbenchStats, deriveEpisodeProductionStatus, validateEpisodeShotGroupSelection, workbenchModes } from "../utils/episode-workbench";
import { itemsForProductionBibleProject } from "../utils/production-bible";
import type { CanvasNodeData } from "../types";
import {
    EpisodeOverviewSection,
    EpisodeScriptSection,
    EpisodeTableSection,
    GenerationManagementSection,
    ShotGroupFormModal,
    ShotGroupSection,
    TableShotFormModal,
    WorkModeSection,
    type ShotGroupFormValues,
    type StoryboardAssetRef,
    type StoryboardProductionBibleRef,
    type TableShotFormValues,
} from "./episode-workbench-sections";
import type { ShotGroup, StoryboardTableShot } from "../utils/storyboard-management";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases: CanvasProject[];
    currentCanvasId?: string;
    canvasNodes: CanvasNodeData[];
    onClose: () => void;
    onUpdateCanvasEpisode: (canvasId: string, patch: Pick<Partial<CanvasProject>, "episodeId" | "episodeTitle" | "scriptId" | "scriptSnapshot">) => void;
    onAddShotGroupToCanvas?: (groupId: string) => void;
    onOpenAsset?: (asset: Asset) => void;
    onLocateNode?: (nodeId: string) => void;
    onRetryNode?: (nodeId: string) => void;
    onOpenAgentSettings?: () => void;
};

type BindFormValues = {
    mode: "existing" | "import";
    episodeId?: string;
    title?: string;
    scriptText?: string;
};

const mediaKinds = new Set(["image", "video", "audio"]);

export function EpisodeWorkbenchDrawer({ open, projectId, projectTitle, canvases, currentCanvasId, canvasNodes, onClose, onUpdateCanvasEpisode, onAddShotGroupToCanvas, onOpenAsset, onLocateNode, onRetryNode, onOpenAgentSettings }: Props) {
    const { message } = App.useApp();
    const [bindForm] = Form.useForm<BindFormValues>();
    const assets = useAssetStore((state) => state.assets);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const tableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const generateTableShotsFromScript = useStoryboardStore((state) => state.generateTableShotsFromScript);
    const addTableShot = useStoryboardStore((state) => state.addTableShot);
    const updateTableShot = useStoryboardStore((state) => state.updateTableShot);
    const removeTableShot = useStoryboardStore((state) => state.removeTableShot);
    const moveTableShot = useStoryboardStore((state) => state.moveTableShot);
    const createShotGroup = useStoryboardStore((state) => state.createShotGroup);
    const updateShotGroup = useStoryboardStore((state) => state.updateShotGroup);
    const removeShotGroup = useStoryboardStore((state) => state.removeShotGroup);
    const createMoodBrief = useImageBriefStore((state) => state.createFromShotGroup);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const breakdownItems = useAssetBreakdownStore((state) => state.items);
    const [activeCanvasId, setActiveCanvasId] = useState("");
    const [scriptDraft, setScriptDraft] = useState("");
    const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
    const [editingShot, setEditingShot] = useState<StoryboardTableShot | null>(null);
    const [shotFormOpen, setShotFormOpen] = useState(false);
    const [editingShotGroup, setEditingShotGroup] = useState<ShotGroup | null>(null);
    const [shotGroupFormOpen, setShotGroupFormOpen] = useState(false);
    const [bindOpen, setBindOpen] = useState(false);
    const projectCanvases = useMemo(() => canvases, [canvases]);
    const activeCanvas = projectCanvases.find((canvas) => canvas.id === activeCanvasId) || projectCanvases.find((canvas) => canvas.id === currentCanvasId) || projectCanvases[0] || null;
    const activeShots = useMemo(() => activeEpisodeTableShots(tableShots, activeCanvas), [activeCanvas, tableShots]);
    const activeShotGroups = useMemo(() => activeEpisodeShotGroups(shotGroups, activeCanvas), [activeCanvas, shotGroups]);
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(productionBibleItems, projectId), [productionBibleItems, projectId]);
    const mediaAssets = useMemo(() => assets.filter((asset) => mediaKinds.has(asset.kind)), [assets]);
    const stats = useMemo(() => buildEpisodeWorkbenchStats({ canvas: activeCanvas, tableShots, shotGroups, assetBreakdownItems: breakdownItems, nodes: canvasNodes }), [activeCanvas, breakdownItems, canvasNodes, shotGroups, tableShots]);
    const status = deriveEpisodeProductionStatus(stats);
    const modes = workbenchModes(stats);
    const episodeOptions = useMemo(
        () =>
            episodes
                .filter((episode) => episode.projectId === projectId)
                .sort((a, b) => a.order - b.order)
                .map((episode) => ({ label: `${episode.order}. ${episode.title}`, value: episode.id })),
        [episodes, projectId],
    );

    useEffect(() => {
        if (!open) return;
        setActiveCanvasId((current) => (current && projectCanvases.some((canvas) => canvas.id === current) ? current : currentCanvasId && projectCanvases.some((canvas) => canvas.id === currentCanvasId) ? currentCanvasId : projectCanvases[0]?.id || ""));
    }, [currentCanvasId, open, projectCanvases]);

    useEffect(() => {
        if (!open) return;
        setScriptDraft(activeCanvas?.scriptSnapshot || "");
        setSelectedShotIds([]);
    }, [activeCanvas?.id, activeCanvas?.scriptSnapshot, open]);

    const saveScriptSnapshot = () => {
        if (!activeCanvas) return;
        const apply = () => {
            onUpdateCanvasEpisode(activeCanvas.id, { scriptSnapshot: scriptDraft, scriptId: activeCanvas.scriptId || projectId });
            if (activeCanvas.episodeId) updateEpisode(activeCanvas.episodeId, { summary: scriptDraft });
            message.success("本集剧本快照已保存");
        };
        if (activeShots.length) {
            Modal.confirm({ title: "保存剧本快照？", content: "这不会自动覆盖已有分镜头表；如需重新生成草案，请手动点击“从剧本生成草案”。", okText: "保存", cancelText: "取消", onOk: apply });
        } else apply();
    };

    const openBindModal = () => {
        bindForm.setFieldsValue({ mode: activeCanvas?.episodeId ? "existing" : "import", episodeId: activeCanvas?.episodeId, title: activeCanvas?.episodeTitle || "", scriptText: activeCanvas?.scriptSnapshot || "" });
        setBindOpen(true);
    };

    const applyBindEpisode = async () => {
        if (!activeCanvas) return;
        const values = await bindForm.validateFields();
        const apply = () => {
            if (values.mode === "existing") {
                const episode = episodes.find((item) => item.id === values.episodeId);
                if (!episode) return message.warning("请选择已有分集");
                onUpdateCanvasEpisode(activeCanvas.id, { episodeId: episode.id, episodeTitle: episode.title, scriptId: projectId, scriptSnapshot: buildEpisodeSnapshot(episode, scenes) });
            } else {
                const title = values.title?.trim() || "未命名集数";
                const scriptText = values.scriptText?.trim() || "";
                if (!scriptText) return message.warning("请粘贴本集剧本");
                upsertScriptProject(projectId, scriptText);
                const episodeId = addEpisode({ projectId, order: episodes.filter((episode) => episode.projectId === projectId).length + 1, title, summary: scriptText, hook: "", turningPoint: "", cliffhanger: "" });
                onUpdateCanvasEpisode(activeCanvas.id, { episodeId, episodeTitle: title, scriptId: projectId, scriptSnapshot: scriptText });
            }
            setBindOpen(false);
            message.success("已更新本集剧本绑定");
        };
        if (activeShots.length || activeShotGroups.length) Modal.confirm({ title: "重新绑定或导入剧本？", content: "已有分镜头和生成镜头组不会被静默覆盖；如需重新生成草案，需要之后手动确认。", okText: "确认更新", cancelText: "取消", onOk: apply });
        else apply();
    };

    const generateDrafts = () => {
        if (!activeCanvas?.episodeId || !scriptDraft.trim()) return message.warning("请先绑定或导入本集剧本");
        const run = () => {
            const count = generateTableShotsFromScript({ projectId, canvasId: activeCanvas.id, episodeId: activeCanvas.episodeId!, scriptText: scriptDraft });
            setSelectedShotIds([]);
            message.success(`已生成 ${count} 条分镜头草案`);
        };
        if (activeShots.length || activeShotGroups.length) Modal.confirm({ title: "重新生成分镜头草案？", content: "这会替换当前本集分镜头表，并清空对应生成镜头组。", okText: "重新生成", cancelText: "取消", onOk: run });
        else run();
    };

    const submitShot = (values: TableShotFormValues, assetRefs: StoryboardAssetRef[]) => {
        if (!activeCanvas?.episodeId) return;
        const payload = {
            projectId,
            canvasId: activeCanvas.id,
            episodeId: activeCanvas.episodeId,
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
            assetRefs: preserveOrCreateAssetVersionReferences(assetRefs, assets, editingShot?.assetRefs || []),
            productionBibleRefs: editingShot?.productionBibleRefs || [],
        };
        if (editingShot) updateTableShot(editingShot.id, { ...payload, order: editingShot.order });
        else addTableShot(payload);
        setShotFormOpen(false);
    };

    const createSelectedShotGroup = () => {
        const validation = validateEpisodeShotGroupSelection(activeShots, selectedShotIds);
        if (!validation.valid) return message.warning(validation.errors.join("；"));
        const result = createShotGroup(selectedShotIds);
        if (result.errors?.length) return message.warning(result.errors.join("；"));
        setSelectedShotIds([]);
        message.success("已创建生成镜头组");
    };

    const submitShotGroup = (values: ShotGroupFormValues, assetRefs: StoryboardAssetRef[], audioRefs: StoryboardAssetRef[], productionBibleRefs: StoryboardProductionBibleRef[]) => {
        if (!editingShotGroup) return;
        updateShotGroup(editingShotGroup.id, {
            prompt: values.prompt || "",
            effectivePrompt: values.effectivePrompt || "",
            assetRefs: preserveOrCreateAssetVersionReferences(assetRefs, assets, editingShotGroup.assetRefs),
            audioRefs: preserveOrCreateAssetVersionReferences(audioRefs, assets, editingShotGroup.audioRefs),
            productionBibleRefs,
        });
        setShotGroupFormOpen(false);
    };

    const addGroupToCanvas = (groupId: string) => {
        if (!onAddShotGroupToCanvas) return message.warning("请在具体画布中执行打组加入画布");
        Modal.confirm({ title: "确认打组加入画布？", content: "将创建文本提示词节点、参考素材节点和视频生成配置节点，不会自动开始生成或扣费。", okText: "加入画布", cancelText: "取消", onOk: () => onAddShotGroupToCanvas(groupId) });
    };

    const retryNode = (nodeId: string) => {
        Modal.confirm({ title: "重试现有配置节点？", content: "会复用当前画布节点配置执行生成，请确认后再继续。", okText: "重试", cancelText: "取消", onOk: () => onRetryNode?.(nodeId) });
    };

    return (
        <Drawer title="视频生产台" open={open} onClose={onClose} width="min(1280px, calc(100vw - 24px))" destroyOnHidden>
            <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-white/5">
                    <div>
                        <div className="text-sm text-stone-500">当前项目：{projectTitle}</div>
                        <div className="mt-1 text-xl font-semibold">{activeCanvas?.episodeTitle || activeCanvas?.title || "未选择画布"}</div>
                    </div>
                    <Space wrap>
                        <Select className="min-w-72" value={activeCanvas?.id} options={projectCanvases.map((canvas) => ({ label: `${canvasEpisodeLabel(canvas)} · ${canvas.title}`, value: canvas.id }))} onChange={setActiveCanvasId} />
                        <Button icon={<FileText className="size-4" />} onClick={openBindModal}>
                            绑定 / 导入剧本
                        </Button>
                        {onOpenAgentSettings ? (
                            <Button icon={<Bot className="size-4" />} onClick={onOpenAgentSettings}>
                                Agent 设置
                            </Button>
                        ) : null}
                    </Space>
                </div>

                <EpisodeOverviewSection stats={stats} status={status} />
                <WorkModeSection modes={modes} />
                <EpisodeScriptSection
                    hasEpisode={Boolean(activeCanvas?.episodeId)}
                    episodeLabel={canvasEpisodeLabel(activeCanvas)}
                    scriptDraft={scriptDraft}
                    onScriptDraftChange={setScriptDraft}
                    onSaveScriptSnapshot={saveScriptSnapshot}
                    onOpenBind={openBindModal}
                />

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(480px,0.95fr)]">
                    <EpisodeTableSection
                        shots={activeShots}
                        selectedIds={selectedShotIds}
                        onGenerateDrafts={generateDrafts}
                        onCreateShot={() => {
                            setEditingShot(null);
                            setShotFormOpen(true);
                        }}
                        onToggleShot={(id, checked) => setSelectedShotIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)))}
                        onEditShot={(shot) => {
                            setEditingShot(shot);
                            setShotFormOpen(true);
                        }}
                        onDeleteShot={removeTableShot}
                        onMoveShot={moveTableShot}
                        onCreateShotGroup={createSelectedShotGroup}
                    />
                    <div className="grid gap-5">
                        <ShotGroupSection
                            shotGroups={activeShotGroups}
                            tableShots={activeShots}
                            assets={mediaAssets}
                            onEditGroup={(group) => {
                                setEditingShotGroup(group);
                                setShotGroupFormOpen(true);
                            }}
                            onDeleteGroup={removeShotGroup}
                            onAddToCanvas={addGroupToCanvas}
                            onCreateBrief={(group) => {
                                const shots = activeShots.filter((shot) => group.shotIds.includes(shot.id));
                                createMoodBrief(group, shots);
                                message.success("已创建氛围参考 Brief");
                            }}
                            onInsertPromptTemplate={(group, prompt) => updateShotGroup(group.id, { prompt: [group.prompt, prompt].filter(Boolean).join("\n\n") })}
                        />
                        <GenerationManagementSection
                            shotGroups={activeShotGroups}
                            tableShots={activeShots}
                            nodes={canvasNodes}
                            assets={assets}
                            onOpenAsset={onOpenAsset}
                            onLocateNode={onLocateNode}
                            onAddToCanvas={addGroupToCanvas}
                            onRetryNode={retryNode}
                        />
                    </div>
                </div>
            </div>

            <TableShotFormModal open={shotFormOpen} editingShot={editingShot} assets={mediaAssets} onCancel={() => setShotFormOpen(false)} onSubmit={submitShot} />
            <ShotGroupFormModal open={shotGroupFormOpen} editingGroup={editingShotGroup} assets={mediaAssets} bibleItems={projectBibleItems} onCancel={() => setShotGroupFormOpen(false)} onSubmit={submitShotGroup} />
            <Modal title="绑定或导入本集剧本" open={bindOpen} onCancel={() => setBindOpen(false)} onOk={() => void applyBindEpisode()} okText="确认" cancelText="取消" destroyOnHidden>
                <Form form={bindForm} layout="vertical" initialValues={{ mode: "import" }}>
                    <Form.Item name="mode" label="剧本来源">
                        <Select
                            options={[
                                { label: "从项目已有分集选择", value: "existing" },
                                { label: "粘贴 / 导入本集剧本", value: "import" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.mode !== next.mode}>
                        {({ getFieldValue }) =>
                            getFieldValue("mode") === "existing" ? (
                                <Form.Item name="episodeId" label="已有分集" rules={[{ required: true, message: "请选择分集" }]}>
                                    <Select options={episodeOptions} placeholder="选择项目分集" />
                                </Form.Item>
                            ) : (
                                <>
                                    <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写标题" }]}>
                                        <Input placeholder="例如：第一集" />
                                    </Form.Item>
                                    <Form.Item name="scriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                                        <Input.TextArea rows={8} />
                                    </Form.Item>
                                </>
                            )
                        }
                    </Form.Item>
                </Form>
            </Modal>
        </Drawer>
    );
}

function buildEpisodeSnapshot(
    episode: { title: string; summary: string; hook: string; turningPoint: string; cliffhanger: string; id: string },
    scenes: Array<{ episodeId: string; order: number; location: string; beat: string; dialogue: string; emotion: string; durationHint: string }>,
) {
    const lines = [`# ${episode.title}`, episode.summary, episode.hook ? `钩子：${episode.hook}` : "", episode.turningPoint ? `转折：${episode.turningPoint}` : "", episode.cliffhanger ? `悬念：${episode.cliffhanger}` : ""].filter(Boolean);
    const sceneText = scenes
        .filter((scene) => scene.episodeId === episode.id)
        .sort((a, b) => a.order - b.order)
        .map((scene) =>
            [`场次 ${scene.order}${scene.location ? `：${scene.location}` : ""}`, scene.beat, scene.dialogue ? `对白：${scene.dialogue}` : "", scene.emotion ? `情绪：${scene.emotion}` : "", scene.durationHint ? `时长：${scene.durationHint}` : ""]
                .filter(Boolean)
                .join("\n"),
        );
    return [...lines, ...sceneText].join("\n\n");
}
