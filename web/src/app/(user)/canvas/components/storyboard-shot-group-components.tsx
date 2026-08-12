"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag } from "antd";
import { ArrowDown, ArrowUp, FileText, Film, Pencil, Trash2 } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { productionBibleKindLabel, type ProductionBibleItem } from "../utils/production-bible";
import { CanvasPromptEditor } from "./canvas-prompt-editor";
import { promptDocumentFromText, serializePromptDocument, validatePromptDocument, type CanvasPromptDocument } from "../utils/canvas-prompt-document";
import type { CanvasReferenceMentionOption } from "../utils/canvas-reference-mentions";
import { buildShotGroupGenerationTableRows, type ShotGroup, type StoryboardAssetKind, type StoryboardAssetRef, type StoryboardProductionBibleRef, type StoryboardTableShot } from "../utils/storyboard-management";

export type TableShotFormValues = {
    sceneName: string;
    location?: string;
    timeOfDay?: string;
    title: string;
    scriptText?: string;
    visualDescription?: string;
    characters?: string[];
    dialogue?: string;
    action?: string;
    emotion?: string;
    shotSize?: string;
    cameraMovement?: string;
    estimatedDuration?: number;
    assetNeeds?: string[];
    assetIds?: string[];
};

export type ShotGroupFormValues = {
    prompt?: string;
    promptDocument?: CanvasPromptDocument;
    effectivePrompt?: string;
    effectivePromptDocument?: CanvasPromptDocument;
    assetIds?: string[];
    audioAssetIds?: string[];
    productionBibleIds?: string[];
};

const mediaKinds = new Set(["image", "video", "audio"]);
const emptySelection: string[] = [];
const assetNeedOptions = [
    { label: "角色", value: "character" },
    { label: "场景", value: "scene" },
    { label: "道具", value: "prop" },
    { label: "服化道", value: "costume" },
    { label: "音频", value: "audio" },
    { label: "参考视频", value: "reference_video" },
    { label: "特殊效果", value: "effect" },
];

export function StoryboardTableShotCard({
    shot,
    checked,
    onCheckedChange,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    shot: StoryboardTableShot;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Checkbox checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} />
                    <Tag className="m-0">镜 {shot.order}</Tag>
                    <span className="truncate">{shot.title}</span>
                </div>
            }
            extra={
                <Space size={2}>
                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} onClick={onMoveUp} />
                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} onClick={onMoveDown} />
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个分镜头？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                <div className="line-clamp-2 whitespace-pre-wrap leading-6 text-[var(--studio-text-secondary)]">{shot.visualDescription || shot.scriptText || "暂无镜头描述"}</div>
                <Space size={[4, 4]} wrap>
                    <Tag className="m-0">{shot.sceneName}</Tag>
                    {shot.timeOfDay ? <Tag className="m-0">{shot.timeOfDay}</Tag> : null}
                    <Tag className="m-0">{shot.estimatedDuration}s</Tag>
                    {shot.characters.map((name) => (
                        <Tag key={name} className="m-0">
                            {name}
                        </Tag>
                    ))}
                    {(shot.assetNeeds || []).map((need) => (
                        <Tag key={need} color="blue" className="m-0">
                            {assetNeedLabel(need)}
                        </Tag>
                    ))}
                </Space>
            </div>
        </Card>
    );
}

export function ShotGroupRowCard({
    row,
    assetsById,
    onEdit,
    onDelete,
    onAddToCanvas,
    onCreateBrief,
}: {
    row: ReturnType<typeof buildShotGroupGenerationTableRows>[number];
    assetsById: Map<string, Asset>;
    onEdit: () => void;
    onDelete: () => void;
    onAddToCanvas: () => void;
    onCreateBrief: () => void;
}) {
    return (
        <Card
            size="small"
            title={
                <div className="flex min-w-0 items-center gap-2">
                    <Tag className="m-0">镜 {row.shotRangeLabel}</Tag>
                    <span className="truncate">{row.group.sceneName}</span>
                </div>
            }
            extra={
                <Space size={2}>
                    <Button size="small" type="text" icon={<FileText className="size-3.5" />} onClick={onCreateBrief} />
                    <Button size="small" type="text" icon={<Film className="size-3.5" />} onClick={onAddToCanvas} />
                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                    <Popconfirm title="删除这个生成镜头组？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onDelete}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            }
        >
            <div className="space-y-2 text-sm">
                <div className="line-clamp-3 whitespace-pre-wrap leading-6 text-[var(--studio-text-secondary)]">{row.group.effectivePrompt || row.group.prompt || "暂无视频提示词"}</div>
                <Space size={[4, 4]} wrap>
                    <Tag className="m-0">{shotGroupStatusLabel(row.group.status)}</Tag>
                    <Tag className="m-0">总时长 {row.group.totalDuration}s</Tag>
                    <Tag color={row.promptReady ? "green" : "default"} className="m-0">
                        {row.promptReady ? "提示词已就绪" : "提示词待补"}
                    </Tag>
                    <Tag color={row.assetReady ? "green" : "default"} className="m-0">
                        {row.assetReady ? "已绑定资产" : "未绑定资产"}
                    </Tag>
                    {row.group.taskId ? <Tag className="m-0">taskId: {row.group.taskId}</Tag> : null}
                    {row.group.assetRefs.map((ref) => (
                        <Tag key={ref.assetId} className="m-0">
                            {assetsById.get(ref.assetId)?.title || ref.assetId}
                        </Tag>
                    ))}
                    {row.group.primaryAssetId ? <Tag className="m-0">主版本：{assetsById.get(row.group.primaryAssetId)?.title || row.group.primaryAssetId}</Tag> : null}
                </Space>
                {row.group.errorMessage ? <div className="studio-semantic-danger studio-semantic-notice rounded-lg border p-2 text-xs leading-5">失败原因：{row.group.errorMessage}</div> : null}
            </div>
        </Card>
    );
}

export function TableShotFormModal({
    open,
    editingShot,
    assets,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    editingShot: StoryboardTableShot | null;
    assets: Asset[];
    onCancel: () => void;
    onSubmit: (values: TableShotFormValues, assetRefs: StoryboardAssetRef[]) => void;
}) {
    const [form] = Form.useForm<TableShotFormValues>();
    const watchedAssetIds = Form.useWatch("assetIds", form);
    const selectedAssetIdsKey = Array.isArray(watchedAssetIds) ? watchedAssetIds.join("\u0000") : "";
    const selectedAssetIds = useMemo(() => (Array.isArray(watchedAssetIds) ? watchedAssetIds : emptySelection), [selectedAssetIdsKey]);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            sceneName: editingShot?.sceneName || "",
            location: editingShot?.location || "",
            timeOfDay: editingShot?.timeOfDay || "",
            title: editingShot?.title || "",
            scriptText: editingShot?.scriptText || "",
            visualDescription: editingShot?.visualDescription || "",
            characters: editingShot?.characters || [],
            dialogue: editingShot?.dialogue || "",
            action: editingShot?.action || "",
            emotion: editingShot?.emotion || "",
            shotSize: editingShot?.shotSize || "",
            cameraMovement: editingShot?.cameraMovement || "",
            estimatedDuration: editingShot?.estimatedDuration || 5,
            assetNeeds: editingShot?.assetNeeds || [],
            assetIds: editingShot?.assetRefs.map((ref) => ref.assetId) || [],
        });
    }, [editingShot, form, open]);

    return (
        <Modal rootClassName="studio-modal" title={editingShot ? "编辑分镜头" : "新增分镜头"} open={open} onCancel={onCancel} onOk={() => form.submit()} okText="保存" cancelText="取消" width={760} destroyOnHidden>
            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => {
                    const assetRefs = selectedAssetIds.flatMap((assetId): StoryboardAssetRef[] => {
                        const asset = assetsById.get(assetId);
                        if (!asset || !mediaKinds.has(asset.kind)) return [];
                        return [{ assetId, kind: asset.kind as StoryboardAssetKind, role: defaultAssetRole(asset.kind), source: assetBreakdownSource(asset) }];
                    });
                    onSubmit(values, assetRefs);
                }}
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Form.Item name="sceneName" label="场次 / 场景" rules={[{ required: true, message: "请填写场次" }]}>
                        <Input placeholder="例如：大学操场" />
                    </Form.Item>
                    <Form.Item name="timeOfDay" label="时间">
                        <Input placeholder="白天 / 夜晚 / 黄昏" />
                    </Form.Item>
                </div>
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写镜头标题" }]}>
                    <Input placeholder="例如：魏梁走上主席台" />
                </Form.Item>
                <Form.Item name="scriptText" label="剧本文本">
                    <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item name="visualDescription" label="画面描述">
                    <Input.TextArea rows={3} />
                </Form.Item>
                <div className="grid gap-3 sm:grid-cols-3">
                    <Form.Item name="shotSize" label="景别">
                        <Input placeholder="中景 / 近景" />
                    </Form.Item>
                    <Form.Item name="cameraMovement" label="运镜">
                        <Input placeholder="推近 / 跟拍" />
                    </Form.Item>
                    <Form.Item name="estimatedDuration" label="预计时长">
                        <InputNumber min={1} max={15} className="w-full" />
                    </Form.Item>
                </div>
                <Form.Item name="characters" label="角色">
                    <Select mode="tags" tokenSeparators={[",", "，"]} />
                </Form.Item>
                <Form.Item name="dialogue" label="对白">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="action" label="动作">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item name="emotion" label="情绪">
                    <Input />
                </Form.Item>
                <Form.Item name="assetNeeds" label="资产需求">
                    <Select mode="multiple" options={assetNeedOptions} />
                </Form.Item>
                <Form.Item name="assetIds" label="参考资产">
                    <Select mode="multiple" options={assets.map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id }))} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export function ShotGroupFormModal({
    open,
    editingGroup,
    assets,
    bibleItems,
    onCancel,
    onSubmit,
}: {
    open: boolean;
    editingGroup: ShotGroup | null;
    assets: Asset[];
    bibleItems: ProductionBibleItem[];
    onCancel: () => void;
    onSubmit: (values: ShotGroupFormValues, assetRefs: StoryboardAssetRef[], audioRefs: StoryboardAssetRef[], productionBibleRefs: StoryboardProductionBibleRef[]) => void;
}) {
    const [form] = Form.useForm<ShotGroupFormValues>();
    const watchedAssetIds = Form.useWatch("assetIds", form);
    const watchedAudioAssetIds = Form.useWatch("audioAssetIds", form);
    const selectedAssetIds = Array.isArray(watchedAssetIds) ? watchedAssetIds : emptySelection;
    const selectedAudioAssetIds = Array.isArray(watchedAudioAssetIds) ? watchedAudioAssetIds : emptySelection;
    const [promptDocument, setPromptDocument] = useState<CanvasPromptDocument>(() => promptDocumentFromText(""));
    const [effectivePromptDocument, setEffectivePromptDocument] = useState<CanvasPromptDocument>(() => promptDocumentFromText(""));
    const [editorVersion, setEditorVersion] = useState(0);
    const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
    const bibleById = useMemo(() => new Map(bibleItems.map((item) => [item.id, item])), [bibleItems]);
    const selectedMentionOptions = useMemo(() => buildAssetMentionOptions(assets, selectedAssetIds, selectedAudioAssetIds, true), [assets, selectedAssetIds, selectedAudioAssetIds]);
    const allMentionOptions = useMemo(() => buildAssetMentionOptions(assets, selectedAssetIds, selectedAudioAssetIds), [assets, selectedAssetIds, selectedAudioAssetIds]);
    const missingReferenceIds = useMemo(
        () => [...new Set([...validatePromptDocument(promptDocument, selectedMentionOptions), ...validatePromptDocument(effectivePromptDocument, selectedMentionOptions)])],
        [effectivePromptDocument, promptDocument, selectedMentionOptions],
    );

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            prompt: editingGroup?.prompt || "",
            effectivePrompt: editingGroup?.effectivePrompt || "",
            assetIds: editingGroup?.assetRefs.map((ref) => ref.assetId) || [],
            audioAssetIds: editingGroup?.audioRefs.map((ref) => ref.assetId) || [],
            productionBibleIds: editingGroup?.productionBibleRefs?.map((ref) => ref.itemId) || [],
        });
        setPromptDocument(editingGroup?.promptDocument || promptDocumentFromText(editingGroup?.prompt || ""));
        setEffectivePromptDocument(editingGroup?.effectivePromptDocument || promptDocumentFromText(editingGroup?.effectivePrompt || ""));
        setEditorVersion((version) => version + 1);
    }, [editingGroup, form, open]);

    const addMentionedAsset = (asset: Asset) => {
        if (asset.kind === "audio") {
            if (selectedAudioAssetIds.includes(asset.id)) return;
            form.setFieldsValue({ audioAssetIds: [...selectedAudioAssetIds, asset.id] });
        } else if (asset.kind === "image" || asset.kind === "video") {
            if (selectedAssetIds.includes(asset.id)) return;
            form.setFieldsValue({ assetIds: [...selectedAssetIds, asset.id] });
        }
    };

    return (
        <Modal rootClassName="studio-modal" title="编辑视频生成镜头组" open={open} onCancel={onCancel} onOk={() => form.submit()} okButtonProps={{ disabled: missingReferenceIds.length > 0 || !serializePromptDocument(promptDocument, selectedMentionOptions).trim() }} okText="保存" cancelText="取消" width={840} destroyOnHidden>
            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => {
                    const assetRefs = (values.assetIds || []).flatMap((assetId): StoryboardAssetRef[] => {
                        const asset = assetsById.get(assetId);
                        if (!asset || asset.kind === "audio" || !mediaKinds.has(asset.kind)) return [];
                        return [{ assetId, kind: asset.kind as StoryboardAssetKind, role: defaultAssetRole(asset.kind), source: assetBreakdownSource(asset) }];
                    });
                    const audioRefs = (values.audioAssetIds || []).flatMap((assetId): StoryboardAssetRef[] => {
                        const asset = assetsById.get(assetId);
                        return asset?.kind === "audio" ? [{ assetId, kind: "audio", role: "reference_audio", source: assetBreakdownSource(asset) }] : [];
                    });
                    const productionBibleRefs = (values.productionBibleIds || []).flatMap((itemId): StoryboardProductionBibleRef[] => {
                        const item = bibleById.get(itemId);
                        return item ? [{ itemId, kind: item.kind }] : [];
                    });
                    onSubmit(
                        {
                            ...values,
                            prompt: serializePromptDocument(promptDocument, selectedMentionOptions),
                            promptDocument,
                            effectivePrompt: serializePromptDocument(effectivePromptDocument, selectedMentionOptions),
                            effectivePromptDocument,
                        },
                        assetRefs,
                        audioRefs,
                        productionBibleRefs,
                    );
                }}
            >
                <Form.Item label="视频提示词" required>
                    <CanvasPromptEditor
                        key={`${editingGroup?.id || "new"}-${editorVersion}-prompt`}
                        initialDocument={promptDocument}
                        options={selectedMentionOptions}
                        mentionOptions={allMentionOptions}
                        placeholder="输入 @ 选择图片、视频或音频参考素材"
                        onChange={setPromptDocument}
                        onMentionReference={(assetId) => {
                            const asset = assetsById.get(assetId);
                            if (asset) addMentionedAsset(asset);
                        }}
                    />
                </Form.Item>
                <Form.Item label="实际提交提示词">
                    <CanvasPromptEditor
                        key={`${editingGroup?.id || "new"}-${editorVersion}-effective-prompt`}
                        initialDocument={effectivePromptDocument}
                        options={selectedMentionOptions}
                        mentionOptions={allMentionOptions}
                        placeholder="可选。留空时使用视频提示词，也可输入 @ 插入素材引用"
                        onChange={setEffectivePromptDocument}
                        onMentionReference={(assetId) => {
                            const asset = assetsById.get(assetId);
                            if (asset) addMentionedAsset(asset);
                        }}
                    />
                </Form.Item>
                {missingReferenceIds.length ? <Alert className="mb-4" type="warning" showIcon message="提示词中有参考素材已移除，请删除失效引用或重新选择素材后再保存" /> : null}
                <Form.Item name="assetIds" label="图片 / 参考视频资产">
                    <Select mode="multiple" options={assets.filter((asset) => asset.kind === "image" || asset.kind === "video").map((asset) => ({ label: `${asset.title} · ${assetKindLabel(asset.kind)}`, value: asset.id }))} />
                </Form.Item>
                <Form.Item name="audioAssetIds" label="音频资产">
                    <Select mode="multiple" options={assets.filter((asset) => asset.kind === "audio").map((asset) => ({ label: asset.title, value: asset.id }))} />
                </Form.Item>
                <Form.Item name="productionBibleIds" label="引用设定">
                    <Select mode="multiple" options={bibleItems.map((item) => ({ label: `${productionBibleKindLabel(item.kind)} · ${item.name}`, value: item.id }))} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

function buildAssetMentionOptions(assets: Asset[], selectedAssetIds: string[], selectedAudioAssetIds: string[], selectedOnly = false): CanvasReferenceMentionOption[] {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return assets
        .filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
        .filter((asset) => !selectedOnly || (asset.kind === "audio" ? selectedAudioAssetIds : selectedAssetIds).includes(asset.id))
        .map((asset) => ({
            id: asset.id,
            label: assetReferenceLabel(asset, selectedAssetIds, selectedAudioAssetIds, assetsById),
            detail: asset.title,
            previewType: asset.kind as "image" | "video" | "audio",
            previewUrl: assetPreviewUrl(asset),
        }));
}

function assetReferenceLabel(asset: Asset, selectedAssetIds: string[], selectedAudioAssetIds: string[], assetsById: Map<string, Asset>) {
    const ids = asset.kind === "audio" ? selectedAudioAssetIds : selectedAssetIds;
    const sameKindIds = ids.filter((id) => assetsById.get(id)?.kind === asset.kind);
    const selectedIndex = sameKindIds.indexOf(asset.id);
    return `${assetKindLabel(asset.kind)} ${selectedIndex >= 0 ? selectedIndex + 1 : sameKindIds.length + 1}`;
}

function assetPreviewUrl(asset: Asset) {
    if (asset.kind === "image") return asset.data.dataUrl || asset.coverUrl;
    if (asset.kind === "video" || asset.kind === "audio") return asset.data.url || asset.coverUrl;
    return asset.coverUrl;
}

function defaultAssetRole(kind?: string) {
    if (kind === "audio") return "reference_audio";
    if (kind === "video") return "reference_video";
    return "reference_image";
}

function assetKindLabel(kind: string) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "素材";
}

function assetNeedLabel(value: string) {
    return assetNeedOptions.find((item) => item.value === value)?.label || value;
}

function assetBreakdownSource(asset: Asset): StoryboardAssetRef["source"] {
    const metadata = asset.metadata || {};
    return metadata.assetBreakdownItemId || metadata.assetBreakdownItems ? "asset_breakdown" : "independent";
}

function shotGroupStatusLabel(status: string) {
    if (status === "prompt_ready") return "提示词就绪";
    if (status === "in_canvas") return "已加入画布";
    if (status === "generating") return "生成中";
    if (status === "done") return "已完成";
    if (status === "error") return "失败";
    return "草稿";
}
