"use client";

import { ArrowDown, ArrowUp, CheckCircle2, GitBranch, Plus, Save, Send, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Checkbox, Empty, Input, InputNumber, Select, Skeleton, Space, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";

import type { SkillOption } from "@/services/api/admin-skills";
import { createAdminAgentVersion, fetchAdminAgentVersion, publishAdminAgentVersion, recommendAdminAgentVersion, updateAdminAgentVersion, validateAdminAgentVersion } from "@/services/api/admin-agents";
import { createAgentVersion, fetchAgentVersion, publishAgentVersion, recommendAgentVersion, updateAgentVersion, validateAgentVersion, type AgentPackage, type AgentRegistryItem, type AgentSkillRef } from "@/services/api/agent-registry";
import { canManageAgentVersion, rebindAgentSkillRefs, reorderAgentSkillRefs } from "../agent-center-utils";

const mutationMessage = (error: unknown) => (error instanceof Error ? error.message : "操作失败");

export function AgentVersionEditor({ item, projectId, skillOptions, mode = "project", adminToken = "" }: { item?: AgentRegistryItem; projectId: string; skillOptions: SkillOption[]; mode?: "project" | "system-admin"; adminToken?: string }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [activeVersionId, setActiveVersionId] = useState("");
    const [editor, setEditor] = useState<AgentPackage>();

    useEffect(() => {
        if (!item) return;
        const draft = item.versions.find((version) => version.status === "draft");
        setActiveVersionId(draft?.id || item.agent.recommendedVersionId || item.versions[0]?.id || "");
    }, [item]);

    const detailQuery = useQuery({ queryKey: [mode === "system-admin" ? "admin-agent-version" : "agent-version", activeVersionId], queryFn: () => mode === "system-admin" ? fetchAdminAgentVersion(adminToken, activeVersionId) : fetchAgentVersion(activeVersionId), enabled: Boolean(activeVersionId && (mode !== "system-admin" || adminToken)), retry: false });
    useEffect(() => {
        if (detailQuery.data) setEditor(structuredClone(detailQuery.data.package));
    }, [detailQuery.data]);
    useEffect(() => {
        if (detailQuery.error) message.error(mutationMessage(detailQuery.error));
    }, [detailQuery.error, message]);

    const refresh = async () => {
        const registryKey = mode === "system-admin" ? ["admin", "agents"] : ["agent-registry", projectId];
        const versionKey = mode === "system-admin" ? ["admin-agent-version"] : ["agent-version"];
        await Promise.all([queryClient.invalidateQueries({ queryKey: registryKey }), queryClient.invalidateQueries({ queryKey: versionKey })]);
    };
    const draftMutation = useMutation({
        mutationFn: () => {
            const input = { version: nextPatchVersion(detailQuery.data?.version.version || "1.0.0"), package: { ...detailQuery.data!.package, contentHash: "" } };
            return mode === "system-admin" ? createAdminAgentVersion(adminToken, item!.agent.id, input) : createAgentVersion(item!.agent.id, input);
        },
        onSuccess: async (version) => { await refresh(); setActiveVersionId(version.id); message.success(`已创建草稿 v${version.version}`); },
        onError: (error) => message.error(mutationMessage(error)),
    });
    const saveMutation = useMutation({
        mutationFn: () => mode === "system-admin" ? updateAdminAgentVersion(adminToken, activeVersionId, { version: detailQuery.data!.version.version, package: editor! }) : updateAgentVersion(activeVersionId, { version: detailQuery.data!.version.version, package: editor! }),
        onSuccess: async () => { await refresh(); message.success("Agent 草稿已保存"); },
        onError: (error) => message.error(mutationMessage(error)),
    });
    const validateMutation = useMutation({
        mutationFn: () => mode === "system-admin" ? validateAdminAgentVersion(adminToken, activeVersionId) : validateAgentVersion(activeVersionId),
        onSuccess: (result) => message.success(`契约校验通过：${shortHash(result.contentHash)}`),
        onError: (error) => message.error(mutationMessage(error)),
    });
    const publishMutation = useMutation({
        mutationFn: () => mode === "system-admin" ? publishAdminAgentVersion(adminToken, activeVersionId) : publishAgentVersion(activeVersionId),
        onSuccess: async () => { await refresh(); message.success("Agent 版本已发布"); },
        onError: (error) => message.error(mutationMessage(error)),
    });
    const recommendMutation = useMutation({
        mutationFn: () => mode === "system-admin" ? recommendAdminAgentVersion(adminToken, item!.agent.id, activeVersionId) : recommendAgentVersion(item!.agent.id, activeVersionId),
        onSuccess: async () => { await refresh(); message.success(mode === "system-admin" ? "已设为系统推荐版本" : "已设为项目推荐版本"); },
        onError: (error) => message.error(mutationMessage(error)),
    });

    if (!item) return <section className="studio-panel grid min-h-72 place-items-center p-6"><Empty description="请选择 Agent" /></section>;
    if (!detailQuery.data || !editor) return <section className="studio-panel p-5"><Skeleton active paragraph={{ rows: 12 }} /></section>;

    const version = detailQuery.data.version;
    const isSystem = item.agent.ownerType === "system";
    const canManage = canManageAgentVersion({ mode, ownerType: item.agent.ownerType });
    const immutable = version.status !== "draft";
    const readOnly = immutable || !canManage;
    const isDirty = JSON.stringify(editor) !== JSON.stringify(detailQuery.data.package);
    const busy = draftMutation.isPending || saveMutation.isPending || validateMutation.isPending || publishMutation.isPending || recommendMutation.isPending;
    const updateRefs = (refs: AgentSkillRef[]) => setEditor((value) => value ? { ...value, defaultSkillRefs: rebindAgentSkillRefs(refs, skillOptions), executionPolicy: { ...value.executionPolicy, maxSteps: Math.max(refs.length, value.executionPolicy.maxSteps) }, contentHash: "" } : value);
    const skillSelectOptions = skillOptions.map((option) => ({
        value: option.skillVersionId,
        label: `${option.skillName} · v${option.version} · ${option.manifest.inputArtifactTypes.join("+") || "无输入"} → ${option.manifest.outputArtifactTypes.join("+") || "无输出"}`,
    }));

    return (
        <section className="studio-panel min-w-0 overflow-hidden">
            <header className="border-b border-[var(--studio-border-subtle)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">AGENT DEFINITION</p>
                        <h2 className="mt-2 text-2xl font-semibold">{item.agent.name}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">{item.agent.summary}</p>
                    </div>
                    <Space wrap>
                        <Select aria-label="Agent 版本" value={activeVersionId} onChange={setActiveVersionId} options={item.versions.map((candidate) => ({ value: candidate.id, label: `v${candidate.version} · ${candidate.status === "draft" ? "草稿" : candidate.status === "published" ? "已发布" : "已退役"}` }))} style={{ minWidth: 180 }} />
                        <Tag color={immutable ? "green" : readOnly ? "default" : "gold"}>{immutable ? "不可变版本" : readOnly ? "只读草稿" : "可编辑草稿"}</Tag>
                    </Space>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canManage && immutable ? <Button icon={<Plus className="size-4" />} loading={draftMutation.isPending} onClick={() => draftMutation.mutate()}>基于此版新建草稿</Button> : null}
                    {canManage && !immutable ? <><Button type="primary" icon={<Save className="size-4" />} disabled={!isDirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存草稿</Button><Button icon={<CheckCircle2 className="size-4" />} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>校验契约</Button><Button icon={<Send className="size-4" />} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>发布版本</Button></> : null}
                    {canManage && version.status === "published" && item.agent.recommendedVersionId !== version.id ? <Button loading={recommendMutation.isPending} onClick={() => recommendMutation.mutate()}>设为推荐版</Button> : null}
                    <span className="ml-auto text-xs text-[var(--studio-text-muted)]">内容哈希 {shortHash(version.contentHash)}</span>
                </div>
            </header>

            <div className="space-y-6 p-5">
                <label className="block"><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">岗位职责 / Role Prompt</span><Input.TextArea autoSize={{ minRows: 4, maxRows: 9 }} value={editor.rolePrompt} readOnly={readOnly} onChange={(event) => setEditor({ ...editor, rolePrompt: event.target.value, contentHash: "" })} /></label>

                <div>
                    <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">Skill 调度链</div><div className="mt-1 text-xs text-[var(--studio-text-muted)]">顺序与 Artifact 交接属于 Agent；业务规则仍由各 Skill 版本独立维护。</div></div><Tag icon={<GitBranch className="size-3.5" />}>{editor.defaultSkillRefs.length} 步</Tag></div>
                    <div className="space-y-2">
                        {editor.defaultSkillRefs.map((ref, index) => {
                            const option = skillOptions.find((candidate) => candidate.skillVersionId === ref.skillVersionId);
                            const handoff = ref.inputBindings[0];
                            return (
                                <div key={`${ref.stepKey}-${index}`} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                                    <div className="grid gap-3 lg:grid-cols-[38px_minmax(180px,0.75fr)_minmax(280px,1.25fr)_auto] lg:items-center">
                                        <div className="grid size-8 place-items-center rounded-md bg-[var(--studio-accent-soft)] text-sm font-semibold text-[var(--studio-accent)]">{index + 1}</div>
                                        <Input value={ref.label} readOnly={readOnly} onChange={(event) => updateRefs(editor.defaultSkillRefs.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
                                        <Select showSearch optionFilterProp="label" value={ref.skillVersionId} disabled={readOnly} options={skillSelectOptions} onChange={(skillVersionId) => {
                                            const selected = skillOptions.find((candidate) => candidate.skillVersionId === skillVersionId);
                                            if (!selected) return;
                                            updateRefs(editor.defaultSkillRefs.map((item, itemIndex) => itemIndex === index ? { ...item, skillId: selected.skillId, skillVersionId, capability: selected.manifest.capabilities[0] || "", expectedOutputType: selected.outputBindings[0]?.artifactType || selected.manifest.outputArtifactTypes[0] || "" } : item));
                                        }} />
                                        <Space.Compact>
                                            <Tooltip title="上移"><Button aria-label="上移" icon={<ArrowUp className="size-4" />} disabled={readOnly || index === 0} onClick={() => updateRefs(reorderAgentSkillRefs(editor.defaultSkillRefs, index, index - 1))} /></Tooltip>
                                            <Tooltip title="下移"><Button aria-label="下移" icon={<ArrowDown className="size-4" />} disabled={readOnly || index === editor.defaultSkillRefs.length - 1} onClick={() => updateRefs(reorderAgentSkillRefs(editor.defaultSkillRefs, index, index + 1))} /></Tooltip>
                                            <Tooltip title="移除"><Button aria-label="移除" danger icon={<Trash2 className="size-4" />} disabled={readOnly || editor.defaultSkillRefs.length === 1} onClick={() => updateRefs(editor.defaultSkillRefs.filter((_, itemIndex) => itemIndex !== index))} /></Tooltip>
                                        </Space.Compact>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--studio-text-muted)]"><span>{option?.manifest.inputArtifactTypes.join(" + ") || "无输入"} → {option?.manifest.outputArtifactTypes.join(" + ") || ref.expectedOutputType}</span><span>·</span><span>{handoff ? `${handoff.fromStepKey}.${handoff.fromOutputBinding} → ${handoff.bindingName}` : index === 0 ? "外部来源 Artifact" : "未找到兼容交接"}</span><span>·</span><span>{ref.capability}</span></div>
                                </div>
                            );
                        })}
                    </div>
                    {!readOnly ? <Select className="mt-3 w-full" placeholder="＋ 添加一个已发布 Skill" showSearch optionFilterProp="label" value={undefined} options={skillSelectOptions.filter((option) => !editor.defaultSkillRefs.some((ref) => ref.skillVersionId === option.value))} onChange={(skillVersionId) => {
                        const selected = skillOptions.find((option) => option.skillVersionId === skillVersionId);
                        if (!selected) return;
                        const base = (selected.manifest.capabilities[0] || selected.skillId).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
                        updateRefs([...editor.defaultSkillRefs, { stepKey: `${base}-${editor.defaultSkillRefs.length + 1}`, label: selected.skillName, capability: selected.manifest.capabilities[0] || "", skillId: selected.skillId, skillVersionId: selected.skillVersionId, skillVersionConstraint: "", required: true, inputBindings: [], parameters: {}, expectedOutputType: selected.outputBindings[0]?.artifactType || selected.manifest.outputArtifactTypes[0] || "" }]);
                    }} /> : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">首选模型</span><Input value={editor.modelPolicy.preferredModel} readOnly={readOnly} onChange={(event) => setEditor({ ...editor, modelPolicy: { ...editor.modelPolicy, preferredModel: event.target.value }, contentHash: "" })} placeholder="留空则使用系统默认文本模型" /></label>
                    <label><span className="mb-2 block text-xs font-medium text-[var(--studio-text-muted)]">最大步骤数</span><InputNumber min={editor.defaultSkillRefs.length} max={32} className="w-full" value={editor.executionPolicy.maxSteps} disabled={readOnly} onChange={(value) => setEditor({ ...editor, executionPolicy: { ...editor.executionPolicy, maxSteps: value || editor.defaultSkillRefs.length }, contentHash: "" })} /></label>
                </div>
                <div className="flex flex-wrap gap-5 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-sm"><Checkbox checked={editor.executionPolicy.allowRuntimeSkillOverride} disabled={readOnly} onChange={(event) => setEditor({ ...editor, executionPolicy: { ...editor.executionPolicy, allowRuntimeSkillOverride: event.target.checked }, contentHash: "" })}>运行时允许替换 Skill</Checkbox><Checkbox checked={editor.executionPolicy.allowBatch} disabled={readOnly} onChange={(event) => setEditor({ ...editor, executionPolicy: { ...editor.executionPolicy, allowBatch: event.target.checked }, contentHash: "" })}>允许批处理</Checkbox></div>
                {isSystem && !canManage ? <div className="rounded-lg border border-dashed border-[var(--studio-border-strong)] p-4 text-sm text-[var(--studio-text-secondary)]">系统 Agent 只读。系统版本由管理员在后台 Agent 中心统一维护。</div> : null}
                {busy ? <div className="text-xs text-[var(--studio-text-muted)]">正在同步 Agent Registry…</div> : null}
            </div>
        </section>
    );
}

function nextPatchVersion(version: string) {
    const parts = version.split(".").map(Number);
    return parts.length === 3 && parts.every(Number.isInteger) ? `${parts[0]}.${parts[1]}.${parts[2] + 1}` : "1.0.0";
}

function shortHash(hash: string) {
    return hash ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : "尚未生成";
}
