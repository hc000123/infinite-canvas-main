"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Input, Select, Spin } from "antd";
import { Boxes, Check, CirclePlus, Save, Trash2, Undo2 } from "lucide-react";
import { nanoid } from "nanoid";

import { getWorkflowAssetSlots, saveWorkflowAssetSlots, type WorkflowAssetSlots } from "@/services/api/workflow-runs";
import { useAssetStore } from "@/stores/use-asset-store";

import type { useWorkflowStageActions } from "../use-workflow-stage-actions";
import { agentAssetSlotSummary, bindAgentAssetSlot, createAgentAssetSlot, ignoreAgentAssetSlot, removeAgentAssetSlot, type AgentAssetSlot } from "../workflow-asset-slots";

type StageActions = ReturnType<typeof useWorkflowStageActions>;

const categories = [
    { label: "角色", value: "character" },
    { label: "场景", value: "scene" },
    { label: "道具", value: "prop" },
    { label: "站位", value: "blocking" },
] as const;

export function WorkflowAssetSlotEditor({ projectId, state }: { projectId: string; state: StageActions }) {
    const { message } = App.useApp();
    const assets = useAssetStore((store) => store.assets);
    const [data, setData] = useState<WorkflowAssetSlots | null>(null);
    const [draft, setDraft] = useState<AgentAssetSlot[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const stage = state.stage;
    const stageId = stage?.id;
    const outputArtifactId = stage?.outputArtifactId;
    const readable = Boolean(stage && ["needs_review", "approved", "applied"].includes(stage.status));

    const load = useCallback(async () => {
        if (!stageId || !readable) return;
        setLoading(true);
        try {
            const result = await getWorkflowAssetSlots(stageId);
            setData(result);
            setDraft(result.slots);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产槽位读取失败");
        } finally {
            setLoading(false);
        }
    }, [message, readable, stageId]);

    useEffect(() => {
        void load();
    }, [load, outputArtifactId]);

    const summary = useMemo(() => agentAssetSlotSummary(draft), [draft]);
    const dirty = Boolean(data && JSON.stringify(draft) !== JSON.stringify(data.slots));
    const formalAssets = useMemo(() => assets.filter((asset) => asset.assetBinding?.projectId === projectId), [assets, projectId]);
    const save = async () => {
        if (!data || !stage) return null;
        setSaving(true);
        try {
            const result = await saveWorkflowAssetSlots(stage.id, { baseArtifactHash: data.artifact.artifact.contentHash, slots: draft });
            setData(result);
            setDraft(result.slots);
            message.success(`资产槽位已保存为第 ${result.version} 版`);
            return result;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "资产槽位保存失败");
            return null;
        } finally {
            setSaving(false);
        }
    };
    const approve = async () => {
        if (dirty && !(await save())) return;
        await state.approve();
    };
    const update = (slotId: string, patch: Partial<AgentAssetSlot>) => setDraft((current) => current.map((slot) => (slot.slotId === slotId ? { ...slot, ...patch } : slot)));
    const bind = (slot: AgentAssetSlot, assetId?: string) => {
        const asset = formalAssets.find((item) => item.id === assetId);
        setDraft((current) => current.map((item) => (item.slotId !== slot.slotId ? item : asset ? bindAgentAssetSlot(item, { assetId: asset.id, subjectId: asset.assetBinding?.subjectId, variantId: asset.assetBinding?.variantId }) : { ...item, status: "placeholder", assetId: undefined, subjectId: undefined, variantId: undefined })));
    };

    return (
        <section className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4 shadow-[var(--studio-shadow)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4 text-[var(--studio-accent)]" />资产槽位</div>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--studio-text-muted)]">解析结果只是生产清单。缺少图片时保留文字占位即可，改名、增减或忽略都不会自动写入正式资产库。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button icon={<CirclePlus className="size-4" />} disabled={!data} onClick={() => setDraft((current) => [...current, createAgentAssetSlot(`slot-manual-${nanoid(10)}`, "character")])}>新增槽位</Button>
                    <Button icon={<Save className="size-4" />} disabled={!dirty} loading={saving} onClick={() => void save()}>保存修订</Button>
                    {stage?.status === "needs_review" ? <Button type="primary" icon={<Check className="size-4" />} disabled={!state.actions.canApprove || saving} loading={state.busyAction === "approve"} onClick={() => void approve()}>批准资产解析</Button> : null}
                </div>
            </div>

            {readable ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">{[
                ["已识别", summary.total], ["已绑定", summary.bound], ["候选", summary.candidate], ["占位", summary.placeholder], ["已忽略", summary.ignored],
            ].map(([label, value]) => <div key={label} className="rounded-md bg-[var(--studio-workspace-bg)] px-3 py-2"><div className="text-[var(--studio-text-muted)]">{label}</div><div className="mt-1 text-base font-semibold">{value}</div></div>)}</div> : null}

            {!readable ? <Alert className="mt-4" showIcon type="info" title="等待资产解析结果" description="进入资产阶段后，Agent 会先生成可人工修订的槽位清单。" /> : loading ? <div className="grid min-h-36 place-items-center"><Spin description="正在读取资产槽位" /></div> : (
                <div className="mt-4 space-y-2">
                    {draft.map((slot) => (
                        <div key={slot.slotId} className={`grid gap-2 rounded-md border p-3 md:grid-cols-[112px_minmax(150px,0.8fr)_minmax(220px,1.4fr)_minmax(180px,1fr)_auto] ${slot.status === "ignored" ? "border-dashed border-[var(--studio-border-subtle)] opacity-60" : "border-[var(--studio-border-subtle)]"}`}>
                            <Select value={slot.category} options={categories.slice()} disabled={slot.status === "ignored"} onChange={(category) => update(slot.slotId, { category })} />
                            <Input value={slot.name} disabled={slot.status === "ignored"} placeholder="资产名称" onChange={(event) => update(slot.slotId, { name: event.target.value })} />
                            <Input value={slot.description} disabled={slot.status === "ignored"} placeholder="外观、空间或站位描述" onChange={(event) => update(slot.slotId, { description: event.target.value })} />
                            <Select allowClear showSearch value={slot.status === "bound" ? slot.assetId : undefined} disabled={slot.status === "ignored"} placeholder="绑定正式资产（可选）" optionFilterProp="label" options={formalAssets.map((asset) => ({ value: asset.id, label: `${asset.title} · ${asset.kind}` }))} onChange={(assetId) => bind(slot, assetId)} />
                            <div className="flex justify-end gap-1">
                                <Button type="text" title={slot.status === "ignored" ? "恢复为占位" : "忽略"} icon={slot.status === "ignored" ? <Undo2 className="size-4" /> : <span className="text-xs">忽略</span>} onClick={() => setDraft((current) => current.map((item) => item.slotId === slot.slotId ? slot.status === "ignored" ? { ...item, status: "placeholder" } : ignoreAgentAssetSlot(item) : item))} />
                                <Button type="text" danger title="删除" icon={<Trash2 className="size-4" />} onClick={() => setDraft((current) => removeAgentAssetSlot(current, slot.slotId))} />
                            </div>
                        </div>
                    ))}
                    {!draft.length ? <Alert showIcon type="warning" title="当前没有资产槽位" description="可以直接批准并继续分镜，也可以手动新增需要保持一致性的角色、场景或道具。" /> : null}
                </div>
            )}
        </section>
    );
}
