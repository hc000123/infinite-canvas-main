"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Checkbox, Empty, Input, InputNumber, Select, Skeleton, Space, Tag, Tooltip } from "antd";
import { Bot, CheckCircle2, GitFork, Plus, Save, Send, Trash2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SkillOption } from "@/services/api/admin-skills";
import { createWorkflowVersion, fetchWorkflowVersion, publishWorkflowVersion, recommendWorkflowVersion, updateWorkflowVersion, validateWorkflowVersion, type WorkflowNodeInputBinding, type WorkflowNodeSpec, type WorkflowPackage, type WorkflowRegistryItem } from "@/services/api/workflow-registry";
import { addWorkflowNode, applySkillOptionToWorkflowNode, createWorkflowNode, nextWorkflowPatchVersion, removeWorkflowNode, replaceWorkflowNode, setWorkflowSkillBindingMode, topologicalWorkflowLanes } from "../workflow-editor-model";

const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失败";

export function WorkflowVersionEditor({ item, projectId, skillOptions, onVersionChange }: { item?: WorkflowRegistryItem; projectId: string; skillOptions: SkillOption[]; onVersionChange: (versionId: string, pkg?: WorkflowPackage) => void }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [activeVersionId, setActiveVersionId] = useState("");
    const [editor, setEditor] = useState<WorkflowPackage>();

    useEffect(() => {
        if (!item) {
            setActiveVersionId("");
            return;
        }
        const draft = item.versions.find((version) => version.status === "draft");
        const versionId = draft?.id || item.workflow.recommendedVersionId || item.versions[0]?.id || "";
        setActiveVersionId(versionId);
        onVersionChange(versionId);
    }, [item, onVersionChange]);

    const detailQuery = useQuery({ queryKey: ["workflow-version", activeVersionId], queryFn: () => fetchWorkflowVersion(activeVersionId), enabled: Boolean(activeVersionId), retry: false });
    useEffect(() => {
        if (!detailQuery.data) return;
        const next = structuredClone(detailQuery.data.package);
        setEditor(next);
        onVersionChange(detailQuery.data.version.id, next);
    }, [detailQuery.data, onVersionChange]);

    const refresh = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["workflow-registry", projectId] }),
            queryClient.invalidateQueries({ queryKey: ["workflow-version"] }),
        ]);
    };
    const draftMutation = useMutation({
        mutationFn: () => createWorkflowVersion(item!.workflow.id, { version: nextWorkflowPatchVersion(detailQuery.data!.version.version), package: { ...structuredClone(detailQuery.data!.package), contentHash: "" } }),
        onSuccess: async (version) => { await refresh(); setActiveVersionId(version.id); onVersionChange(version.id); message.success(`已创建 Workflow 草稿 v${version.version}`); },
        onError: (error) => message.error(errorText(error)),
    });
    const saveMutation = useMutation({
        mutationFn: () => updateWorkflowVersion(activeVersionId, { version: detailQuery.data!.version.version, package: editor! }),
        onSuccess: async () => { await refresh(); message.success("Workflow 草稿已保存"); },
        onError: (error) => message.error(errorText(error)),
    });
    const validateMutation = useMutation({
        mutationFn: () => validateWorkflowVersion(activeVersionId),
        onSuccess: (result) => message.success(`DAG 与引用校验通过：${shortHash(result.contentHash)}`),
        onError: (error) => message.error(errorText(error)),
    });
    const publishMutation = useMutation({
        mutationFn: () => publishWorkflowVersion(activeVersionId),
        onSuccess: async () => { await refresh(); message.success("Workflow 版本已发布并冻结精确引用"); },
        onError: (error) => message.error(errorText(error)),
    });
    const recommendMutation = useMutation({
        mutationFn: () => recommendWorkflowVersion(item!.workflow.id, activeVersionId),
        onSuccess: async () => { await refresh(); message.success("已设为项目推荐 Workflow 版本"); },
        onError: (error) => message.error(errorText(error)),
    });

    if (!item) return <section className="studio-panel grid min-h-72 place-items-center p-6"><Empty description="请选择或新建 Workflow" /></section>;
    if (!detailQuery.data || !editor) return <section className="studio-panel p-5"><Skeleton active paragraph={{ rows: 14 }} /></section>;

    const version = detailQuery.data.version;
    const readOnly = version.status !== "draft";
    const isSystem = item.workflow.ownerType === "system";
    const isDirty = JSON.stringify(editor) !== JSON.stringify(detailQuery.data.package);
    const lanes = topologicalWorkflowLanes(editor);
    const busy = draftMutation.isPending || saveMutation.isPending || validateMutation.isPending || publishMutation.isPending || recommendMutation.isPending;

    const setPackage = (next: WorkflowPackage) => {
        const inputTypes = new Set(next.inputArtifactTypes);
        for (const node of next.nodes) for (const binding of node.inputBindings) if (binding.source === "workflow_input") inputTypes.add(binding.artifactType);
        const value = { ...next, inputArtifactTypes: [...inputTypes], contentHash: "" };
        setEditor(value);
        onVersionChange(activeVersionId, value);
    };
    const updateNode = (nodeKey: string, node: WorkflowNodeSpec) => setPackage(replaceWorkflowNode(editor, nodeKey, node));
    const addNode = () => {
        let node = createWorkflowNode(editor);
        if (skillOptions[0]) node = applySkillOptionToWorkflowNode(node, skillOptions[0]);
        setPackage(addWorkflowNode(editor, node));
    };

    return (
        <section className="studio-panel min-w-0 overflow-hidden">
            <header className="border-b border-[var(--studio-border-subtle)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0"><p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">DAG DEFINITION</p><h2 className="mt-2 truncate text-2xl font-semibold">{item.workflow.name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">{item.workflow.summary || "组合独立 Skill，所有节点统一落到 Invocation / Artifact Runtime。"}</p></div>
                    <Space wrap><Select aria-label="Workflow 版本" value={activeVersionId} onChange={(value) => { setActiveVersionId(value); onVersionChange(value); }} options={item.versions.map((candidate) => ({ value: candidate.id, label: `v${candidate.version} · ${versionStatusLabel(candidate.status)}` }))} style={{ minWidth: 180 }} /><Tag color={readOnly ? "green" : "gold"}>{readOnly ? "不可变版本" : "可编辑草稿"}</Tag></Space>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!isSystem && readOnly ? <Button icon={<Plus className="size-4" />} loading={draftMutation.isPending} onClick={() => draftMutation.mutate()}>基于此版新建草稿</Button> : null}
                    {!readOnly ? <><Button type="primary" icon={<Save className="size-4" />} disabled={busy || !isDirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存 DAG</Button><Button icon={<CheckCircle2 className="size-4" />} disabled={busy || isDirty} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>校验</Button><Button icon={<Send className="size-4" />} disabled={busy || isDirty} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>发布</Button></> : null}
                    {!isSystem && version.status === "published" && item.workflow.recommendedVersionId !== version.id ? <Button loading={recommendMutation.isPending} onClick={() => recommendMutation.mutate()}>设为推荐版</Button> : null}
                    <span className="ml-auto text-xs text-[var(--studio-text-muted)]">内容哈希 {shortHash(version.contentHash)}</span>
                </div>
            </header>

            <div className="space-y-5 p-5">
                <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                    <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">拓扑泳道</div><div className="mt-1 text-xs text-[var(--studio-text-muted)]">同一列可并行，后一列等待依赖的已批准 Artifact。</div></div><Tag icon={<GitFork className="size-3.5" />}>{editor.nodes.length} 节点</Tag></div>
                    <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">{lanes.map((lane, index) => <div key={index} className="min-w-36 flex-1 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-2"><div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--studio-text-muted)]">LANE {index + 1}</div><div className="mt-2 space-y-1.5">{lane.map((node) => <div key={node.nodeKey} className="flex items-center gap-2 rounded-md bg-[var(--studio-active-bg)] px-2 py-1.5 text-xs"><span className="grid size-5 place-items-center rounded bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]">{node.executorType === "agent" ? <Bot className="size-3" /> : <Wrench className="size-3" />}</span><span className="truncate">{node.name}</span></div>)}</div></div>)}</div>
                </div>

                <div className="space-y-3">{editor.nodes.map((node, index) => <WorkflowNodeEditor key={node.nodeKey} index={index} node={node} allNodes={editor.nodes} readOnly={readOnly || node.executorType === "agent"} skillOptions={skillOptions} onChange={(value) => updateNode(node.nodeKey, value)} onRemove={() => setPackage(removeWorkflowNode(editor, node.nodeKey))} />)}</div>
                {!readOnly ? <Button icon={<Wrench className="size-4" />} onClick={addNode}>添加 Skill 节点</Button> : null}
                {isSystem ? <div className="rounded-lg border border-dashed border-[var(--studio-border-strong)] p-4 text-sm text-[var(--studio-text-secondary)]">系统 Workflow 只读；复制到项目后才能自由替换、增删和组合节点。</div> : null}
                {busy ? <div className="text-xs text-[var(--studio-text-muted)]">正在同步 Workflow Registry…</div> : null}
            </div>
        </section>
    );
}

function WorkflowNodeEditor({ index, node, allNodes, readOnly, skillOptions, onChange, onRemove }: { index: number; node: WorkflowNodeSpec; allNodes: WorkflowNodeSpec[]; readOnly: boolean; skillOptions: SkillOption[]; onChange: (node: WorkflowNodeSpec) => void; onRemove: () => void }) {
    const dependencies = allNodes.filter((candidate) => candidate.nodeKey !== node.nodeKey);
    const update = (patch: Partial<WorkflowNodeSpec>) => onChange({ ...node, ...patch });
    const skillOptionsForSelect = skillOptions.map((option) => ({ value: option.skillVersionId, label: `${option.skillName} · v${option.version} · ${option.manifest.inputArtifactTypes.join("+") || "无输入"} → ${option.manifest.outputArtifactTypes.join("+") || "无输出"}` }));
    return (
        <article className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <div className="flex items-start gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--studio-accent-soft)] text-sm font-semibold text-[var(--studio-accent)]">{index + 1}</div><div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2"><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">名称</span><Input value={node.name} readOnly={readOnly} onChange={(event) => update({ name: event.target.value })} /></label><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">Key</span><Input value={node.nodeKey} readOnly={readOnly} onChange={(event) => update({ nodeKey: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_") })} /></label></div><Tooltip title="移除节点"><Button aria-label="移除节点" danger icon={<Trash2 className="size-4" />} disabled={readOnly || allNodes.length === 1} onClick={onRemove} /></Tooltip></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">执行器</span><Input value={node.executorType === "agent" ? "历史 Agent 节点（只读）" : "Skill · 单能力执行"} readOnly /></label>
                <label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">输出 Artifact 类型</span><Input value={node.outputArtifactType} readOnly={readOnly} onChange={(event) => update({ outputArtifactType: event.target.value.trim().toLowerCase() })} /></label>
            </div>
            {node.executorType === "skill" ? <div className="mt-3 grid gap-3 lg:grid-cols-2"><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">Skill 路由模式</span><Select className="w-full" value={node.skillBinding?.mode || "fixed"} disabled={readOnly} options={[{ value: "fixed", label: "固定精确版本" }, { value: "tag_route", label: "标签自动路由" }, { value: "manual_before_run", label: "运行前手动选择" }]} onChange={(mode) => onChange(setWorkflowSkillBindingMode(node, mode))} /></label>{node.skillBinding?.mode === "fixed" ? <label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">Skill 版本</span><Select showSearch optionFilterProp="label" className="w-full" value={node.skillBinding.skillVersionId || undefined} disabled={readOnly} options={skillOptionsForSelect} onChange={(versionId) => { const option = skillOptions.find((candidate) => candidate.skillVersionId === versionId); if (option) onChange(applySkillOptionToWorkflowNode(node, option)); }} /></label> : <><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">Capability</span><Input value={node.skillBinding?.capability} readOnly={readOnly} onChange={(event) => update({ skillBinding: { ...node.skillBinding!, capability: event.target.value.trim().toLowerCase() } })} /></label><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">候选 Skill 范围</span><Select mode="multiple" className="w-full" value={node.skillBinding?.candidateSkillIds || []} disabled={readOnly} options={[...new Map(skillOptions.map((option) => [option.skillId, { value: option.skillId, label: option.skillName }])).values()]} onChange={(candidateSkillIds) => update({ skillBinding: { ...node.skillBinding!, candidateSkillIds, expectedOutputArtifactType: node.outputArtifactType } })} /></label></>}</div> : <label className="mt-3 block"><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">历史 Agent 版本</span><Input value={node.agentRef?.agentVersionId || "未记录"} readOnly /></label>}
            <label className="mt-3 block"><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">依赖节点</span><Select mode="multiple" className="w-full" value={node.dependsOn} disabled={readOnly} options={dependencies.map((candidate) => ({ value: candidate.nodeKey, label: `${candidate.name} · ${candidate.outputArtifactType}` }))} onChange={(dependsOn) => update({ dependsOn })} /></label>
            <div className="mt-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[var(--studio-text-muted)]">输入映射</span>{!readOnly ? <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={() => update({ inputBindings: [...node.inputBindings, { bindingName: `input_${node.inputBindings.length + 1}`, artifactType: "source_text", source: "workflow_input", workflowInputName: `input_${node.inputBindings.length + 1}`, required: true }] })}>添加</Button> : null}</div><div className="mt-2 space-y-2">{node.inputBindings.map((binding, bindingIndex) => <InputBindingEditor key={`${binding.bindingName}-${bindingIndex}`} binding={binding} dependencies={dependencies} readOnly={readOnly} onChange={(value) => update({ inputBindings: node.inputBindings.map((item, itemIndex) => itemIndex === bindingIndex ? value : item) })} onRemove={() => update({ inputBindings: node.inputBindings.filter((_, itemIndex) => itemIndex !== bindingIndex) })} />)}</div></div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3"><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">最大尝试次数</span><InputNumber className="w-full" min={1} max={5} value={node.retryPolicy.maxAttempts} disabled={readOnly} onChange={(value) => update({ retryPolicy: { maxAttempts: value || 1 } })} /></label><label className="flex items-end pb-1"><Checkbox checked={node.confirmationPolicy.requireBeforeRun} disabled={readOnly} onChange={(event) => update({ confirmationPolicy: { ...node.confirmationPolicy, requireBeforeRun: event.target.checked } })}>节点前确认</Checkbox></label><label className="flex items-end pb-1"><Checkbox checked={node.confirmationPolicy.requireReview} disabled={readOnly} onChange={(event) => update({ confirmationPolicy: { ...node.confirmationPolicy, requireReview: event.target.checked } })}>产物需审核</Checkbox></label></div>
            <div className="mt-3 rounded-md border border-[var(--studio-border-subtle)] p-3"><Checkbox checked={Boolean(node.condition)} disabled={readOnly} onChange={(event) => update({ condition: event.target.checked ? { source: "workflow_input", key: "enabled", operator: "equals", value: true } : undefined })}>启用确定性条件</Checkbox>{node.condition ? <div className="mt-3 grid gap-2 lg:grid-cols-4"><Select value={node.condition.source} disabled={readOnly} options={[{ value: "workflow_input", label: "运行参数" }, { value: "node_output", label: "上游产物" }]} onChange={(source) => update({ condition: { ...node.condition!, source } })} /><Input value={node.condition.key} readOnly={readOnly} placeholder="key / node.key" onChange={(event) => update({ condition: { ...node.condition!, key: event.target.value } })} /><Select value={node.condition.operator} disabled={readOnly} options={["equals", "not_equals", "contains", "exists"].map((value) => ({ value, label: value }))} onChange={(operator) => update({ condition: { ...node.condition!, operator } })} /><Input value={typeof node.condition.value === "string" ? node.condition.value : JSON.stringify(node.condition.value)} readOnly={readOnly || node.condition.operator === "exists"} placeholder="比较值" onChange={(event) => update({ condition: { ...node.condition!, value: parseConditionValue(event.target.value) } })} /></div> : null}</div>
        </article>
    );
}

function InputBindingEditor({ binding, dependencies, readOnly, onChange, onRemove }: { binding: WorkflowNodeInputBinding; dependencies: WorkflowNodeSpec[]; readOnly: boolean; onChange: (binding: WorkflowNodeInputBinding) => void; onRemove: () => void }) {
    return <div className="grid gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-2 lg:grid-cols-[1fr_1fr_150px_1fr_auto]"><Input value={binding.bindingName} readOnly={readOnly} placeholder="binding" onChange={(event) => onChange({ ...binding, bindingName: event.target.value })} /><Input value={binding.artifactType} readOnly={readOnly} placeholder="artifact_type" onChange={(event) => onChange({ ...binding, artifactType: event.target.value })} /><Select value={binding.source} disabled={readOnly} options={[{ value: "workflow_input", label: "工作流输入" }, { value: "node_output", label: "节点输出" }]} onChange={(source) => onChange(source === "workflow_input" ? { ...binding, source, workflowInputName: binding.workflowInputName || binding.bindingName, fromNodeKey: undefined, fromOutputBinding: undefined } : { ...binding, source, workflowInputName: undefined, fromNodeKey: dependencies[0]?.nodeKey || "", fromOutputBinding: "output" })} />{binding.source === "workflow_input" ? <Input value={binding.workflowInputName} readOnly={readOnly} placeholder="输入名" onChange={(event) => onChange({ ...binding, workflowInputName: event.target.value })} /> : <Select value={binding.fromNodeKey} disabled={readOnly} options={dependencies.map((node) => ({ value: node.nodeKey, label: node.name }))} onChange={(fromNodeKey) => onChange({ ...binding, fromNodeKey })} />}<Button danger type="text" aria-label="移除输入" icon={<Trash2 className="size-4" />} disabled={readOnly} onClick={onRemove} /></div>;
}

function parseConditionValue(value: string): unknown {
    try { return JSON.parse(value); } catch { return value; }
}

function versionStatusLabel(status: "draft" | "published" | "retired") {
    return status === "draft" ? "草稿" : status === "published" ? "已发布" : "已退役";
}

function shortHash(hash: string) {
    return hash ? `${hash.slice(0, 16)}…` : "待计算";
}
