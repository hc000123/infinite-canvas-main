"use client";

import { AppstoreOutlined, CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined, FileAddOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SafetyCertificateOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Checkbox, Empty, Flex, Input, Modal, Segmented, Select, Skeleton, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
    archiveAdminSkillVersion,
    createAdminSkill,
    createAdminSkillVersion,
    deleteAdminSkillVersion,
    evaluateAdminSkillVersion,
    fetchAdminSkills,
    fetchAdminSkillVersion,
    publishAdminSkillVersion,
    recommendAdminSkillVersion,
    updateAdminSkill,
    updateAdminSkillVersion,
    updateAdminWorkflowStageSkillBinding,
    validateAdminSkillVersion,
    type SkillEvaluationResult,
    type SkillOwnerType,
    type SkillPackage,
    type SkillVersion,
} from "@/services/api/admin-skills";
import { useUserStore } from "@/stores/use-user-store";
import { SkillEditor } from "./components/skill-editor";
import { SkillEvaluationPanel } from "./components/skill-evaluation";
import { canPublishSkill, filterSkillItems, latestPassingEvaluation, nextDraftVersion, resolveRecommendationLabel, shortSkillHash, type SkillFilter } from "./skill-view";

const initialFilters: SkillFilter = { search: "", capability: "", inputArtifactType: "", outputArtifactType: "", projectTag: "", ownerType: "" };

function newSkillPackage(capability = "custom.general", inputType = "source_text", outputType = "structured_result"): SkillPackage {
    return {
        manifest: { capabilities: [capability], inputArtifactTypes: [inputType], outputArtifactTypes: [outputType], projectTags: [], schemaCompatibility: { [inputType]: ">=1.0 <2.0" }, sideEffects: ["none"], estimatedCostClass: "text_low" },
        files: { "SKILL.md": "# 目标\n\n说明输入、判断顺序、输出结构与禁止事项。" },
        inputContract: { requiredInputs: [], imagePolicy: { required: false, min: 0, max: 9, allowTextFallback: true, allowedTypes: ["image/png", "image/jpeg", "image/webp"] } },
        outputContract: { schemaVersion: "1.0.0", schema: { type: "object", additionalProperties: true } },
        qualityGateProfile: ["schema"],
        contentHash: "",
    };
}

export default function AdminSkillsPage() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [filters, setFilters] = useState(initialFilters);
    const [activeSkillId, setActiveSkillId] = useState("");
    const [activeVersionId, setActiveVersionId] = useState("");
    const [editorValue, setEditorValue] = useState<SkillPackage>(() => newSkillPackage());
    const [evaluationResult, setEvaluationResult] = useState<SkillEvaluationResult>();
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", summary: "", ownerType: "project" as SkillOwnerType, ownerProjectId: "", version: "1.0.0", capability: "custom.general", inputArtifactType: "source_text", outputArtifactType: "structured_result" });
    const [definitionOpen, setDefinitionOpen] = useState(false);
    const [definitionForm, setDefinitionForm] = useState({ name: "", summary: "" });
    const [showArchivedVersions, setShowArchivedVersions] = useState(false);
    const [evaluationOpen, setEvaluationOpen] = useState(false);
    const [evaluationForm, setEvaluationForm] = useState({ workflowRunId: "", sourceAgentRunId: "", baselineVersionId: "", confirmApiCost: false });
    const [bindingOpen, setBindingOpen] = useState(false);
    const [bindingForm, setBindingForm] = useState({ scope: "project" as "global" | "project", scopeId: "" });

    const skillsQuery = useQuery({ queryKey: ["admin", "skills", token], queryFn: () => fetchAdminSkills(token), enabled: Boolean(token), retry: false });
    const allItems = skillsQuery.data || [];
    const visibleItems = useMemo(() => filterSkillItems(allItems, filters), [allItems, filters]);
    const activeItem = visibleItems.find((item) => item.skill.id === activeSkillId) || visibleItems[0];
    const visibleVersions = useMemo(() => activeItem?.versions.filter((version) => showArchivedVersions || version.status !== "archived") || [], [activeItem, showArchivedVersions]);
    const activeVersion = activeItem?.versions.find((item) => item.id === activeVersionId);
    const detailQuery = useQuery({ queryKey: ["admin", "skill-version", activeVersionId, token], queryFn: () => fetchAdminSkillVersion(token, activeVersionId), enabled: Boolean(token && activeVersionId), retry: false });

    useEffect(() => {
        if (!activeItem) return;
        if (activeSkillId !== activeItem.skill.id) setActiveSkillId(activeItem.skill.id);
    }, [activeItem, activeSkillId]);
    useEffect(() => {
        if (!activeItem || visibleVersions.some((version) => version.id === activeVersionId)) return;
        const draft = visibleVersions.find((version) => version.status === "draft");
        const recommended = visibleVersions.find((version) => version.id === activeItem.skill.recommendedVersionId);
        setActiveVersionId(draft?.id || recommended?.id || visibleVersions[0]?.id || "");
    }, [activeItem, activeVersionId, visibleVersions]);
    useEffect(() => {
        if (!detailQuery.data) return;
        setEditorValue(detailQuery.data.package);
        setEvaluationResult(undefined);
    }, [detailQuery.data]);
    useEffect(() => {
        const error = skillsQuery.error || detailQuery.error;
        if (error) message.error(error instanceof Error ? error.message : "读取 Skill 中心失败");
    }, [detailQuery.error, message, skillsQuery.error]);

    const filterOptions = useMemo(() => {
        const capabilities = new Set<string>();
        const inputs = new Set<string>();
        const outputs = new Set<string>();
        const tags = new Set<string>();
        for (const item of allItems) {
            const manifest = item.recommendedPackage?.manifest;
            manifest?.capabilities.forEach((value) => capabilities.add(value));
            manifest?.inputArtifactTypes.forEach((value) => inputs.add(value));
            manifest?.outputArtifactTypes.forEach((value) => outputs.add(value));
            manifest?.projectTags.forEach((value) => tags.add(value));
        }
        const options = (set: Set<string>) => [...set].sort().map((value) => ({ value, label: value }));
        return { capabilities: options(capabilities), inputs: options(inputs), outputs: options(outputs), tags: options(tags) };
    }, [allItems]);

    const invalidateAll = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["admin", "skills"] }), queryClient.invalidateQueries({ queryKey: ["admin", "skill-version"] })]);
    const mutationError = (error: unknown) => message.error(error instanceof Error ? error.message : "操作失败");
    const createMutation = useMutation({
        mutationFn: () => createAdminSkill(token, { name: createForm.name, summary: createForm.summary, ownerType: createForm.ownerType, ownerProjectId: createForm.ownerProjectId, version: createForm.version, package: newSkillPackage(createForm.capability, createForm.inputArtifactType, createForm.outputArtifactType) }),
        onSuccess: async (result) => { setCreateOpen(false); await invalidateAll(); setActiveSkillId(result.skill.id); setActiveVersionId(result.version.id); message.success("Skill 与首个草稿已创建"); },
        onError: mutationError,
    });
    const definitionMutation = useMutation({ mutationFn: () => updateAdminSkill(token, activeItem!.skill.id, { name: definitionForm.name.trim(), summary: definitionForm.summary.trim() }), onSuccess: async () => { setDefinitionOpen(false); await invalidateAll(); message.success("Skill 名称与说明已更新"); }, onError: mutationError });
    const saveMutation = useMutation({ mutationFn: () => updateAdminSkillVersion(token, activeVersionId, { version: activeVersion?.version || "", package: editorValue }), onSuccess: async () => { await invalidateAll(); message.success("草稿已保存并生成新内容哈希"); }, onError: mutationError });
    const draftMutation = useMutation({
        mutationFn: async () => {
            const item = activeItem!;
            const sourceVersion = activeVersion || item.versions[0];
            const sourcePackage = sourceVersion ? (detailQuery.data?.version.id === sourceVersion.id ? detailQuery.data.package : (await fetchAdminSkillVersion(token, sourceVersion.id)).package) : newSkillPackage();
            return createAdminSkillVersion(token, item.skill.id, { version: nextDraftVersion(sourceVersion?.version), package: { ...sourcePackage, contentHash: "" } });
        },
        onSuccess: async (version) => { await invalidateAll(); setActiveVersionId(version.id); message.success(`已创建草稿 ${version.version}`); },
        onError: mutationError,
    });
    const validateMutation = useMutation({ mutationFn: () => validateAdminSkillVersion(token, activeVersionId), onSuccess: (result) => message.success(`契约校验通过：${shortSkillHash(result.contentHash)}`), onError: mutationError });
    const evaluationMutation = useMutation({ mutationFn: () => evaluateAdminSkillVersion(token, activeVersionId, evaluationForm), onSuccess: async (result) => { setEvaluationResult(result); setEvaluationOpen(false); await queryClient.invalidateQueries({ queryKey: ["admin", "skills"] }); result.evaluation.status === "passed" ? message.success("同输入评测通过") : message.warning("评测未通过，请查看阻断项"); }, onError: mutationError });
    const publishMutation = useMutation({ mutationFn: () => publishAdminSkillVersion(token, activeVersionId), onSuccess: async () => { await invalidateAll(); message.success("不可变版本已发布，推荐版保持不变"); }, onError: mutationError });
    const recommendMutation = useMutation({ mutationFn: () => recommendAdminSkillVersion(token, activeItem!.skill.id, activeVersionId), onSuccess: async () => { await invalidateAll(); message.success("推荐版本已切换"); }, onError: mutationError });
    const deleteVersionMutation = useMutation({ mutationFn: () => deleteAdminSkillVersion(token, activeVersionId), onSuccess: async () => { setActiveVersionId(""); await invalidateAll(); message.success("草稿版本已删除"); }, onError: mutationError });
    const archiveVersionMutation = useMutation({ mutationFn: () => archiveAdminSkillVersion(token, activeVersionId), onSuccess: async () => { setActiveVersionId(""); await invalidateAll(); message.success("已发布版本已停用"); }, onError: mutationError });
    const enabledMutation = useMutation({ mutationFn: (enabled: boolean) => updateAdminSkill(token, activeItem!.skill.id, { enabled }), onSuccess: invalidateAll, onError: mutationError });
    const workflowCapability = detailQuery.data?.package.manifest.capabilities.find((value) => value.startsWith("workflow.stage."));
    const stageKey = workflowCapability?.slice("workflow.stage.".length) || "";
    const bindingMutation = useMutation({ mutationFn: () => updateAdminWorkflowStageSkillBinding(token, stageKey, { ...bindingForm, skillVersionId: activeVersionId }), onSuccess: async () => { setBindingOpen(false); await invalidateAll(); message.success("工作流使用位置已更新"); }, onError: mutationError });

    if (skillsQuery.isLoading) return <main className="p-6"><Skeleton active paragraph={{ rows: 14 }} /></main>;
    const isDirty = Boolean(detailQuery.data && JSON.stringify(editorValue) !== JSON.stringify(detailQuery.data.package));
    const passingEvaluation = activeItem ? latestPassingEvaluation(activeVersion, activeItem.evaluations) : undefined;
    const publishReady = activeVersion && detailQuery.data ? canPublishSkill({ version: activeVersion, packageValue: detailQuery.data.package, evaluations: activeItem?.evaluations || [] }) : false;
    const recommendedVersion = activeItem?.versions.find((version) => version.id === activeItem.skill.recommendedVersionId);
    const recommendationAction = activeVersion?.status === "published" && activeVersion.id !== activeItem?.skill.recommendedVersionId ? (recommendedVersion && activeVersion.createdAt < recommendedVersion.createdAt ? "回滚推荐到此版" : "设为推荐版") : "";
    const openDefinitionEdit = () => { setDefinitionForm({ name: activeItem?.skill.name || "", summary: activeItem?.skill.summary || "" }); setDefinitionOpen(true); };
    const confirmVersionLifecycle = () => {
        if (!activeVersion || activeVersion.status === "archived") return;
        const deleting = activeVersion.status === "draft";
        modal.confirm({
            title: deleting ? `删除草稿 v${activeVersion.version}？` : `停用版本 v${activeVersion.version}？`,
            content: deleting ? "未被引用的草稿会被永久删除。已被工作流引用的草稿无法删除。" : activeVersion.id === activeItem?.skill.recommendedVersionId ? "这是当前推荐版本。停用后系统会取消推荐，请重新选择其他已发布版本。历史运行记录仍会保留。" : "停用后该版本不再出现在可用版本列表中，历史运行记录仍会保留。",
            okText: deleting ? "删除草稿" : "停用版本",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: () => deleting ? deleteVersionMutation.mutateAsync() : archiveVersionMutation.mutateAsync(),
        });
    };

    return (
        <main className="p-6 max-md:p-3">
            <Flex vertical gap={14}>
                <Card className="studio-panel" variant="borderless">
                    <Flex justify="space-between" align="flex-start" gap={18} wrap>
                        <div><Typography.Text className="text-xs font-semibold tracking-[0.18em] text-[var(--studio-accent)]">COMPOSABLE CAPABILITY REGISTRY</Typography.Text><Typography.Title level={2} style={{ margin: "8px 0 4px" }}>Skill 中心</Typography.Title><Typography.Text type="secondary">Skill 独立发布、版本冻结、按能力检索；工作流只是其中一个调用方。</Typography.Text></div>
                        <Space wrap><Tag icon={<SafetyCertificateOutlined />} color="success">发布与推荐分离</Tag><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建 Skill</Button></Space>
                    </Flex>
                    <Space wrap className="mt-5">
                        <Input.Search placeholder="搜索 Skill 名称或说明" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} style={{ width: 230 }} />
                        <Select aria-label="Capability" placeholder="Capability" allowClear options={filterOptions.capabilities} value={filters.capability || undefined} onChange={(capability) => setFilters({ ...filters, capability: capability || "" })} style={{ width: 210 }} />
                        <Select aria-label="输入 Artifact" placeholder="输入 Artifact" allowClear options={filterOptions.inputs} value={filters.inputArtifactType || undefined} onChange={(inputArtifactType) => setFilters({ ...filters, inputArtifactType: inputArtifactType || "" })} style={{ width: 170 }} />
                        <Select aria-label="输出 Artifact" placeholder="输出 Artifact" allowClear options={filterOptions.outputs} value={filters.outputArtifactType || undefined} onChange={(outputArtifactType) => setFilters({ ...filters, outputArtifactType: outputArtifactType || "" })} style={{ width: 170 }} />
                        <Select aria-label="项目标签" placeholder="项目标签" allowClear options={filterOptions.tags} value={filters.projectTag || undefined} onChange={(projectTag) => setFilters({ ...filters, projectTag: projectTag || "" })} style={{ width: 150 }} />
                        <Segmented aria-label="所有者" options={[{ label: "全部", value: "" }, { label: "系统", value: "system" }, { label: "项目", value: "project" }]} value={filters.ownerType} onChange={(ownerType) => setFilters({ ...filters, ownerType: ownerType as SkillFilter["ownerType"] })} />
                    </Space>
                </Card>

                {!activeItem ? <Card className="studio-panel" variant="borderless"><Empty description="没有匹配的 Skill" /></Card> : (
                    <div className="grid grid-cols-[290px_minmax(540px,1fr)_290px] gap-4 max-2xl:grid-cols-[260px_minmax(500px,1fr)] max-xl:grid-cols-1">
                        <Flex vertical gap={12}>
                            <Card className="studio-panel" variant="borderless" title={`注册表 · ${visibleItems.length}`} extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => skillsQuery.refetch()} />}>
                                <Flex vertical gap={8}>{visibleItems.map((item) => <SkillCard key={item.skill.id} item={item} active={item.skill.id === activeItem.skill.id} onClick={() => { setActiveSkillId(item.skill.id); setActiveVersionId(""); }} />)}</Flex>
                            </Card>
                            <Card className="studio-panel" variant="borderless" title="版本轨道" extra={<Space size={6}><Typography.Text type="secondary" className="text-xs">显示已停用</Typography.Text><Switch size="small" checked={showArchivedVersions} onChange={setShowArchivedVersions} /><Button type="text" size="small" icon={<FileAddOutlined />} loading={draftMutation.isPending} onClick={() => draftMutation.mutate()}>新草稿</Button></Space>}>
                                {visibleVersions.length ? <Flex vertical gap={7}>{visibleVersions.map((version) => <VersionButton key={version.id} version={version} active={version.id === activeVersionId} recommended={version.id === activeItem.skill.recommendedVersionId} onClick={() => setActiveVersionId(version.id)} />)}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可见版本，可新建草稿或显示已停用版本" />}
                            </Card>
                        </Flex>

                        <Flex vertical gap={12} style={{ minWidth: 0 }}>
                            <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}>
                                <Flex justify="space-between" align="center" gap={12} wrap><div><Flex gap={8} align="center" wrap><Typography.Title level={4} style={{ margin: 0 }}>{activeItem.skill.name} · v{activeVersion?.version || "-"}</Typography.Title><Button type="text" size="small" icon={<EditOutlined />} onClick={openDefinitionEdit}>编辑名称</Button><Tag color={activeVersion?.status === "draft" ? "warning" : activeVersion?.status === "published" ? "success" : "default"}>{resolveRecommendationLabel(activeItem, activeVersion)}</Tag></Flex><Typography.Text type="secondary">{activeItem.skill.summary}</Typography.Text></div><Space wrap><Button icon={<CheckCircleOutlined />} disabled={!activeVersion || activeVersion.status === "archived"} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>校验</Button><Button icon={<ExperimentOutlined />} disabled={!activeVersion || activeVersion.status === "archived"} onClick={() => setEvaluationOpen(true)}>评测</Button>{activeVersion?.status === "draft" ? <><Button icon={<SaveOutlined />} disabled={!isDirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存草稿</Button><Button type="primary" icon={<CloudUploadOutlined />} disabled={!publishReady} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>发布</Button></> : null}{recommendationAction ? <Button type="primary" onClick={() => recommendMutation.mutate()} loading={recommendMutation.isPending}>{recommendationAction}</Button> : null}{activeVersion?.status === "draft" ? <Button danger icon={<DeleteOutlined />} loading={deleteVersionMutation.isPending} onClick={confirmVersionLifecycle}>删除草稿</Button> : null}{activeVersion?.status === "published" ? <Button danger icon={<StopOutlined />} loading={archiveVersionMutation.isPending} onClick={confirmVersionLifecycle}>停用版本</Button> : null}</Space></Flex>
                            </Card>
                            {detailQuery.isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailQuery.data ? <SkillEditor value={editorValue} readOnly={activeVersion?.status !== "draft"} onChange={setEditorValue} /> : <Empty description="请选择版本" />}
                        </Flex>

                        <Flex vertical gap={12} className="max-2xl:col-span-2 max-xl:col-span-1">
                            <Card className="studio-panel" variant="borderless" title="运行状态">
                                <Flex vertical gap={10}><Flex justify="space-between"><Typography.Text type="secondary">启用</Typography.Text><Switch checked={activeItem.skill.enabled} loading={enabledMutation.isPending} onChange={(enabled) => enabledMutation.mutate(enabled)} /></Flex><Status label="内容哈希" value={shortSkillHash(activeVersion?.contentHash || "")} /><Status label="评测" value={passingEvaluation ? "同哈希已通过" : "暂无通过记录"} /><Status label="推荐版" value={recommendedVersion ? `v${recommendedVersion.version}` : "未设置"} /></Flex>
                            </Card>
                            <SkillEvaluationPanel result={evaluationResult} stored={passingEvaluation} />
                            <Card className="studio-panel" variant="borderless" title="使用位置" extra={stageKey && activeVersion?.status === "published" ? <Button type="text" size="small" icon={<LinkOutlined />} onClick={() => setBindingOpen(true)}>绑定</Button> : null}>
                                {activeItem.bindings.length ? <Flex vertical gap={8}>{activeItem.bindings.map((binding) => <div key={binding.id} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Typography.Text strong>{binding.stageKey}</Typography.Text><Typography.Text type="secondary" className="block text-xs">{binding.scope === "global" ? "全局" : `项目 · ${binding.scopeId}`} · {shortSkillHash(binding.skillVersionId)}</Typography.Text></div>)}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={stageKey ? "尚未绑定工作流；Skill 仍可独立调用" : "非工作流 Skill"} />}
                            </Card>
                        </Flex>
                    </div>
                )}
            </Flex>

            <Modal title="新建 Skill" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createMutation.mutate()} confirmLoading={createMutation.isPending} okButtonProps={{ disabled: !createForm.name.trim() || !createForm.capability.trim() || !createForm.inputArtifactType.trim() || !createForm.outputArtifactType.trim() || (createForm.ownerType === "project" && !createForm.ownerProjectId.trim()) }}>
                <Flex vertical gap={12}><Input placeholder="Skill 名称" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} /><Input.TextArea placeholder="用途与适用范围" value={createForm.summary} onChange={(event) => setCreateForm({ ...createForm, summary: event.target.value })} /><Segmented options={[{ label: "系统", value: "system" }, { label: "项目", value: "project" }]} value={createForm.ownerType} onChange={(ownerType) => setCreateForm({ ...createForm, ownerType: ownerType as SkillOwnerType })} />{createForm.ownerType === "project" ? <Input placeholder="项目 ID" value={createForm.ownerProjectId} onChange={(event) => setCreateForm({ ...createForm, ownerProjectId: event.target.value })} /> : null}<Input addonBefore="版本" value={createForm.version} onChange={(event) => setCreateForm({ ...createForm, version: event.target.value })} /><Input addonBefore="Capability" value={createForm.capability} onChange={(event) => setCreateForm({ ...createForm, capability: event.target.value })} /><Input addonBefore="输入 Artifact" value={createForm.inputArtifactType} onChange={(event) => setCreateForm({ ...createForm, inputArtifactType: event.target.value })} /><Input addonBefore="输出 Artifact" value={createForm.outputArtifactType} onChange={(event) => setCreateForm({ ...createForm, outputArtifactType: event.target.value })} /></Flex>
            </Modal>
            <Modal title="编辑 Skill 名称" open={definitionOpen} onCancel={() => setDefinitionOpen(false)} onOk={() => definitionMutation.mutate()} confirmLoading={definitionMutation.isPending} okButtonProps={{ disabled: !definitionForm.name.trim() }}>
                <Flex vertical gap={12}><Input placeholder="Skill 名称" value={definitionForm.name} onChange={(event) => setDefinitionForm({ ...definitionForm, name: event.target.value })} /><Input.TextArea rows={4} placeholder="用途与适用范围" value={definitionForm.summary} onChange={(event) => setDefinitionForm({ ...definitionForm, summary: event.target.value })} /></Flex>
            </Modal>
            <Modal title="同输入试运行" open={evaluationOpen} onCancel={() => setEvaluationOpen(false)} onOk={() => evaluationMutation.mutate()} confirmLoading={evaluationMutation.isPending} okButtonProps={{ disabled: !evaluationForm.workflowRunId.trim() }}>
                <Flex vertical gap={12}><Input placeholder="工作流 Run ID" value={evaluationForm.workflowRunId} onChange={(event) => setEvaluationForm({ ...evaluationForm, workflowRunId: event.target.value })} /><Input placeholder="图片来源 Agent Run ID（可选）" value={evaluationForm.sourceAgentRunId} onChange={(event) => setEvaluationForm({ ...evaluationForm, sourceAgentRunId: event.target.value })} /><Input placeholder="基线版本 ID（可选）" value={evaluationForm.baselineVersionId} onChange={(event) => setEvaluationForm({ ...evaluationForm, baselineVersionId: event.target.value })} /><Checkbox checked={evaluationForm.confirmApiCost} onChange={(event) => setEvaluationForm({ ...evaluationForm, confirmApiCost: event.target.checked })}>确认 API 评测可能产生费用</Checkbox></Flex>
            </Modal>
            <Modal title={`绑定工作流阶段 · ${stageKey}`} open={bindingOpen} onCancel={() => setBindingOpen(false)} onOk={() => bindingMutation.mutate()} confirmLoading={bindingMutation.isPending} okButtonProps={{ disabled: bindingForm.scope === "project" && !bindingForm.scopeId.trim() }}>
                <Flex vertical gap={12}><Segmented options={[{ label: "项目灰度", value: "project" }, { label: "全局", value: "global" }]} value={bindingForm.scope} onChange={(scope) => setBindingForm({ ...bindingForm, scope: scope as "global" | "project" })} />{bindingForm.scope === "project" ? <Input placeholder="项目 ID" value={bindingForm.scopeId} onChange={(event) => setBindingForm({ ...bindingForm, scopeId: event.target.value })} /> : <Typography.Text type="secondary">全局绑定前必须存在通过评测的项目灰度绑定。</Typography.Text>}</Flex>
            </Modal>
        </main>
    );
}

function SkillCard({ item, active, onClick }: { item: ReturnType<typeof filterSkillItems>[number]; active: boolean; onClick: () => void }) {
    const manifest = item.recommendedPackage?.manifest;
    return <button type="button" onClick={onClick} className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}><Flex justify="space-between" gap={8}><Typography.Text strong>{item.skill.name}</Typography.Text><Tag>{item.skill.ownerType === "system" ? "系统" : "项目"}</Tag></Flex><Typography.Text type="secondary" className="mt-1 block line-clamp-2 text-xs">{item.skill.summary}</Typography.Text><Flex gap={4} wrap className="mt-2">{manifest?.capabilities.slice(0, 2).map((value) => <Tag key={value} color="blue">{value}</Tag>)}</Flex><Typography.Text type="secondary" className="mt-2 block text-[11px]">{manifest ? `${manifest.inputArtifactTypes.join(", ")} → ${manifest.outputArtifactTypes.join(", ")}` : "尚未设置推荐版本"}</Typography.Text></button>;
}
function VersionButton({ version, active, recommended, onClick }: { version: SkillVersion; active: boolean; recommended: boolean; onClick: () => void }) { const status = version.status === "draft" ? { color: "warning", label: "草稿" } : version.status === "published" ? { color: "success", label: "已发布" } : { color: "default", label: "已停用" }; return <button type="button" onClick={onClick} className={`w-full rounded-lg border p-3 text-left ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]"}`}><Flex justify="space-between"><Typography.Text strong>v{version.version}</Typography.Text><Tag color={status.color}>{status.label}</Tag></Flex><Flex gap={5} wrap className="mt-2">{recommended ? <Tag color="blue">推荐</Tag> : null}<Typography.Text type="secondary" className="text-xs">{shortSkillHash(version.contentHash)}</Typography.Text></Flex></button>; }
function Status({ label, value }: { label: string; value: string }) { return <Flex justify="space-between" gap={10}><Typography.Text type="secondary">{label}</Typography.Text><Typography.Text>{value}</Typography.Text></Flex>; }
