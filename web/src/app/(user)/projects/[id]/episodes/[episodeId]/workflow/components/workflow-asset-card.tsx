"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Dropdown, Image, Input, Modal, Select } from "antd";
import { Check, Download, ExternalLink, History, ImageIcon, Pencil, Upload, WandSparkles } from "lucide-react";
import { saveAs } from "file-saver";

import { buildRestoreAssetVersionPatch } from "@/app/(user)/assets/asset-version-history";
import { resolveRestoredAssetPatch } from "@/app/(user)/assets/asset-version-files";
import { buildAssetWorkbenchHref } from "@/app/(user)/assets/use-workflow-asset-image-actions";
import { workflowAssetInfo, workflowAssetPrompt } from "@/app/(user)/assets/workflow-asset-image";
import { getImageBlob, resolveImageUrl } from "@/services/image-storage";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

import { workflowAssetVersionChoices, type WorkflowAssetCard as WorkflowAssetCardModel, type WorkflowAssetVariant } from "../workflow-asset-card-model";

export function WorkflowAssetCard(props: {
    bindingAssets: Asset[];
    card: WorkflowAssetCardModel;
    failed: Record<string, string>;
    generatingIds: string[];
    onGenerate: (asset: Asset) => void;
    onBind: (variant: WorkflowAssetVariant, assetId: string) => void;
    onImport: (asset: Asset, logicalAssetId: string, source: "local" | "library") => void;
    onSave: (asset: Asset, input: { description: string; imagePrompt: string }) => void;
    onSelectionChange: (logicalAssetId: string, checked: boolean) => void;
    selectedIds: string[];
}) {
    const { message } = App.useApp();
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const [activeId, setActiveId] = useState(props.card.variants[0]?.logicalAssetId || "");
    const [editing, setEditing] = useState<WorkflowAssetVariant | null>(null);
    const [description, setDescription] = useState("");
    const [imagePrompt, setImagePrompt] = useState("");
    const [versionPickerOpen, setVersionPickerOpen] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState("");
    const [switchingVersion, setSwitchingVersion] = useState(false);
    const [versionUrls, setVersionUrls] = useState<Record<string, string>>({});
    useEffect(() => {
        if (!props.card.variants.some((item) => item.logicalAssetId === activeId)) setActiveId(props.card.variants[0]?.logicalAssetId || "");
    }, [activeId, props.card.variants]);
    const active = props.card.variants.find((item) => item.logicalAssetId === activeId) || props.card.variants[0];
    const activeKind = active?.row.kind || "";
    const asset = active?.asset;
    const values = variantValues(active);
    const isImage = asset?.kind === "image";
    const generating = Boolean(asset && props.generatingIds.includes(asset.id));
    const versions = useMemo(() => (asset ? workflowAssetVersionChoices(asset) : []), [asset]);
    const bindingOptions = useMemo(() => props.bindingAssets.filter((item) => item.id === asset?.id || item.assetBinding?.category === bindingCategory(activeKind)).map((item) => ({ label: `${item.title} · ${item.assetBinding?.variantName || item.kind}`, value: item.id })), [activeKind, asset?.id, props.bindingAssets]);
    const selectedVersion = versions.find((version) => version.id === selectedVersionId);

    useEffect(() => {
        if (!versionPickerOpen) return;
        let active = true;
        void Promise.all(
            versions.map(async (version) => {
                const storageKey = readString(version.data.storageKey);
                const fallback = readString(version.data.dataUrl) || version.coverUrl;
                return [version.id, await resolveImageUrl(storageKey, fallback)] as const;
            }),
        ).then((entries) => {
            if (active) setVersionUrls(Object.fromEntries(entries));
        });
        return () => {
            active = false;
        };
    }, [versionPickerOpen, versions]);

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
    const openVersionPicker = () => {
        setSelectedVersionId(versions.find((version) => version.isCurrent)?.id || versions[0]?.id || "");
        setVersionPickerOpen(true);
    };
    const switchVersion = async () => {
        if (!asset || !selectedVersion || selectedVersion.isCurrent) return;
        const patch = buildRestoreAssetVersionPatch(asset, selectedVersion.id, new Date().toISOString());
        if (!patch) return message.error("无法读取该资产版本");
        setSwitchingVersion(true);
        try {
            updateAsset(asset.id, await resolveRestoredAssetPatch(patch));
            setVersionPickerOpen(false);
            message.success(`已将 v${selectedVersion.versionNumber} 设为当前资产图`);
        } catch {
            message.error("版本切换失败，请稍后重试");
        } finally {
            setSwitchingVersion(false);
        }
    };

    if (!active) return null;
    return (
        <article className="overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
            <div className="relative aspect-[5/2] overflow-hidden border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
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
                {isImage && versions.length ? <button type="button" className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] text-white transition hover:bg-black/90" onClick={openVersionPicker} aria-label={`选择 ${versions.length} 个资产版本`}><History className="size-3" />{versions.length} 个版本</button> : null}
            </div>

            <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{props.card.name}</h3>
                        <p className="mt-1 text-[10px] text-[var(--studio-text-muted)]">{categoryLabel(props.card.category)} · {isImage ? "草图已绑定" : "待生成草图"}</p>
                    </div>
                    <Checkbox checked={props.selectedIds.includes(active.logicalAssetId)} disabled={!asset || active.missingParent} onChange={(event) => props.onSelectionChange(active.logicalAssetId, event.target.checked)}>选择生成</Checkbox>
                </div>

                <div className="mt-2 flex items-center gap-2"><span className="shrink-0 text-[10px] text-[var(--studio-text-muted)]">绑定</span><Select className="min-w-0 flex-1" size="small" showSearch optionFilterProp="label" value={asset?.id} options={bindingOptions} placeholder="选择已有资产卡片" onChange={(assetId) => props.onBind(active, assetId)} /></div>

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
                <div className="mt-2 line-clamp-2 rounded-md bg-[var(--studio-panel-muted-bg)] px-2.5 py-1.5 text-[11px] leading-5 text-[var(--studio-text-secondary)]"><span className="text-[var(--studio-text-muted)]">剧本证据：</span>{active.row.scriptEvidence || "待补充"}</div>
                <TextBlock label="资产描述" value={values.description || "暂无描述"} />
                {props.failed[active.logicalAssetId] ? <div className="mt-3 text-xs text-[var(--studio-danger)]">{props.failed[active.logicalAssetId]}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="small" icon={<Pencil className="size-3.5" />} disabled={!asset} onClick={openEdit}>编辑</Button>
                    {asset ? <Button size="small" icon={<ExternalLink className="size-3.5" />} href={buildAssetWorkbenchHref(asset, workflowAssetInfo(asset))}>资产生图</Button> : null}
                    {asset ? <Dropdown trigger={["click"]} menu={{ items: [{ key: "local", label: "从本地导入" }, { key: "library", label: "从素材库导入" }], onClick: ({ key }) => props.onImport(asset, active.logicalAssetId, key as "local" | "library") }}><Button size="small" icon={<Upload className="size-3.5" />}>导入资产</Button></Dropdown> : null}
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
            <Modal
                title={`${active.logicalAssetId} · 选择资产版本`}
                open={versionPickerOpen}
                width={760}
                okText={selectedVersion?.isCurrent ? "当前版本" : "设为当前版本"}
                cancelText="取消"
                okButtonProps={{ disabled: !selectedVersion || selectedVersion.isCurrent }}
                confirmLoading={switchingVersion}
                onCancel={() => setVersionPickerOpen(false)}
                onOk={() => void switchVersion()}
            >
                <p className="mb-4 text-xs leading-5 text-[var(--studio-text-muted)]">选择一个历史版本查看原图，确认后将它设为当前资产图；其他版本仍会保留。</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {versions.map((version) => {
                        const selected = version.id === selectedVersionId;
                        const url = versionUrls[version.id] || readString(version.data.dataUrl) || version.coverUrl;
                        return (
                            <div key={version.id} className={`overflow-hidden rounded-lg border transition ${selected ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]"}`}>
                                <div className="grid aspect-video place-items-center overflow-hidden border-b border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)]">
                                    {url ? <Image alt={`${active.logicalAssetId} v${version.versionNumber}`} className="!h-full !w-full object-cover" height="100%" preview={{ mask: <span className="text-xs">放大版本原图</span> }} src={url} width="100%" /> : <ImageIcon className="size-6 text-[var(--studio-text-muted)]" />}
                                </div>
                                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left" aria-label={`选择版本 v${version.versionNumber}`} aria-pressed={selected} onClick={() => setSelectedVersionId(version.id)}>
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--studio-text-primary)]">v{version.versionNumber}{version.isCurrent ? <span className="rounded bg-[var(--studio-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--studio-accent)]">当前版本</span> : null}</span>
                                        <span className="mt-1 block truncate text-[11px] text-[var(--studio-text-muted)]">{version.changeNote || "资产版本"}{version.createdAt ? ` · ${formatVersionDate(version.createdAt)}` : ""}</span>
                                    </span>
                                    <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[var(--studio-accent)] bg-[var(--studio-accent)] text-white" : "border-[var(--studio-border-strong)] text-transparent"}`}><Check className="size-3.5" /></span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </article>
    );
}

function TextBlock({ label, value }: { label: string; value: string }) {
    return <div className="mt-2"><div className="text-[10px] text-[var(--studio-text-muted)]">{label}</div><p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[var(--studio-text-secondary)]">{value}</p></div>;
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

function bindingCategory(kind: string) {
    return kind === "character" || kind === "costume" ? "character" : kind === "scene" ? "scene" : "prop";
}

function readRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function formatVersionDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
