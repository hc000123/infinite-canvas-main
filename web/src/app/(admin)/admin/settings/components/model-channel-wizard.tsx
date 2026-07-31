"use client";

import { CheckCircleFilled, DeleteOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Alert, App, AutoComplete, Button, Card, Col, Collapse, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Steps, Switch, Tag, Typography, theme } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AdminModelChannel, AdminModelTextEndpoint, AdminPublicModelChannelSettings } from "@/services/api/admin";

import { applyWizardPublication, buildWizardChannel, normalizeWizardModels, type WizardChannelDraft, type WizardPublicSelection } from "../model-channel-wizard-model";

type ModelChannelWizardProps = {
    open: boolean;
    initialChannel: AdminModelChannel;
    existingChannel?: AdminModelChannel;
    siblingChannels: AdminModelChannel[];
    publicModelChannel: AdminPublicModelChannelSettings;
    knownModels: string[];
    saving: boolean;
    onCancel: () => void;
    onDiscoverModels: (draft: AdminModelChannel) => Promise<string[]>;
    onFinish: (channel: AdminModelChannel, publicModelChannel: AdminPublicModelChannelSettings) => Promise<void>;
};

type WizardFormValues = WizardChannelDraft & WizardPublicSelection;

const wizardSteps = ["选择渠道类型", "连接信息", "配置模型", "确认使用范围"];
const protocolOptions: { value: AdminModelChannel["protocol"]; title: string; description: string; tag: string }[] = [
    { value: "openai", title: "OpenAI 兼容", description: "适用于标准 /v1 接口及兼容中转服务。", tag: "通用" },
    { value: "volcengine-ark", title: "火山方舟 Ark", description: "使用本地模型名映射企业 Ark Endpoint。", tag: "企业视频" },
    { value: "jimeng-cli", title: "即梦 CLI", description: "由后台调用 dreamina CLI 执行即梦生成任务。", tag: "本地 CLI" },
    { value: "xinglian-cloud", title: "星链云 SD2", description: "对接星链云 Seedance 2.0 提交与查询接口。", tag: "SD2" },
];
const capabilityOptions = [
    { label: "文本 Agent", value: "text" },
    { label: "图片生成", value: "image" },
    { label: "视频生成", value: "video" },
    { label: "视频任务查询", value: "video_query" },
    { label: "素材加白 / 预检", value: "asset_review" },
    { label: "企业预检", value: "preflight" },
    { label: "CLI Worker", value: "cli_workflow" },
];

export function ModelChannelWizard({
    open,
    initialChannel,
    existingChannel,
    siblingChannels,
    publicModelChannel,
    knownModels,
    saving,
    onCancel,
    onDiscoverModels,
    onFinish,
}: ModelChannelWizardProps) {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [form] = Form.useForm<WizardFormValues>();
    const [step, setStep] = useState(0);
    const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
    const [discovering, setDiscovering] = useState(false);
    const wasOpenRef = useRef(false);
    const discoverySequenceRef = useRef(0);
    const protocol = (Form.useWatch("protocol", form) || initialChannel.protocol) as AdminModelChannel["protocol"];
    const selectedModels = Form.useWatch("models", form) || [];
    const endpointMappings = Form.useWatch("endpointMappings", form) || [];
    const capabilities = Form.useWatch("capabilities", form) || [];
    const candidateModels = useMemo(() => normalizeWizardModels([...knownModels, ...discoveredModels]), [discoveredModels, knownModels]);
    const channelModels = useMemo(
        () => (protocol === "volcengine-ark" ? normalizeWizardModels(endpointMappings.map((item) => item?.model || "")) : normalizeWizardModels(selectedModels)),
        [endpointMappings, protocol, selectedModels],
    );
    const defaultModelOptions = useMemo(() => normalizeWizardModels([...publicModelChannel.availableModels, ...channelModels]).map(toOption), [channelModels, publicModelChannel.availableModels]);
    const hasSavedKey = Boolean(existingChannel?.apiKey.trim());

    useEffect(() => {
        discoverySequenceRef.current += 1;
        if (!open) {
            wasOpenRef.current = false;
            setDiscovering(false);
            return;
        }
        if (wasOpenRef.current) return;
        wasOpenRef.current = true;
        const channel = existingChannel || initialChannel;
        const models = normalizeWizardModels(channel.models);
        const publishedModels = models.filter((model) => publicModelChannel.availableModels.includes(model));
        form.resetFields();
        form.setFieldsValue({
            ...channel,
            apiKey: "",
            endpointMappings: channel.protocol === "volcengine-ark" && !channel.endpointMappings.length ? [{ model: "", endpointId: "" }] : channel.endpointMappings,
            publishedModels,
            defaultTextModel: publicModelChannel.defaultTextModel,
            defaultImageModel: publicModelChannel.defaultImageModel,
            defaultVideoModel: publicModelChannel.defaultVideoModel,
            modelTextEndpoints: textEndpointsFor(models, publicModelChannel.modelTextEndpoints),
        });
        setStep(0);
        setDiscoveredModels([]);
        setDiscovering(false);
    }, [existingChannel, form, initialChannel, open, publicModelChannel]);

    const selectProtocol = (nextProtocol: AdminModelChannel["protocol"]) => {
        form.setFieldValue("protocol", nextProtocol);
        if (nextProtocol === "volcengine-ark" && !(form.getFieldValue("endpointMappings") || []).length) {
            form.setFieldValue("endpointMappings", [{ model: "", endpointId: "" }]);
        }
    };

    const preparePublication = () => {
        const currentModels = getChannelModels(form.getFieldsValue(true));
        const selected = normalizeWizardModels(form.getFieldValue("publishedModels") || []).filter((model) => currentModels.includes(model));
        form.setFieldValue("publishedModels", selected);
        form.setFieldValue("modelTextEndpoints", textEndpointsFor(currentModels, form.getFieldValue("modelTextEndpoints") || publicModelChannel.modelTextEndpoints));
    };

    const nextStep = async () => {
        try {
            if (step === 0) await form.validateFields(["protocol"]);
            if (step === 1) await form.validateFields(connectionFieldNames(protocol));
            if (step === 2) {
                await form.validateFields(protocol === "volcengine-ark" ? [["endpointMappings"]] : ["models"], { recursive: true });
                preparePublication();
            }
            setStep((current) => Math.min(3, current + 1));
        } catch {
            // Ant Design renders the field-level validation message.
        }
    };

    const discover = async () => {
        try {
            await form.validateFields(connectionFieldNames(protocol));
        } catch {
            return;
        }
        const draft = buildDiscoveryChannel(existingChannel || initialChannel, form.getFieldsValue(true));
        const sequence = ++discoverySequenceRef.current;
        setDiscovering(true);
        try {
            const result = normalizeWizardModels(await onDiscoverModels(draft));
            if (sequence !== discoverySequenceRef.current) return;
            setDiscoveredModels(result);
            message.success(`已发现 ${result.length} 个模型，请按需选择`);
        } catch (error) {
            if (sequence === discoverySequenceRef.current) message.error(safeErrorMessage(error, [draft.apiKey, form.getFieldValue("apiKey") || ""]));
        } finally {
            if (sequence === discoverySequenceRef.current) setDiscovering(false);
        }
    };

    const finish = async () => {
        try {
            const values = await form.validateFields();
            const channel = buildWizardChannel(existingChannel, values);
            const selection: WizardPublicSelection = {
                publishedModels: values.publishedModels || [],
                defaultTextModel: values.defaultTextModel || "",
                defaultImageModel: values.defaultImageModel || "",
                defaultVideoModel: values.defaultVideoModel || "",
                modelTextEndpoints: values.modelTextEndpoints || [],
            };
            const publication = applyWizardPublication(publicModelChannel, existingChannel, channel, siblingChannels, selection);
            await onFinish(channel, publication);
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            message.error(safeErrorMessage(error, [existingChannel?.apiKey || "", form.getFieldValue("apiKey") || ""]));
        }
    };

    return (
        <Modal
            rootClassName="studio-modal"
            title={existingChannel ? "编辑模型渠道" : "新增模型渠道"}
            open={open}
            width={920}
            onCancel={onCancel}
            destroyOnHidden
            styles={{ body: { maxHeight: "calc(100dvh - 190px)", overflowY: "auto" } }}
            footer={
                <Flex justify="space-between" align="center">
                    <Button onClick={onCancel} disabled={saving}>取消</Button>
                    <Space>
                        {step > 0 ? <Button onClick={() => setStep((current) => current - 1)} disabled={saving}>上一步</Button> : null}
                        {step < 3 ? <Button type="primary" onClick={() => void nextStep()}>下一步</Button> : <Button type="primary" loading={saving} onClick={() => void finish()}>保存渠道</Button>}
                    </Space>
                </Flex>
            }
        >
            <Steps current={step} size="small" responsive items={wizardSteps.map((title) => ({ title }))} style={{ marginBottom: 24 }} />
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="protocol" hidden rules={[{ required: true }]}><Input /></Form.Item>
                <div style={{ display: step === 0 ? "block" : "none" }}>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>这个渠道如何连接模型？</Typography.Title>
                    <Typography.Paragraph type="secondary">选择实际使用的协议，后续只会展示该协议需要的字段。</Typography.Paragraph>
                    <Row gutter={[12, 12]}>
                        {protocolOptions.map((item) => {
                            const selected = protocol === item.value;
                            return (
                                <Col key={item.value} xs={24} sm={12}>
                                    <Card
                                        hoverable
                                        size="small"
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={selected}
                                        onClick={() => selectProtocol(item.value)}
                                        onKeyDown={(event) => {
                                            if (event.key !== "Enter" && event.key !== " ") return;
                                            event.preventDefault();
                                            selectProtocol(item.value);
                                        }}
                                        style={{ height: "100%", borderColor: selected ? token.colorPrimary : token.colorBorderSecondary, background: selected ? token.colorPrimaryBg : token.colorBgContainer }}
                                    >
                                        <Flex vertical gap={8}>
                                            <Flex justify="space-between" align="center" gap={8}>
                                                <Typography.Text strong>{item.title}</Typography.Text>
                                                {selected ? <CheckCircleFilled style={{ color: token.colorPrimary }} /> : <Tag>{item.tag}</Tag>}
                                            </Flex>
                                            <Typography.Text type="secondary" className="text-xs leading-5">{item.description}</Typography.Text>
                                        </Flex>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                </div>

                <div style={{ display: step === 1 ? "block" : "none" }}>
                    <ConnectionFields protocol={protocol} hasSavedKey={hasSavedKey} />
                </div>

                <div style={{ display: step === 2 ? "block" : "none" }}>
                    <Flex vertical gap={16}>
                        <Flex justify="space-between" align="center" gap={12} wrap>
                            <div>
                                <Typography.Title level={5} style={{ margin: 0 }}>配置渠道模型</Typography.Title>
                                <Typography.Text type="secondary">发现结果只作为候选，不会自动选中。</Typography.Text>
                            </div>
                            <Button icon={<ReloadOutlined />} loading={discovering} onClick={() => void discover()}>发现模型</Button>
                        </Flex>
                        {discoveredModels.length ? <Alert type="success" showIcon title={`已发现 ${discoveredModels.length} 个模型`} description="可从下方候选中选择，也可保留现有手动输入。" /> : null}
                        {protocol === "volcengine-ark" ? <ArkEndpointMappings candidates={candidateModels} /> : (
                            <Form.Item name="models" label="渠道可用模型" extra="可从候选中挑选，也可手动输入模型名称；支持回车、逗号或换行分隔。" rules={[{ required: true, message: "请配置至少一个模型" }]}>
                                <Select mode="tags" tokenSeparators={[",", "\n"]} maxTagCount="responsive" placeholder="选择或手动输入模型名称" options={candidateModels.map(toOption)} />
                            </Form.Item>
                        )}
                    </Flex>
                </div>

                <div style={{ display: step === 3 ? "block" : "none" }}>
                    <Flex vertical gap={16}>
                        <Alert type="info" showIcon title="明确选择公开范围" description="保存渠道不会自动公开，只有这里选中的模型会加入系统可用模型。" />
                        <Row gutter={16}>
                            <Col span={24}>
                                <Form.Item name="capabilities" label="渠道能力" rules={[{ required: true, message: "请选择至少一项渠道能力" }]}>
                                    <Select mode="multiple" options={capabilityOptions} placeholder="选择这个渠道能够处理的任务" />
                                </Form.Item>
                            </Col>
                            <Col span={24}>
                                <Form.Item name="publishedModels" label="加入系统可用模型">
                                    <Select mode="multiple" allowClear options={channelModels.map(toOption)} placeholder="不选则仅保存私有渠道" />
                                </Form.Item>
                            </Col>
                        </Row>
                        {capabilities.includes("text") ? <TextEndpointFields models={channelModels} /> : null}
                        <Card size="small" title="系统默认模型（可选）">
                            <Row gutter={12}>
                                <Col xs={24} md={8}><DefaultModelField name="defaultTextModel" label="默认文本模型" options={defaultModelOptions} /></Col>
                                <Col xs={24} md={8}><DefaultModelField name="defaultImageModel" label="默认图片模型" options={defaultModelOptions} /></Col>
                                <Col xs={24} md={8}><DefaultModelField name="defaultVideoModel" label="默认视频模型" options={defaultModelOptions} /></Col>
                            </Row>
                        </Card>
                    </Flex>
                </div>
            </Form>
        </Modal>
    );
}

function ConnectionFields({ protocol, hasSavedKey }: { protocol: AdminModelChannel["protocol"]; hasSavedKey: boolean }) {
    return (
        <Flex vertical gap={4}>
            <Typography.Title level={5} style={{ marginTop: 0 }}>填写连接信息</Typography.Title>
            <Row gutter={16}>
                <Col span={24}>
                    <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}><Input placeholder="例如：主文本渠道" /></Form.Item>
                </Col>
                {protocol === "jimeng-cli" ? <JimengFields /> : (
                    <>
                        <Col span={24}>
                            <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: "请输入 Base URL" }]} extra={protocol === "xinglian-cloud" ? "通常填写 https://www.vjimeng.vip/v1" : undefined}>
                                <Input placeholder={protocol === "volcengine-ark" ? "https://ark.cn-beijing.volces.com/api/v3" : "https://api.example.com/v1"} />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="apiKey" label={<Space size={8}>API Key{hasSavedKey ? <Tag color="success">已保存，留空不修改</Tag> : null}</Space>} extra={hasSavedKey ? "已保存密钥，留空会继续使用；只有输入新值才会覆盖。" : undefined} rules={hasSavedKey ? [] : [{ required: true, message: "请输入 API Key" }]}>
                                <Input.Password autoComplete="new-password" placeholder={hasSavedKey ? "已保存，留空不修改" : "输入 API Key"} />
                            </Form.Item>
                        </Col>
                    </>
                )}
            </Row>
            <AdvancedFields />
        </Flex>
    );
}

function JimengFields() {
    return (
        <>
            <Col span={24}>
                <Alert type="info" showIcon title="即梦登录与管理分开" description="管理员只检查 CLI 环境，用户仍在个人配置中完成即梦网页登录。" style={{ marginBottom: 20 }} />
            </Col>
            <Col span={24}><Form.Item name="cliPath" label="CLI 路径" extra="可留空，后台将使用 PATH 中的 dreamina。"><Input placeholder="dreamina" /></Form.Item></Col>
            <Col span={12}><Form.Item name="workDir" label="工作目录"><Input placeholder="留空使用后台当前目录" /></Form.Item></Col>
            <Col span={12}><Form.Item name="outputDir" label="输出目录"><Input placeholder="data/jimeng-cli" /></Form.Item></Col>
            <Col span={8}><Form.Item name="sessionId" label="会话 ID"><InputNumber min={0} precision={0} className="!w-full" /></Form.Item></Col>
            <Col span={8}><Form.Item name="timeoutSeconds" label="超时秒数"><InputNumber min={0} precision={0} className="!w-full" /></Form.Item></Col>
            <Col span={8}><Form.Item name="concurrencyLimit" label="并发限制"><InputNumber min={1} precision={0} className="!w-full" /></Form.Item></Col>
        </>
    );
}

function AdvancedFields() {
    return (
        <Collapse
            ghost
            size="small"
            items={[{
                key: "advanced",
                label: <Space size={8}><SettingOutlined />高级设置</Space>,
                children: (
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="id" label="渠道 ID" extra="留空时由保存流程生成。"><Input placeholder="text-openai-main" /></Form.Item></Col>
                        <Col span={6}><Form.Item name="weight" label="权重"><InputNumber min={1} precision={0} className="!w-full" /></Form.Item></Col>
                        <Col span={6}><Form.Item name="environment" label="环境"><Select options={[{ label: "开发 dev", value: "dev" }, { label: "测试 test", value: "test" }, { label: "正式 prod", value: "prod" }]} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="enabled" label="启用渠道" valuePropName="checked"><Switch /></Form.Item></Col>
                        <Col span={24}><Form.Item name="remark" label="备注"><Input.TextArea rows={2} placeholder="记录这个渠道的用途或运维信息" /></Form.Item></Col>
                    </Row>
                ),
            }]}
        />
    );
}

function ArkEndpointMappings({ candidates }: { candidates: string[] }) {
    return (
        <Card size="small" title="Ark 模型映射">
            <Form.List name="endpointMappings">
                {(fields, { add, remove }) => (
                    <Flex vertical gap={10}>
                        <Flex justify="space-between" align="center" gap={12} wrap>
                            <Typography.Text type="secondary" className="text-xs">本地模型名称用于系统选择，真实请求使用对应的 EP。</Typography.Text>
                            <Button size="small" icon={<PlusOutlined />} onClick={() => add({ model: "", endpointId: "" })}>新增映射</Button>
                        </Flex>
                        {fields.map((field, index) => (
                            <Row key={field.key} gutter={8} align="top">
                                <Col span={10}>
                                    <Form.Item name={[field.name, "model"]} label={index === 0 ? "本地模型名称" : undefined} rules={[{ required: true, message: "请输入本地模型名称" }]}>
                                        <AutoComplete options={candidates.map(toOption)} placeholder="选择或手写模型名称" filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={[field.name, "endpointId"]} label={index === 0 ? "火山 Endpoint / EP" : undefined} rules={[{ required: true, message: "请输入火山 Endpoint / EP" }]}>
                                        <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
                                    </Form.Item>
                                </Col>
                                <Col span={2}>
                                    <Button aria-label="删除映射" danger disabled={fields.length === 1} icon={<DeleteOutlined />} style={{ marginTop: index === 0 ? 30 : 0 }} onClick={() => remove(field.name)} />
                                </Col>
                            </Row>
                        ))}
                    </Flex>
                )}
            </Form.List>
        </Card>
    );
}

function TextEndpointFields({ models }: { models: string[] }) {
    return (
        <Card size="small" title="文本接口类型">
            <Typography.Paragraph type="secondary" className="text-xs">为这个渠道中的每个文本模型选择请求接口。</Typography.Paragraph>
            <Row gutter={[12, 0]}>
                {models.map((model, index) => (
                    <Col key={model} xs={24} md={12}>
                        <Form.Item name={["modelTextEndpoints", index, "model"]} hidden><Input /></Form.Item>
                        <Form.Item name={["modelTextEndpoints", index, "endpointType"]} label={model}>
                            <Select options={[{ label: "Chat Completions", value: "chat_completions" }, { label: "Responses", value: "responses" }]} />
                        </Form.Item>
                    </Col>
                ))}
            </Row>
        </Card>
    );
}

function DefaultModelField({ name, label, options }: { name: "defaultTextModel" | "defaultImageModel" | "defaultVideoModel"; label: string; options: { label: string; value: string }[] }) {
    return <Form.Item name={name} label={label} style={{ marginBottom: 0 }}><Select allowClear showSearch optionFilterProp="label" options={options} /></Form.Item>;
}

function connectionFieldNames(protocol: AdminModelChannel["protocol"]): (keyof WizardFormValues)[] {
    return protocol === "jimeng-cli" ? ["name"] : ["name", "baseUrl", "apiKey"];
}

function getChannelModels(values: WizardFormValues) {
    return values.protocol === "volcengine-ark" ? normalizeWizardModels((values.endpointMappings || []).map((item) => item.model || "")) : normalizeWizardModels(values.models || []);
}

function textEndpointsFor(models: string[], endpoints: Partial<AdminModelTextEndpoint>[]) {
    const byModel = new Map(endpoints.map((item) => [item.model?.trim(), item.endpointType]));
    return models.map((model) => ({ model, endpointType: byModel.get(model) === "responses" ? "responses" as const : "chat_completions" as const }));
}

function buildDiscoveryChannel(base: AdminModelChannel, values: WizardFormValues): AdminModelChannel {
    const protocol = values.protocol || base.protocol;
    const mappings = (values.endpointMappings || base.endpointMappings || []).map((item) => ({ model: item.model?.trim() || "", endpointId: item.endpointId?.trim() || "" }));
    const enteredKey = values.apiKey?.trim() || "";
    const apiKey = enteredKey && !/^\*+$/.test(enteredKey) ? enteredKey : base.apiKey;
    return {
        id: values.id?.trim() || base.id,
        protocol,
        name: values.name?.trim() || base.name,
        baseUrl: protocol === "jimeng-cli" ? "" : (values.baseUrl ?? base.baseUrl).trim(),
        apiKey: protocol === "jimeng-cli" ? "" : apiKey,
        cliPath: (values.cliPath ?? base.cliPath).trim(),
        workDir: (values.workDir ?? base.workDir).trim(),
        outputDir: (values.outputDir ?? base.outputDir).trim(),
        timeoutSeconds: Math.max(0, Number(values.timeoutSeconds ?? base.timeoutSeconds) || 0),
        sessionId: Math.max(0, Number(values.sessionId ?? base.sessionId) || 0),
        concurrencyLimit: Math.max(1, Number(values.concurrencyLimit ?? base.concurrencyLimit) || 1),
        endpointId: protocol === "volcengine-ark" ? mappings[0]?.endpointId || base.endpointId : "",
        endpointMappings: protocol === "volcengine-ark" ? mappings : [],
        models: protocol === "volcengine-ark" ? normalizeWizardModels(mappings.map((item) => item.model)) : normalizeWizardModels(values.models || base.models),
        capabilities: normalizeWizardModels(values.capabilities || base.capabilities),
        environment: values.environment || base.environment,
        weight: Math.max(1, Number(values.weight ?? base.weight) || 1),
        enabled: values.enabled ?? base.enabled,
        remark: values.remark ?? base.remark,
    };
}

function safeErrorMessage(error: unknown, secrets: string[]) {
    let result = error instanceof Error ? error.message : "操作失败，请检查渠道配置";
    secrets.filter((value) => value && !/^\*+$/.test(value)).forEach((value) => { result = result.split(value).join("***"); });
    return result
        .replace(/(authorization|api[-_ ]?key)(\s*[:=]\s*)\S+/gi, "$1$2***")
        .replace(/bearer\s+[a-z0-9._~+\/-]+/gi, "Bearer ***")
        .replace(/\bsk-[a-z0-9_-]+\b/gi, "sk-***");
}

function toOption(value: string) {
    return { label: value, value };
}
