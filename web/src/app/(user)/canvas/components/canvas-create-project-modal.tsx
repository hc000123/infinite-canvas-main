"use client";

import { useEffect, useMemo } from "react";
import { Form, Input, InputNumber, Modal, Select, Typography } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { canvasEpisodeContextFromEpisode, type CanvasCreateScriptBinding } from "../utils/canvas-episode-context";
import { buildCanvasProjectPresetFromConfig, canvasProjectPresetModelOptions, canvasProjectPresetOptions, type CanvasProjectPreset } from "../utils/canvas-project-preset";
import { orderedScriptEpisodes, orderedScriptScenes, type ScriptEpisode, type ScriptScene } from "../utils/script-management";

type CanvasCreateProjectValues = CanvasProjectPreset & {
    title: string;
    presetKey?: string;
    scriptSource?: "none" | "existing" | "import";
    episodeId?: string;
    importedEpisodeTitle?: string;
    importedScriptText?: string;
};

export function CanvasCreateProjectModal({
    open,
    defaultTitle,
    initialPreset,
    config,
    modalTitle = "新建画布",
    nameLabel = "画布名称",
    namePlaceholder = "例如：毕业典礼短剧",
    showTitleField = true,
    okText = "创建并进入",
    helperText = "预设会作为本画布后续生成配置节点和视频生成的默认值；旧画布没有预设时继续使用全局配置。",
    scriptOptions,
    onCancel,
    onCreate,
}: {
    open: boolean;
    defaultTitle: string;
    initialPreset?: CanvasProjectPreset;
    config: AiConfig;
    modalTitle?: string;
    nameLabel?: string;
    namePlaceholder?: string;
    showTitleField?: boolean;
    okText?: string;
    helperText?: string;
    scriptOptions?: { projectId: string; episodes: ScriptEpisode[]; scenes: ScriptScene[] };
    onCancel: () => void;
    onCreate: (title: string, preset: CanvasProjectPreset, scriptBinding?: CanvasCreateScriptBinding) => void;
}) {
    const [form] = Form.useForm<CanvasCreateProjectValues>();
    const videoProvider = Form.useWatch("defaultVideoProvider", form) || config.videoProtocol || "openai";
    const scriptSource = Form.useWatch("scriptSource", form) || "none";
    const imageModelOptions = useMemo(() => modelSelectOptions(canvasProjectPresetModelOptions(config, "image")), [config]);
    const videoModelOptions = useMemo(() => modelSelectOptions(canvasProjectPresetModelOptions(config, "video", videoProvider)), [config, videoProvider]);
    const textModelOptions = useMemo(() => modelSelectOptions(canvasProjectPresetModelOptions(config, "text")), [config]);
    const projectEpisodes = useMemo(() => (scriptOptions ? orderedScriptEpisodes(scriptOptions.episodes, scriptOptions.projectId) : []), [scriptOptions]);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({ title: defaultTitle, presetKey: undefined, scriptSource: "none", episodeId: undefined, importedEpisodeTitle: "", importedScriptText: "", ...buildCanvasProjectPresetFromConfig(config, initialPreset) });
    }, [config, defaultTitle, form, initialPreset, open]);

    useEffect(() => {
        if (!open) return;
        const selected = form.getFieldValue("defaultVideoModel");
        const first = videoModelOptions[0]?.value;
        if (first && !videoModelOptions.some((item) => item.value === selected)) form.setFieldValue("defaultVideoModel", first);
    }, [form, open, videoModelOptions]);

    const submit = async () => {
        const values = await form.validateFields();
        onCreate((values.title || defaultTitle).trim() || defaultTitle, buildCanvasProjectPresetFromConfig(config, values), buildScriptBinding(values, scriptOptions));
    };

    return (
        <Modal title={modalTitle} open={open} width={720} onCancel={onCancel} onOk={() => void submit()} okText={okText} cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                {showTitleField ? (
                    <Form.Item name="title" label={nameLabel} rules={[{ required: true, message: `请输入${nameLabel}` }]}>
                        <Input placeholder={namePlaceholder} />
                    </Form.Item>
                ) : null}
                <Form.Item name="presetKey" label="常用预设">
                    <Select
                        allowClear
                        placeholder="选择后可继续微调"
                        options={canvasProjectPresetOptions.map((item) => ({ label: item.label, value: item.key }))}
                        onChange={(key) => {
                            const selected = canvasProjectPresetOptions.find((item) => item.key === key);
                            if (selected) form.setFieldsValue(buildCanvasProjectPresetFromConfig(config, selected.preset));
                        }}
                    />
                </Form.Item>
                <div className="grid gap-3 sm:grid-cols-4">
                    <Form.Item name="resolution" label="分辨率">
                        <Select
                            options={[
                                { label: "720p", value: "720" },
                                { label: "1080p", value: "1080" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="ratio" label="画幅比例">
                        <Select
                            options={[
                                { label: "横屏 16:9", value: "16:9" },
                                { label: "竖屏 9:16", value: "9:16" },
                                { label: "方形 1:1", value: "1:1" },
                                { label: "横屏 4:3", value: "4:3" },
                                { label: "竖屏 3:4", value: "3:4" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="fps" label="帧率">
                        <Select
                            options={[
                                { label: "24fps", value: "24" },
                                { label: "30fps", value: "30" },
                                { label: "60fps", value: "60" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="defaultDuration" label="默认时长">
                        <InputNumber min={1} max={20} className="w-full" addonAfter="秒" />
                    </Form.Item>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Form.Item name="defaultVideoProvider" label="默认视频供应商">
                        <Select
                            onChange={(provider) => {
                                const firstModel = canvasProjectPresetModelOptions(config, "video", provider)[0];
                                if (firstModel) form.setFieldValue("defaultVideoModel", firstModel);
                            }}
                            options={[
                                { label: "OpenAI 兼容", value: "openai" },
                                { label: "火山 Seedance", value: "volcengine-ark" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="defaultImageModel" label="默认图片模型">
                        <Select showSearch optionFilterProp="label" placeholder="选择图片模型" options={imageModelOptions} />
                    </Form.Item>
                    <Form.Item name="defaultVideoModel" label="默认视频模型">
                        <Select showSearch optionFilterProp="label" placeholder="选择视频模型" options={videoModelOptions} />
                    </Form.Item>
                    <Form.Item name="defaultTextModel" label="默认文本模型">
                        <Select showSearch optionFilterProp="label" placeholder="选择文本模型" options={textModelOptions} />
                    </Form.Item>
                </div>
                {scriptOptions ? (
                    <div className="mb-4 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                        <Typography.Text className="mb-3 block font-medium">剧本来源</Typography.Text>
                        <Form.Item name="scriptSource" className="mb-3">
                            <Select
                                options={[
                                    { label: "不绑定剧本", value: "none" },
                                    { label: "从项目已有剧本分集选择", value: "existing" },
                                    { label: "粘贴 / 导入本集剧本", value: "import" },
                                ]}
                            />
                        </Form.Item>
                        {scriptSource === "existing" ? (
                            <Form.Item name="episodeId" label="选择本集" rules={[{ required: true, message: "请选择要绑定的分集" }]}>
                                <Select
                                    showSearch
                                    placeholder={projectEpisodes.length ? "选择项目内已有分集" : "当前项目还没有分集"}
                                    optionFilterProp="label"
                                    disabled={!projectEpisodes.length}
                                    options={projectEpisodes.map((episode) => ({ label: `第 ${episode.order} 集 · ${episode.title}`, value: episode.id }))}
                                />
                            </Form.Item>
                        ) : null}
                        {scriptSource === "import" ? (
                            <>
                                <Form.Item name="importedEpisodeTitle" label="本集标题" rules={[{ required: true, message: "请输入本集标题" }]}>
                                    <Input placeholder="例如：第一集 毕业典礼" />
                                </Form.Item>
                                <Form.Item name="importedScriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                                    <Input.TextArea rows={7} placeholder="粘贴这一集的剧本正文。创建后会写入项目剧本分集，并保存一份画布快照。" />
                                </Form.Item>
                            </>
                        ) : null}
                    </div>
                ) : null}
                <Typography.Text type="secondary" className="text-xs">
                    {helperText}
                </Typography.Text>
            </Form>
        </Modal>
    );
}

function modelSelectOptions(models: string[]) {
    return models.map((model) => ({ label: model, value: model }));
}

function buildScriptBinding(values: CanvasCreateProjectValues, options?: { projectId: string; episodes: ScriptEpisode[]; scenes: ScriptScene[] }): CanvasCreateScriptBinding | undefined {
    if (!options || values.scriptSource === "none" || !values.scriptSource) return { mode: "none" };
    if (values.scriptSource === "import") {
        return {
            mode: "import",
            title: values.importedEpisodeTitle?.trim() || "未命名集数",
            scriptText: values.importedScriptText?.trim() || "",
        };
    }
    const episode = options.episodes.find((item) => item.id === values.episodeId);
    if (!episode) return { mode: "none" };
    return {
        mode: "existing",
        episodeId: episode.id,
        context: canvasEpisodeContextFromEpisode(options.projectId, episode, orderedScriptScenes(options.scenes, episode.id)),
    };
}
