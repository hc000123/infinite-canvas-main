"use client";

import { useEffect } from "react";
import { Button, Card, Drawer, Form, Input, Popconfirm, Select, Space, Tag } from "antd";
import { ArrowDown, ArrowUp, Pencil, Sparkles, Trash2 } from "lucide-react";

import { productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import type { ScriptEpisode, ScriptScene } from "../utils/script-management";
import type { ScriptWorkflowStep } from "../utils/script-workflow";

export type EpisodeFormValues = {
    title: string;
    summary?: string;
    hook?: string;
    turningPoint?: string;
    cliffhanger?: string;
};

export type SceneFormValues = {
    location?: string;
    sceneSettingId?: string;
    characterIds?: string[];
    beat?: string;
    dialogue?: string;
    emotion?: string;
    durationHint?: string;
};

export function ScriptWorkflowGuide({ steps, nextAction }: { steps: ScriptWorkflowStep[]; nextAction: string }) {
    return (
        <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/70">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">推荐流程</div>
                <Tag className="m-0">下一步：{nextAction}</Tag>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
                {steps.map((step, index) => (
                    <div key={step.key} className={`rounded-lg border p-3 ${step.status === "current" ? "border-stone-900 bg-white dark:border-stone-200 dark:bg-stone-800" : "border-stone-200 bg-white/60 dark:border-stone-800 dark:bg-stone-950/40"}`}>
                        <div className="flex items-center gap-2">
                            <span
                                className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${step.status === "done" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950" : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"}`}
                            >
                                {index + 1}
                            </span>
                            <span className="text-sm font-medium">{step.title}</span>
                            {step.status === "current" ? (
                                <Tag className="m-0 ml-auto" color="blue">
                                    当前
                                </Tag>
                            ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-stone-500">{step.detail}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function EpisodeCard({
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

export function episodeFormPayload(projectId: string, values: EpisodeFormValues) {
    return {
        projectId,
        title: values.title,
        summary: values.summary || "",
        hook: values.hook || "",
        turningPoint: values.turningPoint || "",
        cliffhanger: values.cliffhanger || "",
    };
}

export function SceneCard({
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

export function EpisodeFormDrawer({ open, editingEpisode, onClose, onSubmit }: { open: boolean; editingEpisode: ScriptEpisode | null; onClose: () => void; onSubmit: (values: EpisodeFormValues) => void }) {
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

export function SceneFormDrawer({
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
