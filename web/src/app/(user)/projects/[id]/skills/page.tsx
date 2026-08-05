"use client";

import { CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined, FileAddOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Collapse, Empty, Flex, Input, Modal, Popconfirm, Segmented, Skeleton, Space, Spin, Switch, Tag, Typography } from "antd";
import { Copy, Library, Workflow } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SkillAdminItem, SkillPackage, SkillVersion } from "@/services/api/admin-skills";
import { SkillFolderImport } from "@/components/skills/skill-folder-import";
import { SkillSourceBrowser } from "@/components/skills/skill-source-browser";
import { SkillTrialPanel } from "@/components/skills/skill-trial-panel";
import {
    archiveProjectSkillVersion,
    copySystemSkillToProject,
    deleteProjectSkill,
    deleteProjectSkillVersion,
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
    inputContract: { requiredInputs: [], artifactInputs: [], imagePolicy: { required: false, min: 0, max: 9, allowTextFallback: true, allowedTypes: ["image/png", "image/jpeg", "image/webp"] } },
    outputContract: { schemaVersion: "1.0.0", schema: { type: "object", additionalProperties: true }, artifactOutputs: [] },
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
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyForm, setCopyForm] = useState({ name: "", version: "1.0.0" });
    const [definitionOpen, setDefinitionOpen] = useState(false);
    const [definitionForm, setDefinitionForm] = useState({ name: "", summary: "" });
    const [folderImportMode, setFolderImportMode] = useState<"new" | "version" | "">("");
    const [trialOpen, setTrialOpen] = useState(false);

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
    useEffect(() => { if (detailQuery.data) setEditorValue(detailQuery.data.package); }, [detailQuery.data]);
    useEffect(() => { const error = skillsQuery.error || detailQuery.error; if (error) message.error(errorText(error)); }, [detailQuery.error, message, skillsQuery.error]);

    const invalidate = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-skills", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project-skill-version"] }),
        queryClient.invalidateQueries({ queryKey: ["skill-options", projectId] }),
    ]);
    const mutationError = (error: unknown) => message.error(errorText(error));
    const copyMutation = useMutation({ mutationFn: () => copySystemSkillToProject(token, activeItem!.skill.id, { projectId, ...copyForm }), onSuccess: async (result) => { setCopyOpen(false); await invalidate(); setOwnerFilter(""); setActiveSkillId(result.skill.id); setActiveVersionId(result.version.id); message.success("已复制为独立的项目 Skill 草稿"); }, onError: mutationError });
    const saveMutation = useMutation({ mutationFn: () => updateProjectSkillVersion(token, activeVersionId, { version: activeVersion!.version, package: editorValue }), onSuccess: async () => { await invalidate(); message.success("草稿已保存，内容哈希已更新"); }, onError: mutationError });
    const validateMutation = useMutation({ mutationFn: () => validateProjectSkillVersion(token, activeVersionId), onSuccess: (result) => message.success(`契约校验通过：${shortHash(result.contentHash)}`), onError: mutationError });
    const publishMutation = useMutation({ mutationFn: () => publishProjectSkillVersion(token, activeVersionId), onSuccess: async () => { await invalidate(); message.success("不可变版本已发布，运行中的引用不会变化"); }, onError: mutationError });
    const recommendMutation = useMutation({ mutationFn: () => recommendProjectSkillVersion(token, activeItem!.skill.id, activeVersionId), onSuccess: async () => { await invalidate(); message.success("推荐版本已切换，仅影响之后开始的运行"); }, onError: mutationError });
    const archiveMutation = useMutation({ mutationFn: () => archiveProjectSkillVersion(token, activeVersionId), onSuccess: async () => { setActiveVersionId(""); await invalidate(); message.success("版本已归档"); }, onError: mutationError });
    const enabledMutation = useMutation({ mutationFn: (enabled: boolean) => updateProjectSkill(token, activeItem!.skill.id, { enabled }), onSuccess: invalidate, onError: mutationError });
    const definitionMutation = useMutation({ mutationFn: () => updateProjectSkill(token, activeItem!.skill.id, definitionForm), onSuccess: async () => { setDefinitionOpen(false); await invalidate(); message.success("Skill 资料已更新"); }, onError: mutationError });
    const deleteVersionMutation = useMutation({ mutationFn: () => deleteProjectSkillVersion(token, activeVersionId), onSuccess: async () => { setActiveVersionId(""); await invalidate(); message.success("未引用草稿已删除"); }, onError: mutationError });
    const deleteSkillMutation = useMutation({ mutationFn: () => deleteProjectSkill(token, activeItem!.skill.id), onSuccess: async () => { setActiveSkillId(""); setActiveVersionId(""); await invalidate(); message.success("从未发布的 Skill 已删除"); }, onError: mutationError });

    if (!hydrated) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Spin description="正在读取本地项目" /></main>;
    if (!project) return <main className="studio-shell grid h-full place-items-center px-6 py-10 text-[var(--studio-text-primary)]"><Empty description="项目不存在或尚未加载"><Button href="/projects">返回项目中心</Button></Empty></main>;

    const dirty = Boolean(detailQuery.data && JSON.stringify(editorValue) !== JSON.stringify(detailQuery.data.package));
    const recommended = activeItem?.versions.find((version) => version.id === activeItem.skill.recommendedVersionId);
    const passingTrial = activeItem?.evaluations.find((item) => item.skillVersionId === activeVersion?.id && item.contentHash === activeVersion?.contentHash && item.status === "passed");

    return <main className="studio-shell h-full overflow-auto text-[var(--studio-text-primary)]">
        <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-5 px-5 py-7 lg:px-8">
            <header className="border-b border-[var(--studio-border-subtle)] pb-5">
                <Link href={`/projects/${projectId}/workflows`} className="text-xs text-[var(--studio-text-muted)] transition hover:text-[var(--studio-accent)]">{project.title} · Workflow 中心</Link>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><Library className="size-6 text-[var(--studio-accent)]" /><h1 className="text-3xl font-semibold">Skill 管理</h1></div><p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--studio-text-secondary)]">导入完整外部 Skill 文件夹，选择所属阶段后即可独立试跑；通过后由 Workflow、画布、图片与 API 共用同一冻结版本。</p></div><Space wrap><Button type="text" icon={<Workflow className="size-4" />} href={`/projects/${projectId}/workflows`}>Workflow</Button><Button type="primary" onClick={() => setFolderImportMode("new")}>导入项目 Skill 文件夹</Button></Space></div>
            </header>

            <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}><Flex gap={10} wrap><Input.Search placeholder="搜索 Skill" value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 240 }} /><Segmented options={[{ label: "全部", value: "" }, { label: "System", value: "system" }, { label: "Project", value: "project" }]} value={ownerFilter} onChange={(value) => setOwnerFilter(value as typeof ownerFilter)} /><Button type="text" icon={<ReloadOutlined />} onClick={() => skillsQuery.refetch()}>刷新</Button></Flex></Card>

            {skillsQuery.isLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : !activeItem ? <Card className="studio-panel" variant="borderless"><Empty description="没有匹配的 Skill" /></Card> : <div className="grid grid-cols-[290px_minmax(560px,1fr)_280px] items-start gap-4 max-2xl:grid-cols-[260px_minmax(520px,1fr)] max-xl:grid-cols-1">
                <Flex vertical gap={12}>
                    <Card className="studio-panel" variant="borderless" title={`注册表 · ${items.length}`}><Flex vertical gap={8}>{items.map((item) => <SkillCard key={item.skill.id} item={item} active={item.skill.id === activeItem.skill.id} onClick={() => { setActiveSkillId(item.skill.id); setActiveVersionId(""); }} />)}</Flex></Card>
                    <Card className="studio-panel" variant="borderless" title="版本轨道" extra={editable ? <Button type="text" size="small" icon={<FileAddOutlined />} onClick={() => setFolderImportMode("version")}>导入新版本</Button> : null}>{activeItem.versions.length ? <Flex vertical gap={7}>{activeItem.versions.map((version) => <VersionButton key={version.id} version={version} active={version.id === activeVersionId} recommended={version.id === activeItem.skill.recommendedVersionId} onClick={() => setActiveVersionId(version.id)} />)}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无版本，请导入文件夹" />}</Card>
                </Flex>

                <Flex vertical gap={12} style={{ minWidth: 0 }}>
                    <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}><Flex justify="space-between" align="center" gap={12} wrap><div><Flex gap={8} align="center" wrap><Typography.Title level={4} style={{ margin: 0 }}>{activeItem.skill.name} · v{activeVersion?.version || "-"}</Typography.Title><Tag color={activeItem.skill.ownerType === "system" ? "default" : "blue"}>{activeItem.skill.ownerType === "system" ? "System 只读" : "Project"}</Tag><StatusTag version={activeVersion} recommended={activeVersion?.id === activeItem.skill.recommendedVersionId} /></Flex><Typography.Text type="secondary">{activeItem.skill.summary}</Typography.Text></div><Space wrap>{editable ? <><Button icon={<EditOutlined />} onClick={() => { setDefinitionForm({ name: activeItem.skill.name, summary: activeItem.skill.summary }); setDefinitionOpen(true); }}>资料</Button><Button icon={<ExperimentOutlined />} disabled={!activeVersion || activeVersion.status === "archived"} onClick={() => setTrialOpen(true)}>独立试运行</Button>{activeVersion?.status === "draft" ? <Button type="primary" icon={<CloudUploadOutlined />} disabled={!passingTrial} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>设为可用</Button> : null}{activeVersion?.status === "published" && activeVersion.id !== activeItem.skill.recommendedVersionId ? <Button type="primary" onClick={() => recommendMutation.mutate()} loading={recommendMutation.isPending}>设为推荐版</Button> : null}</> : <Button type="primary" icon={<Copy className="size-4" />} onClick={() => { setCopyForm({ name: `${activeItem.skill.name}（项目版）`, version: "1.0.0" }); setCopyOpen(true); }}>复制到项目</Button>}</Space></Flex></Card>
                    {activeVersion?.sourceKind === "folder_import" ? <Card className="studio-panel" variant="borderless" title="导入内容"><SkillSourceBrowser scope="project" token={token} versionId={activeVersion.id} /></Card> : null}
                    {detailQuery.isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : detailQuery.data ? <Collapse items={[{ key: "technical", label: "技术详情与底层契约", children: <><ProjectSkillEditor value={editorValue} readOnly={!editable || activeVersion?.status !== "draft"} onChange={setEditorValue} />{editable && activeVersion?.status === "draft" ? <Flex justify="flex-end" gap={8} className="mt-3"><Button icon={<CheckCircleOutlined />} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>校验契约</Button><Button icon={<SaveOutlined />} disabled={!dirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存底层修改</Button></Flex> : null}</> }]} /> : <Empty description="请选择版本" />}
                </Flex>

                <Flex vertical gap={12} className="max-2xl:col-span-2 max-xl:col-span-1">
                    <Card className="studio-panel" variant="borderless" title="生命周期"><Flex vertical gap={10}>{editable ? <Flex justify="space-between"><Typography.Text type="secondary">启用</Typography.Text><Switch checked={activeItem.skill.enabled} loading={enabledMutation.isPending} onChange={(value) => enabledMutation.mutate(value)} /></Flex> : null}<Status label="内容哈希" value={shortHash(activeVersion?.contentHash || "")} /><Status label="推荐版本" value={recommended ? `v${recommended.version}` : "未设置"} /><Status label="当前状态" value={statusLabel(activeVersion?.status)} />{editable && activeVersion?.status === "published" ? <Popconfirm title="归档这个版本？" description="已有运行引用仍会保留，之后不可再作为新选择。" onConfirm={() => archiveMutation.mutate()}><Button danger type="text" loading={archiveMutation.isPending}>归档当前版本</Button></Popconfirm> : null}{editable && activeVersion?.status === "draft" ? <Popconfirm title="删除这个草稿？" description="只有未被引用的草稿可以删除。" onConfirm={() => deleteVersionMutation.mutate()}><Button danger type="text" icon={<DeleteOutlined />} loading={deleteVersionMutation.isPending}>删除当前草稿</Button></Popconfirm> : null}{editable ? <Popconfirm title="删除整个 Skill？" description="只有从未发布、没有引用的 Skill 才能删除。" onConfirm={() => deleteSkillMutation.mutate()}><Button danger type="text" icon={<DeleteOutlined />} loading={deleteSkillMutation.isPending}>删除 Skill</Button></Popconfirm> : null}</Flex></Card>
                    <Card className="studio-panel" variant="borderless" title="最近试跑">{passingTrial ? <Flex vertical gap={8}><Tag color="success">同内容哈希已通过</Tag><Status label="耗时" value={`${passingTrial.durationMs} ms`} /><Status label="试跑 ID" value={shortHash(passingTrial.id)} /></Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前版本尚未通过试跑" />}</Card>
                </Flex>
            </div>}
        </div>

        <SkillFolderImport open={Boolean(folderImportMode)} token={token} scope="project" projectId={projectId} skillId={folderImportMode === "version" ? activeItem?.skill.id : undefined} previousVersionId={folderImportMode === "version" ? activeVersionId : undefined} onCancel={() => setFolderImportMode("")} onImported={async (skillId, versionId) => { setFolderImportMode(""); await invalidate(); if (skillId) setActiveSkillId(skillId); if (versionId) setActiveVersionId(versionId); }} />
        <SkillTrialPanel open={trialOpen} token={token} scope="project" versionId={activeVersionId} onCancel={() => setTrialOpen(false)} onCompleted={async () => { await invalidate(); }} />
        <Modal title="复制为项目 Skill" open={copyOpen} onCancel={() => setCopyOpen(false)} onOk={() => copyMutation.mutate()} confirmLoading={copyMutation.isPending} okButtonProps={{ disabled: !copyForm.name.trim() || !copyForm.version.trim() }}><Flex vertical gap={12}><Typography.Text type="secondary">复制推荐版本后会形成独立草稿，之后修改不会影响 System Skill。</Typography.Text><Input addonBefore="名称" value={copyForm.name} onChange={(event) => setCopyForm({ ...copyForm, name: event.target.value })} /><Input addonBefore="首个版本" value={copyForm.version} onChange={(event) => setCopyForm({ ...copyForm, version: event.target.value })} /></Flex></Modal>
        <Modal title="编辑 Skill 资料" open={definitionOpen} onCancel={() => setDefinitionOpen(false)} onOk={() => definitionMutation.mutate()} confirmLoading={definitionMutation.isPending} okButtonProps={{ disabled: !definitionForm.name.trim() }}><Flex vertical gap={12}><Input placeholder="Skill 名称" value={definitionForm.name} onChange={(event) => setDefinitionForm({ ...definitionForm, name: event.target.value })} /><Input.TextArea placeholder="用途与适用范围" value={definitionForm.summary} onChange={(event) => setDefinitionForm({ ...definitionForm, summary: event.target.value })} /></Flex></Modal>
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
