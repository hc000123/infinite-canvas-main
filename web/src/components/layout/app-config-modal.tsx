"use client";

import { App, Button, Form, Modal, Segmented, Select } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ModelPicker } from "@/components/model-picker";
import { useOriginalWorkflowStore, type OriginalWorkflowExecutionMode } from "@/app/(user)/original-workflow/use-original-workflow-store";
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
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const modelConfig = effectiveConfig;
    const videoModel = modelConfig.videoModel;
    const isAdmin = user?.role === "admin";
    const workflowExecutionMode = useOriginalWorkflowStore((state) => state.executionMode);
    const setWorkflowExecutionMode = useOriginalWorkflowStore((state) => state.setExecutionMode);
    const showAdminSettingsEntry = isAdmin;
    const allowCustomModel = modelChannel?.allowCustomChannel !== false;

    useEffect(() => {
        if (isConfigOpen && showAdminSettingsEntry) router.prefetch("/admin/settings");
    }, [isConfigOpen, router, showAdminSettingsEntry]);

    useEffect(() => {
        if (!isConfigOpen) return;
        void loadPublicSettings({ force: true });
        const timer = window.setInterval(() => void loadPublicSettings({ force: true }), 5000);
        return () => window.clearInterval(timer);
    }, [isConfigOpen, loadPublicSettings]);

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
            rootClassName="studio-modal"
            title={
                <div>
                    <div className="text-lg font-semibold">配置</div>
                    <div className="mt-1 text-xs font-normal text-[var(--studio-text-muted)]">模型、密钥和后台渠道</div>
                </div>
            }
            open={isConfigOpen}
            width={860}
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
                    <div className="mb-4 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-sm text-[var(--studio-text-secondary)]">
                        <div className="font-medium text-[var(--studio-text-primary)]">模型渠道</div>
                        <div className="mt-1">由后端统一转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。接口、密钥、模型映射、额度、任务日志和素材审核都在后台维护。</div>
                        {isPublicSettingsLoading ? <div className="mt-1 text-xs text-[var(--studio-accent)]">正在同步后台配置...</div> : null}
                        {showAdminSettingsEntry ? (
                            <Button className="mt-3" size="small" onClick={openAdminSettings}>
                                去后台设置
                            </Button>
                        ) : null}
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Form.Item label="默认生图模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="image" value={modelConfig.imageModel} onChange={(value) => updateConfig("imageModel", value)} fullWidth allowCustomModel={allowCustomModel} />
                        </Form.Item>
                        <Form.Item label="默认视频模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="video" value={modelConfig.videoModel} onChange={(value) => updateConfig("videoModel", value)} fullWidth allowCustomModel={allowCustomModel} />
                        </Form.Item>
                        <Form.Item label="默认文本模型" className="mb-4">
                            <ModelPicker config={modelConfig} modelType="text" value={modelConfig.textModel} onChange={(value) => updateConfig("textModel", value)} fullWidth allowCustomModel={allowCustomModel} />
                        </Form.Item>
                    </div>
                    <div className="mb-4 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                        <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
                            <Form.Item label="视频工作流执行方式" className="mb-0">
                                <Select<OriginalWorkflowExecutionMode>
                                    value={workflowExecutionMode}
                                    onChange={setWorkflowExecutionMode}
                                    options={[
                                        { label: "本地 Codex CLI", value: "local-runner" },
                                        { label: "云端 Worker", value: "cloud-worker" },
                                    ]}
                                />
                            </Form.Item>
                            <div className="text-xs leading-5 text-[var(--studio-text-muted)]">
                                {workflowExecutionMode === "cloud-worker" ? "云端 Worker 未接入时会阻断 Stage 启动。" : "使用本机 Codex CLI 执行视频工作流 Stage，结果写入 markdown 缓存。"}
                            </div>
                        </div>
                    </div>
                    <div className="mb-0 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium">思考模式</div>
                                <div className="mt-1 text-xs text-[var(--studio-text-muted)]">用于支持 reasoning_effort 的 OpenAI 兼容 Chat Completions 模型。</div>
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
