"use client";

import type { ReactNode } from "react";
import { Alert, Button, Card, Input, Select, Tag } from "antd";
import { Settings2 } from "lucide-react";

import type { AiConfig } from "@/stores/use-config-store";

type Props = {
    config: AiConfig;
    effectiveConfig: AiConfig;
    onConfigChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    onOpenFullConfig: () => void;
};

export function AgentModelSettingsPanel({ config, effectiveConfig, onConfigChange, onOpenFullConfig }: Props) {
    const setConfigValue = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => onConfigChange(key, value);
    const modelSummary = [
        { label: "文本", value: effectiveConfig.textModel || effectiveConfig.model || "未配置" },
        { label: "生图", value: effectiveConfig.imageModel || effectiveConfig.model || "未配置" },
        { label: "视频", value: effectiveConfig.videoProtocol === "volcengine-ark" ? effectiveConfig.seedanceModel || effectiveConfig.videoModel || "未配置" : effectiveConfig.videoModel || "未配置" },
    ];
    const visibleModels = uniqueModelNames([
        ...(effectiveConfig.textModels || []),
        ...(effectiveConfig.imageModels || []),
        ...(effectiveConfig.videoModels || []),
        effectiveConfig.model,
        effectiveConfig.textModel,
        effectiveConfig.imageModel,
        effectiveConfig.videoModel,
        effectiveConfig.seedanceModel,
    ]);

    return (
        <div className="grid gap-4">
            <Card
                size="small"
                title={
                    <span className="inline-flex items-center gap-2">
                        <Settings2 className="size-4" /> 通用模型配置
                    </span>
                }
                extra={
                    <Button size="small" onClick={onOpenFullConfig}>
                        打开完整配置
                    </Button>
                }
            >
                <Alert className="mb-4" type="info" showIcon title="这里保存的是全局默认模型和通用生成参数" description="Agent、工作流、画布配置节点都会优先读取这些默认值；单个 Agent 或单个画布节点仍可在自己的面板里临时覆盖。" />
                <div className="grid gap-3 md:grid-cols-3">
                    {modelSummary.map((item) => (
                        <div key={item.label} className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-white/5">
                            <div className="text-xs text-stone-500">默认{item.label}模型</div>
                            <div className="mt-1 break-words text-base font-semibold">{item.value}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="font-medium">模型渠道</div>
                        <div className="mt-3 grid gap-3">
                            <div className="rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">统一由后端模型渠道转发请求；接口地址、API Key、模型映射、额度和任务日志都在后台系统设置中维护。</div>
                            <Button onClick={onOpenFullConfig}>打开完整配置</Button>
                        </div>
                    </section>

                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="font-medium">默认模型</div>
                        <div className="mt-3 grid gap-3">
                            <FieldLabel label="默认文本模型">
                                <Input value={config.textModel} onChange={(event) => setConfigValue("textModel", event.target.value)} placeholder="例如 gpt-5.5 / gemini-3.1-pro-preview" />
                            </FieldLabel>
                            <FieldLabel label="默认生图模型">
                                <Input value={config.imageModel} onChange={(event) => setConfigValue("imageModel", event.target.value)} placeholder="例如 gpt-image-2" />
                            </FieldLabel>
                            <FieldLabel label="默认视频模型">
                                <Input value={config.videoModel} onChange={(event) => setConfigValue("videoModel", event.target.value)} placeholder="例如 grok-imagine-video" />
                            </FieldLabel>
                            <FieldLabel label="Seedance 模型">
                                <Input value={config.seedanceModel} onChange={(event) => setConfigValue("seedanceModel", event.target.value)} placeholder="例如 doubao-seedance-2-0" />
                            </FieldLabel>
                        </div>
                    </section>

                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="font-medium">图片默认参数</div>
                        <div className="mt-3 grid gap-3">
                            <FieldLabel label="尺寸">
                                <Select value={config.size} onChange={(value) => setConfigValue("size", value)} options={["1:1", "16:9", "9:16", "4:3", "3:4", "auto"].map((value) => ({ label: value, value }))} />
                            </FieldLabel>
                            <FieldLabel label="质量">
                                <Select value={config.quality} onChange={(value) => setConfigValue("quality", value)} options={["auto", "low", "medium", "high"].map((value) => ({ label: value, value }))} />
                            </FieldLabel>
                            <FieldLabel label="张数">
                                <Select value={config.count} onChange={(value) => setConfigValue("count", value)} options={["1", "2", "3", "4"].map((value) => ({ label: `${value} 张`, value }))} />
                            </FieldLabel>
                            <FieldLabel label="思考强度">
                                <Select
                                    value={config.reasoningEffort}
                                    onChange={(value) => setConfigValue("reasoningEffort", value as AiConfig["reasoningEffort"])}
                                    options={[
                                        { label: "极低", value: "minimal" },
                                        { label: "低", value: "low" },
                                        { label: "中", value: "medium" },
                                        { label: "高", value: "high" },
                                    ]}
                                />
                            </FieldLabel>
                        </div>
                    </section>

                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="font-medium">视频默认参数</div>
                        <div className="mt-3 grid gap-3">
                            <FieldLabel label="视频协议">
                                <Select
                                    value={config.videoProtocol}
                                    onChange={(value) => setConfigValue("videoProtocol", value as AiConfig["videoProtocol"])}
                                    options={[
                                        { label: "OpenAI 兼容", value: "openai" },
                                        { label: "火山 Ark / Seedance", value: "volcengine-ark" },
                                    ]}
                                />
                            </FieldLabel>
                            <div className="grid gap-3 md:grid-cols-2">
                                <FieldLabel label="清晰度">
                                    <Select value={config.vquality} onChange={(value) => setConfigValue("vquality", value)} options={["480", "720", "1080"].map((value) => ({ label: `${value}p`, value }))} />
                                </FieldLabel>
                                <FieldLabel label="时长">
                                    <Select value={config.videoSeconds} onChange={(value) => setConfigValue("videoSeconds", value)} options={["3", "4", "5", "6", "8", "10", "12"].map((value) => ({ label: `${value}s`, value }))} />
                                </FieldLabel>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <FieldLabel label="生成音频">
                                    <Select
                                        value={config.videoGenerateAudio}
                                        onChange={(value) => setConfigValue("videoGenerateAudio", value)}
                                        options={[
                                            { label: "开启", value: "true" },
                                            { label: "关闭", value: "false" },
                                        ]}
                                    />
                                </FieldLabel>
                                <FieldLabel label="水印">
                                    <Select
                                        value={config.videoWatermark}
                                        onChange={(value) => setConfigValue("videoWatermark", value)}
                                        options={[
                                            { label: "关闭", value: "false" },
                                            { label: "开启", value: "true" },
                                        ]}
                                    />
                                </FieldLabel>
                            </div>
                            <FieldLabel label="Seedance Endpoint ID">
                                <Input value={config.seedanceEndpointId} onChange={(event) => setConfigValue("seedanceEndpointId", event.target.value)} placeholder="仅火山 Ark Endpoint 模式需要" />
                            </FieldLabel>
                        </div>
                    </section>
                </div>

                <details className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <summary className="cursor-pointer text-sm font-medium">当前可见模型列表</summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {visibleModels.length ? (
                            visibleModels.map((model) => (
                                <Tag key={model} className="m-0">
                                    {model}
                                </Tag>
                            ))
                        ) : (
                            <span className="text-sm text-stone-500">暂无模型列表；请先在后台系统设置中维护模型渠道。</span>
                        )}
                    </div>
                </details>
            </Card>
        </div>
    );
}

function FieldLabel({ children, label }: { children: ReactNode; label: string }) {
    return (
        <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-stone-500">{label}</span>
            {children}
        </label>
    );
}

function uniqueModelNames(values: Array<string | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}
