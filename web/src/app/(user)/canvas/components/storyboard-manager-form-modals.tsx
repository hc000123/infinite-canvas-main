"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Form, Input, Modal, Select } from "antd";

import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import type { Asset, AssetKind } from "@/stores/use-asset-store";
import { productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import type { StoryboardAssetKind, StoryboardAssetRef, StoryboardGroup, StoryboardProductionBibleRef, StoryboardShot } from "../utils/storyboard-management";

type GroupFormValues = {
    title: string;
    description?: string;
};

type ShotFormValues = {
    title: string;
    description?: string;
    prompt?: string;
    effectivePrompt?: string;
    assetIds?: string[];
    productionBibleIds?: string[];
};

export const mediaKinds = new Set<AssetKind>(["image", "video", "audio"]);

const emptySelection: string[] = [];

export function GroupFormModal({ open, editingGroup, onCancel, onSubmit }: { open: boolean; editingGroup: StoryboardGroup | null; onCancel: () => void; onSubmit: (values: GroupFormValues) => void }) {
    const [form] = Form.useForm<GroupFormValues>();
    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({ title: editingGroup?.title || "", description: editingGroup?.description || "" });
    }, [editingGroup, form, open]);
    return (
        <Modal title={editingGroup ? "编辑分镜组" : "新增分镜组"} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="保存" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
                    <Input placeholder="例如：第一集操场毕业典礼" />
                </Form.Item>
                <Form.Item name="description" label="说明">
                    <Input.TextArea rows={4} placeholder="记录本组分镜目标、节奏和关键画面" />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export function ShotFormDrawer({
    open,
    projectId,
    editingShot,
    assets,
    bibleItems,
    onClose,
    onSubmit,
}: {
    open: boolean;
    projectId: string;
    editingShot: StoryboardShot | null;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onClose: () => void;
    onSubmit: (values: ShotFormValues, assetRefs: StoryboardAssetRef[], productionBibleRefs: StoryboardProductionBibleRef[]) => void;
}) {
    const [form] = Form.useForm<ShotFormValues>();
    const [assetRoles, setAssetRoles] = useState<Record<string, string>>({});
    const [promptOpen, setPromptOpen] = useState(false);
    const watchedAssetIds = Form.useWatch("assetIds", form);
    const watchedBibleIds = Form.useWatch("productionBibleIds", form);
    const selectedAssetIdsKey = Array.isArray(watchedAssetIds) ? watchedAssetIds.join("\u0000") : "";
    const selectedBibleIdsKey = Array.isArray(watchedBibleIds) ? watchedBibleIds.join("\u0000") : "";
    const selectedAssetIds = useMemo(() => (Array.isArray(watchedAssetIds) ? watchedAssetIds : emptySelection), [selectedAssetIdsKey]);
    const selectedBibleIds = useMemo(() => (Array.isArray(watchedBibleIds) ? watchedBibleIds : emptySelection), [selectedBibleIdsKey]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const bibleById = useMemo(() => new Map(bibleItems.map((item) => [item.id, item])), [bibleItems]);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            title: editingShot?.title || "",
            description: editingShot?.description || "",
            prompt: editingShot?.prompt || "",
            effectivePrompt: editingShot?.effectivePrompt || "",
            assetIds: editingShot?.assetRefs.map((ref) => ref.assetId) || [],
            productionBibleIds: editingShot?.productionBibleRefs?.map((ref) => ref.itemId) || [],
        });
        setAssetRoles(Object.fromEntries((editingShot?.assetRefs || []).map((ref) => [ref.assetId, ref.role])));
    }, [editingShot, form, open]);

    useEffect(() => {
        if (!open) return;
        setAssetRoles((current) => {
            const next: Record<string, string> = {};
            for (const assetId of selectedAssetIds) next[assetId] = current[assetId] || defaultAssetRole(assetsById.get(assetId)?.kind);
            if (sameAssetRoles(current, next)) return current;
            return next;
        });
    }, [assetsById, open, selectedAssetIds]);

    return (
        <Drawer
            title={editingShot ? "编辑分镜" : "新增分镜"}
            open={open}
            onClose={onClose}
            size={680}
            destroyOnHidden
            extra={
                <Button type="primary" onClick={() => form.submit()}>
                    保存
                </Button>
            }
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => {
                    const assetRefs = (values.assetIds || []).flatMap((assetId): StoryboardAssetRef[] => {
                        const asset = assetsById.get(assetId);
                        if (!asset || !mediaKinds.has(asset.kind)) return [];
                        return [{ assetId, kind: asset.kind as StoryboardAssetKind, role: assetRoles[assetId] || defaultAssetRole(asset.kind) }];
                    });
                    const productionBibleRefs = (values.productionBibleIds || []).flatMap((itemId): StoryboardProductionBibleRef[] => {
                        const item = bibleById.get(itemId);
                        return item ? [{ itemId, kind: item.kind }] : [];
                    });
                    onSubmit(values, assetRefs, productionBibleRefs);
                }}
            >
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
                    <Input placeholder="例如：魏梁走上主席台" />
                </Form.Item>
                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="分镜画面、构图、运动或情绪说明" />
                </Form.Item>
                <Form.Item label="提示词">
                    <div className="space-y-2">
                        <Form.Item name="prompt" noStyle>
                            <Input.TextArea rows={6} placeholder="写入用于生成视频的分镜提示词" />
                        </Form.Item>
                        <Button size="small" onClick={() => setPromptOpen(true)}>
                            从提示词库插入
                        </Button>
                    </div>
                </Form.Item>
                <Form.Item name="effectivePrompt" label="实际提交提示词">
                    <Input.TextArea rows={4} placeholder="可选。留空时使用提示词" />
                </Form.Item>
                <Form.Item name="assetIds" label="参考素材">
                    <Select mode="multiple" placeholder="选择图片、视频或音频素材" options={assets.map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id }))} />
                </Form.Item>
                {selectedAssetIds.length ? (
                    <div className="mb-4 space-y-2">
                        {selectedAssetIds.map((assetId) => (
                            <div key={assetId} className="grid gap-2 rounded-lg bg-stone-50 p-2 text-sm dark:bg-stone-900 sm:grid-cols-[minmax(0,1fr)_160px]">
                                <span className="truncate">{assetsById.get(assetId)?.title || assetId}</span>
                                <Select
                                    size="small"
                                    value={assetRoles[assetId] || defaultAssetRole(assetsById.get(assetId)?.kind)}
                                    options={assetRoleOptions(assetsById.get(assetId)?.kind)}
                                    onChange={(role) => setAssetRoles((current) => ({ ...current, [assetId]: role }))}
                                />
                            </div>
                        ))}
                    </div>
                ) : null}
                <Form.Item name="productionBibleIds" label="引用设定">
                    <Select mode="multiple" placeholder="选择角色、场景、道具设定" options={bibleItems.map((item) => ({ label: `${productionBibleKindLabel(item.kind)} · ${item.name}`, value: item.id }))} />
                </Form.Item>
                {selectedBibleIds.length ? <div className="mb-4 text-xs text-stone-500">提示词库变量填写时也可以选择这些设定项。</div> : null}
            </Form>
            <PromptSelectDialog
                open={promptOpen}
                projectId={projectId}
                nodeGroup="video"
                allowedTypes={["video", "positive", "workflow"]}
                onOpenChange={setPromptOpen}
                onSelect={(prompt) => {
                    const current = form.getFieldValue("prompt") || "";
                    form.setFieldValue("prompt", [current.trim(), prompt.trim()].filter(Boolean).join("\n\n"));
                }}
            />
        </Drawer>
    );
}

function defaultAssetRole(kind?: string) {
    if (kind === "audio") return "reference_audio";
    if (kind === "video") return "reference_video";
    return "reference_image";
}

function sameAssetRoles(left: Record<string, string>, right: Record<string, string>) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function assetRoleOptions(kind?: string) {
    if (kind === "audio") return [{ label: "音频参考", value: "reference_audio" }];
    if (kind === "video")
        return [
            { label: "视频参考", value: "reference_video" },
            { label: "源视频", value: "source_video" },
        ];
    return [
        { label: "普通参考", value: "reference_image" },
        { label: "首帧", value: "first_frame" },
        { label: "尾帧", value: "last_frame" },
    ];
}

function assetKindLabel(kind: string) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "素材";
}
