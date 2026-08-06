"use client";

import { CheckCircle2, ExternalLink, KeyRound } from "lucide-react";
import { Alert, App, Button, Form, Modal, Space, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { checkUserJimengLogin, startUserJimengLogin, type JimengLoginStartResult } from "@/services/api/jimeng-login";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
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
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const modelConfig = effectiveConfig;
    const videoModel = modelConfig.videoModel;
    const isJimengVideoModel = modelConfig.videoProtocol === "jimeng-cli";
    const isAdmin = user?.role === "admin" || user?.role === "superadmin";
    const showAdminSettingsEntry = isAdmin;
    const allowCustomModel = modelChannel?.allowCustomChannel !== false;
    const [jimengLogin, setJimengLogin] = useState<JimengLoginStartResult | null>(null);
    const [isStartingJimengLogin, setIsStartingJimengLogin] = useState(false);
    const [isCheckingJimengLogin, setIsCheckingJimengLogin] = useState(false);

    useEffect(() => {
        if (isConfigOpen && showAdminSettingsEntry) router.prefetch("/admin/settings");
    }, [isConfigOpen, router, showAdminSettingsEntry]);

    useEffect(() => {
        if (!isConfigOpen) return;
        void loadPublicSettings({ force: true });
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

    const jimengLoginURL = jimengLogin?.verificationUriComplete || jimengLogin?.verificationUri || "";

    const startJimengLogin = async () => {
        if (!videoModel.trim()) {
            message.warning("请先选择即梦视频模型");
            return;
        }
        const verificationWindow = typeof window === "undefined" ? null : window.open("", "_blank");
        if (verificationWindow) verificationWindow.opener = null;
        setIsStartingJimengLogin(true);
        try {
            const result = await startUserJimengLogin(videoModel);
            setJimengLogin(result);
            const loginURL = result.verificationUriComplete || result.verificationUri || "";
            if (result.loginReady) {
                verificationWindow?.close();
                message.success(result.message || "即梦 CLI 已登录");
            } else if (loginURL && verificationWindow) {
                verificationWindow.location.replace(loginURL);
                message.success("已打开即梦验证网页");
            } else {
                verificationWindow?.close();
                message.warning(loginURL ? "验证网页被浏览器拦截，请点击“重新打开验证页”" : "未获取到即梦验证链接");
            }
        } catch (error) {
            verificationWindow?.close();
            message.error(error instanceof Error ? error.message : "获取即梦验证码失败");
        } finally {
            setIsStartingJimengLogin(false);
        }
    };

    const checkJimengLogin = async () => {
        if (!jimengLogin?.deviceCode) return;
        setIsCheckingJimengLogin(true);
        try {
            const result = await checkUserJimengLogin({ model: videoModel, deviceCode: jimengLogin.deviceCode });
            if (result.loginReady) {
                setJimengLogin({ ...jimengLogin, loginReady: true, message: result.message });
                message.success(result.message || "即梦网页登录验证已完成");
            } else {
                message.warning(result.message || "即梦登录尚未完成");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "即梦网页登录验证未完成");
        } finally {
            setIsCheckingJimengLogin(false);
        }
    };

    const openJimengLoginURL = () => {
        if (!jimengLoginURL || typeof window === "undefined") return;
        const opened = window.open(jimengLoginURL, "_blank", "noopener,noreferrer");
        if (!opened) message.warning("验证网页被浏览器拦截，可复制链接后手动打开。");
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
                    {isJimengVideoModel ? (
                        <Alert
                            className="mb-4"
                            showIcon
                            type={jimengLogin?.loginReady ? "success" : "info"}
                            title="即梦网页登录"
                            description={
                                <div className="space-y-3">
                                    <Typography.Text type="secondary">当前视频模型使用本机即梦 CLI 登录态。后台仍会记录任务和用量，并归属当前应用账号。</Typography.Text>
                                    {jimengLogin?.userCode ? (
                                        <Space size={12} wrap>
                                            <Typography.Text>
                                                验证码：
                                                <Typography.Text code copyable>
                                                    {jimengLogin.userCode}
                                                </Typography.Text>
                                            </Typography.Text>
                                            {jimengLogin.expiresIn ? <Typography.Text type="secondary">{Math.floor(jimengLogin.expiresIn / 60)} 分钟内有效</Typography.Text> : null}
                                            {jimengLoginURL ? <Typography.Text copyable={{ text: jimengLoginURL }}>复制验证链接</Typography.Text> : null}
                                        </Space>
                                    ) : null}
                                    {jimengLogin?.loginReady ? <Typography.Text type="success">{jimengLogin.message || "即梦 CLI 已登录"}</Typography.Text> : null}
                                    <Space wrap>
                                        <Button icon={<KeyRound size={16} />} loading={isStartingJimengLogin} onClick={() => void startJimengLogin()}>
                                            登录即梦
                                        </Button>
                                        <Button icon={<ExternalLink size={16} />} type="primary" disabled={!jimengLoginURL} onClick={openJimengLoginURL}>
                                            重新打开验证页
                                        </Button>
                                        <Button icon={<CheckCircle2 size={16} />} loading={isCheckingJimengLogin} disabled={!jimengLogin?.deviceCode || jimengLogin.loginReady} onClick={() => void checkJimengLogin()}>
                                            完成验证
                                        </Button>
                                    </Space>
                                </div>
                            }
                        />
                    ) : null}
                </Form>
            </div>
        </Modal>
    );
}
