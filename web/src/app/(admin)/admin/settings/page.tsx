"use client";

import { CheckCircleOutlined, DeleteOutlined, FormatPainterOutlined, LoadingOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import { json } from "@codemirror/lang-json";
import { Alert, App, Button, Card, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Switch, Table, Tabs, Tag, Typography, type FormInstance } from "antd";
import type { InputRef } from "antd";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";

import { modelMatchesAiCapability, type AiModelKind } from "@/lib/ai-model-kind";
import { ProviderPresetModal } from "./components/provider-preset-modal";
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
const xinglianVideoModels = ["sd2-720p-fast", "sd2-720p", "sd2-720p-sh", "sd2-720p-mini", "sd2-1080p-mini", "sd2-1080p-fast", "sd2-1080p", "sd2-720p-ax-fast", "sd2-720p-ax"];

type SettingsTabKey = "public" | "private";
type EditorMode = "visual" | "json";
type ModelSelectTabKey = "new" | "current";
type AutoSaveStatus = "idle" | "saving" | "saved" | "error";
type ChannelFormValues = AdminModelChannel & { endpointId?: string };
type ChannelTableItem = AdminModelChannel & { _index: number; _rowKey: string };

export default function AdminSettingsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [form] = Form.useForm<AdminSettings>();
    const [activeTab, setActiveTab] = useState<SettingsTabKey>("public");
    const [editorMode, setEditorMode] = useState<Record<SettingsTabKey, EditorMode>>({ public: "visual", private: "visual" });
    const [jsonText, setJsonText] = useState<Record<SettingsTabKey, string>>({ public: "", private: "" });
    const [channels, setChannels] = useState<AdminModelChannel[]>([]);
    const [channelForm] = Form.useForm<ChannelFormValues>();
    const [editingChannelIndex, setEditingChannelIndex] = useState<number | null>(null);
    const [isChannelDrawerOpen, setIsChannelDrawerOpen] = useState(false);
    const [isProviderPresetOpen, setIsProviderPresetOpen] = useState(false);
    const [isApplyingProviderPreset, setIsApplyingProviderPreset] = useState(false);
    const [channelAutoSaveStatus, setChannelAutoSaveStatus] = useState<AutoSaveStatus>("idle");
    const channelAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelAutoSaveSeqRef = useRef(0);
    const modelSelectSearchInputRef = useRef<InputRef>(null);
    const modelSelectChannelDraftRef = useRef<ChannelFormValues | null>(null);
    const enterpriseVideoFocusRef = useRef<HTMLDivElement>(null);
    const [testChannelIndex, setTestChannelIndex] = useState<number | null>(null);
    const [testKeyword, setTestKeyword] = useState("");
    const [selectedTestModels, setSelectedTestModels] = useState<string[]>([]);
    const [testingModels, setTestingModels] = useState<string[]>([]);
    const [testResults, setTestResults] = useState<Record<string, { status: "success" | "error"; duration?: string; message: string }>>({});
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [modelSelectSource, setModelSelectSource] = useState<string[]>([]);
    const [modelSelectExisting, setModelSelectExisting] = useState<string[]>([]);
    const [modelSelectSelected, setModelSelectSelected] = useState<string[]>([]);
    const [modelSelectKeyword, setModelSelectKeyword] = useState("");
    const [modelSelectTab, setModelSelectTab] = useState<ModelSelectTabKey>("new");
    const [isFetchingChannelModels, setIsFetchingChannelModels] = useState(false);
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
    const modelSelectGroups = useMemo(() => buildModelSelectGroups(modelSelectSource, modelSelectExisting), [modelSelectSource, modelSelectExisting]);
    const activeModelSelectModels = useMemo(() => {
        const keyword = modelSelectKeyword.trim().toLowerCase();
        return modelSelectGroups[modelSelectTab].filter((model) => model.toLowerCase().includes(keyword));
    }, [modelSelectGroups, modelSelectKeyword, modelSelectTab]);
    const activeSelectedCount = activeModelSelectModels.filter((model) => modelSelectSelected.includes(model)).length;
    const channelProtocol = Form.useWatch("protocol", channelForm);
    const channelAPIKey = Form.useWatch("apiKey", channelForm);
    const hasSavedChannelAPIKey = editingChannelIndex !== null && Boolean(channels[editingChannelIndex]?.apiKey);
    const hasNewChannelAPIKey = Boolean(channelAPIKey && !isMaskedAPIKey(channelAPIKey));
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

    useEffect(() => {
        if (!isModelSelectorOpen) return;
        const timer = window.setTimeout(() => modelSelectSearchInputRef.current?.focus({ cursor: "all" }), 80);
        return () => window.clearTimeout(timer);
    }, [isModelSelectorOpen]);

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

    const openChannelDrawer = (index: number | null) => {
        setEditingChannelIndex(index);
        setIsChannelDrawerOpen(true);
        const channel = index === null ? emptyChannel : normalizeChannel(channels[index]);
        channelForm.setFieldsValue({ ...channel, apiKey: "", endpointId: channel.endpointId || arkEndpointFromModels(channel.models), models: visibleChannelModels(channel.models), endpointMappings: channelEndpointMappingFields(channel) });
        rememberModels(channel.models);
    };

    const openEnterpriseVideoChannel = () => {
        const arkIndex = channels.findIndex((channel) => normalizeChannel(channel).protocol === "volcengine-ark");
        if (arkIndex >= 0) {
            openChannelDrawer(arkIndex);
            return;
        }
        setEditingChannelIndex(null);
        setIsChannelDrawerOpen(true);
        const model = defaultArkLocalModelName();
        channelForm.setFieldsValue({
            ...emptyChannel,
            name: "企业 Ark / Seedance",
            protocol: "volcengine-ark",
            baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
            models: [model],
            endpointMappings: [{ model, endpointId: "" }],
            capabilities: ["text", "video", "video_query", "asset_review", "preflight"],
            environment: "prod",
        });
        rememberModels([model]);
    };

    const resetChannelDrawer = () => {
        setIsChannelDrawerOpen(false);
        setEditingChannelIndex(null);
        setChannelAutoSaveStatus("idle");
        channelForm.resetFields();
    };

    const closeChannelDrawer = () => {
        const hasPendingAutoSave = Boolean(channelAutoSaveTimerRef.current);
        if (channelAutoSaveTimerRef.current) clearTimeout(channelAutoSaveTimerRef.current);
        channelAutoSaveTimerRef.current = null;
        if (!hasPendingAutoSave) {
            resetChannelDrawer();
            return;
        }
        setChannelAutoSaveStatus("saving");
        void saveChannel(true)
            .catch(() => setChannelAutoSaveStatus("error"))
            .finally(resetChannelDrawer);
    };

    const saveChannel = async (silent = false) => {
        const values = await channelForm.validateFields();
        const existingChannel = editingChannelIndex === null ? undefined : channels[editingChannelIndex];
        const endpointMappings = values.protocol === "volcengine-ark" ? normalizeEndpointMappings(values.endpointMappings, values.models, values.endpointId || existingChannel?.endpointId || arkEndpointFromModels(existingChannel?.models)) : [];
        const endpointId = values.protocol === "volcengine-ark" ? endpointMappings[0]?.endpointId || normalizeEndpointModel(values.endpointId) || existingChannel?.endpointId || arkEndpointFromModels(existingChannel?.models) : "";
        const channel = normalizeChannel({
            ...existingChannel,
            ...values,
            apiKey: values.apiKey || existingChannel?.apiKey || "",
            endpointId,
            endpointMappings,
            models: values.protocol === "volcengine-ark" ? endpointMappings.map((item) => item.model) : values.models || [],
        });
        rememberModels(channel.models);
        const nextChannels = [...channels];
        if (editingChannelIndex === null) nextChannels.push(channel);
        else nextChannels[editingChannelIndex] = channel;
        await persistChannels(nextChannels, { silent });
        if (editingChannelIndex === null) setEditingChannelIndex(nextChannels.length - 1);
    };

    const scheduleChannelAutoSave = () => {
        if (!isChannelDrawerOpen) return;
        if (channelAutoSaveTimerRef.current) clearTimeout(channelAutoSaveTimerRef.current);
        setChannelAutoSaveStatus("idle");
        channelAutoSaveTimerRef.current = setTimeout(() => {
            channelAutoSaveTimerRef.current = null;
            const seq = channelAutoSaveSeqRef.current + 1;
            channelAutoSaveSeqRef.current = seq;
            setChannelAutoSaveStatus("saving");
            void saveChannel(true)
                .then(() => {
                    if (channelAutoSaveSeqRef.current === seq) setChannelAutoSaveStatus("saved");
                })
                .catch(() => {
                    if (channelAutoSaveSeqRef.current === seq) setChannelAutoSaveStatus("error");
                });
        }, 900);
    };

    const fetchChannelModelList = async () => {
        if (!token) return;
        const channel = normalizeChannel(modelSelectChannelDraftRef.current || (channelForm.getFieldsValue(true) as ChannelFormValues));
        if (channel.protocol !== "jimeng-cli" && !channel?.baseUrl) {
            message.warning("请先填写接口地址");
            return;
        }
        if (channel.protocol !== "jimeng-cli" && editingChannelIndex === null && !channel?.apiKey) {
            message.warning("请先填写 API Key");
            return;
        }
        setIsFetchingChannelModels(true);
        try {
            const channelModels = cleanChannelModels(await fetchChannelModels(token, { index: editingChannelIndex ?? undefined, channel }));
            const current = isModelSelectorOpen ? cleanChannelModels(modelSelectSelected) : cleanChannelModels(channelForm.getFieldValue("models") || []);
            rememberModels(channelModels);
            setModelSelectExisting(current);
            setModelSelectSource(uniqueModels(channelModels));
            setModelSelectSelected(uniqueModels([...current, ...channelModels]));
            setModelSelectKeyword("");
            setModelSelectTab("new");
            setIsModelSelectorOpen(true);
            message.success(`已获取 ${channelModels.length} 个模型，请选择后确认`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setIsFetchingChannelModels(false);
        }
    };

    const openChannelModelSelector = (sourceModels?: string[]) => {
        modelSelectChannelDraftRef.current = channelForm.getFieldsValue(true) as ChannelFormValues;
        const current = cleanChannelModels(channelForm.getFieldValue("models") || []);
        const source = cleanChannelModels(sourceModels !== undefined ? sourceModels : [...knownModels, ...current]);
        setModelSelectExisting(current);
        setModelSelectSource(source);
        setModelSelectSelected(sourceModels ? uniqueModels([...current, ...source]) : current);
        setModelSelectKeyword("");
        setModelSelectTab(sourceModels ? "new" : "current");
        setIsModelSelectorOpen(true);
    };

    const closeChannelModelSelector = () => {
        setIsModelSelectorOpen(false);
        setModelSelectKeyword("");
        modelSelectChannelDraftRef.current = null;
    };

    const confirmChannelModelSelector = () => {
        const models = cleanChannelModels(modelSelectSelected);
        channelForm.setFieldValue("models", models);
        rememberModels(models);
        scheduleChannelAutoSave();
        closeChannelModelSelector();
    };

    const toggleSelectedModel = (model: string, checked: boolean) => {
        setModelSelectSelected((current) => (checked ? uniqueModels([...current, model]) : current.filter((item) => item !== model)));
    };

    const selectActiveModels = () => {
        setModelSelectSelected((current) => uniqueModels([...current, ...activeModelSelectModels]));
    };

    const clearActiveModels = () => {
        const active = new Set(activeModelSelectModels);
        setModelSelectSelected((current) => current.filter((model) => !active.has(model)));
    };

    function rememberModels(models: string[]) {
        setKnownModels((current) => cleanChannelModels([...current, ...models]));
    }

    function rememberKnownModels(settings: AdminSettings) {
        rememberModels(collectKnownModels(settings));
    }

    const openTestDialog = (index: number) => {
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
        setTestChannelIndex(null);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const testModelOnline = async (model: string) => {
        if (testChannelIndex === null) return;
        if (!token) return;
        const channel = normalizeChannel(channels[testChannelIndex]);
        setTestingModels((current) => [...current, model]);
        try {
            const startedAt = performance.now();
            const result = await testChannelModel(token, { index: testChannelIndex, channel, model, endpointType: modelTextEndpointType(modelTextEndpoints, model) });
            setTestResults((current) => ({ ...current, [model]: { status: "success", duration: `${((performance.now() - startedAt) / 1000).toFixed(2)}s`, message: result } }));
        } catch (error) {
            setTestResults((current) => ({ ...current, [model]: { status: "error", message: error instanceof Error ? error.message : "测试失败" } }));
        } finally {
            setTestingModels((current) => current.filter((item) => item !== model));
        }
    };

    const batchTestModels = async () => {
        for (const model of selectedTestModels) {
            await testModelOnline(model);
        }
    };

    const testChannel = testChannelIndex === null ? null : normalizeChannel(channels[testChannelIndex]);
    const testModels = visibleChannelModels(testChannel?.models || []).filter((model) => model.toLowerCase().includes(testKeyword.trim().toLowerCase()));
    const isTestingArkChannel = testChannel?.protocol === "volcengine-ark";
    const isTestingJimengChannel = testChannel?.protocol === "jimeng-cli";
    const isTestingXinglianChannel = testChannel?.protocol === "xinglian-cloud";

    async function persistChannels(nextChannels: AdminModelChannel[], options: { silent?: boolean } = {}) {
        if (!token) return;
        const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
        const nextChannelModels = collectChannelModels(nextChannels);
        const nextSettings = normalizeSettings({
            ...values,
            public: { ...values.public, modelChannel: { ...values.public.modelChannel, availableModels: filterModels(values.public.modelChannel.availableModels, nextChannelModels) } },
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
                                    <Button icon={<PlusOutlined />} onClick={() => openChannelDrawer(null)}>
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
                                                        测试
                                                    </Button>
                                                    <Button size="small" onClick={() => openChannelDrawer(item._index)}>
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
                <Drawer
                    rootClassName="studio-modal"
                    title={editingChannelIndex === null ? "新增渠道" : "编辑渠道"}
                    open={isChannelDrawerOpen}
                    size={isModelSelectorOpen ? 760 : 560}
                    onClose={closeChannelDrawer}
                    extra={
                        <Space size={12}>
                            <Typography.Text type={channelAutoSaveStatus === "error" ? "danger" : "secondary"} className="text-xs">
                                {channelAutoSaveStatus === "saving" ? "保存中..." : channelAutoSaveStatus === "saved" ? "已保存" : channelAutoSaveStatus === "error" ? "保存失败" : "修改会自动保存"}
                            </Typography.Text>
                            <Button onClick={closeChannelDrawer}>完成</Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    {isModelSelectorOpen ? (
                        <Flex vertical gap={16}>
                            <Flex justify="space-between" align="center" gap={12}>
                                <Space size={12}>
                                    <Typography.Title level={5} style={{ margin: 0 }}>
                                        选择渠道模型
                                    </Typography.Title>
                                    <Typography.Text type="secondary">
                                        已选择 {modelSelectSelected.length} / {uniqueModels([...modelSelectSource, ...modelSelectExisting]).length}
                                    </Typography.Text>
                                </Space>
                                <Space>
                                    <Button onClick={closeChannelModelSelector}>返回编辑</Button>
                                    <Button type="primary" onClick={confirmChannelModelSelector}>
                                        确定
                                    </Button>
                                </Space>
                            </Flex>
                            <Input
                                ref={modelSelectSearchInputRef}
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder="输入关键词搜索模型"
                                size="large"
                                value={modelSelectKeyword}
                                onChange={(event) => setModelSelectKeyword(event.target.value)}
                                onMouseDown={(event) => event.currentTarget.focus()}
                            />
                            <Flex justify="flex-end">
                                <Button icon={<ReloadOutlined />} loading={isFetchingChannelModels} onClick={() => void fetchChannelModelList()}>
                                    拉取模型列表
                                </Button>
                            </Flex>
                            <Tabs
                                activeKey={modelSelectTab}
                                onChange={(key) => setModelSelectTab(key as ModelSelectTabKey)}
                                items={[
                                    { key: "new", label: `新获取的模型 (${modelSelectGroups.new.length})` },
                                    { key: "current", label: `已有的模型 (${modelSelectGroups.current.length})` },
                                ]}
                            />
                            <Flex justify="space-between" align="center" gap={12} wrap>
                                <Typography.Text type="secondary">
                                    当前列表已选择 {activeSelectedCount} / {activeModelSelectModels.length}
                                </Typography.Text>
                                <Space size={8}>
                                    <Button size="small" disabled={!activeModelSelectModels.length || activeSelectedCount === activeModelSelectModels.length} onClick={selectActiveModels}>
                                        全选当前列表
                                    </Button>
                                    <Button size="small" disabled={!activeSelectedCount} onClick={clearActiveModels}>
                                        取消当前列表
                                    </Button>
                                </Space>
                            </Flex>
                            <div style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto", borderTop: "1px solid var(--ant-color-border-secondary)", paddingTop: 12 }}>
                                {activeModelSelectModels.length ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 24, rowGap: 12 }}>
                                        {activeModelSelectModels.map((model) => (
                                            <Checkbox key={model} checked={modelSelectSelected.includes(model)} onChange={(event) => toggleSelectedModel(model, event.target.checked)}>
                                                <Typography.Text style={{ wordBreak: "break-all" }}>{model}</Typography.Text>
                                            </Checkbox>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: "48px 0", textAlign: "center" }}>
                                        <Typography.Text type="secondary">没有匹配的模型</Typography.Text>
                                    </div>
                                )}
                            </div>
                        </Flex>
                    ) : (
                        <Form form={channelForm} layout="vertical" requiredMark={false} initialValues={emptyChannel} onValuesChange={scheduleChannelAutoSave}>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="id" label="渠道 ID" extra="Agent 可绑定这个 ID；留空保存时自动生成。">
                                        <Input placeholder="例如 text-openai-main" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="protocol" label="协议">
                                        <Select
                                            options={[
                                                { label: "OpenAI 兼容", value: "openai" },
                                                { label: "火山方舟 Ark", value: "volcengine-ark" },
                                                { label: "即梦 CLI", value: "jimeng-cli" },
                                                { label: "星链云 SD2", value: "xinglian-cloud" },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="weight" label="权重">
                                        <InputNumber min={1} step={1} className="!w-full" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="enabled" label="启用" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="environment" label="环境">
                                        <Select
                                            options={[
                                                { label: "开发 dev", value: "dev" },
                                                { label: "测试 test", value: "test" },
                                                { label: "正式 prod", value: "prod" },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="capabilities" label="渠道能力">
                                        <Select
                                            mode="multiple"
                                            options={[
                                                { label: "文本 Agent", value: "text" },
                                                { label: "图片生成", value: "image" },
                                                { label: "视频生成", value: "video" },
                                                { label: "视频任务查询", value: "video_query" },
                                                { label: "素材加白 / 预检", value: "asset_review" },
                                                { label: "企业预检", value: "preflight" },
                                                { label: "CLI Worker", value: "cli_workflow" },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                                {channelProtocol === "jimeng-cli" ? (
                                    <>
                                        <Col span={24}>
                                            <Form.Item name="cliPath" label="CLI 路径" extra="留空时使用 PATH 里的 dreamina；也可以填写 /Users/.../.local/bin/dreamina。">
                                                <Input placeholder="dreamina" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="outputDir" label="输出目录" extra="留空时使用后端 data/jimeng-cli。">
                                                <Input placeholder="data/jimeng-cli" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="workDir" label="工作目录">
                                                <Input placeholder="留空使用后端当前目录" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item name="sessionId" label="会话 ID">
                                                <InputNumber min={0} precision={0} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item name="timeoutSeconds" label="超时秒数">
                                                <InputNumber min={0} precision={0} className="!w-full" placeholder="默认 300" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item name="concurrencyLimit" label="并发限制">
                                                <InputNumber min={1} precision={0} className="!w-full" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={24}>
                                            <Alert
                                                type="info"
                                                showIcon
                                                title="即梦用户登录"
                                                description={
                                                    <Typography.Text type="secondary">
                                                        管理员只配置 CLI 路径、输出目录、模型和算力成本；用户在个人配置中自行完成即梦网页登录。生成请求仍经过后台任务系统，管理员可在用量统计和 AI
                                                        任务里查看用户、模型、状态和算力流水。
                                                    </Typography.Text>
                                                }
                                            />
                                        </Col>
                                    </>
                                ) : (
                                    <Col span={24}>
                                        <Form.Item
                                            name="baseUrl"
                                            label="接口地址"
                                            extra={channelProtocol === "xinglian-cloud" ? "填写 https://www.vjimeng.vip/v1；后端会自动调用 SD2 提交和查询路径。" : undefined}
                                            rules={[{ required: true, message: "请输入接口地址" }]}
                                        >
                                            <Input placeholder={channelProtocol === "xinglian-cloud" ? "https://www.vjimeng.vip/v1" : undefined} />
                                        </Form.Item>
                                    </Col>
                                )}
                                {channelProtocol === "volcengine-ark" ? (
                                    <Col span={24}>
                                        <Card size="small" title="Seedance 模型映射">
                                            <Form.List name="endpointMappings">
                                                {(fields, { add, remove }) => (
                                                    <Flex vertical gap={10}>
                                                        <Flex justify="space-between" align="center" gap={12}>
                                                            <Typography.Text type="secondary" className="text-xs">
                                                                一个本地模型名称对应一个火山 EP；前端选择模型名，后台真实请求使用对应 EP。
                                                            </Typography.Text>
                                                            <Button size="small" icon={<PlusOutlined />} onClick={() => add({ model: "", endpointId: "" })}>
                                                                添加选项
                                                            </Button>
                                                        </Flex>
                                                        {fields.map((field, index) => (
                                                            <Row key={field.key} gutter={8} align="top">
                                                                <Col span={10}>
                                                                    <Form.Item name={[field.name, "model"]} label={index === 0 ? "本地模型名称" : ""} rules={[{ required: true, message: "请输入本地模型名称" }]}>
                                                                        <Input placeholder="doubao-seedance-2-0-fast" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col span={12}>
                                                                    <Form.Item name={[field.name, "endpointId"]} label={index === 0 ? "火山 Endpoint / EP" : ""} rules={[{ required: true, message: "请输入火山 Endpoint / EP" }]}>
                                                                        <Input placeholder="ep-xxxxxxxxxxxxxxxx" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col span={2}>
                                                                    <Button aria-label="删除映射" disabled={fields.length <= 1} danger icon={<DeleteOutlined />} style={{ marginTop: index === 0 ? 30 : 0 }} onClick={() => remove(field.name)} />
                                                                </Col>
                                                            </Row>
                                                        ))}
                                                    </Flex>
                                                )}
                                            </Form.List>
                                        </Card>
                                    </Col>
                                ) : null}
                                {channelProtocol === "jimeng-cli" ? null : (
                                    <Col span={24}>
                                        <Form.Item
                                            name="apiKey"
                                            label={
                                                <Space size={8}>
                                                    API Key
                                                    <Tag color={hasNewChannelAPIKey ? "processing" : hasSavedChannelAPIKey ? "success" : "default"}>{hasNewChannelAPIKey ? "本次已输入新 Key" : hasSavedChannelAPIKey ? "已保存，留空不修改" : "未填写"}</Tag>
                                                </Space>
                                            }
                                            extra={hasSavedChannelAPIKey && !hasNewChannelAPIKey ? "输入框留空会继续沿用后台已保存的 API Key；输入新值后会自动保存并覆盖。" : undefined}
                                            rules={editingChannelIndex === null ? [{ required: true, message: "请输入 API Key" }] : []}
                                        >
                                            <Input.Password placeholder={hasSavedChannelAPIKey ? "已保存，输入新 Key 才会覆盖" : "请输入 API Key"} />
                                        </Form.Item>
                                    </Col>
                                )}
                                {channelProtocol === "volcengine-ark" ? null : (
                                    <Col span={24}>
                                        <Form.Item label="渠道可用模型" extra="模型名称是节点调用的唯一标识；同名模型可用于同协议备用渠道，但不能同时配置到不同协议。">
                                            <Space.Compact style={{ width: "100%" }}>
                                                <Form.Item name="models" noStyle>
                                                    <Select
                                                        mode="tags"
                                                        maxTagCount="responsive"
                                                        tokenSeparators={[",", "\n"]}
                                                        options={(channelProtocol === "xinglian-cloud" ? [...xinglianVideoModels, ...knownModels] : knownModels).map((model) => ({ label: model, value: model }))}
                                                    />
                                                </Form.Item>
                                                <Button onClick={() => openChannelModelSelector()}>选择模型</Button>
                                            </Space.Compact>
                                        </Form.Item>
                                    </Col>
                                )}
                                <Col span={24}>
                                    <Form.Item name="remark" label="备注">
                                        <Input.TextArea rows={3} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    )}
                </Drawer>
                <Modal
                    rootClassName="studio-modal"
                    title={
                        <Space>
                            {testChannel?.name || "渠道"} 渠道的{isTestingArkChannel || isTestingJimengChannel || isTestingXinglianChannel ? "视频预检" : "模型测试"}
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
                                {isTestingArkChannel || isTestingJimengChannel || isTestingXinglianChannel ? "批量预检" : "批量测试"} {selectedTestModels.length} 个模型
                            </Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    <Flex vertical gap={12}>
                        <Typography.Text type="secondary">
                            {isTestingArkChannel
                                ? "企业 Ark / Seedance 只验证 API Key、Base URL 和模型到火山 Endpoint / EP 的映射，不创建视频任务或扣除额度。"
                                : isTestingJimengChannel
                                  ? "即梦 CLI 只检查 CLI 安装、登录态、输出目录和模型版本，不创建视频任务或扣除额度。"
                                  : isTestingXinglianChannel
                                    ? "星链云只查询 API Key 对应账户余额，不创建视频任务或扣除额度。"
                                    : "测试会向选中模型发送一条 hi，用于确认渠道是否有响应。"}
                        </Typography.Text>
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
                                        if (testingModels.includes(value)) return <Tag icon={<LoadingOutlined className="animate-spin" />}>测试中</Tag>;
                                        const result = testResults[value];
                                        if (!result) return <Tag>未开始</Tag>;
                                        return result.status === "success" ? (
                                            <Space size={6} wrap>
                                                <Tag color="success">成功</Tag>
                                                <Typography.Text type="secondary">请求时长: {result.duration}</Typography.Text>
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
                                            {isTestingArkChannel || isTestingJimengChannel ? "预检" : "测试"}
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

function channelEndpointMappingFields(channel: Partial<AdminModelChannel>) {
    const mappings = channelEndpointMappings(channel);
    if (mappings.length) return mappings;
    return [{ model: "", endpointId: "" }];
}

function normalizeEndpointModel(value?: string) {
    return (value || "").trim();
}

function isEndpointModel(value?: string) {
    return normalizeEndpointModel(value).toLowerCase().startsWith("ep-");
}

function isMaskedAPIKey(value?: string) {
    return (value || "").trim() === "********";
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

function buildModelSelectGroups(sourceModels: string[], existingModels: string[]): Record<ModelSelectTabKey, string[]> {
    const source = cleanChannelModels(sourceModels);
    const existing = cleanChannelModels(existingModels);
    const existingSet = new Set(existing);
    return {
        new: source.filter((model) => !existingSet.has(model)),
        current: existing,
    };
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
