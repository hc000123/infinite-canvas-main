import type { FormInstance } from "antd";
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch, Tag } from "antd";
import { Bot, Copy, RotateCcw, Save } from "lucide-react";

import { canInvokeAgentConfig, defaultAgentConfig, validateAgentConfig, type AgentConfig, type AgentConfigKind } from "./agent-settings";
import { agentRunKindLabel, agentRunStatusLabel } from "./agent-runner-records";
import type { AgentRunRecord } from "./agent-runner-types";
import type { AgentConfigFormValues } from "./agent-settings-form";

const agentKindOptions: Array<{ label: string; value: AgentConfigKind }> = [
    { label: "资产提取 Agent", value: "asset_extractor" },
    { label: "分镜导演 Agent", value: "storyboard_director" },
    { label: "生图 Brief Agent", value: "image_brief_builder" },
    { label: "视频提示词 Agent", value: "video_prompt_builder" },
    { label: "提示词质检 Agent", value: "prompt_reviewer" },
];

export function AgentQuickAgentsPanel({
    callable,
    form,
    onCopyDefault,
    onCreatePreviewRun,
    onOpenConfig,
    onResetProjectOverride,
    onRestoreDefaultToForm,
    onSaveOverride,
    projectOverrideKinds,
    recentRuns,
    resolvedConfigs,
    selectedAgentModel,
    selectedConfig,
    selectedKind,
    setSelectedKind,
    settingsOnly,
    textApiReady,
    textChannelLabel,
    validation,
}: {
    callable: ReturnType<typeof canInvokeAgentConfig>;
    form: FormInstance<AgentConfigFormValues>;
    onCopyDefault: () => void;
    onCreatePreviewRun: () => void;
    onOpenConfig: () => void;
    onResetProjectOverride: () => void;
    onRestoreDefaultToForm: () => void;
    onSaveOverride: () => void;
    projectOverrideKinds: Set<AgentConfigKind>;
    recentRuns: AgentRunRecord[];
    resolvedConfigs: AgentConfig[];
    selectedAgentModel: string;
    selectedConfig: AgentConfig;
    selectedKind: AgentConfigKind;
    setSelectedKind: (kind: AgentConfigKind) => void;
    settingsOnly: boolean;
    textApiReady: boolean;
    textChannelLabel: string;
    validation: ReturnType<typeof validateAgentConfig>;
}) {
    return (
        <div className="grid gap-4">
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
                                            {status.callable ? "模板可用" : "模板不可用"}
                                        </Tag>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <Tag className="m-0">{config.reasoningLevel}</Tag>
                                        <Tag className="m-0">{config.modelPreference === "default" ? "全局文本模型" : config.modelPreference}</Tag>
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
                            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRestoreDefaultToForm}>
                                恢复默认模板
                            </Button>
                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={onCopyDefault}>
                                复制默认到项目
                            </Button>
                            <Button size="small" danger disabled={!projectOverrideKinds.has(selectedKind)} onClick={onResetProjectOverride}>
                                移除项目覆盖
                            </Button>
                            <Button size="small" type="primary" icon={<Save className="size-3.5" />} onClick={onSaveOverride}>
                                保存项目配置
                            </Button>
                            {!settingsOnly ? (
                                <Button size="small" onClick={onCreatePreviewRun}>
                                    创建预览 Run
                                </Button>
                            ) : null}
                        </Space>
                    }
                >
                    {!validation.valid ? <Alert className="mb-4" type="warning" showIcon title="当前配置需要修正" description={validation.errors.join("；")} /> : null}
                    {!callable.callable ? <Alert className="mb-4" type="info" showIcon title="后续调用入口会显示不可用" description={callable.reason} /> : null}
                    <div className="mb-4 grid gap-2 rounded-lg bg-stone-50 p-3 text-sm dark:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0" color={callable.callable ? "green" : "default"}>
                                {callable.callable ? "模板可用" : "模板不可用"}
                            </Tag>
                            <Tag className="m-0" color={textApiReady ? "green" : "orange"}>
                                文本 API {textApiReady ? "已就绪" : "未就绪"}
                            </Tag>
                            <Tag className="m-0">{textChannelLabel}</Tag>
                            <Tag className="m-0">实际模型：{selectedAgentModel}</Tag>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                            <span>{settingsOnly ? "这里只保存项目级 Agent 配置；运行与写入回到本集生产流程中完成。" : "“创建预览 Run”只创建本地草案记录；真实文本调用在工作流阶段的“运行草案”中触发。"}</span>
                            <Button size="small" onClick={onOpenConfig}>
                                打开 AI 配置
                            </Button>
                        </div>
                    </div>
                    <AgentTemplatePreview selectedConfig={selectedConfig} />
                    <AgentTemplateEditForm form={form} />
                </Card>
            </div>

            {!settingsOnly ? <AgentDraftRunsPanel recentRuns={recentRuns} /> : null}
        </div>
    );
}

function AgentTemplatePreview({ selectedConfig }: { selectedConfig: AgentConfig }) {
    return (
        <div className="mb-4 grid gap-3 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">模板预览</span>
                <Tag className="m-0">{selectedConfig.reasoningLevel}</Tag>
                <Tag className="m-0">{selectedConfig.writePolicy === "confirm_before_write" ? "确认后写入" : "仅预览"}</Tag>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <div>
                    <div className="mb-1 text-xs text-stone-500">使用场景</div>
                    <div className="rounded-md bg-stone-50 p-2 leading-6 dark:bg-white/5">{selectedConfig.scenario}</div>
                </div>
                <div>
                    <div className="mb-1 text-xs text-stone-500">输入变量</div>
                    <div className="rounded-md bg-stone-50 p-2 leading-6 dark:bg-white/5">
                        {selectedConfig.inputVariables.map((variable) => (
                            <div key={variable.name}>
                                {variable.name}：{variable.description}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <details open>
                <summary className="cursor-pointer text-xs text-stone-500">查看完整提示词与输出 Schema</summary>
                <div className="mt-2 grid gap-2">
                    <div>
                        <div className="mb-1 text-xs text-stone-500">系统提示词</div>
                        <pre className="max-h-40 overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-5 whitespace-pre-wrap text-stone-50">{selectedConfig.systemPrompt}</pre>
                    </div>
                    <div>
                        <div className="mb-1 text-xs text-stone-500">用户提示词模板</div>
                        <pre className="max-h-48 overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-5 whitespace-pre-wrap text-stone-50">{selectedConfig.userPromptTemplate}</pre>
                    </div>
                    <div>
                        <div className="mb-1 text-xs text-stone-500">输出 JSON 示例 / Schema</div>
                        <pre className="max-h-64 overflow-auto rounded-md bg-stone-950 p-3 text-xs leading-5 whitespace-pre-wrap text-stone-50">{selectedConfig.outputJsonExample}</pre>
                    </div>
                </div>
            </details>
        </div>
    );
}

function AgentTemplateEditForm({ form }: { form: FormInstance<AgentConfigFormValues> }) {
    return (
        <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <summary className="cursor-pointer text-sm font-medium">编辑模板字段</summary>
            <Form className="mt-3" form={form} layout="vertical">
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
        </details>
    );
}

function AgentDraftRunsPanel({ recentRuns }: { recentRuns: AgentRunRecord[] }) {
    return (
        <Card size="small" title="草案记录">
            {recentRuns.length ? (
                <div className="grid gap-3">
                    {recentRuns.map((run) => (
                        <Card key={run.id} size="small" className="bg-stone-50/70 dark:bg-white/5">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag className="m-0">{agentRunKindLabel(run.agentKind)}</Tag>
                                    <Tag className="m-0">{agentRunStatusLabel(run.status)}</Tag>
                                    <Tag className="m-0">配置 v{run.agentConfigVersion}</Tag>
                                    {run.input.workflowId ? <Tag className="m-0">workflow {run.input.workflowId}</Tag> : null}
                                    {run.input.stageId ? <Tag className="m-0">stage {run.input.stageId}</Tag> : null}
                                    {run.input.episodeTitle ? <Tag className="m-0">{run.input.episodeTitle}</Tag> : null}
                                </div>
                                <div className="mt-2 text-sm font-medium">{run.workflowTextOutput?.summary || run.draftOutput.summary}</div>
                                {run.status === "error" || run.status === "failed" ? <div className="mt-1 text-xs text-rose-500">{run.errorMessage || "执行失败"}</div> : null}
                                <div className="mt-1 text-xs text-stone-500">
                                    来源：{run.input.sourceType}
                                    {run.input.sourceId ? ` / ${run.input.sourceId}` : ""} · {run.createdAt}
                                    {run.input.agentId ? ` · agent ${run.input.agentId}` : ""}
                                    {run.input.model ? ` · model ${run.input.model}` : ""}
                                </div>
                            </div>
                            <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-stone-500">查看草案 / workflow 文本产物</summary>
                                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify({ draftOutput: run.draftOutput, workflowTextOutput: run.workflowTextOutput, proposedActions: run.proposedActions }, null, 2)}</pre>
                            </details>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500 dark:bg-white/5">暂无草案记录。可以先选择一个 Agent，点击“创建预览 Run”生成本地草案记录。</div>
            )}
        </Card>
    );
}
