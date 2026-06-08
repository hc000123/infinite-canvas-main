"use client";

import { useEffect } from "react";
import { Form, Input, Modal, Select } from "antd";

import type { Asset } from "@/stores/use-asset-store";
import { productionBibleKindForAssetBreakdown, type AssetBreakdownItem, type AssetBreakdownKind } from "../utils/asset-breakdown";
import type { ProductionBibleItem } from "../utils/production-bible";

export type AssetBreakdownFormValues = {
    kind: AssetBreakdownKind;
    name: string;
    description?: string;
    sourceText?: string;
    tags?: string[];
    productionBibleItemId?: string;
    assetIds?: string[];
};

const kindOptions: Array<{ label: string; value: AssetBreakdownKind }> = [
    { label: "角色", value: "character" },
    { label: "场景", value: "scene" },
    { label: "道具", value: "prop" },
    { label: "风格 / 光影", value: "style" },
];

export function AssetBreakdownFormModal({
    open,
    editingItem,
    defaultKind,
    assets,
    bibleItems,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    editingItem: AssetBreakdownItem | null;
    defaultKind: AssetBreakdownKind;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onCancel: () => void;
    onSubmit: (values: AssetBreakdownFormValues) => void;
}) {
    const [form] = Form.useForm<AssetBreakdownFormValues>();
    const kind = Form.useWatch("kind", form) || defaultKind;
    const bibleKind = productionBibleKindForAssetBreakdown(kind);
    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            kind: editingItem?.kind || defaultKind,
            name: editingItem?.name || "",
            description: editingItem?.description || "",
            sourceText: editingItem?.sourceText || "",
            tags: editingItem?.tags || [],
            productionBibleItemId: editingItem?.productionBibleItemId,
            assetIds: editingItem?.assetIds || [],
        });
    }, [defaultKind, editingItem, form, open]);
    return (
        <Modal title={editingItem ? "编辑资产条目" : "新增资产条目"} open={open} onCancel={onCancel} onOk={() => void form.validateFields().then(onSubmit)} okText="保存" cancelText="取消" destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="kind" label="资产类型">
                    <Select options={kindOptions} />
                </Form.Item>
                <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入资产名称" }]}>
                    <Input placeholder="例如：魏梁 / 大学操场 / 话筒 / 白天自然光" />
                </Form.Item>
                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="人工整理资产特征、服化道、场景氛围或参考要求" />
                </Form.Item>
                <Form.Item name="sourceText" label="剧本依据">
                    <Input.TextArea rows={3} placeholder="从剧本中摘录该资产出现的原文" />
                </Form.Item>
                <Form.Item name="tags" label="标签">
                    <Select mode="tags" tokenSeparators={[",", "，"]} />
                </Form.Item>
                <Form.Item name="productionBibleItemId" label="关联设定库">
                    <Select
                        allowClear
                        disabled={!bibleKind}
                        placeholder={bibleKind ? "选择已有设定库条目" : "风格 / 光影资产暂不关联设定库"}
                        options={bibleItems.filter((item) => item.kind === bibleKind).map((item) => ({ label: item.name, value: item.id }))}
                    />
                </Form.Item>
                <Form.Item name="assetIds" label="绑定素材">
                    <Select mode="tags" options={assets.map((asset) => ({ label: asset.title, value: asset.id }))} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export function assetBreakdownKindOptionsWithAll() {
    return [{ label: "全部", value: "all" }, ...kindOptions];
}

export function assetBreakdownDefaultKind(kind: AssetBreakdownKind | "all") {
    return kind === "all" ? "character" : kind;
}
