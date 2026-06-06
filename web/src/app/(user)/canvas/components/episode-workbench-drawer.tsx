"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Drawer, Empty, Form, Input, Modal, Select, Space } from "antd";
import { Bot, FileText } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import { useAgentSettingsStore } from "../../projects/use-agent-settings-store";
import { useAgentRunnerStore } from "../../projects/use-agent-runner-store";
import { listAgentRunsByEpisode, type AgentRunRecord } from "../../projects/agent-runner.ts";
import type { CanvasProject } from "../stores/use-canvas-store";
import { useAssetBreakdownStore } from "../stores/use-asset-breakdown-store";
import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useScriptStore } from "../stores/use-script-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { useImageBriefStore } from "../stores/use-image-brief-store";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import {
    activeEpisodeShotGroups,
    activeEpisodeTableShots,
    buildEpisodeWorkbenchStats,
    deriveEpisodeProductionStatus,
    freeCanvasModeKeepsScriptOptional,
    selectEpisodeWorkbenchCanvas,
    shouldConfirmEpisodeScriptReimport,
    shouldPromptEpisodeScriptBinding,
    validateEpisodeShotGroupSelection,
    workbenchModes,
} from "../utils/episode-workbench";
import { buildAssetBreakdownInputsFromAgentRun, buildAssetExtractorRunInput, buildLocalAssetExtractorDraftOutput, canRunAssetExtractor, shouldAllowAssetExtractorRun } from "../utils/agent-asset-extractor";
import { itemsForProductionBibleProject } from "../utils/production-bible";
import type { CanvasNodeData } from "../types";
import {
    EpisodeOverviewSection,
    EpisodeScriptSection,
    AssetExtractionSection,
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
    onCreateCanvas?: () => void;
    promptBindWhenUnbound?: boolean;
};

type BindFormValues = {
    mode: "none" | "existing" | "import";
    episodeId?: string;
    title?: string;
    scriptText?: string;
};

const mediaKinds = new Set(["image", "video", "audio"]);

export function EpisodeWorkbenchDrawer({
    open,
    projectId,
    projectTitle,
    canvases,
    currentCanvasId,
    canvasNodes,
    onClose,
    onUpdateCanvasEpisode,
    onAddShotGroupToCanvas,
    onOpenAsset,
    onLocateNode,
    onRetryNode,
    onOpenAgentSettings,
    onCreateCanvas,
    promptBindWhenUnbound = false,
}: Props) {
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
    const importAgentAssetDrafts = useAssetBreakdownStore((state) => state.importAgentDrafts);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const breakdownItems = useAssetBreakdownStore((state) => state.items);
    const resolvedAgentConfigs = useAgentSettingsStore((state) => state.resolvedProjectConfigs(projectId));
    const agentRuns = useAgentRunnerStore((state) => state.runs);
    const createAgentRun = useAgentRunnerStore((state) => state.createRun);
    const approveAgentRun = useAgentRunnerStore((state) => state.approveRun);
    const rejectAgentRun = useAgentRunnerStore((state) => state.rejectRun);
    const markAgentRunApplied = useAgentRunnerStore((state) => state.markApplied);
    const [activeCanvasId, setActiveCanvasId] = useState("");
    const [scriptDraft, setScriptDraft] = useState("");
    const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
    const [editingShot, setEditingShot] = useState<StoryboardTableShot | null>(null);
    const [shotFormOpen, setShotFormOpen] = useState(false);
    const [editingShotGroup, setEditingShotGroup] = useState<ShotGroup | null>(null);
    const [shotGroupFormOpen, setShotGroupFormOpen] = useState(false);
    const [bindOpen, setBindOpen] = useState(false);
    const [bindPromptDismissed, setBindPromptDismissed] = useState(false);
    const projectCanvases = useMemo(() => canvases, [canvases]);
    const activeCanvas = projectCanvases.find((canvas) => canvas.id === activeCanvasId) || selectEpisodeWorkbenchCanvas(projectCanvases, currentCanvasId);
    const activeShots = useMemo(() => activeEpisodeTableShots(tableShots, activeCanvas), [activeCanvas, tableShots]);
    const activeShotGroups = useMemo(() => activeEpisodeShotGroups(shotGroups, activeCanvas), [activeCanvas, shotGroups]);
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(productionBibleItems, projectId), [productionBibleItems, projectId]);
    const mediaAssets = useMemo(() => assets.filter((asset) => mediaKinds.has(asset.kind)), [assets]);
    const stats = useMemo(() => buildEpisodeWorkbenchStats({ canvas: activeCanvas, tableShots, shotGroups, assetBreakdownItems: breakdownItems, nodes: canvasNodes }), [activeCanvas, breakdownItems, canvasNodes, shotGroups, tableShots]);
    const status = deriveEpisodeProductionStatus(stats);
    const modes = workbenchModes(stats);
    const assetExtractorConfig = useMemo(() => resolvedAgentConfigs.find((config) => config.kind === "asset_extractor"), [resolvedAgentConfigs]);
    const assetExtractorAvailability = shouldAllowAssetExtractorRun(assetExtractorConfig);
    const assetExtractorRunReadiness = canRunAssetExtractor(activeCanvas);
    const activeAssetExtractorRuns = useMemo(
        () => (activeCanvas?.episodeId ? listAgentRunsByEpisode(agentRuns, activeCanvas.episodeId).filter((run) => run.agentKind === "asset_extractor" && run.input.canvasId === activeCanvas.id) : []),
        [activeCanvas?.episodeId, activeCanvas?.id, agentRuns],
    );
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
        setActiveCanvasId((current) => {
            if (current && projectCanvases.some((canvas) => canvas.id === current)) return current;
            return selectEpisodeWorkbenchCanvas(projectCanvases, currentCanvasId)?.id || "";
        });
    }, [currentCanvasId, open, projectCanvases]);

    useEffect(() => {
        if (!open) {
            setBindPromptDismissed(false);
            return;
        }
        setScriptDraft(activeCanvas?.scriptSnapshot || "");
        setSelectedShotIds([]);
    }, [activeCanvas?.id, activeCanvas?.scriptSnapshot, open]);

    useEffect(() => {
        if (!open || bindOpen || bindPromptDismissed) return;
        if (shouldPromptEpisodeScriptBinding(activeCanvas, promptBindWhenUnbound)) openBindModal();
    }, [activeCanvas, bindOpen, bindPromptDismissed, open, promptBindWhenUnbound]);

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
            if (freeCanvasModeKeepsScriptOptional(values.mode)) {
                setBindOpen(false);
                setBindPromptDismissed(true);
                message.info("已保留自由画布制作路径");
                return;
            }
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
            setBindPromptDismissed(true);
            message.success("已更新本集剧本绑定");
        };
        if (values.mode !== "none" && shouldConfirmEpisodeScriptReimport({ hasScriptSnapshot: Boolean(activeCanvas.scriptSnapshot?.trim()), tableShotCount: activeShots.length, shotGroupCount: activeShotGroups.length }))
            Modal.confirm({ title: "重新绑定或导入剧本？", content: "已有剧本快照、分镜头和生成镜头组不会被静默覆盖；如需重新生成草案，需要之后手动确认。", okText: "确认更新", cancelText: "取消", onOk: apply });
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

    const runAssetExtraction = () => {
        if (!activeCanvas) return message.warning("请先选择画布");
        if (!assetExtractorRunReadiness.canRun) return message.warning(assetExtractorRunReadiness.reason);
        if (!assetExtractorConfig || !assetExtractorAvailability.allowed) {
            message.warning(assetExtractorAvailability.reason || "资产提取 Agent 不可用");
            onOpenAgentSettings?.();
            return;
        }
        try {
            const context = { projectId, canvas: activeCanvas };
            createAgentRun(assetExtractorConfig, buildAssetExtractorRunInput(context), buildLocalAssetExtractorDraftOutput(context));
            message.success("已创建资产提取草案，请先审核再写入本集生图需求");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "资产提取 Agent 运行失败");
        }
    };

    const applyAssetExtractionRun = (run: AgentRunRecord) => {
        if (!activeCanvas?.episodeId) return message.warning("请先绑定或导入本集剧本");
        try {
            const drafts = buildAssetBreakdownInputsFromAgentRun(run, { projectId, canvas: activeCanvas });
            if (!drafts.length) return message.warning("当前草案没有可写入的资产需求");
            const apply = () => {
                const count = importAgentAssetDrafts({ projectId, episodeId: activeCanvas.episodeId!, drafts });
                markAgentRunApplied(run.id);
                message.success(`已写入 ${count} 条本集生图需求，重复项会自动合并`);
            };
            Modal.confirm({ title: "写入本集生图需求？", content: "将把已批准的资产草案写入资产拆解列表，不会自动创建 Brief、生成图片或扣费。重复资产会按同集同类同名合并。", okText: "写入", cancelText: "取消", onOk: apply });
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "资产草案写入失败");
        }
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

                {!activeCanvas ? (
                    <Empty description="当前项目还没有画布">
                        {onCreateCanvas ? (
                            <Button type="primary" onClick={onCreateCanvas}>
                                新建一集画布并导入剧本
                            </Button>
                        ) : null}
                    </Empty>
                ) : (
                    <>
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
                        <AssetExtractionSection
                            canRun={assetExtractorRunReadiness.canRun && assetExtractorAvailability.allowed}
                            disabledReason={assetExtractorRunReadiness.reason || assetExtractorAvailability.reason}
                            runs={activeAssetExtractorRuns}
                            onRun={runAssetExtraction}
                            onApprove={approveAgentRun}
                            onReject={rejectAgentRun}
                            onApply={applyAssetExtractionRun}
                            onOpenAgentSettings={onOpenAgentSettings}
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
                    </>
                )}
            </div>

            <TableShotFormModal open={shotFormOpen} editingShot={editingShot} assets={mediaAssets} onCancel={() => setShotFormOpen(false)} onSubmit={submitShot} />
            <ShotGroupFormModal open={shotGroupFormOpen} editingGroup={editingShotGroup} assets={mediaAssets} bibleItems={projectBibleItems} onCancel={() => setShotGroupFormOpen(false)} onSubmit={submitShotGroup} />
            <Modal
                title="绑定或导入本集剧本"
                open={bindOpen}
                onCancel={() => {
                    setBindOpen(false);
                    setBindPromptDismissed(true);
                }}
                onOk={() => void applyBindEpisode()}
                okText="确认"
                cancelText="取消"
                destroyOnHidden
            >
                <Alert
                    className="mb-4"
                    type="info"
                    showIcon
                    message="选择本集生产方式"
                    description="剧本驱动生产用于拆资产和分镜；自由画布制作可以不绑定剧本继续创作；资产生产与复用可先沉淀角色图、场景图、道具图和氛围参考。确认后不会自动运行 Agent、生成分镜草案或触发生成扣费。"
                />
                <Form form={bindForm} layout="vertical" initialValues={{ mode: "import" }}>
                    <Form.Item name="mode" label="剧本来源">
                        <Select
                            options={[
                                { label: "不绑定剧本，继续自由画布制作", value: "none" },
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
                            ) : getFieldValue("mode") === "import" ? (
                                <>
                                    <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写标题" }]}>
                                        <Input placeholder="例如：第一集" />
                                    </Form.Item>
                                    <Form.Item name="scriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                                        <Input.TextArea rows={8} />
                                    </Form.Item>
                                </>
                            ) : (
                                <Alert type="success" showIcon message="自由画布制作" description="不绑定剧本也可以继续使用画布、素材、Brief 和视频生成节点。后续需要剧本驱动生产时，可随时从本集工作台重新绑定或导入。" />
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
