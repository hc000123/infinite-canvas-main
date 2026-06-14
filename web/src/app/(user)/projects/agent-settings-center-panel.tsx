"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Form, Input, InputNumber, Select, Switch, Tag } from "antd";
import { Bot, RotateCcw, Save } from "lucide-react";

import { saveRemoteAgentConfig } from "@/services/api/agent-runs";
import { canInvokeAgentConfig, defaultAgentConfig, defaultAgentConfigs, mergeAgentConfigs, validateAgentConfig, type AgentConfigKind } from "./agent-settings";
import { configToForm, formToGlobalConfig, type AgentConfigFormValues } from "./agent-settings-form";
import { useAgentSettingsStore } from "./use-agent-settings-store";

const agentKindOptions: Array<{ label: string; value: AgentConfigKind }> = [
    { label: "剧本优化", value: "script_optimizer" },
    { label: "导演分析", value: "script_analyzer" },
    { label: "资产分析", value: "asset_extractor" },
    { label: "分镜生产", value: "storyboard_director" },
    { label: "生图 Brief", value: "image_brief_builder" },
    { label: "视频提示词", value: "video_prompt_builder" },
    { label: "提示词质检", value: "prompt_reviewer" },
];

export function AgentSettingsCenterPanel() {
    const { message } = App.useApp();
    const [form] = Form.useForm<AgentConfigFormValues>();
    const [selectedKind, setSelectedKind] = useState<AgentConfigKind>("script_optimizer");
    const [remoteSaving, setRemoteSaving] = useState(false);
    const globalConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const saveGlobalConfig = useAgentSettingsStore((state) => state.saveGlobalConfig);
    const resetGlobalConfig = useAgentSettingsStore((state) => state.resetGlobalConfig);
    const resolvedConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalConfigs), [globalConfigs]);
    const selectedConfig = resolvedConfigs.find((config) => config.kind === selectedKind) || defaultAgentConfig(selectedKind);
    const validation = validateAgentConfig(selectedConfig);
    const callable = canInvokeAgentConfig(selectedConfig);
    const hasGlobalOverride = globalConfigs.some((config) => config.kind === selectedKind);

    useEffect(() => {
        form.setFieldsValue(configToForm(selectedConfig));
    }, [form, selectedConfig]);

    const save = async () => {
        const values = await form.validateFields();
        const nextConfig = formToGlobalConfig(selectedConfig, values);
        const result = validateAgentConfig(nextConfig);
        if (!result.valid) {
            message.error(result.errors.join("；"));
            return;
        }
        saveGlobalConfig(nextConfig);
        setRemoteSaving(true);
        try {
            await saveRemoteAgentConfig({ scope: "global", kind: nextConfig.kind, configJson: nextConfig });
            message.success("Agent 全局设定已保存到后端");
        } catch (error) {
            message.warning(error instanceof Error ? `已保存本地草稿，后端同步失败：${error.message}` : "已保存本地草稿，后端同步失败");
        } finally {
            setRemoteSaving(false);
        }
    };

    const restoreDefaultToForm = () => {
        form.setFieldsValue(configToForm(defaultAgentConfig(selectedKind, new Date().toISOString())));
        message.info("已恢复默认设定到表单，保存后生效");
    };

    const reset = () => {
        resetGlobalConfig(selectedKind);
        message.success("已移除全局覆盖，恢复默认设定");
    };

    return (
        <div className="grid gap-4">
            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Bot className="size-4" />
                            Agent 中心
                        </div>
                        <div className="mt-1 text-xs text-stone-500">每个 Agent 只维护一份完整设定；具体流程里读取这里的全局设定，项目页可再单独覆盖。</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Tag className="m-0" color={callable.callable ? "green" : "orange"}>
                            {callable.callable ? "可用" : callable.reason}
                        </Tag>
                        {hasGlobalOverride ? <Tag className="m-0">已自定义</Tag> : <Tag className="m-0">默认设定</Tag>}
                    </div>
                </div>
                <Select className="w-full" value={selectedKind} onChange={setSelectedKind} options={agentKindOptions} />
            </div>

            <Form form={form} layout="vertical" requiredMark={false}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                    <Form.Item name="name" label="Agent 名称" rules={[{ required: true, message: "请填写 Agent 名称" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="enabled" label="启用" valuePropName="checked">
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                </div>

                <Form.Item name="scenario" label="使用场景">
                    <Input.TextArea rows={2} />
                </Form.Item>

                <Form.Item name="systemPrompt" label="完整设定" extra="把角色身份、任务边界、输出风格、禁止事项和质量要求都写在这里。">
                    <Input.TextArea rows={8} />
                </Form.Item>

                {selectedConfig.skillSummary ? (
                    <details className="mb-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <summary className="cursor-pointer text-sm font-medium">内置 Skill 摘要</summary>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">{selectedConfig.skillSummary}</div>
                    </details>
                ) : null}

                <Form.Item name="userPromptTemplate" label="输入模板" extra="流程运行时会把 {projectTitle}、{episodeTitle}、{scriptSnapshot} 等变量填入模板。">
                    <Input.TextArea rows={6} />
                </Form.Item>

                <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <summary className="cursor-pointer text-sm font-medium">高级项</summary>
                    <div className="mt-3 grid gap-3">
                        <Form.Item name="inputVariablesText" label="变量说明">
                            <Input.TextArea rows={4} placeholder="每行一个变量，例如：scriptSnapshot：本集剧本文本快照" />
                        </Form.Item>
                        <Form.Item name="outputJsonExample" label="输出示例 / Schema">
                            <Input.TextArea rows={5} />
                        </Form.Item>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <Form.Item name="channelId" label="API 渠道 ID">
                                <Input placeholder="留空走项目 / 全局默认" />
                            </Form.Item>
                            <Form.Item name="modelPreference" label="模型偏好">
                                <Input placeholder="default / gpt-..." />
                            </Form.Item>
                            <Form.Item name="temperature" label="Temperature">
                                <InputNumber className="w-full" min={0} max={2} step={0.1} />
                            </Form.Item>
                            <Form.Item name="maxOutputTokens" label="最大输出">
                                <InputNumber className="w-full" min={1} step={100} />
                            </Form.Item>
                            <Form.Item name="reasoningLevel" label="推理程度">
                                <Select
                                    options={[
                                        { label: "中", value: "中" },
                                        { label: "高", value: "高" },
                                        { label: "超高", value: "超高" },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item name="writePolicy" label="写入策略">
                                <Select
                                    options={[
                                        { label: "仅预览", value: "preview_only" },
                                        { label: "确认后写入", value: "confirm_before_write" },
                                    ]}
                                />
                            </Form.Item>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <Form.Item name="estimatedCredits" label="单次预估费用">
                                <InputNumber className="w-full" min={0} step={1} />
                            </Form.Item>
                            <Form.Item name="timeoutSeconds" label="超时秒数">
                                <InputNumber className="w-full" min={30} max={1800} step={30} />
                            </Form.Item>
                            <Form.Item name="concurrencyLimit" label="并发限制">
                                <InputNumber className="w-full" min={1} max={10} step={1} />
                            </Form.Item>
                            <Form.Item name="allowFallback" label="允许 fallback" valuePropName="checked">
                                <Switch checkedChildren="允许" unCheckedChildren="阻断" />
                            </Form.Item>
                            <Form.Item name="allowBatch" label="允许批量" valuePropName="checked">
                                <Switch checkedChildren="允许" unCheckedChildren="禁用" />
                            </Form.Item>
                        </div>
                        <Form.Item name="fallbackChannelIdsText" label="Fallback 渠道 ID" extra="每行一个渠道 ID；只有启用 fallback 时才会使用，不会自动切到更贵渠道。">
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    </div>
                </details>
            </Form>

            {!validation.valid ? <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">{validation.errors.join("；")}</div> : null}
            <div className="flex flex-wrap justify-end gap-2">
                <Button icon={<RotateCcw className="size-4" />} onClick={restoreDefaultToForm}>
                    恢复默认
                </Button>
                <Button danger disabled={!hasGlobalOverride} onClick={reset}>
                    移除自定义
                </Button>
                <Button type="primary" icon={<Save className="size-4" />} loading={remoteSaving} onClick={() => void save()}>
                    保存 Agent 设定
                </Button>
            </div>
        </div>
    );
}
