"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Empty, Input, Modal, Space } from "antd";
import { FileText, Plus, Sparkles } from "lucide-react";

import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useScriptStore } from "../stores/use-script-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { itemsForProductionBibleProject } from "../utils/production-bible";
import { orderedScriptEpisodes, orderedScriptScenes, type ScriptEpisode, type ScriptScene } from "../utils/script-management";
import { buildScriptWorkflowSteps, scriptWorkflowNextAction } from "../utils/script-workflow";
import {
    EpisodeCard,
    EpisodeFormDrawer,
    SceneCard,
    SceneFormDrawer,
    ScriptWorkflowGuide,
    episodeFormPayload,
} from "./script-manager-drawer-parts";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    initialEpisodeId?: string;
    onClose: () => void;
    onOpenStoryboardGroup?: (groupId: string) => void;
};

export function ScriptManagerDrawer({ open, projectId, projectTitle, initialEpisodeId, onClose, onOpenStoryboardGroup }: Props) {
    const { message } = App.useApp();
    const scriptProjects = useScriptStore((state) => state.projects);
    const episodes = useScriptStore((state) => state.episodes);
    const scenes = useScriptStore((state) => state.scenes);
    const upsertProject = useScriptStore((state) => state.upsertProject);
    const addEpisode = useScriptStore((state) => state.addEpisode);
    const updateEpisode = useScriptStore((state) => state.updateEpisode);
    const removeEpisode = useScriptStore((state) => state.removeEpisode);
    const moveEpisode = useScriptStore((state) => state.moveEpisode);
    const addScene = useScriptStore((state) => state.addScene);
    const updateScene = useScriptStore((state) => state.updateScene);
    const removeScene = useScriptStore((state) => state.removeScene);
    const moveScene = useScriptStore((state) => state.moveScene);
    const importScenesFromText = useScriptStore((state) => state.importScenesFromText);
    const createStoryboardGroupFromScene = useStoryboardStore((state) => state.createGroupFromScriptScene);
    const createStoryboardGroupFromEpisode = useStoryboardStore((state) => state.createGroupFromScriptEpisode);
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const projectScript = scriptProjects.find((item) => item.projectId === projectId);
    const projectEpisodes = useMemo(() => orderedScriptEpisodes(episodes, projectId), [episodes, projectId]);
    const [outlineDraft, setOutlineDraft] = useState("");
    const [activeEpisodeId, setActiveEpisodeId] = useState("");
    const [editingEpisode, setEditingEpisode] = useState<ScriptEpisode | null>(null);
    const [episodeFormOpen, setEpisodeFormOpen] = useState(false);
    const [editingScene, setEditingScene] = useState<ScriptScene | null>(null);
    const [sceneFormOpen, setSceneFormOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");

    const activeEpisode = projectEpisodes.find((episode) => episode.id === activeEpisodeId) || projectEpisodes[0] || null;
    const activeScenes = useMemo(() => (activeEpisode ? orderedScriptScenes(scenes, activeEpisode.id) : []), [activeEpisode, scenes]);
    const projectBibleItems = useMemo(() => itemsForProductionBibleProject(productionBibleItems, projectId), [productionBibleItems, projectId]);
    const characterItems = projectBibleItems.filter((item) => item.kind === "character");
    const sceneSettingItems = projectBibleItems.filter((item) => item.kind === "scene");
    const bibleById = useMemo(() => new Map(projectBibleItems.map((item) => [item.id, item])), [projectBibleItems]);
    const workflowInput = { hasOutline: Boolean(outlineDraft.trim()), episodeCount: projectEpisodes.length, activeSceneCount: activeScenes.length };
    const workflowSteps = buildScriptWorkflowSteps(workflowInput);
    const nextAction = scriptWorkflowNextAction(workflowInput);

    useEffect(() => {
        if (!open) return;
        setOutlineDraft(projectScript?.outline || "");
        setActiveEpisodeId((current) => {
            if (initialEpisodeId && projectEpisodes.some((episode) => episode.id === initialEpisodeId)) return initialEpisodeId;
            return current && projectEpisodes.some((episode) => episode.id === current) ? current : projectEpisodes[0]?.id || "";
        });
    }, [initialEpisodeId, open, projectEpisodes, projectScript?.outline]);

    const saveOutline = () => {
        upsertProject(projectId, outlineDraft);
        message.success("故事大纲已保存");
    };

    const startCreateEpisode = () => {
        setEditingEpisode(null);
        setEpisodeFormOpen(true);
    };

    const startCreateScene = () => {
        if (!activeEpisode) return message.warning("请先创建分集");
        setEditingScene(null);
        setSceneFormOpen(true);
    };

    const submitImport = () => {
        if (!activeEpisode) return;
        const ids = importScenesFromText(activeEpisode.id, importText);
        setImportOpen(false);
        setImportText("");
        message.success(`已导入 ${ids.length} 个场次草稿`);
    };

    const openSceneStoryboard = (scene: ScriptScene) => {
        const groupId = scene.storyboardGroupId || createStoryboardGroupFromScene(projectId, scene);
        if (!scene.storyboardGroupId) updateScene(scene.id, { storyboardGroupId: groupId });
        onOpenStoryboardGroup?.(groupId);
        message.success(scene.storyboardGroupId ? "已打开场次分镜组" : "已创建场次分镜组");
    };

    const openEpisodeStoryboard = () => {
        if (!activeEpisode || !activeScenes.length) return;
        const groupId = activeScenes.find((scene) => scene.storyboardGroupId)?.storyboardGroupId || createStoryboardGroupFromEpisode(projectId, activeEpisode, activeScenes);
        activeScenes.forEach((scene) => {
            if (!scene.storyboardGroupId) updateScene(scene.id, { storyboardGroupId: groupId });
        });
        onOpenStoryboardGroup?.(groupId);
        message.success("已打开本集分镜组");
    };

    return (
        <Drawer title="剧本分镜工作台" open={open} onClose={onClose} size={980} destroyOnHidden>
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前画布：{projectTitle} · 按故事大纲、分集、场次到分镜草案推进</div>
            <ScriptWorkflowGuide steps={workflowSteps} nextAction={nextAction} />
            <div className="grid h-full min-h-[680px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-4">
                    <Card size="small" title="故事大纲">
                        <Input.TextArea value={outlineDraft} rows={5} placeholder="记录世界观、主线、人物关系和结局方向" onChange={(event) => setOutlineDraft(event.target.value)} />
                        <Button className="mt-3" size="small" type="primary" onClick={saveOutline}>
                            保存大纲
                        </Button>
                    </Card>
                    <Card
                        size="small"
                        title="分集"
                        extra={
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={startCreateEpisode}>
                                新增
                            </Button>
                        }
                    >
                        {projectEpisodes.length ? (
                            <div className="space-y-2">
                                {projectEpisodes.map((episode) => (
                                    <EpisodeCard
                                        key={episode.id}
                                        episode={episode}
                                        active={episode.id === activeEpisode?.id}
                                        sceneCount={orderedScriptScenes(scenes, episode.id).length}
                                        onSelect={() => setActiveEpisodeId(episode.id)}
                                        onEdit={() => {
                                            setEditingEpisode(episode);
                                            setEpisodeFormOpen(true);
                                        }}
                                        onDelete={() => removeEpisode(episode.id)}
                                        onMoveUp={() => moveEpisode(episode.id, "up")}
                                        onMoveDown={() => moveEpisode(episode.id, "down")}
                                    />
                                ))}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先新增第一个分集，再为这一集拆场次" className="py-8" />
                        )}
                    </Card>
                </div>

                <Card
                    size="small"
                    title={activeEpisode ? `${activeEpisode.title} · 场次` : "场次"}
                    extra={
                        <Space size={6}>
                            <Button size="small" icon={<FileText className="size-3.5" />} disabled={!activeEpisode} onClick={() => setImportOpen(true)}>
                                文本导入
                            </Button>
                            <Button size="small" icon={<Sparkles className="size-3.5" />} disabled={!activeEpisode || !activeScenes.length} onClick={openEpisodeStoryboard}>
                                集生成分镜草案
                            </Button>
                            <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={!activeEpisode} onClick={startCreateScene}>
                                新增场次
                            </Button>
                        </Space>
                    }
                >
                    {activeEpisode ? (
                        <div className="mb-4 rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            {activeEpisode.summary || "暂无本集摘要"}
                            {activeEpisode.hook ? <div>开场钩子：{activeEpisode.hook}</div> : null}
                            {activeEpisode.turningPoint ? <div>转折：{activeEpisode.turningPoint}</div> : null}
                            {activeEpisode.cliffhanger ? <div>结尾悬念：{activeEpisode.cliffhanger}</div> : null}
                        </div>
                    ) : null}
                    {activeScenes.length ? (
                        <div className="space-y-3">
                            {activeScenes.map((scene) => (
                                <SceneCard
                                    key={scene.id}
                                    scene={scene}
                                    bibleById={bibleById}
                                    onEdit={() => {
                                        setEditingScene(scene);
                                        setSceneFormOpen(true);
                                    }}
                                    onDelete={() => removeScene(scene.id)}
                                    onMoveUp={() => moveScene(scene.id, "up")}
                                    onMoveDown={() => moveScene(scene.id, "down")}
                                    onStoryboard={() => openSceneStoryboard(scene)}
                                />
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeEpisode ? "新增场次，或用文本导入批量生成场次草稿" : "先在左侧创建分集"} className="py-16" />
                    )}
                </Card>
            </div>

            <EpisodeFormDrawer
                open={episodeFormOpen}
                editingEpisode={editingEpisode}
                onClose={() => setEpisodeFormOpen(false)}
                onSubmit={(values) => {
                    const payload = episodeFormPayload(projectId, values);
                    if (editingEpisode) {
                        updateEpisode(editingEpisode.id, { ...payload, order: editingEpisode.order });
                    } else {
                        const id = addEpisode(payload);
                        setActiveEpisodeId(id);
                    }
                    setEpisodeFormOpen(false);
                }}
            />
            <SceneFormDrawer
                open={sceneFormOpen}
                editingScene={editingScene}
                characterItems={characterItems}
                sceneSettingItems={sceneSettingItems}
                onClose={() => setSceneFormOpen(false)}
                onSubmit={(values) => {
                    if (!activeEpisode) return;
                    const sceneSetting = sceneSettingItems.find((item) => item.id === values.sceneSettingId);
                    const payload = {
                        episodeId: activeEpisode.id,
                        location: values.location || sceneSetting?.name || "",
                        sceneSettingId: values.sceneSettingId,
                        characterIds: values.characterIds || [],
                        beat: values.beat || "",
                        dialogue: values.dialogue || "",
                        emotion: values.emotion || "",
                        durationHint: values.durationHint || "",
                    };
                    if (editingScene) {
                        updateScene(editingScene.id, { ...payload, order: editingScene.order });
                    } else {
                        addScene(payload);
                    }
                    setSceneFormOpen(false);
                }}
            />
            <Modal title="从纯文本导入场次" open={importOpen} onCancel={() => setImportOpen(false)} onOk={submitImport} okText="导入" cancelText="取消">
                <Input.TextArea value={importText} rows={10} placeholder={"按空行分段，每段会生成一个场次草稿。\n可写：地点：、情绪：、对白：、时长："} onChange={(event) => setImportText(event.target.value)} />
            </Modal>
        </Drawer>
    );
}
