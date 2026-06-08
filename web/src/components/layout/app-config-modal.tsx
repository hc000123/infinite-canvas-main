"use client";

import { Download, Upload } from "lucide-react";
import { App, Button, Form, Input, Modal, Segmented, Tag } from "antd";
import { useEffect, useRef, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { parseAiConfigPackage } from "@/services/ai-config-package";
import { fetchAdminSettings, type AdminSettings } from "@/services/api/admin";
import { fetchImageModels } from "@/services/api/image";
import { summarizeVolcengineAssetConfig, VOLCENGINE_ASSET_CONFIG_NOTICE } from "@/services/volcengine-asset-config";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function AppConfigModal() {
    const { message } = App.useApp();
    const configFileInputRef = useRef<HTMLInputElement>(null);
    const [loadingModels, setLoadingModels] = useState(false);
    const [loadingVolcengineAsset, setLoadingVolcengineAsset] = useState(false);
    const [importingConfig, setImportingConfig] = useState(false);
    const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const allowCustomChannel = modelChannel?.allowCustomChannel === true;
    const effectiveMode = allowCustomChannel ? config.channelMode : "remote";
    const modelConfig = effectiveMode === "remote" ? effectiveConfig : config;
    const videoModel = modelConfig.videoModel;
    const isAdmin = user?.role === "admin";

    useEffect(() => {
        if (!isConfigOpen) {
            setLoadingVolcengineAsset(false);
            return;
        }
        if (!token || !isAdmin) {
            setAdminSettings(null);
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

    const finishConfig = () => {
        const hasOpenAIConfig = Boolean(config.baseUrl.trim() && config.apiKey.trim());
        const hasProviderConfig = effectiveMode !== "local" || hasOpenAIConfig;
        const hasModelConfig = Boolean(modelConfig.imageModel.trim() && videoModel.trim() && modelConfig.textModel.trim());
        setConfigDialogOpen(false);
        if (!hasProviderConfig || !hasModelConfig) return;
        if (!allowCustomChannel && config.channelMode !== "remote") updateConfig("channelMode", "remote");
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
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

    const importConfigPackage = async (file?: File | null) => {
        if (!file) return;
        setImportingConfig(true);
        try {
            const { patch, importedKeys } = parseAiConfigPackage(await file.text());
            const applyConfig = updateConfig as (key: keyof AiConfig, value: AiConfig[keyof AiConfig]) => void;
            importedKeys.forEach((key) => {
                const value = patch[key];
                if (value !== undefined) applyConfig(key, value);
            });
            message.success(`已导入 ${importedKeys.length} 项配置`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "配置包导入失败");
        } finally {
            setImportingConfig(false);
            if (configFileInputRef.current) configFileInputRef.current.value = "";
        }
    };

    const downloadConfigTemplate = () => {
        message.success("配置模板已下载");
    };

    const volcengineAssetDetails = adminSettings?.private.volcengineAsset;
    const volcengineAssetSummary = summarizeVolcengineAssetConfig(volcengineAssetDetails || publicSettings?.volcengineAsset, { showDetails: Boolean(volcengineAssetDetails) });

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
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex gap-2">
                        <Button icon={<Upload className="size-4" />} loading={importingConfig} onClick={() => configFileInputRef.current?.click()}>
                            导入配置包
                        </Button>
                        <Button icon={<Download className="size-4" />} href="/api/ai-config-template" download="ai-config-template.json" onClick={downloadConfigTemplate}>
                            下载模板
                        </Button>
                    </div>
                    <Button type="primary" onClick={finishConfig}>
                        完成
                    </Button>
                </div>
            }
        >
            <div className="pt-1">
                <input ref={configFileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importConfigPackage(event.target.files?.[0])} />
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
                        <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                            <div className="mb-3">
                                <div className="text-sm font-medium">OpenAI 兼容 API</div>
                                <div className="mt-1 text-xs text-stone-500">本地直连只用于个人 OpenAI 兼容 Base URL / API Key / 模型 ID。火山 Seedance 企业能力请使用云端渠道。</div>
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
                    ) : (
                        <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                            <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                            <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。火山方舟、Seedance Endpoint、额度和任务日志都在后台渠道中维护。</div>
                        </div>
                    )}
                    <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">火山人像加白</div>
                                <div className="mt-1 text-xs text-stone-500">用于“我的素材”和画布图片提交人像素材审核。</div>
                            </div>
                            <Tag color={volcengineAssetSummary.statusColor}>{volcengineAssetSummary.statusText}</Tag>
                        </div>
                        <div className="mb-3 rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{VOLCENGINE_ASSET_CONFIG_NOTICE}</div>
                        {loadingVolcengineAsset ? (
                            <div className="text-xs text-stone-500">正在读取加白配置...</div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid gap-2 text-xs text-stone-600 dark:text-stone-300 md:grid-cols-3">
                                    <div>
                                        <div className="text-stone-400">ProjectName</div>
                                        <div className="mt-1 font-medium">{volcengineAssetSummary.projectName}</div>
                                    </div>
                                    <div>
                                        <div className="text-stone-400">Region</div>
                                        <div className="mt-1 font-medium">{volcengineAssetSummary.region}</div>
                                    </div>
                                    <div>
                                        <div className="text-stone-400">素材组 ID</div>
                                        <div className="mt-1 break-all font-medium">{volcengineAssetSummary.assetGroupId}</div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
                                    <span>加白密钥只在后台系统设置中维护，前台配置弹窗只读展示。</span>
                                    <Button size="small" href="/admin/settings">
                                        去后台设置
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Form.Item label="默认生图模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="image" value={modelConfig.imageModel} onChange={(model) => updateConfig("imageModel", model)} fullWidth />
                        </Form.Item>
                        <Form.Item label="默认视频模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="video" value={modelConfig.videoModel} onChange={(model) => updateConfig("videoModel", model)} fullWidth />
                        </Form.Item>
                        <Form.Item label="默认文本模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="text" value={modelConfig.textModel} onChange={(model) => updateConfig("textModel", model)} fullWidth />
                        </Form.Item>
                    </div>
                    {effectiveMode === "local" ? (
                        <>
                            <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">思考模式</div>
                                        <div className="mt-1 text-xs text-stone-500">用于支持 reasoning_effort 的 OpenAI 兼容 Chat Completions 模型。</div>
                                    </div>
                                    <Segmented
                                        size="small"
                                        value={config.thinkingMode}
                                        onChange={(value) => updateConfig("thinkingMode", value as AiConfig["thinkingMode"])}
                                        options={[
                                            { label: "关闭", value: "false" },
                                            { label: "开启", value: "true" },
                                        ]}
                                    />
                                </div>
                                <Segmented
                                    block
                                    size="middle"
                                    disabled={config.thinkingMode !== "true"}
                                    value={config.reasoningEffort}
                                    onChange={(value) => updateConfig("reasoningEffort", value as AiConfig["reasoningEffort"])}
                                    options={[
                                        { label: "极低", value: "minimal" },
                                        { label: "低", value: "low" },
                                        { label: "中", value: "medium" },
                                        { label: "高", value: "high" },
                                    ]}
                                />
                            </div>
                            <Form.Item label="系统提示词" className="mb-0">
                                <Input.TextArea rows={3} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                            </Form.Item>
                        </>
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}
