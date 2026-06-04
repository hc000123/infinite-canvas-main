"use client";

import { useEffect } from "react";
import { Form, Input, InputNumber, Modal, Select, Typography } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { buildCanvasProjectPresetFromConfig, canvasProjectPresetOptions, type CanvasProjectPreset } from "../utils/canvas-project-preset";

type CanvasCreateProjectValues = CanvasProjectPreset & {
    title: string;
    presetKey?: string;
};

export function CanvasCreateProjectModal({ open, defaultTitle, config, onCancel, onCreate }: { open: boolean; defaultTitle: string; config: AiConfig; onCancel: () => void; onCreate: (title: string, preset: CanvasProjectPreset) => void }) {
    const [form] = Form.useForm<CanvasCreateProjectValues>();

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({ title: defaultTitle, presetKey: undefined, ...buildCanvasProjectPresetFromConfig(config) });
    }, [config, defaultTitle, form, open]);

    const submit = async () => {
        const values = await form.validateFields();
        onCreate(values.title.trim() || defaultTitle, buildCanvasProjectPresetFromConfig(config, values));
    };

    return (
        <Modal title="新建画布" open={open} width={720} onCancel={onCancel} onOk={() => void submit()} okText="创建并进入" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false} className="pt-2">
                <Form.Item name="title" label="画布名称" rules={[{ required: true, message: "请输入画布名称" }]}>
                    <Input placeholder="例如：毕业典礼短剧" />
                </Form.Item>
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
                    <Form.Item name="ratio" label="画幅">
                        <Select
                            options={[
                                { label: "16:9", value: "16:9" },
                                { label: "9:16", value: "9:16" },
                                { label: "1:1", value: "1:1" },
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
                            options={[
                                { label: "OpenAI 兼容", value: "openai" },
                                { label: "火山 Seedance", value: "volcengine-ark" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="defaultImageModel" label="默认图片模型">
                        <Input placeholder="图片模型 ID" />
                    </Form.Item>
                    <Form.Item name="defaultVideoModel" label="默认视频模型">
                        <Input placeholder="视频模型或 Seedance Endpoint ID" />
                    </Form.Item>
                    <Form.Item name="defaultTextModel" label="默认文本模型">
                        <Input placeholder="文本模型 ID" />
                    </Form.Item>
                </div>
                <Typography.Text type="secondary" className="text-xs">
                    预设会作为本画布后续生成配置节点和视频生成的默认值；旧画布没有预设时继续使用全局配置。
                </Typography.Text>
            </Form>
        </Modal>
    );
}
