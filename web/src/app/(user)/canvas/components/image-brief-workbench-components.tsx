"use client";

import { useEffect, useMemo } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Segmented, Space, Tag } from "antd";
import { Clipboard, ImagePlus, Pencil, Star, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { buildImageBriefResultSummaries, defaultImageBriefFields, imageBriefKindLabel, imageBriefModeLabel, type ImageBrief, type ImageBriefKind, type ImageBriefMode } from "../utils/image-brief";
import type { CanvasProject } from "../stores/use-canvas-store";

export type ImageBriefFormValues = {
    canvasId?: string;
    kind: ImageBriefKind;
    mode: ImageBriefMode;
    title: string;
    scriptText?: string;
    referenceAssetIds?: string[];
    finalPrompt?: string;
} & Record<string, string | string[] | undefined>;

export const imageBriefKindOptions: Array<{ label: string; value: ImageBriefKind }> = [
    { label: "场景图", value: "scene" },
    { label: "角色图", value: "character" },
    { label: "道具图", value: "prop" },
    { label: "氛围参考图", value: "mood" },
];

const imageBriefModeOptions: Array<{ label: string; value: ImageBriefMode }> = [
    { label: "标准", value: "standard" },
    { label: "提醒", value: "reminder" },
    { label: "自由", value: "free" },
];

export function ImageBriefCard({
    brief,
    assetsById,
    onCopy,
    onCreateImageConfig,
    onOpenAsset,
    onSetPrimary,
    onSyncPrimary,
    onEdit,
    onDelete,
}: {
    brief: ImageBrief;
    assetsById: Map<string, Asset>;
    onCopy: () => void;
    onCreateImageConfig?: () => void;
    onOpenAsset?: (asset: Asset) => void;
    onSetPrimary: (assetId: string) => void;
    onSyncPrimary?: (assetId: string) => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const validationColor = brief.validationResult.severity === "error" ? "red" : brief.validationResult.severity === "warning" ? "gold" : "green";
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Tag className="m-0">{imageBriefKindLabel(brief.kind)}</Tag>
                    <span className="truncate">{brief.title}</span>
                    <Tag color={validationColor} className="m-0">
                        {brief.validationResult.severity === "none" ? "检查通过" : brief.validationResult.severity === "warning" ? "提醒" : "待补充"}
                    </Tag>
                    <Tag className="m-0">{imageBriefModeLabel(brief.mode)}</Tag>
                </div>
            }
            extra={
                <Space size={4}>
                    <Button size="small" type="text" icon={<Clipboard className="size-4" />} onClick={onCopy} />
                    {onCreateImageConfig ? <Button size="small" type="text" icon={<ImagePlus className="size-4" />} onClick={onCreateImageConfig} /> : null}
                    <Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={onEdit} />
                    <Popconfirm title="删除这个 Brief？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-3 text-sm">
                {brief.scriptText ? <p className="m-0 line-clamp-2 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{brief.scriptText}</p> : null}
                <Space size={[4, 4]} wrap>
                    <Tag className="m-0">{imageBriefSourceTypeLabel(brief.sourceType)}</Tag>
                    {brief.episodeTitle ? <Tag className="m-0">{brief.episodeTitle}</Tag> : null}
                    {brief.status ? <Tag className="m-0">{imageBriefStatusLabel(brief.status)}</Tag> : null}
                    {brief.referenceAssets.map((ref) => (
                        <Tag key={`${ref.assetId}:${ref.role}`} className="m-0">
                            {assetsById.get(ref.assetId)?.title || ref.assetId} · {ref.role}
                        </Tag>
                    ))}
                </Space>
                {brief.validationResult.messages.length ? <div className="rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{brief.validationResult.messages.join(" / ")}</div> : null}
                <pre className="thin-scrollbar max-h-40 overflow-auto rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{brief.finalPrompt || brief.prompt}</pre>
                {brief.resultAssetIds.length ? <ImageBriefResultTags brief={brief} assetsById={assetsById} onOpenAsset={onOpenAsset} onSetPrimary={onSetPrimary} onSyncPrimary={onSyncPrimary} /> : null}
            </div>
        </Card>
    );
}

export function ImageBriefFormModal({
    open,
    editingBrief,
    canvases,
    assets,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    editingBrief: ImageBrief | null;
    canvases: CanvasProject[];
    assets: Asset[];
    onCancel: () => void;
    onSubmit: (values: ImageBriefFormValues) => void;
}) {
    const [form] = Form.useForm<ImageBriefFormValues>();
    const kind = Form.useWatch("kind", form) || editingBrief?.kind || "scene";
    const fieldKeys = Object.keys(defaultImageBriefFields(kind));

    useEffect(() => {
        if (!open) return;
        const brief = editingBrief;
        form.setFieldsValue({
            canvasId: brief?.canvasId || canvases[0]?.id,
            kind: brief?.kind || "scene",
            mode: brief?.mode || "standard",
            title: brief?.title || "",
            scriptText: brief?.scriptText || "",
            referenceAssetIds: brief?.referenceAssets.map((ref) => ref.assetId) || [],
            finalPrompt: brief?.finalPrompt || "",
            ...brief?.fields,
        });
    }, [canvases, editingBrief, form, open]);

    useEffect(() => {
        if (!open) return;
        const current = form.getFieldsValue(true);
        form.setFieldsValue({ ...defaultImageBriefFields(kind), ...current, kind });
    }, [form, kind, open]);

    return (
        <Modal title={editingBrief ? "编辑生图 Brief" : "新增生图 Brief"} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="保存" cancelText="取消" width={760} destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Form.Item name="kind" label="Brief 类型" rules={[{ required: true, message: "请选择类型" }]}>
                        <Segmented options={imageBriefKindOptions} />
                    </Form.Item>
                    <Form.Item name="mode" label="检查模式" rules={[{ required: true, message: "请选择模式" }]}>
                        <Segmented options={imageBriefModeOptions} />
                    </Form.Item>
                </div>
                <Form.Item name="canvasId" label="关联画布">
                    <Select allowClear options={canvases.map((canvas) => ({ label: canvas.title, value: canvas.id }))} />
                </Form.Item>
                <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: "请输入标题" }]}>
                    <Input placeholder="例如：大学操场场景图 / 魏梁角色图" />
                </Form.Item>
                <Form.Item name="scriptText" label="剧本依据 / 来源文本">
                    <Input.TextArea rows={3} />
                </Form.Item>
                <div className="grid gap-3 sm:grid-cols-2">
                    {fieldKeys.map((key) => (
                        <Form.Item key={key} name={key} label={imageBriefFieldLabel(key)}>
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    ))}
                </div>
                <Form.Item name="referenceAssetIds" label="参考素材">
                    <Select mode="multiple" showSearch optionFilterProp="label" options={assets.map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id }))} />
                </Form.Item>
                <Form.Item name="finalPrompt" label="最终提示词（留空则按结构化字段自动拼装）">
                    <Input.TextArea rows={5} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

function ImageBriefResultTags({
    brief,
    assetsById,
    onOpenAsset,
    onSetPrimary,
    onSyncPrimary,
}: {
    brief: ImageBrief;
    assetsById: Map<string, Asset>;
    onOpenAsset?: (asset: Asset) => void;
    onSetPrimary: (assetId: string) => void;
    onSyncPrimary?: (assetId: string) => void;
}) {
    const summaries = buildImageBriefResultSummaries(brief, Array.from(assetsById.values()));
    return (
        <div className="space-y-1 rounded-lg border border-stone-200 p-2 dark:border-stone-700">
            <div className="text-xs font-medium text-stone-500">生成结果</div>
            <div className="space-y-2">
                {summaries.map((summary) => {
                    const asset = assetsById.get(summary.assetId);
                    return (
                        <div key={summary.assetId} className="rounded-md bg-stone-50 p-2 text-xs leading-5 dark:bg-stone-900">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button type="button" className="max-w-56 truncate font-medium text-stone-700 underline-offset-2 hover:underline dark:text-stone-200" onClick={() => asset && onOpenAsset?.(asset)}>
                                    {summary.title}
                                </button>
                                {summary.isPrimary ? (
                                    <Tag color="blue" className="m-0">
                                        主参考
                                    </Tag>
                                ) : null}
                                {summary.currentVersionNumber ? <Tag className="m-0">v{summary.currentVersionNumber}</Tag> : null}
                                {summary.model ? <Tag className="m-0">{summary.model}</Tag> : null}
                                {summary.provider ? <Tag className="m-0">{summary.provider}</Tag> : null}
                            </div>
                            <div className="mt-1 text-stone-500 dark:text-stone-400">{[summary.createdAt, summary.referenceAssets.length ? `参考 ${summary.referenceAssets.length}` : ""].filter(Boolean).join(" · ")}</div>
                            {summary.finalPrompt ? <div className="mt-1 line-clamp-2 text-stone-500 dark:text-stone-400">{summary.finalPrompt}</div> : null}
                            <Space size={6} className="mt-1">
                                {!summary.isPrimary ? (
                                    <button type="button" className="text-blue-600 underline underline-offset-2 dark:text-blue-300" onClick={() => onSetPrimary(summary.assetId)}>
                                        <Star className="inline size-3" /> 设为主参考
                                    </button>
                                ) : null}
                                {summary.isPrimary && onSyncPrimary ? (
                                    <button type="button" className="text-blue-600 underline underline-offset-2 dark:text-blue-300" onClick={() => onSyncPrimary(summary.assetId)}>
                                        同步到来源
                                    </button>
                                ) : null}
                            </Space>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function valuesForImageBriefFields(values: ImageBriefFormValues, kind: ImageBriefKind) {
    return Object.fromEntries(Object.keys(defaultImageBriefFields(kind)).map((key) => [key, typeof values[key] === "string" ? values[key] : ""]));
}

function imageBriefFieldLabel(key: string) {
    const labels: Record<string, string> = {
        location: "地点",
        timeOfDay: "时间",
        atmosphere: "氛围",
        composition: "构图",
        lighting: "光影",
        appearance: "外貌",
        costume: "服装",
        expression: "表情",
        pose: "姿态",
        consistency: "一致性",
        material: "材质",
        shape: "形态",
        scale: "尺度",
        usage: "用途",
        details: "细节",
        mood: "情绪",
        palette: "色彩",
        texture: "质感",
        reference: "参考",
    };
    return labels[key] || key;
}

function assetKindLabel(kind: Asset["kind"]) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    if (kind === "text") return "文本";
    return "素材";
}

function imageBriefSourceTypeLabel(sourceType: ImageBrief["sourceType"]) {
    if (sourceType === "asset_breakdown") return "资产拆解";
    if (sourceType === "production_bible") return "设定库";
    if (sourceType === "storyboard") return "分镜";
    return "手动";
}

function imageBriefStatusLabel(status: ImageBrief["status"]) {
    if (status === "prompt_ready") return "提示词就绪";
    if (status === "generated") return "已生成";
    if (status === "archived") return "已归档";
    return "草稿";
}
