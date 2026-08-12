"use client";

import { useRef, useState } from "react";
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Select } from "antd";
import { Eye, Images, Upload } from "lucide-react";
import Image from "next/image";

import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { useVideoPackageStore, type ProductionPackage, type WorkflowReferenceBinding, type WorkflowReferenceRole } from "@/app/(user)/video/use-video-package-store";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";

import { referenceUsage, upsertReferenceBinding, validateReferenceDefinition, workflowReferenceRoleOptions } from "../workflow-reference-bindings";
import type { WorkflowReferenceImage } from "../workflow-reference-images";

const KIND_LABEL = { character: "角色", scene: "场景", prop: "道具" };

export function WorkflowReferenceImagePanel(props: { images: WorkflowReferenceImage[]; item: ProductionPackage }) {
    const { message } = App.useApp();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [definitionOpen, setDefinitionOpen] = useState(false);
    const [candidate, setCandidate] = useState<{ assetId: string; label: string; version: string } | null>(null);
    const [definition, setDefinition] = useState<Partial<WorkflowReferenceBinding>>({ role: "blocking" });
    const [importing, setImporting] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const addAssetOnce = useAssetStore((state) => state.addAssetOnce);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const bindings = props.item.referenceBindings || [];
    const selected = new Set(bindings.map((item) => item.libraryAssetId));

    const toggleKnown = (item: WorkflowReferenceImage, checked: boolean) => {
        if (!checked) return updatePackage(props.item, { referenceBindings: bindings.filter((binding) => binding.libraryAssetId !== item.id) });
        const role: WorkflowReferenceRole = item.parentLogicalAssetId || item.variantName ? "character_variant" : item.kind;
        const binding: WorkflowReferenceBinding = { role, label: item.label, logicalAssetId: item.logicalAssetId || item.id, parentLogicalAssetId: item.parentLogicalAssetId, variantName: item.variantName, libraryAssetId: item.id, version: item.version, usage: referenceUsage(role) };
        updatePackage(props.item, { referenceBindings: upsertReferenceBinding(bindings, binding) });
    };
    const openDefinition = (assetId: string, label: string, version: string) => {
        setCandidate({ assetId, label, version });
        setDefinition({ role: "blocking", label, libraryAssetId: assetId, version });
        setDefinitionOpen(true);
    };
    const materialize = async (payload: Extract<InsertAssetPayload, { kind: "image" }>) => {
        if (payload.sourceAssetId) {
            const source = useAssetStore.getState().assets.find((item) => item.id === payload.sourceAssetId && item.kind === "image");
            if (source) return { assetId: source.id, label: payload.title, version: payload.assetVersion?.assetVersionId || source.updatedAt };
        }
        const stored = await uploadImage(payload.dataUrl);
        const assetId = await addAssetOnce({ coverUrl: stored.url, data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType }, kind: "image", metadata: { workflowShotReference: true }, source: "镜头参考图导入", tags: ["视频工作流", "镜头参考图"], title: payload.title });
        return { assetId, label: payload.title, version: useAssetStore.getState().assets.find((item) => item.id === assetId)?.updatedAt || new Date().toISOString() };
    };
    const importPicked = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "image") return message.warning("请选择图片素材");
        setImporting(true);
        try { const result = await materialize(payload); setPickerOpen(false); openDefinition(result.assetId, result.label, result.version); }
        catch (error) { message.error(error instanceof Error ? error.message : "参考图导入失败"); }
        finally { setImporting(false); }
    };
    const importFile = async (file?: File) => {
        if (!file) return;
        setImporting(true);
        try {
            const stored = await uploadImage(file);
            const assetId = await addAssetOnce({ coverUrl: stored.url, data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType }, kind: "image", metadata: { workflowShotReference: true }, source: "镜头本地参考图", tags: ["视频工作流", "镜头参考图"], title: file.name });
            openDefinition(assetId, file.name, useAssetStore.getState().assets.find((item) => item.id === assetId)?.updatedAt || new Date().toISOString());
        } catch (error) { message.error(error instanceof Error ? error.message : "参考图导入失败"); }
        finally { setImporting(false); if (fileInput.current) fileInput.current.value = ""; }
    };
    const saveDefinition = () => {
        if (!candidate) return;
        const input = { ...definition, libraryAssetId: candidate.assetId, version: candidate.version };
        const issue = validateReferenceDefinition(input);
        if (issue) return message.warning(issue);
        const role = input.role as Exclude<WorkflowReferenceRole, "continuity_reference">;
        const binding: WorkflowReferenceBinding = { role, label: input.label!.trim(), logicalAssetId: input.logicalAssetId?.trim(), parentLogicalAssetId: input.parentLogicalAssetId?.trim(), variantName: input.variantName?.trim(), libraryAssetId: candidate.assetId, version: candidate.version, usage: referenceUsage(role) };
        updatePackage(props.item, { referenceBindings: upsertReferenceBinding(bindings, binding) });
        const asset = useAssetStore.getState().assets.find((item) => item.id === candidate.assetId);
        if (asset) updateAsset(asset.id, { metadata: { ...asset.metadata, workflowShotReference: { episodeId: props.item.episodeId, shotId: props.item.id, ...binding } } });
        setDefinitionOpen(false);
        message.success("参考图已定义并绑定到本镜");
    };

    return <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Images className="size-4 text-[var(--studio-accent)]" />本镜参考图</div><p className="mt-1 text-xs leading-5 text-[var(--studio-text-muted)]">为当前生产包选择或导入参考图；每张图都带用途、资产编号和冻结版本。</p></div><div className="flex items-center gap-2"><span className="text-xs text-[var(--studio-text-secondary)]">已选 {bindings.length}/9</span><Dropdown trigger={["click"]} menu={{ items: [{ key: "local", label: "从本地导入" }, { key: "library", label: "从素材库导入" }], onClick: ({ key }) => key === "local" ? fileInput.current?.click() : setPickerOpen(true) }}><Button size="small" icon={<Upload className="size-3.5" />} loading={importing}>导入参考图</Button></Dropdown></div></div>
        {props.images.length ? <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{props.images.map((item) => <label key={item.id} className={`group relative cursor-pointer overflow-hidden rounded-md border ${selected.has(item.id) ? "border-[var(--studio-accent)]" : "border-[var(--studio-border-subtle)]"}`}><span className="relative block aspect-[3/4] w-full bg-[var(--studio-panel-muted-bg)]"><Image alt={item.label} fill sizes="120px" src={item.asset.data.dataUrl || item.asset.coverUrl} unoptimized className="object-cover" /></span><span className="absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-1 text-[10px] text-white"><span className="block truncate">{item.label}</span><span className="opacity-70">{KIND_LABEL[item.kind]} · {item.logicalAssetId || "待编号"}</span></span><Checkbox className="absolute left-1.5 top-1.5" checked={selected.has(item.id)} disabled={!selected.has(item.id) && bindings.length >= 9} onChange={(event) => toggleKnown(item, event.target.checked)} /></label>)}</div> : <Empty className="my-4" image={Empty.PRESENTED_IMAGE_SIMPLE} description="可从本地或素材库导入本镜参考图" />}
        {bindings.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{bindings.map((item) => <div key={`${item.role}:${item.libraryAssetId}`} className="rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-xs"><div className="font-semibold">{item.label}</div><div className="mt-1 text-[var(--studio-text-muted)]">{roleLabel(item.role)} · {item.logicalAssetId || props.item.id} · {item.version}</div></div>)}</div> : null}
        <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-[11px] text-[var(--studio-text-secondary)]"><Eye className="size-3.5 shrink-0 text-[var(--studio-accent)]" />上一镜尾帧由系统单独作为剧情连续性普通参考，不会作为首帧；本镜手动参考只影响当前镜头。</div>
        <input ref={fileInput} className="hidden" type="file" accept="image/*" onChange={(event) => void importFile(event.target.files?.[0])} />
        <AssetPickerModal open={pickerOpen} title="选择本镜参考图" allowedKinds={["image"]} onInsert={(payload) => void importPicked(payload)} onClose={() => setPickerOpen(false)} />
        <Modal title="定义参考图用途" open={definitionOpen} okText="绑定到本镜" cancelText="取消" onCancel={() => setDefinitionOpen(false)} onOk={saveDefinition} okButtonProps={{ disabled: Boolean(validateReferenceDefinition({ ...definition, libraryAssetId: candidate?.assetId, version: candidate?.version })) }}>
            <div className="grid gap-4"><label><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">参考图类型</span><Select className="w-full" value={definition.role} options={workflowReferenceRoleOptions} onChange={(role) => setDefinition((current) => ({ ...current, role }))} /></label><label><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">名称</span><Input value={definition.label} onChange={(event) => setDefinition((current) => ({ ...current, label: event.target.value }))} /></label>{definition.role !== "blocking" ? <label><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">绑定资产编号</span><Input placeholder="例如 CHAR-001 / SCENE-001 / PROP-001" value={definition.logicalAssetId} onChange={(event) => setDefinition((current) => ({ ...current, logicalAssetId: event.target.value }))} /></label> : null}{definition.role === "character_variant" ? <><label><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">所属角色编号</span><Input placeholder="例如 CHAR-001" value={definition.parentLogicalAssetId} onChange={(event) => setDefinition((current) => ({ ...current, parentLogicalAssetId: event.target.value }))} /></label><label><span className="mb-1.5 block text-xs text-[var(--studio-text-muted)]">马甲 / 状态名</span><Input value={definition.variantName} onChange={(event) => setDefinition((current) => ({ ...current, variantName: event.target.value }))} /></label></> : null}</div>
        </Modal>
    </section>;
}

function roleLabel(role: WorkflowReferenceRole) { return ({ character: "角色", character_variant: "角色马甲", scene: "场景", prop: "道具", blocking: "站位图", continuity_reference: "连续性尾帧" } as const)[role]; }
