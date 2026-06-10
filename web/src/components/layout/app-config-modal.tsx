"use client";

import { App, Button, Form, Modal, Segmented } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function AppConfigModal() {
    const { message } = App.useApp();
    const router = useRouter();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const modelConfig = effectiveConfig;
    const videoModel = modelConfig.videoModel;
    const isAdmin = user?.role === "admin";
    const showAdminSettingsEntry = isAdmin;

    useEffect(() => {
        if (isConfigOpen && showAdminSettingsEntry) router.prefetch("/admin/settings");
    }, [isConfigOpen, router, showAdminSettingsEntry]);

    const finishConfig = () => {
        const hasModelConfig = Boolean(modelConfig.imageModel.trim() && videoModel.trim() && modelConfig.textModel.trim());
        setConfigDialogOpen(false);
        if (!hasModelConfig) return;
        if (config.channelMode !== "remote") updateConfig("channelMode", "remote");
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        clearPromptContinue();
    };

    const openAdminSettings = () => {
        setConfigDialogOpen(false);
        router.push("/admin/settings");
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
                <div className="flex w-full justify-end">
                    <Button type="primary" onClick={finishConfig}>
                        完成
                    </Button>
                </div>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                        <div className="font-medium text-stone-900 dark:text-stone-100">模型渠道</div>
                        <div className="mt-1">由后端统一转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。接口、密钥、模型映射、额度、任务日志和素材审核都在后台维护。</div>
                        {showAdminSettingsEntry ? (
                            <Button className="mt-3" size="small" onClick={openAdminSettings}>
                                去后台设置
                            </Button>
                        ) : null}
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
                    <div className="mb-0 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
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
                </Form>
            </div>
        </Modal>
    );
}
