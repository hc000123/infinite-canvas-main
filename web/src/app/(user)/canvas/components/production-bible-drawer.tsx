"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Drawer, Empty, Form, Input, Popconfirm, Select, Segmented, Space, Tag } from "antd";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { hasNewerAssetVersion, preserveOrCreateAssetVersionReferences, updateAssetRefListToLatest } from "../../assets/asset-version-references";
import {
    itemsForProductionBibleProject,
    productionBibleAssetRoleLabel,
    productionBibleAssetRoleOptions,
    productionBibleKindLabel,
    productionBibleKindOptions,
    type ProductionBibleAssetRef,
    type ProductionBibleItem,
    type ProductionBibleKind,
} from "../utils/production-bible";
import { useProductionBibleStore } from "../stores/use-production-bible-store";

type Props = {
    open: boolean;
    projectId: string;
    projectTitle: string;
    onClose: () => void;
};

type FormValues = {
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

export function ProductionBibleDrawer({ open, projectId, projectTitle, onClose }: Props) {
    const [kind, setKind] = useState<ProductionBibleKind>("character");
    const [editingItem, setEditingItem] = useState<ProductionBibleItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const items = useProductionBibleStore((state) => state.items);
    const addItem = useProductionBibleStore((state) => state.addItem);
    const updateItem = useProductionBibleStore((state) => state.updateItem);
    const removeItem = useProductionBibleStore((state) => state.removeItem);
    const assets = useAssetStore((state) => state.assets);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const visibleItems = useMemo(() => itemsForProductionBibleProject(items, projectId, kind), [items, kind, projectId]);

    const startCreate = () => {
        setEditingItem(null);
        setFormOpen(true);
    };

    const startEdit = (item: ProductionBibleItem) => {
        setEditingItem(item);
        setFormOpen(true);
    };

    return (
        <Drawer
            title="项目设定库"
            open={open}
            onClose={onClose}
            size={680}
            destroyOnHidden
            extra={
                <Button icon={<Plus className="size-4" />} type="primary" onClick={startCreate}>
                    新增设定
                </Button>
            }
        >
            <div className="mb-4 text-sm text-stone-500 dark:text-stone-400">当前项目：{projectTitle}</div>
            <Segmented className="mb-4" value={kind} onChange={(value) => setKind(value as ProductionBibleKind)} options={productionBibleKindOptions.map((option) => ({ label: option.label, value: option.value }))} />

            {visibleItems.length ? (
                <div className="space-y-3">
                    {visibleItems.map((item) => (
                        <ProductionBibleCard
                            key={item.id}
                            item={item}
                            assetsById={assetsById}
                            onUpdateAssetRef={(assetId) => {
                                const asset = assetsById.get(assetId);
                                if (!asset) return;
                                updateItem(item.id, { assetRefs: updateAssetRefListToLatest(item.assetRefs, asset) });
                            }}
                            onEdit={() => startEdit(item)}
                            onDelete={() => removeItem(item.id)}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${productionBibleKindLabel(kind)}设定`} className="py-16" />
            )}

            <ProductionBibleFormModal
                open={formOpen}
                projectId={projectId}
                defaultKind={kind}
                editingItem={editingItem}
                assets={assets}
                onCancel={() => setFormOpen(false)}
                onSubmit={(values, assetRefs) => {
                    const versionedAssetRefs = preserveOrCreateAssetVersionReferences(assetRefs, assets, editingItem?.assetRefs || []);
                    const payload = {
                        projectId,
                        kind: values.kind,
                        name: values.name,
                        description: values.description || "",
                        tags: values.tags || [],
                        assetRefs: versionedAssetRefs,
                        promptSnippets: {
                            positive: values.positive || "",
                            negative: values.negative || "",
                            consistency: values.consistency || "",
                        },
                    };
                    if (editingItem) {
                        updateItem(editingItem.id, payload);
                    } else {
                        addItem(payload);
                    }
                    setKind(values.kind);
                    setFormOpen(false);
                }}
            />
        </Drawer>
    );
}

function ProductionBibleCard({ item, assetsById, onUpdateAssetRef, onEdit, onDelete }: { item: ProductionBibleItem; assetsById: Map<string, Asset>; onUpdateAssetRef: (assetId: string) => void; onEdit: () => void; onDelete: () => void }) {
    const snippets = [
        item.promptSnippets.positive ? `正向：${item.promptSnippets.positive}` : "",
        item.promptSnippets.negative ? `反向：${item.promptSnippets.negative}` : "",
        item.promptSnippets.consistency ? `一致性：${item.promptSnippets.consistency}` : "",
    ].filter(Boolean);

    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Tag className="m-0 shrink-0">{productionBibleKindLabel(item.kind)}</Tag>
                    <span className="truncate">{item.name}</span>
                </div>
            }
            extra={
                <Space size={4}>
                    <Button size="small" type="text" icon={<Pencil className="size-4" />} onClick={onEdit} />
                    <Popconfirm title="删除这个设定？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-4" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                {item.description ? <p className="m-0 whitespace-pre-wrap text-stone-600 dark:text-stone-300">{item.description}</p> : <p className="m-0 text-stone-400">暂无描述</p>}
                {item.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                            <Tag key={tag} className="m-0">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                ) : null}
                {item.assetRefs.length ? (
                    <div className="flex flex-wrap gap-1.5">
                        {item.assetRefs.map((ref) => {
                            const asset = assetsById.get(ref.assetId);
                            const hasNewVersion = hasNewerAssetVersion(ref.assetVersion, asset);
                            return (
                                <Tag key={ref.assetId} color={hasNewVersion ? "gold" : undefined} className="m-0">
                                    {asset?.title || ref.assetId} · {productionBibleAssetRoleLabel(ref.role)}
                                    {hasNewVersion ? (
                                        <button
                                            type="button"
                                            className="ml-1 text-amber-700 underline underline-offset-2 dark:text-amber-300"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onUpdateAssetRef(ref.assetId);
                                            }}
                                        >
                                            更新
                                        </button>
                                    ) : null}
                                </Tag>
                            );
                        })}
                    </div>
                ) : null}
                {snippets.length ? <div className="line-clamp-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{snippets.join(" / ")}</div> : null}
            </div>
        </Card>
    );
}

function ProductionBibleFormModal({
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
    onSubmit: (values: FormValues, assetRefs: ProductionBibleAssetRef[]) => void;
}) {
    const [form] = Form.useForm<FormValues>();
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
