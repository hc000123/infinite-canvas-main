"use client";

import { App, Button, Form, Input, Modal, Segmented, Switch } from "antd";
import { useEffect, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { fetchAdminSettings, saveAdminSettings, type AdminPrivateVolcengineAssetSettings, type AdminSettings } from "@/services/api/admin";
import { fetchImageModels } from "@/services/api/image";
import { defaultConfig, resolveSeedanceRequestModel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function AppConfigModal() {
    const { message } = App.useApp();
    const [loadingModels, setLoadingModels] = useState(false);
    const [loadingVolcengineAsset, setLoadingVolcengineAsset] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
    const [volcengineAssetDraft, setVolcengineAssetDraft] = useState<AdminPrivateVolcengineAssetSettings>(defaultVolcengineAssetSettings);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const allowCustomChannel = modelChannel?.allowCustomChannel === true;
    const effectiveMode = allowCustomChannel ? config.channelMode : "remote";
    const modelConfig = effectiveMode === "remote" ? effectiveConfig : config;
    const videoModel = effectiveMode === "local" && config.videoProtocol === "volcengine-ark" ? config.seedanceModel || config.seedanceEndpointId : modelConfig.videoModel;
    const seedanceRequestModel = resolveSeedanceRequestModel(config);
    const isAdmin = user?.role === "admin";

    useEffect(() => {
        if (!isConfigOpen) {
            setLoadingVolcengineAsset(false);
            return;
        }
        if (!token || !isAdmin) {
            setAdminSettings(null);
            setVolcengineAssetDraft(defaultVolcengineAssetSettings);
            setLoadingVolcengineAsset(false);
            return;
        }
        let ignored = false;
        setLoadingVolcengineAsset(true);
        setAdminSettings(null);
        fetchAdminSettings(token)
            .then((settings) => {
                if (ignored) return;
                setAdminSettings(settings);
                setVolcengineAssetDraft(normalizeVolcengineAssetSettings(settings.private.volcengineAsset));
            })
            .catch((error) => {
                if (ignored) return;
                message.error(error instanceof Error ? error.message : "读取加白配置失败");
            })
            .finally(() => {
                if (!ignored) setLoadingVolcengineAsset(false);
            });
        return () => {
            ignored = true;
        };
    }, [isConfigOpen, isAdmin, message, token]);

    const updateVolcengineAssetDraft = <K extends keyof AdminPrivateVolcengineAssetSettings>(key: K, value: AdminPrivateVolcengineAssetSettings[K]) => {
        setVolcengineAssetDraft((current) => ({ ...current, [key]: value }));
    };

    const finishConfig = async () => {
        const hasOpenAIConfig = Boolean(config.baseUrl.trim() && config.apiKey.trim());
        const hasSeedanceConfig = Boolean(config.volcengineApiKey.trim() && seedanceRequestModel);
        const hasProviderConfig = effectiveMode !== "local" || (config.videoProtocol === "volcengine-ark" ? hasSeedanceConfig : hasOpenAIConfig);
        const hasModelConfig = Boolean(modelConfig.imageModel.trim() && videoModel.trim() && modelConfig.textModel.trim());
        let savedVolcengineAsset = false;
        let publicSettingsRefreshFailed = false;
        setSavingSettings(true);
        try {
            if (token && isAdmin && adminSettings) {
                const nextSettings: AdminSettings = {
                    ...adminSettings,
                    private: {
                        ...adminSettings.private,
                        volcengineAsset: normalizeVolcengineAssetSettings(volcengineAssetDraft),
                    },
                };
                const saved = await saveAdminSettings(token, nextSettings);
                setAdminSettings(saved);
                setVolcengineAssetDraft(normalizeVolcengineAssetSettings(saved.private.volcengineAsset));
                savedVolcengineAsset = true;
                try {
                    await loadPublicSettings();
                } catch {
                    publicSettingsRefreshFailed = true;
                }
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存加白配置失败");
            setSavingSettings(false);
            return;
        }
        setConfigDialogOpen(false);
        setSavingSettings(false);
        if (!hasProviderConfig || !hasModelConfig) {
            if (savedVolcengineAsset) {
                if (publicSettingsRefreshFailed) {
                    message.warning("加白配置已保存，公开配置刷新失败，请刷新页面");
                } else {
                    message.success("加白配置已保存");
                }
            }
            return;
        }
        if (!allowCustomChannel && config.channelMode !== "remote") updateConfig("channelMode", "remote");
        if (publicSettingsRefreshFailed) {
            message.warning("配置已保存，公开配置刷新失败，请刷新页面");
        } else {
            message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        }
        clearPromptContinue();
    };

    const refreshModels = async () => {
        if (effectiveMode === "remote") return;
        if (!config.baseUrl.trim() || !config.apiKey.trim()) {
            message.error("请先填写 OpenAI 兼容 Base URL 和 API Key");
            return;
        }
        setLoadingModels(true);
        try {
            const models = await fetchImageModels(config);
            updateConfig("models", models);
            const [fallbackModel] = models;
            if (fallbackModel && !models.includes(config.imageModel)) updateConfig("imageModel", fallbackModel);
            if (fallbackModel && !models.includes(config.videoModel)) updateConfig("videoModel", fallbackModel);
            if (fallbackModel && !models.includes(config.textModel)) updateConfig("textModel", fallbackModel);
            message.success("模型列表已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingModels(false);
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">模型和密钥</div>
                </div>
            }
            open={isConfigOpen}
            width={760}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            footer={
                <Button type="primary" loading={savingSettings} disabled={loadingVolcengineAsset} onClick={() => void finishConfig()}>
                    完成
                </Button>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    {allowCustomChannel ? (
                        <Form.Item label="渠道模式" className="mb-4">
                            <Segmented
                                block
                                size="middle"
                                value={effectiveMode}
                                onChange={(value) => updateConfig("channelMode", value as AiConfig["channelMode"])}
                                options={[
                                    { label: "本地直连", value: "local" },
                                    { label: "云端渠道", value: "remote" },
                                ]}
                            />
                        </Form.Item>
                    ) : null}
                    {effectiveMode === "local" ? (
                        <div className="mb-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="mb-3">
                                    <div className="text-sm font-medium">OpenAI 兼容 API</div>
                                    <div className="mt-1 text-xs text-stone-500">用于生图、语言模型和兼容视频模型。</div>
                                </div>
                                <div className="grid gap-3">
                                    <Form.Item label="Base URL" className="mb-3">
                                        <Input value={config.baseUrl} placeholder="https://api.openai.com" onChange={(event) => updateConfig("baseUrl", event.target.value)} />
                                    </Form.Item>
                                    <Form.Item label="API Key" className="mb-3">
                                        <Input.Password value={config.apiKey} onChange={(event) => updateConfig("apiKey", event.target.value)} />
                                    </Form.Item>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium">模型列表</div>
                                        <div className="mt-1 text-xs text-stone-500">当前已保存 {config.models.length} 个模型，所有模型选择器都可检索</div>
                                    </div>
                                    <Button size="small" loading={loadingModels} onClick={() => void refreshModels()}>
                                        拉取模型列表
                                    </Button>
                                </div>
                            </div>
                            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="mb-3">
                                    <div className="text-sm font-medium">火山方舟 Ark</div>
                                    <div className="mt-1 text-xs text-stone-500">已预设 Seedance 任务地址，调用时优先使用 Endpoint ID。</div>
                                </div>
                                <div className="mb-3 rounded-md bg-stone-100 px-2 py-1.5 text-xs text-stone-500 dark:bg-stone-900">{config.volcengineBaseUrl || defaultConfig.volcengineBaseUrl}</div>
                                <Form.Item label="Ark API Key" className="mb-3">
                                    <Input.Password value={config.volcengineApiKey} placeholder="填写火山方舟 API Key" onChange={(event) => updateConfig("volcengineApiKey", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="Seedance Endpoint ID" className="mb-0">
                                    <Input value={config.seedanceEndpointId} placeholder="ep-20260524233518-kxgt4" onChange={(event) => updateConfig("seedanceEndpointId", event.target.value)} />
                                </Form.Item>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                            <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                            <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。</div>
                        </div>
                    )}
                    <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">火山人像加白</div>
                                <div className="mt-1 text-xs text-stone-500">用于“我的素材”图片提交审核。</div>
                            </div>
                            {isAdmin && adminSettings ? <Switch checked={volcengineAssetDraft.enabled} disabled={loadingVolcengineAsset} onChange={(checked) => updateVolcengineAssetDraft("enabled", checked)} /> : null}
                        </div>
                        {!isAdmin ? (
                            <div className="text-xs text-stone-500">需要管理员登录后配置。</div>
                        ) : loadingVolcengineAsset ? (
                            <div className="text-xs text-stone-500">正在读取加白配置...</div>
                        ) : adminSettings ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <Form.Item label="Access Key" className="mb-3">
                                    <Input.Password value={volcengineAssetDraft.accessKey} placeholder="留空则沿用已保存的 Access Key" onChange={(event) => updateVolcengineAssetDraft("accessKey", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="Secret Key" className="mb-3">
                                    <Input.Password value={volcengineAssetDraft.secretKey} placeholder="留空则沿用已保存的 Secret Key" onChange={(event) => updateVolcengineAssetDraft("secretKey", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="项目名称" className="mb-3">
                                    <Input value={volcengineAssetDraft.projectName} placeholder="default" onChange={(event) => updateVolcengineAssetDraft("projectName", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="地域" className="mb-3">
                                    <Input value={volcengineAssetDraft.region} placeholder="cn-beijing" onChange={(event) => updateVolcengineAssetDraft("region", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="素材组 ID" className="mb-3 md:col-span-2">
                                    <Input value={volcengineAssetDraft.assetGroupId} placeholder="group-20260318033332-xxxxx" onChange={(event) => updateVolcengineAssetDraft("assetGroupId", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="公网素材访问地址" className="mb-0 md:col-span-2" extra="填写火山 TOS 公网前缀时，提交加白前会自动上传到对应桶路径。">
                                    <Input
                                        value={volcengineAssetDraft.publicAssetBaseUrl}
                                        placeholder="https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets"
                                        onChange={(event) => updateVolcengineAssetDraft("publicAssetBaseUrl", event.target.value)}
                                    />
                                </Form.Item>
                            </div>
                        ) : (
                            <div className="text-xs text-stone-500">未读取到加白配置，请稍后重试。</div>
                        )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Form.Item label="默认生图模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="image" value={modelConfig.imageModel} onChange={(model) => updateConfig("imageModel", model)} fullWidth />
                        </Form.Item>
                        <Form.Item label="默认视频模型" className="mb-4">
                            <div className="space-y-2">
                                {effectiveMode === "local" ? (
                                    <Segmented
                                        block
                                        size="small"
                                        value={config.videoProtocol}
                                        onChange={(value) => updateConfig("videoProtocol", value as AiConfig["videoProtocol"])}
                                        options={[
                                            { label: "OpenAI 兼容视频", value: "openai" },
                                            { label: "火山 Seedance", value: "volcengine-ark" },
                                        ]}
                                    />
                                ) : null}
                                {effectiveMode === "local" && config.videoProtocol === "volcengine-ark" ? (
                                    <div className="space-y-1.5">
                                        <Input value={config.seedanceModel} placeholder="doubao-seedance-2-0-260128" onChange={(event) => updateConfig("seedanceModel", event.target.value)} />
                                        <div className="text-[11px] leading-4 text-stone-500">此处用于显示名称，真实请求使用 Ark 区块里的 Endpoint ID。</div>
                                    </div>
                                ) : (
                                    <ModelPicker config={modelConfig} modelType="video" value={modelConfig.videoModel} onChange={(model) => updateConfig("videoModel", model)} fullWidth />
                                )}
                            </div>
                        </Form.Item>
                        <Form.Item label="默认文本模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="text" value={modelConfig.textModel} onChange={(model) => updateConfig("textModel", model)} fullWidth />
                        </Form.Item>
                    </div>
                    {effectiveMode === "local" ? (
                        <Form.Item label="系统提示词" className="mb-0">
                            <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                        </Form.Item>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}

const defaultVolcengineAssetSettings: AdminPrivateVolcengineAssetSettings = {
    enabled: false,
    accessKey: "",
    secretKey: "",
    projectName: "default",
    region: "cn-beijing",
    assetGroupId: "",
    publicAssetBaseUrl: "",
};

function normalizeVolcengineAssetSettings(setting: Partial<AdminPrivateVolcengineAssetSettings> = {}): AdminPrivateVolcengineAssetSettings {
    return {
        enabled: setting.enabled === true,
        accessKey: setting.accessKey || "",
        secretKey: setting.secretKey || "",
        projectName: setting.projectName || "default",
        region: setting.region || "cn-beijing",
        assetGroupId: setting.assetGroupId || "",
        publicAssetBaseUrl: setting.publicAssetBaseUrl || "",
    };
}
