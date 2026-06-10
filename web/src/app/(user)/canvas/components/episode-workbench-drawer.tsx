"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Drawer, Form } from "antd";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { preserveOrCreateAssetVersionReferences } from "../../assets/asset-version-references";
import { defaultAgentConfigs, mergeAgentConfigs, projectAgentConfigOverrides } from "../../projects/agent-settings";
import { useAgentSettingsStore } from "../../projects/use-agent-settings-store";
import { useAgentRunnerStore } from "../../projects/use-agent-runner-store";
import { listAgentRunsByEpisode } from "../../projects/agent-runner.ts";
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
import { canRunAssetExtractor, shouldAllowAssetExtractorRun } from "../utils/agent-asset-extractor";
import { canRunStoryboardDirector, shouldAllowStoryboardDirectorRun } from "../utils/agent-storyboard-director";
import { useEpisodeWorkbenchAgentActions } from "../hooks/use-episode-workbench-agent-actions";
import { itemsForProductionBibleProject } from "../utils/production-bible";
import type { CanvasNodeData } from "../types";
import {
    EpisodeOverviewSection,
    EpisodeScriptSection,
    AssetExtractionSection,
    EpisodeImageNeedsSection,
    EpisodeTableSection,
    GenerationManagementSection,
    ShotGroupReferencePreview,
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
import { findImageBriefForAssetBreakdown } from "../utils/episode-image-needs";
import type { AssetBreakdownItem } from "../utils/asset-breakdown";
import { buildShotGroupEpisodeReferenceCandidates, selectedEpisodeReferenceRefs, summarizeEpisodeReferenceCandidates } from "../utils/shot-group-episode-references";
import { buildEpisodeSnapshot, EpisodeBindScriptModal, type BindFormValues } from "./episode-bind-script-modal";
import { EpisodeWorkbenchAssetPreviewModal, EpisodeWorkbenchEmptyCanvas, EpisodeWorkbenchHeader } from "./episode-workbench-drawer-chrome";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    canvases: CanvasProject[];
    currentCanvasId?: string;
    canvasNodes: CanvasNodeData[];
    onClose: () => void;
    onUpdateCanvasEpisode: (canvasId: string, patch: Pick<Partial<CanvasProject>, "episodeId" | "episodeTitle" | "scriptId" | "scriptSnapshot">) => void;
    onAddShotGroupToCanvas?: (groupId: string, autoAssetRefs?: StoryboardAssetRef[]) => void;
    onOpenAsset?: (asset: Asset) => void;
    onOpenImageBrief?: (briefId: string) => void;
    onLocateNode?: (nodeId: string) => void;
    onRetryNode?: (nodeId: string) => void;
    onOpenAgentSettings?: () => void;
    onCreateCanvas?: () => void;
    promptBindWhenUnbound?: boolean;
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
    onOpenImageBrief,
    onLocateNode,
    onRetryNode,
    onOpenAgentSettings,
    onCreateCanvas,
    promptBindWhenUnbound = false,
}: Props) {
    const { message, modal } = App.useApp();
    const [bindForm] = Form.useForm<BindFormValues>();
    const assets = useAssetStore((state) => state.assets);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const upsertScriptProject = useScriptStore((state) => state.upsertProject);
    const tableShots = useStoryboardStore((state) => state.tableShots);
    const shotGroups = useStoryboardStore((state) => state.shotGroups);
    const applyAgentTableShots = useStoryboardStore((state) => state.applyAgentTableShots);
    const addTableShot = useStoryboardStore((state) => state.addTableShot);
    const updateTableShot = useStoryboardStore((state) => state.updateTableShot);
    const removeTableShot = useStoryboardStore((state) => state.removeTableShot);
    const moveTableShot = useStoryboardStore((state) => state.moveTableShot);
    const createShotGroup = useStoryboardStore((state) => state.createShotGroup);
    const updateShotGroup = useStoryboardStore((state) => state.updateShotGroup);
    const removeShotGroup = useStoryboardStore((state) => state.removeShotGroup);
    const createMoodBrief = useImageBriefStore((state) => state.createFromShotGroup);
    const imageBriefs = useImageBriefStore((state) => state.briefs);
    const createImageBriefFromAssetBreakdown = useImageBriefStore((state) => state.createFromAssetBreakdown);
    const importAgentAssetDrafts = useAssetBreakdownStore((state) => state.importAgentDrafts);
    const updateAssetBreakdownItem = useAssetBreakdownStore((state) => state.updateItem);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const breakdownItems = useAssetBreakdownStore((state) => state.items);
    const globalAgentConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectAgentConfigs = useAgentSettingsStore((state) => state.projectConfigs);
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
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const projectCanvases = useMemo(() => canvases, [canvases]);
    const projectAgentOverrides = projectAgentConfigOverrides(projectAgentConfigs, projectId);
    const resolvedAgentConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalAgentConfigs, projectAgentOverrides), [globalAgentConfigs, projectAgentOverrides]);
    const activeCanvas = projectCanvases.find((canvas) => canvas.id === activeCanvasId) || selectEpisodeWorkbenchCanvas(projectCanvases, currentCanvasId);
    const activeShots = useMemo(() => activeEpisodeTableShots(tableShots, activeCanvas), [activeCanvas, tableShots]);
    const activeShotGroups = useMemo(() => activeEpisodeShotGroups(shotGroups, activeCanvas), [activeCanvas, shotGroups]);
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(productionBibleItems, projectId), [productionBibleItems, projectId]);
    const mediaAssets = useMemo(() => assets.filter((asset) => mediaKinds.has(asset.kind)), [assets]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const episodeReferenceCandidatesByGroupId = useMemo(
        () =>
            Object.fromEntries(
                activeShotGroups.map((group) => [
                    group.id,
                    buildShotGroupEpisodeReferenceCandidates({
                        group,
                        shots: activeShots,
                        imageNeeds: breakdownItems,
                        briefs: imageBriefs,
                        assets,
                    }),
                ]),
            ),
        [activeShotGroups, activeShots, assets, breakdownItems, imageBriefs],
    );
    const episodeReferenceLabelsByGroupId = useMemo(
        () => Object.fromEntries(Object.entries(episodeReferenceCandidatesByGroupId).map(([groupId, candidates]) => [groupId, summarizeEpisodeReferenceCandidates(candidates).label])),
        [episodeReferenceCandidatesByGroupId],
    );
    const stats = useMemo(() => buildEpisodeWorkbenchStats({ canvas: activeCanvas, tableShots, shotGroups, assetBreakdownItems: breakdownItems, nodes: canvasNodes }), [activeCanvas, breakdownItems, canvasNodes, shotGroups, tableShots]);
    const status = deriveEpisodeProductionStatus(stats);
    const modes = workbenchModes(stats);
    const assetExtractorConfig = useMemo(() => resolvedAgentConfigs.find((config) => config.kind === "asset_extractor"), [resolvedAgentConfigs]);
    const assetExtractorAvailability = shouldAllowAssetExtractorRun(assetExtractorConfig);
    const assetExtractorRunReadiness = canRunAssetExtractor(activeCanvas);
    const storyboardDirectorConfig = useMemo(() => resolvedAgentConfigs.find((config) => config.kind === "storyboard_director"), [resolvedAgentConfigs]);
    const storyboardDirectorAvailability = shouldAllowStoryboardDirectorRun(storyboardDirectorConfig);
    const storyboardDirectorRunReadiness = canRunStoryboardDirector(activeCanvas);
    const { applyAssetExtractionRun, applyStoryboardDirectorRun, runAssetExtraction, runStoryboardDirector } = useEpisodeWorkbenchAgentActions({
        activeCanvas,
        activeShots,
        applyAgentTableShots,
        assetExtractorAvailability,
        assetExtractorConfig,
        assetExtractorRunReadiness,
        createAgentRun,
        importAgentAssetDrafts,
        markAgentRunApplied,
        message,
        modal,
        onOpenAgentSettings,
        projectId,
        scriptDraft,
        setSelectedShotIds,
        storyboardDirectorAvailability,
        storyboardDirectorConfig,
        storyboardDirectorRunReadiness,
    });
    const activeCanvasEpisodeId = activeCanvas?.episodeId;
    const activeCanvasIdForRuns = activeCanvas?.id;
    const activeAssetExtractorRuns = useMemo(
        () => (activeCanvasEpisodeId ? listAgentRunsByEpisode(agentRuns, activeCanvasEpisodeId).filter((run) => run.agentKind === "asset_extractor" && run.input.canvasId === activeCanvasIdForRuns) : []),
        [activeCanvasEpisodeId, activeCanvasIdForRuns, agentRuns],
    );
    const activeStoryboardDirectorRuns = useMemo(
        () => (activeCanvasEpisodeId ? listAgentRunsByEpisode(agentRuns, activeCanvasEpisodeId).filter((run) => run.agentKind === "storyboard_director" && run.input.canvasId === activeCanvasIdForRuns) : []),
        [activeCanvasEpisodeId, activeCanvasIdForRuns, agentRuns],
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
            modal.confirm({ title: "保存剧本快照？", content: "这不会自动覆盖已有分镜头表；如需重新生成草案，请手动点击“运行分镜导演”。", okText: "保存", cancelText: "取消", onOk: apply });
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
            modal.confirm({ title: "重新绑定或导入剧本？", content: "已有剧本快照、分镜头和生成镜头组不会被静默覆盖；如需重新生成草案，需要之后手动确认。", okText: "确认更新", cancelText: "取消", onOk: apply });
        else apply();
    };

    const openNeedAsset = (asset: Asset) => {
        if (onOpenAsset) onOpenAsset(asset);
        else setPreviewAsset(asset);
    };

    const openAssetNeedBrief = (item: AssetBreakdownItem) => {
        const existing = findImageBriefForAssetBreakdown(item, imageBriefs);
        if (existing) {
            if (item.briefId !== existing.id) updateAssetBreakdownItem(item.id, { briefId: existing.id, status: "brief_ready" });
            onOpenImageBrief?.(existing.id);
            message.success("已定位关联 Brief 草案");
            return;
        }
        const briefId = createImageBriefFromAssetBreakdown(item);
        updateAssetBreakdownItem(item.id, { briefId, status: "brief_ready" });
        onOpenImageBrief?.(briefId);
        message.success("已生成并定位 Brief 草案");
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
        const candidates = episodeReferenceCandidatesByGroupId[groupId] || [];
        let selectedIds = candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.assetId);
        modal.confirm({
            title: "确认打组加入画布？",
            content: candidates.length ? (
                <ShotGroupReferencePreview candidates={candidates} assetsById={assetsById} defaultSelectedIds={selectedIds} onSelectionChange={(ids) => (selectedIds = ids)} />
            ) : (
                "将创建文本提示词节点、参考素材节点和视频生成配置节点，不会自动开始生成或扣费。"
            ),
            okText: "加入画布",
            cancelText: "取消",
            width: 720,
            onOk: () => {
                const confirmed = candidates.map((candidate) => ({ ...candidate, defaultSelected: selectedIds.includes(candidate.assetId) }));
                onAddShotGroupToCanvas(groupId, selectedEpisodeReferenceRefs(confirmed));
            },
        });
    };

    const retryNode = (nodeId: string) => {
        modal.confirm({ title: "重试现有配置节点？", content: "会复用当前画布节点配置执行生成，请确认后再继续。", okText: "重试", cancelText: "取消", onOk: () => onRetryNode?.(nodeId) });
    };

    return (
        <Drawer title="本集生产流程" open={open} onClose={onClose} size="min(1280px, calc(100vw - 24px))" destroyOnHidden>
            <div className="grid gap-4">
                <EpisodeWorkbenchHeader activeCanvas={activeCanvas} canvases={projectCanvases} projectTitle={projectTitle} onBindScript={openBindModal} onCanvasChange={setActiveCanvasId} onOpenAgentSettings={onOpenAgentSettings} />

                {!activeCanvas ? (
                    <EpisodeWorkbenchEmptyCanvas onCreateCanvas={onCreateCanvas} />
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
                        <EpisodeImageNeedsSection
                            projectId={projectId}
                            canvasId={activeCanvas.id}
                            episodeId={activeCanvas.episodeId}
                            items={breakdownItems}
                            briefs={imageBriefs}
                            assets={assets}
                            onOpenBrief={openAssetNeedBrief}
                            onOpenAsset={openNeedAsset}
                        />

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(480px,0.95fr)]">
                            <EpisodeTableSection
                                shots={activeShots}
                                selectedIds={selectedShotIds}
                                onGenerateDrafts={runStoryboardDirector}
                                canGenerateDrafts={storyboardDirectorRunReadiness.canRun && storyboardDirectorAvailability.allowed}
                                disabledReason={storyboardDirectorRunReadiness.reason || storyboardDirectorAvailability.reason}
                                runs={activeStoryboardDirectorRuns}
                                onApproveRun={approveAgentRun}
                                onRejectRun={rejectAgentRun}
                                onApplyRun={applyStoryboardDirectorRun}
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
                                    autoReferenceLabels={episodeReferenceLabelsByGroupId}
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
            <EpisodeWorkbenchAssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
            <EpisodeBindScriptModal
                open={bindOpen}
                form={bindForm}
                episodeOptions={episodeOptions}
                onCancel={() => {
                    setBindOpen(false);
                    setBindPromptDismissed(true);
                }}
                onOk={() => void applyBindEpisode()}
            />
        </Drawer>
    );
}
