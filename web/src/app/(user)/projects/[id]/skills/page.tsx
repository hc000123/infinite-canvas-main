"use client";

import { CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined, FileAddOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Checkbox, Empty, Flex, Input, Modal, Popconfirm, Segmented, Skeleton, Space, Spin, Switch, Tag, Typography } from "antd";
import { Copy, Library, Workflow } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SkillAdminItem, SkillEvaluationResult, SkillPackage, SkillVersion } from "@/services/api/admin-skills";
import {
    archiveProjectSkillVersion,
    copySystemSkillToProject,
    createProjectSkill,
    createProjectSkillVersion,
    deleteProjectSkill,
    deleteProjectSkillVersion,
    evaluateProjectSkillVersion,
    fetchProjectSkills,
    fetchProjectSkillVersion,
    publishProjectSkillVersion,
    recommendProjectSkillVersion,
    updateProjectSkill,
    updateProjectSkillVersion,
    validateProjectSkillVersion,
} from "@/services/api/project-skills";
import { useUserStore } from "@/stores/use-user-store";
import { useCreativeProjectStore } from "../../use-creative-project-store";
import { ProjectSkillEditor } from "./components/project-skill-editor";

const emptyPackage = (capability = "custom.general", inputType = "source_text", outputType = "structured_result"): SkillPackage => ({
    manifest: { capabilities: [capability], inputArtifactTypes: [inputType], outputArtifactTypes: [outputType], projectTags: [], schemaCompatibility: { [inputType]: ">=1.0 <2.0" }, sideEffects: ["none"], estimatedCostClass: "text_low" },
    files: { "SKILL.md": "# 目标\n\n说明输入、判断顺序、输出结构与禁止事项。" },
    inputContract: { requiredInputs: [], imagePolicy: { required: false, min: 0, max: 9, allowTextFallback: true, allowedTypes: ["image/png", "image/jpeg", "image/webp"] } },
    outputContract: { schemaVersion: "1.0.0", schema: { type: "object", additionalProperties: true } },
    qualityGateProfile: ["schema"],
    contentHash: "",
});

const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失败";

export default function ProjectSkillsPage() {
    const params = useParams<{ id: string }>();
    const projectId = params.id;
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const hydrated = useCreativeProjectStore((state) => state.hydrated);
    const project = useCreativeProjectStore((state) => state.projects.find((item) => item.id === projectId));
    const [search, setSearch] = useState("");
    const [ownerFilter, setOwnerFilter] = useState<"" | "system" | "project">("");
    const [activeSkillId, setActiveSkillId] = useState("");
    const [activeVersionId, setActiveVersionId] = useState("");
    const [editorValue, setEditorValue] = useState<SkillPackage>(() => emptyPackage());
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", summary: "", version: "1.0.0", capability: "custom.general", inputType: "source_text", outputType: "structured_result" });
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyForm, setCopyForm] = useState({ name: "", version: "1.0.0" });
    const [definitionOpen, setDefinitionOpen] = useState(false);
    const [definitionForm, setDefinitionForm] = useState({ name: "", summary: "" });
    const [evaluationOpen, setEvaluationOpen] = useState(false);
    const [evaluationForm, setEvaluationForm] = useState({ workflowRunId: "", sourceAgentRunId: "", baselineVersionId: "", confirmApiCost: false });
    const [evaluationResult, setEvaluationResult] = useState<SkillEvaluationResult>();

    const skillsQuery = useQuery({ queryKey: ["project-skills", projectId, token], queryFn: () => fetchProjectSkills(token, projectId), enabled: hydrated && Boolean(project && token), retry: false });
    const items = useMemo(() => (skillsQuery.data || []).filter((item) => {
        const text = search.trim().toLowerCase();
        return (!ownerFilter || item.skill.ownerType === ownerFilter) && (!text || `${item.skill.name} ${item.skill.summary}`.toLowerCase().includes(text));
    }).sort((left, right) => left.skill.ownerType.localeCompare(right.skill.ownerType) || left.skill.name.localeCompare(right.skill.name, "zh-CN")), [ownerFilter, search, skillsQuery.data]);
    const activeItem = items.find((item) => item.skill.id === activeSkillId) || items[0];
    const activeVersion = activeItem?.versions.find((version) => version.id === activeVersionId);
    const editable = activeItem?.skill.ownerType === "project";
    const detailQuery = useQuery({ queryKey: ["project-skill-version", activeVersionId, token], queryFn: () => fetchProjectSkillVersion(token, activeVersionId), enabled: Boolean(token && activeVersionId), retry: false });

    useEffect(() => { if (activeItem && activeItem.skill.id !== activeSkillId) setActiveSkillId(activeItem.skill.id); }, [activeItem, activeSkillId]);
    useEffect(() => {
        if (!activeItem || activeItem.versions.some((version) => version.id === activeVersionId)) return;
        setActiveVersionId(activeItem.versions.find((version) => version.status === "draft")?.id || activeItem.skill.recommendedVersionId || activeItem.versions[0]?.id || "");
    }, [activeItem, activeVersionId]);
    useEffect(() => { if (detailQuery.data) { setEditorValue(detailQuery.data.package); setEvaluationResult(undefined); } }, [detailQuery.data]);
    useEffect(() => { const error = skillsQuery.error || detailQuery.error; if (error) message.error(errorText(error)); }, [detailQuery.error, message, skillsQuery.error]);

    const invalidate = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-skills", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-skill-version"] }),
        queryClient.invalidateQueries({ queryKey: ["skill-options", projectId] }),
    ]);
    const mutationError = (error: unknown) => message.error(errorText(error));
    const createMutation = useMutation({ mutationFn: () => createProjectSkill(token, { projectId, name: createForm.name, summary: createForm.summary, version: createForm.version, package: emptyPackage(createForm.capability, createForm.inputType, createForm.outputType) }), onSuccess: async (result) => { setCreateOpen(false); await invalidate(); setActiveSkillId(result.skill.id); setActiveVersionId(result.version.id); message.success("项目 Skill 草稿已创建"); }, onError: mutationError });
    const copyMutation = useMutation({ mutationFn: () => copySystemSkillToProject(token, activeItem!.skill.id, { projectId, ...copyForm }), onSuccess: async (result) => { setCopyOpen(false); await invalidate(); setOwnerFilter(""); setActiveSkillId(result.skill.id); setActiveVersionId(result.version.id); message.success("已复制为独立的项目 Skill 草稿"); }, onError: mutationError });
    const saveMutation = useMutation({ mutationFn: () => updateProjectSkillVersion(token, activeVersionId, { version: activeVersion!.version, package: editorValue }), onSuccess: async () => { await invalidate(); message.success("草稿已保存，内容哈希已更新"); }, onError: mutationError });
    const draftMutation = useMutation({ mutationFn: () => createProjectSkillVersion(token, activeItem!.skill.id, { version: nextPatch(activeVersion?.version || "1.0.0"), package: { ...editorValue, contentHash: "" } }), onSuccess: async (version) => { await invalidate(); setActiveVersionId(version.id); message.success(`已创建草稿 v${version.version}`); }, onError: mutationError });
    const validateMutation = useMutation({ mutationFn: () => validateProjectSkillVersion(token, activeVersionId), onSuccess: (result) => message.success(`契约校验通过：${shortHash(result.contentHash)}`), onError: mutationError });
    const evaluationMutation = useMutation({ mutationFn: () => evaluateProjectSkillVersion(token, activeVersionId, evaluationForm), onSuccess: async (result) => { setEvaluationResult(result); setEvaluationOpen(false); await invalidate(); result.evaluation.status === "passed" ? message.success("同输入评测通过") : message.warning("评测未通过，请查看结果"); }, onError: mutationError });
    const publishMutation = useMutation({ mutationFn: () => publishProjectSkillVersion(token, activeVersionId), onSuccess: async () => { await invalidate(); message.success("不可变版本已发布，运行中的引用不会变化"); }, onError: mutationError });
    const recommendMutation = useMutation({ mutationFn: () => recommendProjectSkillVersion(token, activeItem!.skill.id, activeVersionId), onSuccess: async () => { await invalidate(); message.success("推荐版本已切换，仅影响之后开始的运行"); }, onError: mutationError });
    const archiveMutation = useMutation({ mutationFn: () => archiveProjectSkillVersion(token, activeVersionId), onSuccess: async () => { await invalidate(); message.success("版本已归档"); }, onError: mutationError });
    const enabledMutation = useMutation({ mutationFn: (enabled: boolean) => updateProjectSkill(token, activeItem!.skill.id, { enabled }), onSuccess: invalidate, onError: mutationError });
    const definitionMutation = useMutation({ mutationFn: () => updateProjectSkill(token, activeItem!.skill.id, definitionForm), onSuccess: async () => { setDefinitionOpen(false); await invalidate(); message.success("Skill 资料已更新"); }, onError: mutationError });
    const deleteVersionMutation = useMutation({ mutationFn: () => deleteProjectSkillVersion(token, activeVersionId), onSuccess: async () => { setActiveVersionId(""); await invalidate(); message.success("未引用草稿已删除"); }, onError: mutationError });
    const deleteSkillMutation = useMutation({ mutationFn: () => deleteProjectSkill(token, activeItem!.skill.id), onSuccess: async () => { setActiveSkillId(""); setActiveVersionId(""); await invalidate(); message.success("从未发布的 Skill 已删除"); }, onError: mutationError });

    if (!hydrated) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description="正在读取本地项目" /></main>;
    if (!project) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Empty description="项目不存在或尚未加载"><Button href="/projects">返回项目中心</Button></Empty></main>;

    const dirty = Boolean(detailQuery.data && JSON.stringify(editorValue) !== JSON.stringify(detailQuery.data.package));
    const recommended = activeItem?.versions.find((version) => version.id === activeItem.skill.recommendedVersionId);

    return <main className="studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
        <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-5 px-5 py-7 lg:px-8">
            <header className="border-b border-[var(--studio-border-subtle)] pb-5">
                <Link href={`/projects/${projectId}/workflows`} className="text-xs text-[var(--studio-text-muted)] transition hover:text-[var(--studio-accent)]">{project.title} · Workflow 中心</Link>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><Library className="size-6 text-[var(--studio-accent)]" /><h1 className="text-3xl font-semibold">Skill 管理</h1></div><p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--studio-text-secondary)]">System Skill 是可复制的只读模板；Project Skill 独立演进。发布和推荐分离，Workflow、画布 Agent 与 API 共用同一版本注册表。</p></div><Space wrap><Button type="text" icon={<Workflow className="size-4" />} href={`/projects/${projectId}/workflows`}>Workflow</Button><Button type="primary" onClick={() => setCreateOpen(true)}>新建项目 Skill</Button></Space></div>
            </header>

            <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}><Flex gap={10} wrap><Input.Search placeholder="搜索 Skill" value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 240 }} /><Segmented options={[{ label: "全部", value: "" }, { label: "System", value: "system" }, { label: "Project", value: "project" }]} value={ownerFilter} onChange={(value) => setOwnerFilter(value as typeof ownerFilter)} /><Button type="text" icon={<ReloadOutlined />} onClick={() => skillsQuery.refetch()}>刷新</Button></Flex></Card>

            {skillsQuery.isLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : !activeItem ? <Card className="studio-panel" variant="borderless"><Empty description="没有匹配的 Skill" /></Card> : <div className="grid grid-cols-[290px_minmax(560px,1fr)_280px] items-start gap-4 max-2xl:grid-cols-[260px_minmax(520px,1fr)] max-xl:grid-cols-1">
                <Flex vertical gap={12}>
                    <Card className="studio-panel" variant="borderless" title={`注册表 · ${items.length}`}><Flex vertical gap={8}>{items.map((item) => <SkillCard key={item.skill.id} item={item} active={item.skill.id === activeItem.skill.id} onClick={() => { setActiveSkillId(item.skill.id); setActiveVersionId(""); }} />)}</Flex></Card>
                    <Card className="studio-panel" variant="borderless" title="版本轨道" extra={editable ? <Button type="text" size="small" icon={<FileAddOutlined />} disabled={!detailQuery.data} loading={draftMutation.isPending} onClick={() => draftMutation.mutate()}>新草稿</Button> : null}><Flex vertical gap={7}>{activeItem.versions.map((version) => <VersionButton key={version.id} version={version} active={version.id === activeVersionId} recommended={version.id === activeItem.skill.recommendedVersionId} onClick={() => setActiveVersionId(version.id)} />)}</Flex></Card>
                </Flex>

                <Flex vertical gap={12} style={{ minWidth: 0 }}>
                    <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}><Flex justify="space-between" align="center" gap={12} wrap><div><Flex gap={8} align="center" wrap><Typography.Title level={4} style={{ margin: 0 }}>{activeItem.skill.name} · v{activeVersion?.version || "-"}</Typography.Title><Tag color={activeItem.skill.ownerType === "system" ? "default" : "blue"}>{activeItem.skill.ownerType === "system" ? "System 只读" : "Project"}</Tag><StatusTag version={activeVersion} recommended={activeVersion?.id === activeItem.skill.recommendedVersionId} /></Flex><Typography.Text type="secondary">{activeItem.skill.summary}</Typography.Text></div><Space wrap>{editable ? <><Button icon={<EditOutlined />} onClick={() => { setDefinitionForm({ name: activeItem.skill.name, summary: activeItem.skill.summary }); setDefinitionOpen(true); }}>资料</Button><Button icon={<CheckCircleOutlined />} disabled={!activeVersion} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>校验</Button><Button icon={<ExperimentOutlined />} disabled={!activeVersion} onClick={() => setEvaluationOpen(true)}>评测</Button>{activeVersion?.status === "draft" ? <><Button icon={<SaveOutlined />} disabled={!dirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存</Button><Button type="primary" icon={<CloudUploadOutlined />} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>发布</Button></> : null}{activeVersion?.status === "published" && activeVersion.id !== activeItem.skill.recommendedVersionId ? <Button type="primary" onClick={() => recommendMutation.mutate()} loading={recommendMutation.isPending}>设为推荐版</Button> : null}</> : <Button type="primary" icon={<Copy className="size-4" />} onClick={() => { setCopyForm({ name: `${activeItem.skill.name}（项目版）`, version: "1.0.0" }); setCopyOpen(true); }}>复制到项目</Button>}</Space></Flex></Card>
                    {detailQuery.isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailQuery.data ? <ProjectSkillEditor value={editorValue} readOnly={!editable || activeVersion?.status !== "draft"} onChange={setEditorValue} /> : <Empty description="请选择版本" />}
                </Flex>

                <Flex vertical gap={12} className="max-2xl:col-span-2 max-xl:col-span-1">
                    <Card className="studio-panel" variant="borderless" title="生命周期"><Flex vertical gap={10}>{editable ? <Flex justify="space-between"><Typography.Text type="secondary">启用</Typography.Text><Switch checked={activeItem.skill.enabled} loading={enabledMutation.isPending} onChange={(value) => enabledMutation.mutate(value)} /></Flex> : null}<Status label="内容哈希" value={shortHash(activeVersion?.contentHash || "")} /><Status label="推荐版本" value={recommended ? `v${recommended.version}` : "未设置"} /><Status label="当前状态" value={statusLabel(activeVersion?.status)} />{editable && activeVersion?.status === "published" ? <Popconfirm title="归档这个版本？" description="已有运行引用仍会保留，之后不可再作为新选择。" onConfirm={() => archiveMutation.mutate()}><Button danger type="text" loading={archiveMutation.isPending}>归档当前版本</Button></Popconfirm> : null}{editable && activeVersion?.status === "draft" ? <Popconfirm title="删除这个草稿？" description="只有未被引用的草稿可以删除。" onConfirm={() => deleteVersionMutation.mutate()}><Button danger type="text" icon={<DeleteOutlined />} loading={deleteVersionMutation.isPending}>删除当前草稿</Button></Popconfirm> : null}{editable ? <Popconfirm title="删除整个 Skill？" description="只有从未发布、没有引用的 Skill 才能删除。" onConfirm={() => deleteSkillMutation.mutate()}><Button danger type="text" icon={<DeleteOutlined />} loading={deleteSkillMutation.isPending}>删除 Skill</Button></Popconfirm> : null}</Flex></Card>
                    <Card className="studio-panel" variant="borderless" title="评测结果">{evaluationResult ? <Flex vertical gap={8}><Tag color={evaluationResult.evaluation.status === "passed" ? "success" : "error"}>{evaluationResult.evaluation.status === "passed" ? "通过" : "未通过"}</Tag><Status label="输入图片" value={`${evaluationResult.imageCount}`} /><Status label="耗时" value={`${evaluationResult.evaluation.durationMs} ms`} />{evaluationResult.evaluation.errorMessage ? <Typography.Text type="danger">{evaluationResult.evaluation.errorMessage}</Typography.Text> : null}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前会话暂无评测" />}</Card>
                </Flex>
            </div>}
        </div>

        <Modal title="新建项目 Skill" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createMutation.mutate()} confirmLoading={createMutation.isPending} okButtonProps={{ disabled: !createForm.name.trim() || !createForm.capability.trim() || !createForm.inputType.trim() || !createForm.outputType.trim() }}><Flex vertical gap={12}><Input placeholder="Skill 名称" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} /><Input.TextArea placeholder="用途与适用范围" value={createForm.summary} onChange={(event) => setCreateForm({ ...createForm, summary: event.target.value })} /><Input addonBefore="版本" value={createForm.version} onChange={(event) => setCreateForm({ ...createForm, version: event.target.value })} /><Input addonBefore="Capability" value={createForm.capability} onChange={(event) => setCreateForm({ ...createForm, capability: event.target.value })} /><Input addonBefore="输入 Artifact" value={createForm.inputType} onChange={(event) => setCreateForm({ ...createForm, inputType: event.target.value })} /><Input addonBefore="输出 Artifact" value={createForm.outputType} onChange={(event) => setCreateForm({ ...createForm, outputType: event.target.value })} /></Flex></Modal>
        <Modal title="复制为项目 Skill" open={copyOpen} onCancel={() => setCopyOpen(false)} onOk={() => copyMutation.mutate()} confirmLoading={copyMutation.isPending} okButtonProps={{ disabled: !copyForm.name.trim() || !copyForm.version.trim() }}><Flex vertical gap={12}><Typography.Text type="secondary">复制推荐版本后会形成独立草稿，之后修改不会影响 System Skill。</Typography.Text><Input addonBefore="名称" value={copyForm.name} onChange={(event) => setCopyForm({ ...copyForm, name: event.target.value })} /><Input addonBefore="首个版本" value={copyForm.version} onChange={(event) => setCopyForm({ ...copyForm, version: event.target.value })} /></Flex></Modal>
        <Modal title="编辑 Skill 资料" open={definitionOpen} onCancel={() => setDefinitionOpen(false)} onOk={() => definitionMutation.mutate()} confirmLoading={definitionMutation.isPending} okButtonProps={{ disabled: !definitionForm.name.trim() }}><Flex vertical gap={12}><Input placeholder="Skill 名称" value={definitionForm.name} onChange={(event) => setDefinitionForm({ ...definitionForm, name: event.target.value })} /><Input.TextArea placeholder="用途与适用范围" value={definitionForm.summary} onChange={(event) => setDefinitionForm({ ...definitionForm, summary: event.target.value })} /></Flex></Modal>
        <Modal title="同输入试运行" open={evaluationOpen} onCancel={() => setEvaluationOpen(false)} onOk={() => evaluationMutation.mutate()} confirmLoading={evaluationMutation.isPending} okButtonProps={{ disabled: !evaluationForm.workflowRunId.trim() }}><Flex vertical gap={12}><Input placeholder="Workflow Run ID" value={evaluationForm.workflowRunId} onChange={(event) => setEvaluationForm({ ...evaluationForm, workflowRunId: event.target.value })} /><Input placeholder="图片来源 Agent Run ID（可选）" value={evaluationForm.sourceAgentRunId} onChange={(event) => setEvaluationForm({ ...evaluationForm, sourceAgentRunId: event.target.value })} /><Input placeholder="基线版本 ID（可选）" value={evaluationForm.baselineVersionId} onChange={(event) => setEvaluationForm({ ...evaluationForm, baselineVersionId: event.target.value })} /><Checkbox checked={evaluationForm.confirmApiCost} onChange={(event) => setEvaluationForm({ ...evaluationForm, confirmApiCost: event.target.checked })}>确认评测可能产生 API 费用</Checkbox></Flex></Modal>
    </main>;
}

function SkillCard({ item, active, onClick }: { item: SkillAdminItem; active: boolean; onClick: () => void }) {
    const manifest = item.recommendedPackage?.manifest;
    return <button type="button" onClick={onClick} className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}><Flex justify="space-between" gap={8}><Typography.Text strong>{item.skill.name}</Typography.Text><Tag>{item.skill.ownerType === "system" ? "System" : "Project"}</Tag></Flex><Typography.Text type="secondary" className="mt-1 block line-clamp-2 text-xs">{item.skill.summary}</Typography.Text><Flex gap={4} wrap className="mt-2">{manifest?.capabilities.slice(0, 2).map((value) => <Tag key={value} color="blue">{value}</Tag>)}</Flex><Typography.Text type="secondary" className="mt-2 block text-[11px]">{manifest ? `${manifest.inputArtifactTypes.join(", ")} → ${manifest.outputArtifactTypes.join(", ")}` : "尚未设置推荐版本"}</Typography.Text></button>;
}

function VersionButton({ version, active, recommended, onClick }: { version: SkillVersion; active: boolean; recommended: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`w-full rounded-lg border p-3 text-left ${active ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]"}`}><Flex justify="space-between"><Typography.Text strong>v{version.version}</Typography.Text><Tag color={version.status === "draft" ? "warning" : version.status === "published" ? "success" : "default"}>{statusLabel(version.status)}</Tag></Flex><Flex gap={5} wrap className="mt-2">{recommended ? <Tag color="blue">推荐</Tag> : null}<Typography.Text type="secondary" className="text-xs">{shortHash(version.contentHash)}</Typography.Text></Flex></button>; }
function StatusTag({ version, recommended }: { version?: SkillVersion; recommended: boolean }) { return <Tag color={version?.status === "draft" ? "warning" : version?.status === "published" ? "success" : "default"}>{recommended ? "当前推荐版" : statusLabel(version?.status)}</Tag>; }
function Status({ label, value }: { label: string; value: string }) { return <Flex justify="space-between" gap={10}><Typography.Text type="secondary">{label}</Typography.Text><Typography.Text>{value}</Typography.Text></Flex>; }
function statusLabel(status?: SkillVersion["status"]) { return status === "draft" ? "草稿" : status === "published" ? "已发布" : status === "archived" ? "已归档" : "未选择"; }
function shortHash(value: string) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : "未生成"; }
function nextPatch(value: string) { const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/); return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : "1.0.1"; }
