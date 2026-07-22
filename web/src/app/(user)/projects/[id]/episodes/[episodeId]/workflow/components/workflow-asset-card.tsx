"use client";

import { useEffect, useState } from "react";
import { App, Button, Checkbox, Image, Input, Modal } from "antd";
import { Download, ExternalLink, ImageIcon, Pencil, WandSparkles } from "lucide-react";
import { saveAs } from "file-saver";

import { assetVersionRecords } from "@/app/(user)/assets/asset-version-history";
import { buildImageWorkbenchHref } from "@/app/(user)/assets/use-workflow-asset-image-actions";
import { workflowAssetInfo, workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { getImageBlob } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";

import type { WorkflowAssetCard as WorkflowAssetCardModel, WorkflowAssetVariant } from "../workflow-asset-card-model";

export function WorkflowAssetCard(props: {
    card: WorkflowAssetCardModel;
    failed: Record<string, string>;
    generatingIds: string[];
    onGenerate: (asset: Asset) => void;
    onSave: (asset: Asset, input: { description: string; imagePrompt: string }) => void;
    onSelectionChange: (logicalAssetId: string, checked: boolean) => void;
    selectedIds: string[];
}) {
    const { message } = App.useApp();
    const [activeId, setActiveId] = useState(props.card.variants[0]?.logicalAssetId || "");
    const [editing, setEditing] = useState<WorkflowAssetVariant | null>(null);
    const [description, setDescription] = useState("");
    const [imagePrompt, setImagePrompt] = useState("");
    useEffect(() => {
        if (!props.card.variants.some((item) => item.logicalAssetId === activeId)) setActiveId(props.card.variants[0]?.logicalAssetId || "");
    }, [activeId, props.card.variants]);
    const active = props.card.variants.find((item) => item.logicalAssetId === activeId) || props.card.variants[0];
    const asset = active?.asset;
    const values = variantValues(active);
    const isImage = asset?.kind === "image";
    const generating = Boolean(asset && props.generatingIds.includes(asset.id));
    const versionCount = asset ? Math.max(1, assetVersionRecords(asset).length) : 0;

    const openEdit = () => {
        if (!active?.asset) return;
        setEditing(active);
        setDescription(values.description);
        setImagePrompt(values.imagePrompt);
    };
    const save = () => {
        if (!editing?.asset || !imagePrompt.trim()) return message.warning("生图提示词不能为空");
        props.onSave(editing.asset, { description, imagePrompt });
        setEditing(null);
    };
    const download = async () => {
        if (asset?.kind !== "image") return;
        try {
            const source = asset.data.storageKey ? await getImageBlob(asset.data.storageKey) : null;
            const target = source || (await fetch(asset.data.dataUrl || asset.coverUrl).then((response) => response.blob()));
            if (!target) throw new Error("没有可下载的原图");
            saveAs(target, `${asset.title || active.logicalAssetId}.${asset.data.mimeType.split("/")[1] || "png"}`);
        } catch {
            message.error("原图下载失败，请稍后重试");
        }
    };

    if (!active) return null;
    return (
        <article className="overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
            <div className="relative aspect-video overflow-hidden border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                {isImage ? (
                    <Image
                        alt={`${props.card.name} · ${values.variantName}`}
                        className="!h-full !w-full object-cover"
                        height="100%"
                        preview={{ mask: <span className="text-xs">放大原图</span> }}
                        src={asset.data.dataUrl || asset.coverUrl}
                        width="100%"
                    />
                ) : (
                    <div className="grid h-full place-items-center text-center text-xs text-[var(--studio-text-muted)]">
                        <div><ImageIcon className="mx-auto mb-2 size-6 opacity-60" />尚未生成资产草图</div>
                    </div>
                )}
                <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">{active.logicalAssetId}</div>
                {isImage ? <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">{versionCount} 个版本</div> : null}
            </div>

            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{props.card.name}</h3>
                        <p className="mt-1 text-[10px] text-[var(--studio-text-muted)]">{categoryLabel(props.card.category)} · {isImage ? "草图已绑定" : "待生成草图"}</p>
                    </div>
                    <Checkbox checked={props.selectedIds.includes(active.logicalAssetId)} disabled={!asset || active.missingParent} onChange={(event) => props.onSelectionChange(active.logicalAssetId, event.target.checked)}>选择生成</Checkbox>
                </div>

                {props.card.variants.length > 1 ? (
                    <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                        {props.card.variants.map((variant, index) => (
                            <button key={variant.logicalAssetId} type="button" className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[10px] ${variant.logicalAssetId === active.logicalAssetId ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)] text-[var(--studio-text-secondary)]"}`} onClick={() => setActiveId(variant.logicalAssetId)}>
                                {index === 0 ? "基础形象" : variant.row.variantName || variant.row.name}
                            </button>
                        ))}
                    </div>
                ) : null}

                {active.missingParent ? <div className="mt-3 rounded-md border border-[var(--studio-warning)]/40 bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-xs text-[var(--studio-warning)]">该马甲尚未关联有效角色，暂不能生成。</div> : null}
                <div className="mt-3 rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--studio-text-secondary)]"><span className="text-[var(--studio-text-muted)]">剧本证据：</span>{active.row.scriptEvidence || "待补充"}</div>
                <TextBlock label="资产描述" value={values.description || "暂无描述"} />
                <TextBlock label="生图提示词" value={values.imagePrompt || "暂无提示词"} muted />
                {props.failed[active.logicalAssetId] ? <div className="mt-3 text-xs text-[var(--studio-danger)]">{props.failed[active.logicalAssetId]}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="small" icon={<Pencil className="size-3.5" />} disabled={!asset} onClick={openEdit}>编辑</Button>
                    {asset ? <Button size="small" icon={<ExternalLink className="size-3.5" />} href={buildImageWorkbenchHref(asset, workflowAssetPrompt(asset), workflowAssetInfo(asset))}>图片工作台</Button> : null}
                    {isImage ? <Button size="small" icon={<Download className="size-3.5" />} onClick={() => void download()}>下载原图</Button> : null}
                    <Button className="ml-auto" size="small" type="primary" icon={<WandSparkles className="size-3.5" />} disabled={!asset || !values.imagePrompt || active.missingParent} loading={generating} onClick={() => asset && props.onGenerate(asset)}>{isImage ? "重新生成草图" : "生成草图"}</Button>
                </div>
            </div>

            <Modal title={`编辑 ${active.logicalAssetId} · ${values.variantName}`} open={Boolean(editing)} okText="保存卡片" cancelText="取消" onCancel={() => setEditing(null)} onOk={save}>
                <label className="mt-2 block text-xs text-[var(--studio-text-secondary)]">资产描述</label>
                <Input.TextArea className="mt-2" autoSize={{ minRows: 3, maxRows: 7 }} value={description} onChange={(event) => setDescription(event.target.value)} />
                <label className="mt-4 block text-xs text-[var(--studio-text-secondary)]">生图提示词</label>
                <Input.TextArea className="mt-2" autoSize={{ minRows: 6, maxRows: 14 }} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} />
            </Modal>
        </article>
    );
}

function TextBlock({ label, muted, value }: { label: string; muted?: boolean; value: string }) {
    return <div className="mt-3"><div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div><p className={`mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-5 ${muted ? "text-[var(--studio-text-muted)]" : "text-[var(--studio-text-secondary)]"}`}>{value}</p></div>;
}

function variantValues(variant?: WorkflowAssetVariant) {
    const workflow = readRecord(variant?.asset?.metadata?.originalWorkflow);
    return {
        description: readString(workflow.description) || variant?.row.description || "",
        imagePrompt: workflowAssetPrompt(variant?.asset) || variant?.row.imagePrompt || "",
        variantName: readString(workflow.variantName) || variant?.row.variantName || variant?.row.name || "资产",
    };
}

function categoryLabel(category: WorkflowAssetCardModel["category"]) {
    return { character: "角色", scene: "场景", prop: "道具" }[category];
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
