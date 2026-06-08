"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Form, Input, Select, Segmented, Tag } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import { productionBibleAssetRoleOptions, productionBibleKindOptions, type ProductionBibleAssetRef, type ProductionBibleItem, type ProductionBibleKind } from "../utils/production-bible";

export type ProductionBibleFormValues = {
    kind: ProductionBibleKind;
    name: string;
    description?: string;
    tags?: string[];
    assetIds?: string[];
    positive?: string;
    negative?: string;
    consistency?: string;
};

const emptySelection: string[] = [];

export function ProductionBibleFormModal({
    open,
    projectId,
    defaultKind,
    editingItem,
    assets,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    projectId: string;
    defaultKind: ProductionBibleKind;
    editingItem: ProductionBibleItem | null;
    assets: Asset[];
    onCancel: () => void;
    onSubmit: (values: ProductionBibleFormValues, assetRefs: ProductionBibleAssetRef[]) => void;
}) {
    const [form] = Form.useForm<ProductionBibleFormValues>();
    const [assetRoles, setAssetRoles] = useState<Record<string, string>>({});
    const watchedAssetIds = Form.useWatch("assetIds", form);
    const selectedAssetIdsKey = Array.isArray(watchedAssetIds) ? watchedAssetIds.join("\u0000") : "";
    const selectedAssetIds = useMemo(() => (Array.isArray(watchedAssetIds) ? watchedAssetIds : emptySelection), [selectedAssetIdsKey]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const assetOptions = useMemo(() => assets.map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id })), [assets]);

    useEffect(() => {
        if (!open) return;
        const item = editingItem;
        form.setFieldsValue({
            kind: item?.kind || defaultKind,
            name: item?.name || "",
            description: item?.description || "",
            tags: item?.tags || [],
            assetIds: item?.assetRefs.map((ref) => ref.assetId) || [],
            positive: item?.promptSnippets.positive || "",
            negative: item?.promptSnippets.negative || "",
            consistency: item?.promptSnippets.consistency || "",
        });
        setAssetRoles(Object.fromEntries((item?.assetRefs || []).map((ref) => [ref.assetId, ref.role])));
    }, [defaultKind, editingItem, form, open]);

    useEffect(() => {
        if (!open) return;
        setAssetRoles((current) => {
            const next: Record<string, string> = {};
            for (const assetId of selectedAssetIds) next[assetId] = current[assetId] || "reference";
            if (sameAssetRoles(current, next)) return current;
            return next;
        });
    }, [open, selectedAssetIds]);

    return (
        <Drawer
            title={editingItem ? "编辑设定" : "新增设定"}
            open={open}
            onClose={onCancel}
            size={560}
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
                initialValues={{ kind: defaultKind }}
                onFinish={(values) => {
                    const assetRefs = (values.assetIds || []).map((assetId) => ({ assetId, role: assetRoles[assetId] || "reference" }));
                    onSubmit(values, assetRefs);
                }}
            >
                <Form.Item name="kind" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                    <Segmented options={productionBibleKindOptions.map((option) => ({ label: option.label, value: option.value }))} />
                </Form.Item>
                <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: "请输入名称" }]}>
                    <Input placeholder="例如：魏梁 / 毕业典礼操场 / 学士帽" />
                </Form.Item>
                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={4} placeholder="记录外貌、环境、道具特征或使用约束" />
                </Form.Item>
                <Form.Item name="tags" label="标签">
                    <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                </Form.Item>
                <Form.Item name="assetIds" label="绑定素材">
                    <Select mode="multiple" showSearch options={assetOptions} optionFilterProp="label" placeholder="从我的素材中选择图片、视频、音频或文本素材" />
                </Form.Item>
                {selectedAssetIds.length ? (
                    <div className="mb-5 space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                        {selectedAssetIds.map((assetId) => {
                            const asset = assetsById.get(assetId);
                            return (
                                <div key={assetId} className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm">{asset?.title || assetId}</span>
                                    <Tag className="m-0 shrink-0">{assetKindLabel(asset?.kind)}</Tag>
                                    <Select className="w-28 shrink-0" size="small" value={assetRoles[assetId] || "reference"} options={productionBibleAssetRoleOptions} onChange={(role) => setAssetRoles((current) => ({ ...current, [assetId]: role }))} />
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <Form.Item name="positive" label="正向提示词片段">
                    <Input.TextArea rows={3} placeholder="适合在生成时复用的正向描述" />
                </Form.Item>
                <Form.Item name="negative" label="反向提示词片段">
                    <Input.TextArea rows={2} placeholder="需要避免的风格、错误或限制" />
                </Form.Item>
                <Form.Item name="consistency" label="一致性提示词片段">
                    <Input.TextArea rows={3} placeholder="保持角色、场景、道具一致性的描述" />
                </Form.Item>
                <input type="hidden" value={projectId} readOnly />
            </Form>
        </Drawer>
    );
}

function assetKindLabel(kind?: Asset["kind"]) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    if (kind === "text") return "文本";
    return "素材";
}

function sameAssetRoles(left: Record<string, string>, right: Record<string, string>) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}
