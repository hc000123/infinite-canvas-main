"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Empty, Form, Input, Modal, Popconfirm, Select, Space, Tag } from "antd";
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { useProductionBibleStore } from "../stores/use-production-bible-store";
import { useScriptStore } from "../stores/use-script-store";
import { useStoryboardStore } from "../stores/use-storyboard-store";
import { itemsForProductionBibleProject, productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import { orderedScriptEpisodes, orderedScriptScenes, type ScriptEpisode, type ScriptScene } from "../utils/script-management";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    onClose: () => void;
    onOpenStoryboardGroup?: (groupId: string) => void;
};

type EpisodeFormValues = {
    title: string;
    summary?: string;
    hook?: string;
    turningPoint?: string;
    cliffhanger?: string;
};

type SceneFormValues = {
    location?: string;
    sceneSettingId?: string;
    characterIds?: string[];
    beat?: string;
    dialogue?: string;
    emotion?: string;
    durationHint?: string;
};

export function ScriptManagerDrawer({ open, projectId, projectTitle, onClose, onOpenStoryboardGroup }: Props) {
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

    useEffect(() => {
        if (!open) return;
        setOutlineDraft(projectScript?.outline || "");
        setActiveEpisodeId((current) => (current && projectEpisodes.some((episode) => episode.id === current) ? current : projectEpisodes[0]?.id || ""));
    }, [open, projectEpisodes, projectScript?.outline]);

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
        <Drawer title="剧本管理" open={open} onClose={onClose} size={980} destroyOnHidden>
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前画布：{projectTitle}</div>
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
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分集" className="py-8" />
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
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={activeEpisode ? "暂无场次" : "请先创建分集"} className="py-16" />
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

function EpisodeCard({
    episode,
    active,
    sceneCount,
    onSelect,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    episode: ScriptEpisode;
    active: boolean;
    sceneCount: number;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-3 text-left transition ${active ? "border-stone-900 bg-stone-100 dark:border-stone-200 dark:bg-stone-800" : "border-stone-200 hover:border-stone-400 dark:border-stone-700"}`}
            onClick={onSelect}
        >
            <div className="flex items-start gap-2">
                <Tag className="m-0 shrink-0">第 {episode.order} 集</Tag>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{episode.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{episode.summary || "暂无摘要"}</div>
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-stone-400">{sceneCount} 个场次</span>
                <Space size={2} onClick={(event) => event.stopPropagation()}>
                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} onClick={onMoveUp} />
                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} onClick={onMoveDown} />
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个分集？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            </div>
        </button>
    );
}

function episodeFormPayload(projectId: string, values: EpisodeFormValues) {
    return {
        projectId,
        title: values.title,
        summary: values.summary || "",
        hook: values.hook || "",
        turningPoint: values.turningPoint || "",
        cliffhanger: values.cliffhanger || "",
    };
}

function SceneCard({
    scene,
    bibleById,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
    onStoryboard,
}: {
    scene: ScriptScene;
    bibleById: Map<string, ProductionBibleItem>;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onStoryboard: () => void;
}) {
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Tag className="m-0">场 {scene.order}</Tag>
                    <span className="truncate">{scene.location || bibleById.get(scene.sceneSettingId || "")?.name || "未设定地点"}</span>
                </div>
            }
            extra={
                <Space size={2}>
                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} onClick={onMoveUp} />
                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} onClick={onMoveDown} />
                    <Button size="small" type="text" icon={<Sparkles className="size-3.5" />} onClick={onStoryboard} />
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个场次？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                <div className="whitespace-pre-wrap leading-6 text-stone-700 dark:text-stone-300">{scene.beat || "暂无剧情节拍"}</div>
                <Space size={[4, 4]} wrap>
                    {scene.characterIds.map((id) => (
                        <Tag key={id} className="m-0">
                            {bibleById.get(id)?.name || id}
                        </Tag>
                    ))}
                    {scene.sceneSettingId ? (
                        <Tag className="m-0">
                            {productionBibleKindLabel(bibleById.get(scene.sceneSettingId)?.kind || "scene")}：{bibleById.get(scene.sceneSettingId)?.name || scene.sceneSettingId}
                        </Tag>
                    ) : null}
                    {scene.emotion ? <Tag className="m-0">情绪：{scene.emotion}</Tag> : null}
                    {scene.durationHint ? <Tag className="m-0">时长：{scene.durationHint}</Tag> : null}
                    {scene.storyboardGroupId ? (
                        <Tag color="blue" className="m-0">
                            分镜草案：{scene.storyboardGroupId}
                        </Tag>
                    ) : null}
                </Space>
                {scene.dialogue ? <div className="whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs leading-5 text-stone-500 dark:bg-stone-900 dark:text-stone-400">对白：{scene.dialogue}</div> : null}
            </div>
        </Card>
    );
}

function EpisodeFormDrawer({ open, editingEpisode, onClose, onSubmit }: { open: boolean; editingEpisode: ScriptEpisode | null; onClose: () => void; onSubmit: (values: EpisodeFormValues) => void }) {
    const [form] = Form.useForm<EpisodeFormValues>();
    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            title: editingEpisode?.title || "",
            summary: editingEpisode?.summary || "",
            hook: editingEpisode?.hook || "",
            turningPoint: editingEpisode?.turningPoint || "",
            cliffhanger: editingEpisode?.cliffhanger || "",
        });
    }, [editingEpisode, form, open]);

    return (
        <Drawer
            title={editingEpisode ? "编辑分集" : "新增分集"}
            open={open}
            onClose={onClose}
            size={520}
            destroyOnHidden
            extra={
                <Button type="primary" onClick={() => form.submit()}>
                    保存
                </Button>
            }
        >
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: "请输入标题" }]}>
                    <Input />
                </Form.Item>
                <Form.Item name="summary" label="摘要">
                    <Input.TextArea rows={4} />
                </Form.Item>
                <Form.Item name="hook" label="开场钩子">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="turningPoint" label="转折点">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="cliffhanger" label="结尾悬念">
                    <Input.TextArea rows={2} />
                </Form.Item>
            </Form>
        </Drawer>
    );
}

function SceneFormDrawer({
    open,
    editingScene,
    characterItems,
    sceneSettingItems,
    onClose,
    onSubmit,
}: {
    open: boolean;
    editingScene: ScriptScene | null;
    characterItems: ProductionBibleItem[];
    sceneSettingItems: ProductionBibleItem[];
    onClose: () => void;
    onSubmit: (values: SceneFormValues) => void;
}) {
    const [form] = Form.useForm<SceneFormValues>();
    const sceneSettingId = Form.useWatch("sceneSettingId", form);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            location: editingScene?.location || "",
            sceneSettingId: editingScene?.sceneSettingId,
            characterIds: editingScene?.characterIds || [],
            beat: editingScene?.beat || "",
            dialogue: editingScene?.dialogue || "",
            emotion: editingScene?.emotion || "",
            durationHint: editingScene?.durationHint || "",
        });
    }, [editingScene, form, open]);

    useEffect(() => {
        const setting = sceneSettingItems.find((item) => item.id === sceneSettingId);
        if (setting && !form.getFieldValue("location")) form.setFieldValue("location", setting.name);
    }, [form, sceneSettingId, sceneSettingItems]);

    return (
        <Drawer
            title={editingScene ? "编辑场次" : "新增场次"}
            open={open}
            onClose={onClose}
            size={620}
            destroyOnHidden
            extra={
                <Button type="primary" onClick={() => form.submit()}>
                    保存
                </Button>
            }
        >
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item name="sceneSettingId" label="场景设定">
                    <Select allowClear showSearch optionFilterProp="label" options={sceneSettingItems.map((item) => ({ label: item.name, value: item.id }))} placeholder="可选择 M5.4 场景设定" />
                </Form.Item>
                <Form.Item name="location" label="地点">
                    <Input placeholder="例如：大学操场 / 主席台 / 观礼区" />
                </Form.Item>
                <Form.Item name="characterIds" label="登场角色">
                    <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={characterItems.map((item) => ({ label: item.name, value: item.id }))} placeholder="选择 M5.4 角色设定" />
                </Form.Item>
                <Form.Item name="beat" label="剧情节拍">
                    <Input.TextArea rows={5} placeholder="这一场发生什么，人物目标、冲突和结果是什么" />
                </Form.Item>
                <Form.Item name="dialogue" label="对白草稿">
                    <Input.TextArea rows={4} />
                </Form.Item>
                <Form.Item name="emotion" label="情绪节奏">
                    <Input placeholder="例如：克制、紧张、松弛、爆发" />
                </Form.Item>
                <Form.Item name="durationHint" label="预计时长">
                    <Input placeholder="例如：30 秒 / 1 分钟" />
                </Form.Item>
            </Form>
        </Drawer>
    );
}
