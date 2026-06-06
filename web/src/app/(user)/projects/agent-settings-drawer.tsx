"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Switch, Tag } from "antd";
import { Bot, Copy, RotateCcw, Save } from "lucide-react";

import {
    canInvokeAgentConfig,
    defaultAgentConfig,
    defaultAgentConfigs,
    formatInputVariablesText,
    mergeAgentConfigs,
    parseInputVariablesText,
    validateAgentConfig,
    type AgentConfig,
    type AgentConfigKind,
    type AgentReasoningLevel,
    type AgentWritePolicy,
} from "./agent-settings";
import { agentRunKindLabel, agentRunStatusLabel, listAgentRunsByProject } from "./agent-runner";
import { useAgentSettingsStore } from "./use-agent-settings-store";
import { useAgentRunnerStore } from "./use-agent-runner-store";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    onClose: () => void;
};

type AgentConfigFormValues = {
    name: string;
    scenario: string;
    enabled: boolean;
    systemPrompt: string;
    userPromptTemplate: string;
    inputVariablesText: string;
    outputJsonExample: string;
    modelPreference: string;
    temperature: number;
    maxOutputTokens: number;
    reasoningLevel: AgentReasoningLevel;
    writePolicy: AgentWritePolicy;
};

const agentKindOptions: Array<{ label: string; value: AgentConfigKind }> = [
    { label: "资产提取 Agent", value: "asset_extractor" },
    { label: "分镜导演 Agent", value: "storyboard_director" },
    { label: "生图 Brief Agent", value: "image_brief_builder" },
    { label: "视频提示词 Agent", value: "video_prompt_builder" },
    { label: "提示词质检 Agent", value: "prompt_reviewer" },
];

export function AgentSettingsDrawer({ open, projectId, projectTitle, onClose }: Props) {
    const { message } = App.useApp();
    const [form] = Form.useForm<AgentConfigFormValues>();
    const [selectedKind, setSelectedKind] = useState<AgentConfigKind>("asset_extractor");
    const globalConfigs = useAgentSettingsStore((state) => state.globalConfigs);
    const projectConfigs = useAgentSettingsStore((state) => state.projectConfigs);
    const saveProjectConfig = useAgentSettingsStore((state) => state.saveProjectConfig);
    const copyDefaultToProject = useAgentSettingsStore((state) => state.copyDefaultToProject);
    const resetProjectConfig = useAgentSettingsStore((state) => state.resetProjectConfig);
    const runs = useAgentRunnerStore((state) => state.runs);
    const createRun = useAgentRunnerStore((state) => state.createRun);
    const approveRun = useAgentRunnerStore((state) => state.approveRun);
    const rejectRun = useAgentRunnerStore((state) => state.rejectRun);
    const resolvedConfigs = useMemo(() => mergeAgentConfigs(defaultAgentConfigs(), globalConfigs, projectConfigs[projectId] || []), [globalConfigs, projectConfigs, projectId]);
    const recentRuns = useMemo(() => listAgentRunsByProject(runs, projectId).slice(0, 8), [projectId, runs]);
    const selectedConfig = resolvedConfigs.find((config) => config.kind === selectedKind) || defaultAgentConfig(selectedKind);
    const projectOverrideKinds = new Set((projectConfigs[projectId] || []).map((config) => config.kind));
    const validation = validateAgentConfig(selectedConfig);
    const callable = canInvokeAgentConfig(selectedConfig);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue(configToForm(selectedConfig));
    }, [form, open, selectedConfig]);

    const saveOverride = async () => {
        const values = await form.validateFields();
        const nextConfig = formToConfig(selectedConfig, values, projectId);
        const result = validateAgentConfig(nextConfig);
        if (!result.valid) {
            message.error(result.errors.join("；"));
            return;
        }
        saveProjectConfig(projectId, nextConfig);
        message.success("Agent 项目级配置已保存");
    };

    const restoreDefaultToForm = () => {
        form.setFieldsValue(configToForm(defaultAgentConfig(selectedKind, new Date().toISOString())));
        message.info("已恢复默认模板到表单，保存后才会写入项目配置");
    };

    const copyDefault = () => {
        copyDefaultToProject(projectId, selectedKind);
        message.success("已复制默认模板到项目配置");
    };

    const resetProjectOverride = () => {
        resetProjectConfig(projectId, selectedKind);
        message.success("已移除项目级覆盖，回到默认配置");
    };

    const createPreviewRun = () => {
        try {
            createRun(
                selectedConfig,
                {
                    projectId,
                    sourceType: "agent_settings_preview",
                    sourceId: selectedKind,
                    variables: { agentKind: selectedKind },
                },
                selectedConfig.outputJsonExample || { summary: `${selectedConfig.name} 本地预览运行记录`, items: [], warnings: ["第一版只创建本地草案记录，不调用真实模型。"] },
            );
            message.success("已创建本地 Agent run 预览");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "Agent 配置不可用，无法创建 run");
        }
    };

    return (
        <Drawer title="Agent 设置中心" open={open} onClose={onClose} size={1080} destroyOnHidden>
            <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-sm text-stone-500">当前项目：{projectTitle}</div>
                        <div className="mt-1 text-xl font-semibold">统一维护资产提取、分镜、生图 Brief、视频提示词和质检 Agent</div>
                        <p className="mt-2 text-sm leading-6 text-stone-500">第一版只保存本地配置，不接真实 LLM；所有输出默认是草案或预览，写入业务数据前必须用户确认。</p>
                    </div>
                    <Tag className="m-0">本地设置</Tag>
                </div>

                <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <Card size="small" title="Agent 类型">
                        <div className="grid gap-2">
                            {agentKindOptions.map((option) => {
                                const config = resolvedConfigs.find((item) => item.kind === option.value) || defaultAgentConfig(option.value);
                                const status = canInvokeAgentConfig(config);
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`rounded-lg border p-3 text-left transition hover:bg-stone-50 dark:hover:bg-white/5 ${selectedKind === option.value ? "border-stone-900 dark:border-stone-100" : "border-stone-200 dark:border-stone-800"}`}
                                        onClick={() => setSelectedKind(option.value)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium">{option.label}</span>
                                            <Tag className="m-0" color={status.callable ? "green" : "default"}>
                                                {status.callable ? "可用" : "不可用"}
                                            </Tag>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            <Tag className="m-0">{config.reasoningLevel}</Tag>
                                            <Tag className="m-0">{config.writePolicy === "confirm_before_write" ? "确认后写入" : "仅预览"}</Tag>
                                            {projectOverrideKinds.has(option.value) ? <Tag className="m-0">项目覆盖</Tag> : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    <Card
                        size="small"
                        title={
                            <span className="inline-flex items-center gap-2">
                                <Bot className="size-4" />
                                {selectedConfig.name}
                            </span>
                        }
                        extra={
                            <Space wrap>
                                <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={restoreDefaultToForm}>
                                    恢复默认模板
                                </Button>
                                <Button size="small" icon={<Copy className="size-3.5" />} onClick={copyDefault}>
                                    复制默认到项目
                                </Button>
                                <Button size="small" danger disabled={!projectOverrideKinds.has(selectedKind)} onClick={resetProjectOverride}>
                                    移除项目覆盖
                                </Button>
                                <Button size="small" type="primary" icon={<Save className="size-3.5" />} onClick={() => void saveOverride()}>
                                    保存项目配置
                                </Button>
                                <Button size="small" onClick={createPreviewRun}>
                                    创建预览 Run
                                </Button>
                            </Space>
                        }
                    >
                        {!validation.valid ? <Alert className="mb-4" type="warning" showIcon message="当前配置需要修正" description={validation.errors.join("；")} /> : null}
                        {!callable.callable ? <Alert className="mb-4" type="info" showIcon message="后续调用入口会显示不可用" description={callable.reason} /> : null}
                        <Form form={form} layout="vertical">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Form.Item name="name" label="Agent 名称" rules={[{ required: true, message: "请填写 Agent 名称" }]}>
                                    <Input />
                                </Form.Item>
                                <Form.Item name="enabled" label="是否启用" valuePropName="checked">
                                    <Switch checkedChildren="启用" unCheckedChildren="停用" />
                                </Form.Item>
                            </div>
                            <Form.Item name="scenario" label="使用场景">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="systemPrompt" label="系统提示词" rules={[{ required: true, message: "请填写系统提示词" }]}>
                                <Input.TextArea rows={5} />
                            </Form.Item>
                            <Form.Item name="userPromptTemplate" label="用户提示词模板" rules={[{ required: true, message: "请填写用户提示词模板" }]}>
                                <Input.TextArea rows={6} />
                            </Form.Item>
                            <Form.Item name="inputVariablesText" label="输入变量说明">
                                <Input.TextArea rows={4} placeholder="每行一个变量，例如：scriptSnapshot：本集剧本文本快照" />
                            </Form.Item>
                            <Form.Item name="outputJsonExample" label="输出 JSON 示例 / Schema">
                                <Input.TextArea rows={8} />
                            </Form.Item>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <Form.Item name="modelPreference" label="模型偏好">
                                    <Input placeholder="default / gpt-... / doubao-..." />
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
                        </Form>
                    </Card>
                </div>

                <Card size="small" title="运行记录">
                    {recentRuns.length ? (
                        <div className="grid gap-3">
                            {recentRuns.map((run) => (
                                <Card key={run.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">{agentRunKindLabel(run.agentKind)}</Tag>
                                                <Tag className="m-0">{agentRunStatusLabel(run.status)}</Tag>
                                                <Tag className="m-0">配置 v{run.agentConfigVersion}</Tag>
                                                {run.input.episodeTitle ? <Tag className="m-0">{run.input.episodeTitle}</Tag> : null}
                                            </div>
                                            <div className="mt-2 text-sm font-medium">{run.draftOutput.summary}</div>
                                            <div className="mt-1 text-xs text-stone-500">
                                                来源：{run.input.sourceType}
                                                {run.input.sourceId ? ` / ${run.input.sourceId}` : ""} · {run.createdAt}
                                            </div>
                                        </div>
                                        <Space size={6} wrap>
                                            <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => approveRun(run.id)}>
                                                批准
                                            </Button>
                                            <Button size="small" disabled={run.status !== "ready_for_review"} onClick={() => rejectRun(run.id)}>
                                                驳回
                                            </Button>
                                        </Space>
                                    </div>
                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs text-stone-500">查看 draftOutput / rawJson / proposedActions</summary>
                                        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify({ draftOutput: run.draftOutput, proposedActions: run.proposedActions }, null, 2)}</pre>
                                    </details>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500 dark:bg-white/5">暂无 Agent run。可以先选择一个 Agent，点击“创建预览 Run”生成本地草案记录。</div>
                    )}
                </Card>
            </div>
        </Drawer>
    );
}

function configToForm(config: AgentConfig): AgentConfigFormValues {
    return {
        name: config.name,
        scenario: config.scenario,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.userPromptTemplate,
        inputVariablesText: formatInputVariablesText(config.inputVariables),
        outputJsonExample: config.outputJsonExample || config.outputJsonSchema || "",
        modelPreference: config.modelPreference,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        reasoningLevel: config.reasoningLevel,
        writePolicy: config.writePolicy,
    };
}

function formToConfig(base: AgentConfig, values: AgentConfigFormValues, projectId: string): AgentConfig {
    return {
        ...base,
        id: base.projectId ? base.id : `agent-config-${projectId}-${base.kind}`,
        projectId,
        name: values.name,
        scenario: values.scenario || "",
        enabled: values.enabled,
        systemPrompt: values.systemPrompt,
        userPromptTemplate: values.userPromptTemplate,
        inputVariables: parseInputVariablesText(values.inputVariablesText || ""),
        outputJsonExample: values.outputJsonExample || "",
        modelPreference: values.modelPreference || "default",
        temperature: values.temperature ?? 0.4,
        maxOutputTokens: values.maxOutputTokens ?? 1800,
        reasoningLevel: values.reasoningLevel,
        writePolicy: values.writePolicy,
        updatedAt: new Date().toISOString(),
    };
}
