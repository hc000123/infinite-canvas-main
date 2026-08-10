"use client";

import { ApiOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Flex, Form, Input, Modal, Row, Select, Space, Tag, Typography, theme } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { AdminSettings } from "@/services/api/admin";

import { applyModelChannelPreset, MODEL_CHANNEL_PRESETS, type ModelChannelPresetId, type ModelChannelPresetInput, type ModelChannelPresetResult } from "../model-channel-presets";

type ProviderPresetModalProps = {
    open: boolean;
    settings: AdminSettings;
    saving: boolean;
    onCancel: () => void;
    onApply: (result: ModelChannelPresetResult) => Promise<void>;
};

export function ProviderPresetModal({ open, settings, saving, onCancel, onApply }: ProviderPresetModalProps) {
    const { token } = theme.useToken();
    const [form] = Form.useForm<ModelChannelPresetInput>();
    const [presetId, setPresetId] = useState<ModelChannelPresetId>("xinglian");
    const values = Form.useWatch([], form) || {};
    const hasSavedKey = presetHasSavedKey(settings, presetId, values);
    const preview = useMemo(() => {
        try {
            return { result: applyModelChannelPreset(settings, presetId, values), error: "" };
        } catch (error) {
            return { result: null, error: error instanceof Error ? error.message : "请补充预设必填项" };
        }
    }, [presetId, settings, values]);

    useEffect(() => {
        if (!open) return;
        setPresetId("xinglian");
        form.resetFields();
    }, [form, open]);

    const selectPreset = (next: ModelChannelPresetId) => {
        setPresetId(next);
        form.resetFields();
    };

    const applyPreset = async () => {
        await form.validateFields();
        const result = applyModelChannelPreset(settings, presetId, form.getFieldsValue());
        await onApply(result);
    };

    return (
        <Modal
            rootClassName="studio-modal"
            title={
                <Space>
                    <ApiOutlined />
                    一键配置厂商
                </Space>
            }
            open={open}
            width={900}
            onCancel={onCancel}
            footer={
                <Space>
                    <Button onClick={onCancel}>取消</Button>
                    <Button type="primary" loading={saving} disabled={!preview.result} onClick={() => void applyPreset()}>
                        一次配置
                    </Button>
                </Space>
            }
        >
            <Flex vertical gap={20}>
                <Alert
                    showIcon
                    type="info"
                    title="先建立私有渠道，再决定公开哪些模型"
                    description="协议、地址、模型、能力和环境会写入现有渠道；新模型不会自动开放给前台，请随后到公开配置选择系统可用模型和默认模型。"
                />
                <Row gutter={[12, 12]}>
                    {MODEL_CHANNEL_PRESETS.map((preset) => {
                        const selected = preset.id === presetId;
                        return (
                            <Col key={preset.id} xs={24} sm={12} lg={8}>
                                <Card
                                    hoverable
                                    size="small"
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={selected}
                                    onClick={() => selectPreset(preset.id)}
                                    onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        selectPreset(preset.id);
                                    }}
                                    style={{ height: "100%", borderColor: selected ? token.colorPrimary : token.colorBorderSecondary, background: selected ? token.colorPrimaryBg : token.colorBgContainer }}
                                >
                                    <Flex vertical gap={6}>
                                        <Flex justify="space-between" align="center" gap={8}>
                                            <Typography.Text strong>{preset.name}</Typography.Text>
                                            {selected ? <CheckCircleOutlined style={{ color: token.colorPrimary }} /> : <Tag>{preset.tag}</Tag>}
                                        </Flex>
                                        <Typography.Text type="secondary" className="text-xs leading-5">
                                            {preset.description}
                                        </Typography.Text>
                                    </Flex>
                                </Card>
                            </Col>
                        );
                    })}
                </Row>
                <Card size="small" title={`${MODEL_CHANNEL_PRESETS.find((item) => item.id === presetId)?.name || "厂商"}配置`}>
                    <Form form={form} layout="vertical" requiredMark={false}>
                        <PresetFields presetId={presetId} hasSavedKey={hasSavedKey} />
                    </Form>
                </Card>
                {preview.result ? <PresetPreview result={preview.result} /> : <Alert showIcon type="warning" title="还不能应用" description={preview.error} />}
            </Flex>
        </Modal>
    );
}

function PresetFields({ presetId, hasSavedKey }: { presetId: ModelChannelPresetId; hasSavedKey: boolean }) {
    if (presetId === "jimeng") {
        return <Alert showIcon type="success" title="无需 API Key" description="将自动配置六个即梦模型。普通用户在个人配置中完成即梦网页登录。" />;
    }
    if (presetId === "openai-compatible") {
        return (
            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                        <Input placeholder="例如 我的图片中转" />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item name="capability" label="渠道能力" rules={[{ required: true, message: "请选择渠道能力" }]}>
                        <Select options={[{ label: "文本", value: "text" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }]} />
                    </Form.Item>
                </Col>
                <Col span={24}>
                    <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: "请输入 Base URL" }]}>
                        <Input placeholder="https://api.example.com/v1" />
                    </Form.Item>
                </Col>
                <Col span={24}>
                    <APIKeyField hasSavedKey={hasSavedKey} />
                </Col>
                <Col span={24}>
                    <Form.Item name="models" label="模型列表" rules={[{ required: true, message: "请填写至少一个模型" }]} extra="支持回车或逗号分隔；预设不会根据模型名猜测能力。">
                        <Select mode="tags" tokenSeparators={[",", "\n"]} />
                    </Form.Item>
                </Col>
            </Row>
        );
    }
    return (
        <Row gutter={16}>
            <Col xs={24} md={presetId === "volcengine" ? 8 : 24}>
                <APIKeyField hasSavedKey={hasSavedKey} />
            </Col>
            {presetId === "volcengine" ? (
                <>
                    <Col xs={24} md={8}>
                        <Form.Item name="endpointId" label="Seedance 2.0 Endpoint / EP" extra="已有 2.0 映射时留空保留；首次配置必须填写。">
                            <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name="seedance25EndpointId" label="Seedance 2.5 Endpoint / EP" extra="可选；已有 2.5 映射时留空保留。">
                            <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
                        </Form.Item>
                    </Col>
                </>
            ) : null}
        </Row>
    );
}

function APIKeyField({ hasSavedKey }: { hasSavedKey: boolean }) {
    return (
        <Form.Item name="apiKey" label="API Key" extra={hasSavedKey ? "已检测到保存的密钥，留空会继续使用；输入新值才会覆盖。" : "密钥只写入后端私有设置，不会出现在公开配置中。"}>
            <Input.Password placeholder={hasSavedKey ? "已保存，留空不修改" : "请输入 API Key"} />
        </Form.Item>
    );
}

function PresetPreview({ result }: { result: ModelChannelPresetResult }) {
    const changes = [
        result.summary.added.length ? `新增：${result.summary.added.join("、")}` : "",
        result.summary.updated.length ? `更新：${result.summary.updated.join("、")}` : "",
        result.summary.disabled.length ? `停用旧渠道：${result.summary.disabled.join("、")}` : "",
    ].filter(Boolean);
    return (
        <Alert
            showIcon
            type="success"
            title={`可一次保存 · 公开模型目录将包含 ${result.summary.publishedModels.length} 个模型`}
            description={
                <Flex vertical gap={4}>
                    {changes.map((item) => (
                        <Typography.Text key={item} type="secondary">
                            {item}
                        </Typography.Text>
                    ))}
                    <Typography.Text type="secondary">默认模型和已有费用保持不变。</Typography.Text>
                </Flex>
            }
        />
    );
}

function presetHasSavedKey(settings: AdminSettings, presetId: ModelChannelPresetId, values: ModelChannelPresetInput) {
    if (values.apiKey?.trim()) return true;
    if (presetId === "volcengine") return settings.private.channels.some((item) => item.protocol === "volcengine-ark" && Boolean(item.apiKey));
    if (presetId === "xinglian") return settings.private.channels.some((item) => item.protocol === "xinglian-cloud" && Boolean(item.apiKey));
    if (presetId === "comfly") return settings.private.channels.some((item) => item.baseUrl.replace(/\/+$/, "") === "https://ai.comfly.org" && Boolean(item.apiKey));
    if (presetId === "geeknow") return settings.private.channels.some((item) => item.id.startsWith("geeknow-") && Boolean(item.apiKey));
    if (presetId === "openai-compatible" && values.name) return settings.private.channels.some((item) => item.name === values.name && Boolean(item.apiKey));
    return false;
}
