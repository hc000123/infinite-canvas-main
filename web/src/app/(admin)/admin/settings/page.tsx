"use client";

import { CheckCircleOutlined, DeleteOutlined, FormatPainterOutlined, LoadingOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { json } from "@codemirror/lang-json";
import { Alert, App, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Switch, Table, Tabs, Tag, Typography, type FormInstance } from "antd";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";

import { modelMatchesAiCapability, type AiModelKind } from "@/lib/ai-model-kind";
import { ModelChannelWizard } from "./components/model-channel-wizard";
import { ProviderPresetModal } from "./components/provider-preset-modal";
import { channelVerificationCopy, createChannelVerificationCoordinator, filterWizardPublicationSnapshot, runChannelVerification } from "./model-channel-wizard-model";
import type { ModelChannelPresetResult } from "./model-channel-presets";
import {
    fetchAdminSettings,
    fetchChannelModels,
    saveAdminSettings,
    testChannelModel,
    type AdminModelChannel,
    type AdminModelCost,
    type AdminSettings,
} from "@/services/api/admin";
import { VOLCENGINE_ASSET_CONFIG_NOTICE } from "@/services/volcengine-asset-config";
import { useUserStore } from "@/stores/use-user-store";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const jsonEditorTheme = EditorView.theme({
    "&": { backgroundColor: "var(--ant-color-bg-container)", color: "var(--ant-color-text)" },
    ".cm-content": { caretColor: "var(--ant-color-text)", padding: "12px 0" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": { backgroundColor: "var(--ant-color-fill-quaternary)", borderRight: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    ".cm-activeLine": { backgroundColor: "var(--ant-color-fill-quaternary)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--ant-color-fill-quaternary)", color: "var(--ant-color-text)" },
    ".cm-cursor": { borderLeftColor: "var(--ant-color-text)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--ant-control-item-bg-active)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--ant-color-fill-quaternary)", border: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    "&.cm-focused": { outline: "none" },
});

const emptySettings: AdminSettings = {
    public: {
        modelChannel: {
            availableModels: [],
            modelCosts: [],
            modelTextEndpoints: [],
            defaultModel: "",
            defaultImageModel: "",
            defaultVideoModel: "",
            defaultTextModel: "",
            systemPrompt: "",
            allowCustomChannel: false,
        },
        auth: { allowRegister: true },
        volcengineAsset: { enabled: false },
    },
    private: {
        channels: [],
        promptSync: { enabled: false, cron: "*/5 * * * *" },
        auth: {},
        volcengineAsset: { enabled: false, accessKey: "", secretKey: "", accessKeyConfigured: false, secretKeyConfigured: false, projectName: "default", region: "cn-beijing", assetGroupId: "", publicAssetBaseUrl: "" },
    },
};
const emptyChannel: AdminModelChannel = {
    id: "",
    protocol: "openai",
    name: "",
    baseUrl: "",
    apiKey: "",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 0,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    models: [],
    capabilities: ["text"],
    environment: "dev",
    weight: 1,
    enabled: true,
    remark: "",
};
const savedSecretExtra = "已保存的密钥不会在刷新后回显明文；留空保存会继续使用后台已保存的密钥，只在输入新值时替换。";

type SettingsTabKey = "public" | "private";
type EditorMode = "visual" | "json";
type ChannelTableItem = AdminModelChannel & { _index: number; _rowKey: string };

export default function AdminSettingsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [form] = Form.useForm<AdminSettings>();
    const [activeTab, setActiveTab] = useState<SettingsTabKey>("public");
    const [editorMode, setEditorMode] = useState<Record<SettingsTabKey, EditorMode>>({ public: "visual", private: "visual" });
    const [jsonText, setJsonText] = useState<Record<SettingsTabKey, string>>({ public: "", private: "" });
    const [channels, setChannels] = useState<AdminModelChannel[]>([]);
    const [isChannelWizardOpen, setIsChannelWizardOpen] = useState(false);
    const [editingChannelIndex, setEditingChannelIndex] = useState<number | null>(null);
    const [wizardInitialChannel, setWizardInitialChannel] = useState<AdminModelChannel>(emptyChannel);
    const [isSavingChannelWizard, setIsSavingChannelWizard] = useState(false);
    const [isProviderPresetOpen, setIsProviderPresetOpen] = useState(false);
    const [isApplyingProviderPreset, setIsApplyingProviderPreset] = useState(false);
    const enterpriseVideoFocusRef = useRef<HTMLDivElement>(null);
    const verificationCoordinatorRef = useRef(createChannelVerificationCoordinator());
    const [testChannelIndex, setTestChannelIndex] = useState<number | null>(null);
    const [testKeyword, setTestKeyword] = useState("");
    const [selectedTestModels, setSelectedTestModels] = useState<string[]>([]);
    const [testingModels, setTestingModels] = useState<string[]>([]);
    const [testResults, setTestResults] = useState<Record<string, { status: "success" | "error"; duration?: string; message: string }>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEnterpriseVideoFocus, setIsEnterpriseVideoFocus] = useState(false);
    const [modelCosts, setModelCosts] = useState<AdminModelCost[]>([]);
    const [knownModels, setKnownModels] = useState<string[]>([]);
    const watchedPublicModels = Form.useWatch(["public", "modelChannel", "availableModels"], form);
    const watchedModelTextEndpoints = Form.useWatch(["public", "modelChannel", "modelTextEndpoints"], form);
    const publicModels = useMemo(() => watchedPublicModels || [], [watchedPublicModels]);
    const publicModelChannel = Form.useWatch(["public", "modelChannel"], form) || emptySettings.public.modelChannel;
    const privateVolcengineAsset = Form.useWatch(["private", "volcengineAsset"], form) || emptySettings.private.volcengineAsset;
    const publicImageModelOptions = useMemo(() => buildCapabilityModelOptions(publicModels, channels, "image"), [channels, publicModels]);
    const publicVideoModelOptions = useMemo(() => buildCapabilityModelOptions(publicModels, channels, "video"), [channels, publicModels]);
    const publicTextModels = useMemo(() => filterModelsByCapability(publicModels, channels, "text"), [channels, publicModels]);
    const modelTextEndpoints = useMemo(() => normalizeModelTextEndpoints(watchedModelTextEndpoints || [], publicTextModels), [watchedModelTextEndpoints, publicTextModels]);
    const publicTextModelOptions = useMemo(() => publicTextModels.map((item) => ({ label: item, value: item })), [publicTextModels]);
    const channelModels = useMemo(() => collectChannelModels(channels), [channels]);
    const channelTableData = useMemo(() => channels.map((channel, index) => ({ ...channel, _index: index, _rowKey: `${index}-${channel.name}-${channel.baseUrl}` })), [channels]);
    const activeMode = editorMode[activeTab];
    const activeJsonText = jsonText[activeTab];
    const jsonError = activeMode === "json" ? getJsonError(activeJsonText) : "";
    const publicConfigWarnings = useMemo(() => buildPublicConfigWarnings(publicModelChannel, channels), [channels, publicModelChannel]);
    const privateConfigWarnings = useMemo(() => buildPrivateConfigWarnings(channels, privateVolcengineAsset), [channels, privateVolcengineAsset]);
    const activeWarnings = activeTab === "public" ? publicConfigWarnings : privateConfigWarnings;

    const loadSettings = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = normalizeSettings(await fetchAdminSettings(token));
            form.setFieldsValue(data);
            setChannels(data.private.channels);
            setModelCosts(data.public.modelChannel.modelCosts);
            setKnownModels(collectKnownModels(data));
            setJsonText({
                public: JSON.stringify(data.public, null, 2),
                private: JSON.stringify(data.private, null, 2),
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取设置失败");
        } finally {
            setIsLoading(false);
        }
    }, [form, message, token]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (new URLSearchParams(window.location.search).get("focus") !== "enterprise-video") return;
        setIsEnterpriseVideoFocus(true);
        setActiveTab("private");
        setEditorMode((current) => ({ ...current, private: "visual" }));
        const timer = window.setTimeout(() => enterpriseVideoFocusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
        return () => window.clearTimeout(timer);
    }, []);

    const changeTab = (nextTab: SettingsTabKey) => {
        setActiveTab(nextTab);
    };

    const saveSettings = async () => {
        if (!token) return;
        const values = await collectSettings(form, editorMode, jsonText, message);
        if (!values) {
            return;
        }
        setIsSaving(true);
        try {
            const saved = normalizeSettings(await saveAdminSettings(token, values));
            const merged = mergePrivateSecrets(values, saved);
            form.setFieldsValue(merged);
            setChannels(merged.private.channels);
            setModelCosts(merged.public.modelChannel.modelCosts);
            rememberKnownModels(merged);
            setJsonText({
                public: JSON.stringify(merged.public, null, 2),
                private: JSON.stringify(merged.private, null, 2),
            });
            message.success("已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setIsSaving(false);
        }
    };

    const applyProviderPreset = async (result: ModelChannelPresetResult) => {
        if (!token) return;
        setIsApplyingProviderPreset(true);
        try {
            const saved = normalizeSettings(await saveAdminSettings(token, result.settings));
            const merged = mergePrivateSecrets(result.settings, saved);
            form.setFieldsValue(merged);
            setChannels(merged.private.channels);
            setModelCosts(merged.public.modelChannel.modelCosts);
            rememberKnownModels(merged);
            setJsonText({ public: JSON.stringify(merged.public, null, 2), private: JSON.stringify(merged.private, null, 2) });
            setIsProviderPresetOpen(false);
            message.success("厂商预设已一次配置完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "厂商预设保存失败");
        } finally {
            setIsApplyingProviderPreset(false);
        }
    };

    const toggleMode = (tab: SettingsTabKey, nextMode: EditorMode) => {
        if (nextMode === "json") {
            setJsonText((current) => ({
                ...current,
                [tab]: JSON.stringify(tab === "public" ? normalizePublicSetting(form.getFieldValue(["public"]) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(form.getFieldValue(["private"]) as Partial<AdminSettings["private"]>), null, 2),
            }));
            setEditorMode((current) => ({ ...current, [tab]: nextMode }));
            return;
        }
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        form.setFieldsValue({ [tab]: parsed } as Partial<AdminSettings>);
        if (tab === "private") setChannels((parsed as AdminSettings["private"]).channels);
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        rememberKnownModels({ ...normalizeSettings(form.getFieldsValue(true) as AdminSettings), [tab]: parsed });
        setEditorMode((current) => ({ ...current, [tab]: nextMode }));
    };

    const formatJson = (tab: SettingsTabKey) => {
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        setJsonText((current) => ({
            ...current,
            [tab]: JSON.stringify(parsed, null, 2),
        }));
    };

    const openChannelWizard = (index: number | null, initialChannel?: AdminModelChannel) => {
        const channel = index === null ? initialChannel || emptyChannel : channels[index];
        setEditingChannelIndex(index);
        setWizardInitialChannel(channel);
        setIsChannelWizardOpen(true);
        rememberModels(channel.models);
    };

    const openEnterpriseVideoChannel = () => {
        const arkIndex = channels.findIndex((channel) => normalizeChannel(channel).protocol === "volcengine-ark");
        if (arkIndex >= 0) {
            openChannelWizard(arkIndex);
            return;
        }
        const model = defaultArkLocalModelName();
        openChannelWizard(null, {
            ...emptyChannel,
            name: "企业 Ark / Seedance",
            protocol: "volcengine-ark",
            baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
            models: [model],
            endpointMappings: [{ model, endpointId: "" }],
            capabilities: ["text", "video", "video_query", "asset_review", "preflight"],
            environment: "prod",
        });
    };

    const closeChannelWizard = () => {
        setIsChannelWizardOpen(false);
        setEditingChannelIndex(null);
    };

    const finishChannelWizard = async (channel: AdminModelChannel, publicModelChannel: AdminSettings["public"]["modelChannel"]) => {
        const normalizedChannel = normalizeChannel(channel);
        rememberModels(normalizedChannel.models);
        const nextChannels = [...channels];
        if (editingChannelIndex === null) nextChannels.push(normalizedChannel);
        else nextChannels[editingChannelIndex] = normalizedChannel;
        setIsSavingChannelWizard(true);
        try {
            await persistChannels(nextChannels, { publicModelChannel });
            closeChannelWizard();
        } finally {
            setIsSavingChannelWizard(false);
        }
    };

    const discoverChannelModels = async (channel: AdminModelChannel) => {
        if (!token) return [];
        const models = cleanChannelModels(await fetchChannelModels(token, { index: editingChannelIndex ?? undefined, channel: normalizeChannel(channel) }));
        rememberModels(models);
        return models;
    };

    function rememberModels(models: string[]) {
        setKnownModels((current) => cleanChannelModels([...current, ...models]));
    }

    function rememberKnownModels(settings: AdminSettings) {
        rememberModels(collectKnownModels(settings));
    }

    const openTestDialog = (index: number) => {
        verificationCoordinatorRef.current.reset();
        const channel = normalizeChannel(channels[index]);
        if (channel.protocol !== "jimeng-cli" && !channel.baseUrl) {
            message.warning("请先填写接口地址");
            return;
        }
        if (visibleChannelModels(channel.models).length === 0) {
            message.warning("请先配置至少一个模型");
            return;
        }
        setTestChannelIndex(index);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const closeTestDialog = () => {
        verificationCoordinatorRef.current.reset();
        setTestChannelIndex(null);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const testChannel = testChannelIndex === null ? null : normalizeChannel(channels[testChannelIndex]);
    const verificationCopy = channelVerificationCopy(testChannel || emptyChannel);

    const verifyModelsOnline = async (models: string[]) => {
        if (testChannelIndex === null || !token) return;
        const channel = normalizeChannel(channels[testChannelIndex]);
        const selectedModels = uniqueModels(models);
        const request = verificationCoordinatorRef.current.begin(testChannelIndex, channel, selectedModels);
        if (!request) return;
        if (!verificationCoordinatorRef.current.isCurrent(request, testChannelIndex, channel.id)) {
            verificationCoordinatorRef.current.finish(request);
            return;
        }
        setTestingModels((current) => uniqueModels([...current, ...selectedModels]));
        try {
            const results = await runChannelVerification(channel, selectedModels, {
                connect: async () => {
                    await fetchChannelModels(token, { index: testChannelIndex, channel });
                    return "连接与鉴权可用；未创建视频任务";
                },
                testModel: (model) => testChannelModel(token, { index: testChannelIndex, channel, model }),
            });
            if (!verificationCoordinatorRef.current.isCurrent(request, testChannelIndex, channel.id)) return;
            setTestResults((current) => {
                const next = { ...current };
                results.forEach((result) => {
                    next[result.model] = result.status === "success"
                        ? { status: "success", duration: `${(result.durationMs / 1000).toFixed(2)}s`, message: result.message || "检测成功" }
                        : { status: "error", message: result.error instanceof Error ? result.error.message : `${verificationCopy.actionLabel}失败` };
                });
                return next;
            });
        } finally {
            if (verificationCoordinatorRef.current.isCurrent(request, testChannelIndex, channel.id)) {
                const testedModels = new Set(selectedModels);
                setTestingModels((current) => current.filter((item) => !testedModels.has(item)));
            }
            verificationCoordinatorRef.current.finish(request);
        }
    };

    const testModelOnline = async (model: string) => {
        await verifyModelsOnline([model]);
    };

    const batchTestModels = async () => {
        await verifyModelsOnline(selectedTestModels);
    };

    const testModels = visibleChannelModels(testChannel?.models || []).filter((model) => model.toLowerCase().includes(testKeyword.trim().toLowerCase()));

    async function persistChannels(nextChannels: AdminModelChannel[], options: { silent?: boolean; publicModelChannel?: AdminSettings["public"]["modelChannel"] } = {}) {
        if (!token) return;
        const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
        const nextPublicModelChannel = options.publicModelChannel || values.public.modelChannel;
        const nextPublicSnapshot = filterWizardPublicationSnapshot(nextPublicModelChannel, nextChannels);
        const nextSettings = normalizeSettings({
            ...values,
            public: { ...values.public, modelChannel: nextPublicSnapshot },
            private: { ...values.private, channels: nextChannels },
        });
        const saved = normalizeSettings(await saveAdminSettings(token, nextSettings));
        const merged = mergePrivateSecrets(nextSettings, saved);
        setChannels(merged.private.channels);
        setModelCosts(merged.public.modelChannel.modelCosts);
        rememberKnownModels(merged);
        form.setFieldsValue(merged);
        setJsonText({
            public: JSON.stringify(merged.public, null, 2),
            private: JSON.stringify(merged.private, null, 2),
        });
        if (!options.silent) message.success("已保存");
    }

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Flex justify="space-between" align="center" gap={16} wrap>
                        <Tabs
                            activeKey={activeTab}
                            onChange={(key) => changeTab(key as SettingsTabKey)}
                            items={[
                                { key: "public", label: "公开配置（对外暴露）" },
                                { key: "private", label: "私有配置（不会对外暴露）" },
                            ]}
                        />
                        <Space>
                            <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadSettings()}>
                                刷新
                            </Button>
                            <Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={() => void saveSettings()}>
                                保存设置
                            </Button>
                        </Space>
                    </Flex>
                </Card>

                <Card variant="borderless">
                    <Flex justify="space-between" align="center" gap={16} wrap style={{ marginBottom: 16 }}>
                        <Segmented
                            value={activeMode}
                            onChange={(value) => toggleMode(activeTab, value as EditorMode)}
                            options={[
                                { label: "可视化编辑", value: "visual" },
                                { label: "手动编辑 JSON", value: "json" },
                            ]}
                        />
                        {activeMode === "json" ? (
                            <Space>
                                {jsonError ? (
                                    <Tag color="error">{jsonError}</Tag>
                                ) : (
                                    <Tag color="success" icon={<CheckCircleOutlined />}>
                                        JSON 格式正确
                                    </Tag>
                                )}
                                <Button icon={<FormatPainterOutlined />} onClick={() => formatJson(activeTab)}>
                                    格式化
                                </Button>
                            </Space>
                        ) : (
                            <Typography.Text type="secondary">{activeTab === "public" ? "这些配置会暴露给前端读取" : "这些配置只会在后台保存"}</Typography.Text>
                        )}
                    </Flex>
                    {activeMode === "visual" && activeWarnings.length ? (
                        <Alert
                            className="mb-4"
                            type="error"
                            showIcon
                            title="配置还没完整"
                            description={
                                <div>
                                    {activeWarnings.map((item) => (
                                        <div key={item}>{item}</div>
                                    ))}
                                </div>
                            }
                        />
                    ) : null}

                    {activeTab === "public" ? (
                        activeMode === "visual" ? (
                            <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
                                <Alert
                                    className="mb-4"
                                    type="info"
                                    showIcon
                                    title="模型配置分两步"
                                    description="先在“模型渠道”登记协议、密钥、模型和能力，再到这里决定开放范围与三类默认模型。画布节点只保存模型名称，实际协议始终跟随后台渠道映射。"
                                />
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <Form.Item name={["public", "modelChannel", "availableModels"]} label="系统可用模型(请先在私有配置里配置渠道)" extra="可选项来自已启用渠道中选择的模型，最终开放哪些模型由这里勾选决定">
                                            <Select mode="multiple" placeholder="请选择系统可用模型" options={channelModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["public", "modelChannel", "defaultImageModel"]} label="默认图片模型">
                                            <Select showSearch allowClear optionFilterProp="label" placeholder="搜索图片模型" options={publicImageModelOptions} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["public", "modelChannel", "defaultVideoModel"]} label="默认视频模型">
                                            <Select showSearch allowClear optionFilterProp="label" placeholder="搜索视频模型" options={publicVideoModelOptions} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["public", "modelChannel", "defaultTextModel"]} label="默认文本模型">
                                            <Select showSearch allowClear optionFilterProp="label" placeholder="搜索文本模型" options={publicTextModelOptions} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}>
                                        <Form.Item name={["public", "auth", "allowRegister"]} label="是否允许用户注册" extra="关闭后隐藏注册入口，注册接口也会拒绝新用户创建" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}>
                                        <Typography.Title level={5}>文本模型接口类型</Typography.Title>
                                        <Table
                                            rowKey="model"
                                            pagination={false}
                                            size="small"
                                            dataSource={publicTextModels.map((model) => ({ model, endpointType: modelTextEndpointType(modelTextEndpoints, model) }))}
                                            columns={[
                                                { title: "模型", dataIndex: "model" },
                                                {
                                                    title: "文字 Agent 请求接口",
                                                    dataIndex: "endpointType",
                                                    width: 260,
                                                    render: (_, item) => (
                                                        <Select
                                                            className="!w-full"
                                                            value={item.endpointType}
                                                            options={[
                                                                { label: "Chat Completions (/chat/completions)", value: "chat_completions" },
                                                                { label: "Responses (/responses)", value: "responses" },
                                                            ]}
                                                            onChange={(value) => setModelTextEndpoint(form, publicTextModels, item.model, value)}
                                                        />
                                                    ),
                                                },
                                            ]}
                                        />
                                    </Col>
                                    <Col span={24}>
                                        <Typography.Title level={5}>模型算力点</Typography.Title>
                                        <Table
                                            rowKey="model"
                                            pagination={false}
                                            size="small"
                                            dataSource={publicModels.map((model) => ({ model, credits: modelCostCredits(modelCosts, model), unit: modelCreditUnitLabel(model, channels) }))}
                                            columns={[
                                                { title: "模型", dataIndex: "model" },
                                                {
                                                    title: "单位算力点",
                                                    dataIndex: "credits",
                                                    width: 260,
                                                    render: (_, item) => (
                                                        <Space.Compact className="w-full">
                                                            <InputNumber min={0} step={1} precision={0} className="!w-full" value={item.credits} onChange={(value) => setModelCost(form, setModelCosts, item.model, Number(value) || 0)} />
                                                            <Input className="w-24 text-center" value={`点 / ${item.unit}`} readOnly />
                                                        </Space.Compact>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </Col>
                                </Row>
                            </Form>
                        ) : (
                            <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
                                <CodeMirror
                                    value={activeJsonText}
                                    height="520px"
                                    extensions={[json(), jsonEditorTheme]}
                                    basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                                    theme="none"
                                    onChange={(value) => setJsonText((current) => ({ ...current, public: value }))}
                                    style={{ fontSize: 13 }}
                                />
                            </div>
                        )
                    ) : activeMode === "visual" ? (
                        <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
                            <Flex vertical gap={12}>
                                <Card size="small" title="火山素材审核（唯一配置入口）">
                                    <Flex vertical gap={14}>
                                        <Typography.Text type="secondary">
                                            {VOLCENGINE_ASSET_CONFIG_NOTICE}
                                            此处是唯一编辑入口，用来填写 AK/SK、ProjectName、Region 和公网素材访问地址；素材组 ID 可选。图片会先保存到后端公开静态目录；如果公网素材访问地址是火山 TOS
                                            前缀，会在提交前自动上传到对应桶路径，再提交到火山方舟私域虚拟人像素材资产库。
                                        </Typography.Text>
                                        <Space size={8} wrap>
                                            <Tag color={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "accessKey") ? "success" : "default"}>
                                                {isVolcengineAssetKeyConfigured(privateVolcengineAsset, "accessKey") ? "Access Key 已保存" : "Access Key 未填写"}
                                            </Tag>
                                            <Tag color={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "secretKey") ? "success" : "default"}>
                                                {isVolcengineAssetKeyConfigured(privateVolcengineAsset, "secretKey") ? "Secret Key 已保存" : "Secret Key 未填写"}
                                            </Tag>
                                        </Space>
                                        <Row gutter={16}>
                                            <Form.Item name={["private", "volcengineAsset", "accessKeyConfigured"]} valuePropName="checked" hidden>
                                                <Switch />
                                            </Form.Item>
                                            <Form.Item name={["private", "volcengineAsset", "secretKeyConfigured"]} valuePropName="checked" hidden>
                                                <Switch />
                                            </Form.Item>
                                            <Col xs={24} md={6}>
                                                <Form.Item name={["private", "volcengineAsset", "enabled"]} label="开启素材审核" valuePropName="checked">
                                                    <Switch />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={9}>
                                                <Form.Item
                                                    name={["private", "volcengineAsset", "accessKey"]}
                                                    label="访问密钥 Access Key"
                                                    extra={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "accessKey") ? savedSecretExtra : "未保存，请填写 Access Key。"}
                                                >
                                                    <Input.Password placeholder={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "accessKey") ? "已保存，留空不修改" : "请输入 Access Key"} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={9}>
                                                <Form.Item
                                                    name={["private", "volcengineAsset", "secretKey"]}
                                                    label="密钥 Secret Key"
                                                    extra={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "secretKey") ? savedSecretExtra : "未保存，请填写 Secret Key。"}
                                                >
                                                    <Input.Password placeholder={isVolcengineAssetKeyConfigured(privateVolcengineAsset, "secretKey") ? "已保存，留空不修改" : "请输入 Secret Key"} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name={["private", "volcengineAsset", "projectName"]} label="项目名称">
                                                    <Input placeholder="default" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={8}>
                                                <Form.Item name={["private", "volcengineAsset", "region"]} label="地域">
                                                    <Input placeholder="cn-beijing" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={12}>
                                                <Form.Item name={["private", "volcengineAsset", "assetGroupId"]} label="素材组 ID（可选）" extra="不填写时提交素材审核不会指定素材组。">
                                                    <Input placeholder="group-20260318033332-xxxxx" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={12}>
                                                <Form.Item name={["private", "volcengineAsset", "publicAssetBaseUrl"]} label="公网素材访问地址" extra="TOS 地址示例：https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets">
                                                    <Input placeholder="https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </Flex>
                                </Card>
                                <div ref={enterpriseVideoFocusRef}>
                                    {isEnterpriseVideoFocus ? (
                                        <Alert
                                            showIcon
                                            type="warning"
                                            title="企业视频通道需要确认"
                                            description={
                                                <div className="space-y-3">
                                                    <div>从视频生成预检失败进入。请编辑火山方舟 Ark 渠道，确认 API Key、Base URL、Seedance 本地模型名和火山 Endpoint / EP 映射后保存，再回到视频生成页重新预检。</div>
                                                    <Space wrap>
                                                        <Button size="small" type="primary" onClick={openEnterpriseVideoChannel}>
                                                            编辑 Ark 渠道
                                                        </Button>
                                                        <Button size="small" href="/video">
                                                            返回视频生成
                                                        </Button>
                                                    </Space>
                                                </div>
                                            }
                                        />
                                    ) : null}
                                </div>
                                <Space wrap>
                                    <Button type="primary" icon={<FormatPainterOutlined />} onClick={() => setIsProviderPresetOpen(true)}>
                                        一键配置厂商
                                    </Button>
                                    <Button icon={<PlusOutlined />} onClick={() => openChannelWizard(null)}>
                                        手动新增渠道
                                    </Button>
                                </Space>
                                <Table<ChannelTableItem>
                                    rowKey="_rowKey"
                                    pagination={false}
                                    scroll={{ x: 1320 }}
                                    dataSource={channelTableData}
                                    columns={[
                                        { title: "名称", dataIndex: "name", width: 160, render: (value) => value || "未命名渠道" },
                                        { title: "协议", dataIndex: "protocol", width: 96, render: (value) => <Tag>{value || "openai"}</Tag> },
                                        {
                                            title: "渠道 ID",
                                            dataIndex: "id",
                                            width: 180,
                                            render: (value) => (
                                                <Typography.Text copyable ellipsis>
                                                    {value || "保存后生成"}
                                                </Typography.Text>
                                            ),
                                        },
                                        {
                                            title: "状态",
                                            dataIndex: "enabled",
                                            width: 140,
                                            render: (value, item) => (
                                                <Space size={4} wrap>
                                                    <Tag color={value ? "success" : "default"}>{value ? "已启用" : "已停用"}</Tag>
                                                    {channelMissingReasons(item).length ? <Tag color="error">待配置</Tag> : null}
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: "能力",
                                            dataIndex: "capabilities",
                                            width: 180,
                                            render: (value: string[], item) => (
                                                <Space size={4} wrap>
                                                    {(value || []).slice(0, 3).map((capability) => (
                                                        <Tag key={capability}>{capability}</Tag>
                                                    ))}
                                                    {item.environment ? <Tag color={item.environment === "prod" ? "red" : item.environment === "test" ? "gold" : "blue"}>{item.environment}</Tag> : null}
                                                </Space>
                                            ),
                                        },
                                        {
                                            title: "模型",
                                            dataIndex: "models",
                                            width: 360,
                                            render: (value: string[], item: ChannelTableItem) => {
                                                const mappings = channelEndpointMappings(item);
                                                const firstMapping = mappings[0];
                                                return (
                                                    <Space orientation="vertical" size={2} style={{ maxWidth: 360 }}>
                                                        <Typography.Text ellipsis>
                                                            {item.protocol === "volcengine-ark" && firstMapping ? `${firstMapping.model} -> ${firstMapping.endpointId}${mappings.length > 1 ? `，+${mappings.length - 1}` : ""}` : modelSummary(value || [])}
                                                        </Typography.Text>
                                                        {item.protocol === "volcengine-ark" && firstMapping ? (
                                                            <Typography.Text type="secondary" className="text-xs" ellipsis>
                                                                本地模型名用于选择；真实请求按映射使用 EP
                                                            </Typography.Text>
                                                        ) : null}
                                                    </Space>
                                                );
                                            },
                                        },
                                        { title: "权重", dataIndex: "weight", width: 88 },
                                        {
                                            title: "操作",
                                            key: "actions",
                                            width: 220,
                                            align: "right",
                                            render: (_, item) => (
                                                <Space size={4}>
                                                    <Button size="small" onClick={() => openTestDialog(item._index)}>
                                                        {channelVerificationCopy(item).tableLabel}
                                                    </Button>
                                                    <Button size="small" onClick={() => openChannelWizard(item._index)}>
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => {
                                                            const nextChannels = [...channels];
                                                            nextChannels.splice(item._index, 1);
                                                            void persistChannels(nextChannels);
                                                        }}
                                                    />
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            </Flex>
                        </Form>
                    ) : (
                        <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
                            <CodeMirror
                                value={activeJsonText}
                                height="520px"
                                extensions={[json(), jsonEditorTheme]}
                                basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                                theme="none"
                                onChange={(value) => setJsonText((current) => ({ ...current, private: value }))}
                                style={{ fontSize: 13 }}
                            />
                        </div>
                    )}
                </Card>
                <ProviderPresetModal
                    open={isProviderPresetOpen}
                    settings={normalizeSettings(form.getFieldsValue(true) as AdminSettings)}
                    saving={isApplyingProviderPreset}
                    onCancel={() => setIsProviderPresetOpen(false)}
                    onApply={applyProviderPreset}
                />
                <ModelChannelWizard
                    open={isChannelWizardOpen}
                    initialChannel={wizardInitialChannel}
                    existingChannel={editingChannelIndex === null ? undefined : channels[editingChannelIndex]}
                    siblingChannels={channels.filter((_, index) => index !== editingChannelIndex)}
                    publicModelChannel={publicModelChannel}
                    knownModels={knownModels}
                    saving={isSavingChannelWizard}
                    onCancel={closeChannelWizard}
                    onDiscoverModels={discoverChannelModels}
                    onFinish={(channel, publicModelChannel) => finishChannelWizard(channel, publicModelChannel)}
                />
                <Modal
                    rootClassName="studio-modal"
                    title={
                        <Space>
                            {testChannel?.name || "渠道"} 渠道的{verificationCopy.modalLabel}
                            <Typography.Text type="secondary">共 {visibleChannelModels(testChannel?.models || []).length} 个模型</Typography.Text>
                        </Space>
                    }
                    open={testChannelIndex !== null}
                    width={920}
                    onCancel={closeTestDialog}
                    footer={
                        <Space>
                            <Button onClick={closeTestDialog}>取消</Button>
                            <Button type="primary" disabled={!selectedTestModels.length || testingModels.length > 0} onClick={() => void batchTestModels()}>
                                {verificationCopy.batchLabel} {selectedTestModels.length} 个模型
                            </Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    <Flex vertical gap={12}>
                        <Typography.Text type="secondary">{verificationCopy.description}</Typography.Text>
                        <Input.Search placeholder="搜索模型..." allowClear value={testKeyword} onChange={(event) => setTestKeyword(event.target.value)} />
                        <Table
                            rowKey="model"
                            pagination={false}
                            scroll={{ y: 420 }}
                            dataSource={testModels.map((model) => ({ model }))}
                            rowSelection={{
                                selectedRowKeys: selectedTestModels,
                                onChange: (keys) => setSelectedTestModels(keys.map(String)),
                            }}
                            columns={[
                                { title: "模型名称", dataIndex: "model", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
                                {
                                    title: "状态",
                                    dataIndex: "model",
                                    width: 260,
                                    render: (value) => {
                                        if (testingModels.includes(value)) return <Tag icon={<LoadingOutlined className="animate-spin" />}>{verificationCopy.actionLabel}中</Tag>;
                                        const result = testResults[value];
                                        if (!result) return <Tag>未开始</Tag>;
                                        return result.status === "success" ? (
                                            <Space size={6} wrap>
                                                <Tag color="success">成功</Tag>
                                                <Typography.Text type="secondary">请求时长: {result.duration}</Typography.Text>
                                                <Typography.Text type="secondary">{result.message}</Typography.Text>
                                            </Space>
                                        ) : (
                                            <Typography.Text type="danger">{result.message}</Typography.Text>
                                        );
                                    },
                                },
                                {
                                    title: "操作",
                                    key: "actions",
                                    width: 120,
                                    align: "right",
                                    render: (_, item) => (
                                        <Button size="small" loading={testingModels.includes(item.model)} onClick={() => void testModelOnline(item.model)}>
                                            {verificationCopy.actionLabel}
                                        </Button>
                                    ),
                                },
                            ]}
                        />
                    </Flex>
                </Modal>
            </Flex>
        </main>
    );
}

function normalizeSettings(settings: Partial<AdminSettings> = {}): AdminSettings {
    const privateSetting = normalizePrivateSetting(settings.private);
    return {
        public: {
            ...normalizePublicSetting(settings.public),
        },
        private: privateSetting,
    };
}

function normalizePublicSetting(setting: Partial<AdminSettings["public"]> = {}): AdminSettings["public"] {
    return {
        ...emptySettings.public,
        modelChannel: {
            ...emptySettings.public.modelChannel,
            ...(setting.modelChannel || {}),
            availableModels: cleanChannelModels(setting.modelChannel?.availableModels || []),
            modelCosts: normalizeModelCosts(setting.modelChannel?.modelCosts || []),
            modelTextEndpoints: normalizeModelTextEndpoints(setting.modelChannel?.modelTextEndpoints || [], setting.modelChannel?.availableModels || [], false),
        },
        auth: {
            allowRegister: setting.auth?.allowRegister !== false,
        },
        volcengineAsset: { enabled: setting.volcengineAsset?.enabled === true },
    };
}

function normalizeModelCosts(items: Partial<AdminSettings["public"]["modelChannel"]["modelCosts"][number]>[]) {
    return items.filter((item) => item.model && !isEndpointModel(item.model)).map((item) => ({ model: item.model || "", credits: Math.max(0, Number(item.credits) || 0) }));
}

function normalizeModelTextEndpoints(items: Partial<AdminSettings["public"]["modelChannel"]["modelTextEndpoints"][number]>[], models: string[], fillMissing = true) {
    const availableModels = cleanChannelModels(models);
    const modelSet = new Set(availableModels);
    const seen = new Set<string>();
    const result = items
        .map((item) => ({ model: item.model?.trim() || "", endpointType: normalizeTextEndpointType(item.endpointType, item.model || "") }))
        .filter((item) => {
            if (!item.model || seen.has(item.model) || (modelSet.size > 0 && !modelSet.has(item.model))) return false;
            seen.add(item.model);
            return true;
        });
    if (fillMissing) {
        availableModels.forEach((model) => {
            if (!seen.has(model)) result.push({ model, endpointType: defaultTextEndpointType(model) });
        });
    }
    return result;
}

function normalizePrivateSetting(setting: Partial<AdminSettings["private"]> = {}): AdminSettings["private"] {
    return {
        channels: (setting.channels || []).map(normalizeChannel),
        promptSync: {
            enabled: setting.promptSync?.enabled === true,
            cron: setting.promptSync?.cron || "*/5 * * * *",
        },
        auth: {},
        volcengineAsset: normalizePrivateVolcengineAssetSetting(setting.volcengineAsset),
    };
}

function normalizePrivateVolcengineAssetSetting(setting: Partial<AdminSettings["private"]["volcengineAsset"]> = {}): AdminSettings["private"]["volcengineAsset"] {
    return {
        enabled: setting.enabled === true,
        accessKey: setting.accessKey || "",
        secretKey: setting.secretKey || "",
        accessKeyConfigured: setting.accessKeyConfigured === true,
        secretKeyConfigured: setting.secretKeyConfigured === true,
        projectName: setting.projectName || "default",
        region: setting.region || "cn-beijing",
        assetGroupId: setting.assetGroupId || "",
        publicAssetBaseUrl: setting.publicAssetBaseUrl || "",
    };
}

function isVolcengineAssetKeyConfigured(setting: Partial<AdminSettings["private"]["volcengineAsset"]>, key: "accessKey" | "secretKey") {
    if (key === "accessKey") return setting.accessKeyConfigured === true || Boolean(setting.accessKey);
    return setting.secretKeyConfigured === true || Boolean(setting.secretKey);
}

function normalizeChannel(item: Partial<AdminModelChannel> = {}): AdminModelChannel {
    const legacyEndpointId = arkEndpointFromModels(item.models);
    const protocol = item.protocol || "openai";
    const endpointId = protocol === "volcengine-ark" ? normalizeEndpointModel(item.endpointId) || legacyEndpointId : "";
    const endpointMappings = protocol === "volcengine-ark" ? normalizeEndpointMappings(item.endpointMappings, item.models, endpointId) : [];
    return {
        id: (item.id || stableChannelId(item)).trim(),
        protocol,
        name: item.name || "",
        baseUrl: item.baseUrl || "",
        apiKey: item.apiKey || "",
        cliPath: item.cliPath || "",
        workDir: item.workDir || "",
        outputDir: item.outputDir || "",
        timeoutSeconds: Math.max(0, Number(item.timeoutSeconds) || 0),
        sessionId: Math.max(0, Number(item.sessionId) || 0),
        concurrencyLimit: Math.max(1, Number(item.concurrencyLimit) || 1),
        endpointId,
        endpointMappings,
        models: protocol === "volcengine-ark" ? endpointMappings.map((mapping) => mapping.model) : localChannelModels(item.models || [], protocol, endpointId),
        capabilities: normalizeChannelCapabilities(item.capabilities, protocol),
        environment: normalizeChannelEnvironment(item.environment),
        weight: Math.max(1, Number(item.weight) || 1),
        enabled: item.enabled !== false,
        remark: item.remark || "",
    };
}

function stableChannelId(item: Partial<AdminModelChannel>) {
    const source = `${item.name || item.protocol || "channel"}-${item.baseUrl || ""}`.toLowerCase();
    const value = source.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return value || "model-channel";
}

function normalizeChannelCapabilities(value: string[] | undefined, protocol: AdminModelChannel["protocol"]) {
    const fallback = protocol === "volcengine-ark" ? ["text", "video"] : protocol === "jimeng-cli" ? ["video", "video_query", "preflight", "cli_workflow"] : protocol === "xinglian-cloud" ? ["video", "video_query", "preflight"] : ["text", "image"];
    const allowed = new Set(["text", "image", "video", "video_query", "asset_review", "preflight", "cli", "cli_workflow"]);
    const result = Array.from(new Set((value || []).map((item) => item.trim()).filter((item) => allowed.has(item))));
    return result.length ? result : fallback;
}

function normalizeChannelEnvironment(value: AdminModelChannel["environment"] | undefined): AdminModelChannel["environment"] {
    if (value === "test" || value === "prod") return value;
    return "dev";
}

function normalizeEndpointMappings(mappings: Partial<AdminModelChannel["endpointMappings"][number]>[] = [], models: string[] = [], fallbackEndpointId = "") {
    const result: AdminModelChannel["endpointMappings"] = [];
    const seen = new Set<string>();
    const appendMapping = (modelName?: string, endpointId?: string) => {
        const model = (modelName || "").trim();
        const endpoint = normalizeEndpointModel(endpointId);
        if (!model || !endpoint || seen.has(model)) return;
        seen.add(model);
        result.push({ model, endpointId: endpoint });
    };
    mappings.forEach((item) => appendMapping(item?.model, item?.endpointId));
    if (!result.length && normalizeEndpointModel(fallbackEndpointId)) {
        visibleChannelModels(models).forEach((model) => appendMapping(model, fallbackEndpointId));
    }
    return result;
}

function channelEndpointMappings(channel: Partial<AdminModelChannel>) {
    return normalizeEndpointMappings(channel.endpointMappings, channel.models, normalizeEndpointModel(channel.endpointId) || arkEndpointFromModels(channel.models));
}

function normalizeEndpointModel(value?: string) {
    return (value || "").trim();
}

function isEndpointModel(value?: string) {
    return normalizeEndpointModel(value).toLowerCase().startsWith("ep-");
}

function arkEndpointFromModels(models: string[] = []) {
    return models.find(isEndpointModel) || "";
}

function cleanChannelModels(models: string[] = []) {
    return uniqueModels(models).filter((model) => !isEndpointModel(model));
}

function defaultArkLocalModelName() {
    return "Seedance EP";
}

function localChannelModels(models: string[] = [], protocol?: AdminModelChannel["protocol"], endpointId?: string) {
    const visibleModels = cleanChannelModels(models);
    if (protocol === "volcengine-ark" && endpointId && !visibleModels.length) return [defaultArkLocalModelName()];
    return visibleModels;
}

function visibleChannelModels(models: string[] = []) {
    return cleanChannelModels(models);
}

function modelCostCredits(items: AdminSettings["public"]["modelChannel"]["modelCosts"], model: string) {
    return items.find((item) => item.model === model)?.credits || 0;
}

function modelCreditUnitLabel(model: string, channels: AdminModelChannel[]) {
    const capabilities = modelCapabilitiesByChannel(channels).get(model);
    if (modelMatchesAiCapability(model, capabilities, "video")) return "秒";
    if (modelMatchesAiCapability(model, capabilities, "image")) return "张";
    return "次";
}

function modelTextEndpointType(items: AdminSettings["public"]["modelChannel"]["modelTextEndpoints"], model: string) {
    return items.find((item) => item.model === model)?.endpointType || defaultTextEndpointType(model);
}

function setModelCost(form: FormInstance<AdminSettings>, setModelCosts: (items: AdminModelCost[]) => void, model: string, credits: number) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelCosts"]) || []) as AdminSettings["public"]["modelChannel"]["modelCosts"];
    const next = current.filter((item) => item.model !== model);
    next.push({ model, credits: Math.max(0, credits) });
    form.setFieldValue(["public", "modelChannel", "modelCosts"], next);
    setModelCosts(next);
}

function setModelTextEndpoint(form: FormInstance<AdminSettings>, textModels: string[], model: string, endpointType: AdminSettings["public"]["modelChannel"]["modelTextEndpoints"][number]["endpointType"]) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelTextEndpoints"]) || []) as AdminSettings["public"]["modelChannel"]["modelTextEndpoints"];
    const next = normalizeModelTextEndpoints([...current.filter((item) => item.model !== model), { model, endpointType }], textModels);
    form.setFieldValue(["public", "modelChannel", "modelTextEndpoints"], next);
}

function normalizeTextEndpointType(value: unknown, model: string): AdminSettings["public"]["modelChannel"]["modelTextEndpoints"][number]["endpointType"] {
    return value === "responses" || value === "chat_completions" ? value : defaultTextEndpointType(model);
}

function defaultTextEndpointType(model: string): AdminSettings["public"]["modelChannel"]["modelTextEndpoints"][number]["endpointType"] {
    return model.trim().toLowerCase().includes("gpt-5.5") ? "responses" : "chat_completions";
}

function mergePrivateSecrets(input: AdminSettings, saved: AdminSettings): AdminSettings {
    const channels = saved.private.channels.map((item, index) => ({
        ...item,
        apiKey: input.private.channels[index]?.apiKey || item.apiKey,
    }));
    return {
        public: saved.public,
        private: {
            ...saved.private,
            channels,
            volcengineAsset: {
                ...saved.private.volcengineAsset,
                accessKey: input.private.volcengineAsset.accessKey || saved.private.volcengineAsset.accessKey,
                secretKey: input.private.volcengineAsset.secretKey || saved.private.volcengineAsset.secretKey,
            },
        },
    };
}

function collectChannelModels(channels: AdminModelChannel[]) {
    return cleanChannelModels(channels.filter((channel) => channel.enabled).flatMap((channel) => channel.models || []));
}

function filterModelsByCapability(models: string[], channels: AdminModelChannel[], capability: AiModelKind) {
    const capabilitiesByModel = modelCapabilitiesByChannel(channels);
    return cleanChannelModels(models).filter((model) => modelMatchesAiCapability(model, capabilitiesByModel.get(model), capability));
}

function buildCapabilityModelOptions(models: string[], channels: AdminModelChannel[], capability: AiModelKind) {
    return filterModelsByCapability(models, channels, capability).map((item) => ({ label: item, value: item }));
}

function modelCapabilitiesByChannel(channels: AdminModelChannel[]) {
    const capabilitiesByModel = new Map<string, string[]>();
    channels.forEach((item) => {
        const channel = normalizeChannel(item);
        if (!channel.enabled) return;
        visibleChannelModels(channel.models).forEach((model) => {
            const capabilities = new Set(capabilitiesByModel.get(model) || []);
            channel.capabilities.forEach((capability) => capabilities.add(capability));
            capabilitiesByModel.set(model, Array.from(capabilities));
        });
    });
    return capabilitiesByModel;
}

function collectKnownModels(settings: AdminSettings) {
    return cleanChannelModels([...(settings.public.modelChannel.availableModels || []), ...(settings.public.modelChannel.modelCosts || []).map((item) => item.model), ...settings.private.channels.flatMap((channel) => channel.models || [])]);
}

function uniqueModels(models: string[]) {
    return Array.from(new Set(models.filter(Boolean)));
}

function filterModels(models: string[], options: string[]) {
    const optionSet = new Set(options);
    return uniqueModels(models).filter((model) => optionSet.has(model));
}

function modelSummary(models: string[]) {
    const visibleModels = visibleChannelModels(models);
    if (!visibleModels.length) return "未配置模型";
    const preview = visibleModels.slice(0, 3).join(", ");
    return visibleModels.length > 3 ? `${visibleModels.length} 个模型：${preview}...` : preview;
}

function buildPublicConfigWarnings(modelChannel: AdminSettings["public"]["modelChannel"], channels: AdminModelChannel[]) {
    const warnings: string[] = [];
    const enabledChannelModels = collectChannelModels(channels);
    const availableModels = cleanChannelModels(modelChannel.availableModels || []);
    if (!channels.length) warnings.push("还没有私有渠道。请切到“私有配置”，点击“新增渠道”，填写接口地址、API Key 和模型。");
    else if (!enabledChannelModels.length) warnings.push("已启用渠道里没有可用模型。请到“私有配置”编辑渠道，填写模型或 Seedance 模型映射。");
    if (!availableModels.length) warnings.push("公开配置还没有选择系统可用模型。请在“系统可用模型”里勾选要开放给前台的模型。");
    if (!modelChannel.defaultImageModel) warnings.push("默认图片模型未设置。请在“默认图片模型”里选择一个已开放模型。");
    if (!modelChannel.defaultVideoModel) warnings.push("默认视频模型未设置。请在“默认视频模型”里选择一个已开放模型。");
    if (!modelChannel.defaultTextModel) warnings.push("默认文本模型未设置。请在“默认文本模型”里选择一个已开放模型。");
    return warnings;
}

function buildPrivateConfigWarnings(channels: AdminModelChannel[], volcengineAsset: AdminSettings["private"]["volcengineAsset"]) {
    const warnings: string[] = [];
    if (!channels.length) {
        warnings.push("还没有模型渠道。请点击“新增渠道”，填写接口地址、API Key，并配置至少一个模型。");
    }
    channels.forEach((channel, index) => {
        const name = channel.name || `渠道 ${index + 1}`;
        if (channel.protocol !== "jimeng-cli" && !channel.baseUrl.trim()) warnings.push(`${name} 缺少接口地址。请点击该渠道“编辑”，填写“接口地址”。`);
        if (channel.protocol !== "jimeng-cli" && !channel.apiKey.trim()) warnings.push(`${name} 缺少 API Key。请点击该渠道“编辑”，填写“API Key”。`);
        if (channel.protocol === "volcengine-ark") {
            if (!channelEndpointMappings(channel).length) warnings.push(`${name} 缺少 Seedance 模型映射。请点击“编辑”，在“Seedance 模型映射”里填写模型名和火山 EP。`);
        } else if (!visibleChannelModels(channel.models).length) {
            warnings.push(`${name} 缺少可用模型。请点击“编辑”，在“渠道可用模型”里选择或填写模型。`);
        }
    });
    if (volcengineAsset.enabled) {
        if (!isVolcengineAssetKeyConfigured(volcengineAsset, "accessKey")) warnings.push("火山素材审核已开启，但 Access Key 未配置。请在“火山素材审核”卡片填写访问密钥。");
        if (!isVolcengineAssetKeyConfigured(volcengineAsset, "secretKey")) warnings.push("火山素材审核已开启，但 Secret Key 未配置。请在“火山素材审核”卡片填写密钥。");
        if (!volcengineAsset.publicAssetBaseUrl.trim()) warnings.push("火山素材审核已开启，但公网素材访问地址未配置。请填写 TOS 或公网素材地址。");
    }
    return warnings;
}

function channelMissingReasons(channel: AdminModelChannel) {
    const reasons: string[] = [];
    if (channel.protocol !== "jimeng-cli" && !channel.baseUrl.trim()) reasons.push("接口地址");
    if (channel.protocol !== "jimeng-cli" && !channel.apiKey.trim()) reasons.push("API Key");
    if (channel.protocol === "volcengine-ark") {
        if (!channelEndpointMappings(channel).length) reasons.push("Seedance 映射");
    } else if (!visibleChannelModels(channel.models).length) {
        reasons.push("模型");
    }
    return reasons;
}

function parseTabJson(tab: "public", value: string): AdminSettings["public"] | null;
function parseTabJson(tab: "private", value: string): AdminSettings["private"] | null;
function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null;
function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null {
    try {
        return tab === "public" ? normalizePublicSetting(JSON.parse(value) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(JSON.parse(value) as Partial<AdminSettings["private"]>);
    } catch {
        return null;
    }
}

async function collectSettings(form: FormInstance<AdminSettings>, editorMode: Record<SettingsTabKey, EditorMode>, jsonText: Record<SettingsTabKey, string>, message: { error: (value: string) => void }) {
    const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
    if (editorMode.public === "json") {
        const publicSetting = parseTabJson("public", jsonText.public);
        if (!publicSetting) {
            message.error("公开配置 JSON 格式不正确");
            return null;
        }
        values.public = publicSetting;
    }
    if (editorMode.private === "json") {
        const privateSetting = parseTabJson("private", jsonText.private);
        if (!privateSetting) {
            message.error("私有配置 JSON 格式不正确");
            return null;
        }
        values.private = privateSetting;
    }
    values.public.modelChannel.availableModels = filterModels(values.public.modelChannel.availableModels, collectChannelModels(values.private.channels));
    values.public.modelChannel.modelTextEndpoints = normalizeModelTextEndpoints(values.public.modelChannel.modelTextEndpoints, filterModelsByCapability(values.public.modelChannel.availableModels, values.private.channels, "text"));
    values.public.modelChannel.defaultModel = "";
    return normalizeSettings(values);
}

function getJsonError(value: string) {
    try {
        JSON.parse(value);
        return "";
    } catch (error) {
        return error instanceof Error ? error.message : "JSON 格式不正确";
    }
}
