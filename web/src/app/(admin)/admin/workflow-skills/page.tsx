"use client";

import { ApartmentOutlined, CheckCircleOutlined, CloudUploadOutlined, ExperimentOutlined, FileAddOutlined, HistoryOutlined, ReloadOutlined, RollbackOutlined, SaveOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Checkbox, Divider, Empty, Flex, Input, Modal, Select, Skeleton, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
    createAdminWorkflowSkillVersion,
    evaluateAdminWorkflowSkillVersion,
    fetchAdminWorkflowSkills,
    fetchAdminWorkflowSkillVersion,
    publishAdminWorkflowSkillVersion,
    rollbackAdminWorkflowSkillBinding,
    updateAdminWorkflowSkillVersion,
    validateAdminWorkflowSkillVersion,
    type WorkflowSkillAdminItem,
    type WorkflowSkillEvaluationResult,
    type WorkflowSkillPackage,
    type WorkflowSkillVersion,
} from "@/services/api/admin-workflow-skills";
import { useUserStore } from "@/stores/use-user-store";
import { WorkflowSkillEditor } from "./components/workflow-skill-editor";
import { WorkflowSkillEvaluationPanel } from "./components/workflow-skill-evaluation";
import { canPublishSkill, latestPassingEvaluation, nextPatchVersion, resolveBindingLabel, shortWorkflowHash, sortWorkflowSkillItems, workflowSkillStageLabels, workflowSkillStageNumbers } from "./workflow-skill-view";

const emptyPackage: WorkflowSkillPackage = {
    files: { "SKILL.md": "" },
    contract: {
        requiredInputs: [],
        imagePolicy: { required: false, min: 0, max: 9, allowTextFallback: true, allowedTypes: ["image/png", "image/jpeg", "image/webp"] },
        outputSchemaVersion: "1.0.0",
        outputSchema: { type: "object" },
        qualityGateProfile: ["schema"],
        applyTargets: [],
    },
    contentHash: "",
};

export default function AdminWorkflowSkillsPage() {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [activeSkillId, setActiveSkillId] = useState("");
    const [activeVersionId, setActiveVersionId] = useState("");
    const [editorValue, setEditorValue] = useState<WorkflowSkillPackage>(emptyPackage);
    const [evaluationResult, setEvaluationResult] = useState<WorkflowSkillEvaluationResult>();
    const [draftOpen, setDraftOpen] = useState(false);
    const [draftVersion, setDraftVersion] = useState("1.0.1");
    const [evaluationOpen, setEvaluationOpen] = useState(false);
    const [evaluationForm, setEvaluationForm] = useState({ workflowRunId: "", sourceAgentRunId: "", confirmApiCost: false });
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishProjectId, setPublishProjectId] = useState("");
    const [rollbackOpen, setRollbackOpen] = useState(false);
    const [rollbackForm, setRollbackForm] = useState<{ scope: "global" | "project"; scopeId: string; skillVersionId: string }>({ scope: "project", scopeId: "", skillVersionId: "" });

    const skillsQuery = useQuery({ queryKey: ["admin", "workflow-skills", token], queryFn: () => fetchAdminWorkflowSkills(token), enabled: Boolean(token), retry: false });
    const items = useMemo(() => sortWorkflowSkillItems(skillsQuery.data || []), [skillsQuery.data]);
    const activeItem = items.find((item) => item.skill.id === activeSkillId) || items[0];
    const activeVersion = activeItem?.versions.find((item) => item.id === activeVersionId);
    const detailQuery = useQuery({
        queryKey: ["admin", "workflow-skill-version", activeVersionId, token],
        queryFn: () => fetchAdminWorkflowSkillVersion(token, activeVersionId),
        enabled: Boolean(token && activeVersionId),
        retry: false,
    });

    useEffect(() => {
        if (!items.length || activeSkillId) return;
        setActiveSkillId(items[0].skill.id);
    }, [activeSkillId, items]);

    useEffect(() => {
        if (!activeItem) return;
        if (activeItem.versions.some((item) => item.id === activeVersionId)) return;
        const globalBinding = activeItem.bindings.find((item) => item.scope === "global");
        setActiveVersionId(globalBinding?.skillVersionId || activeItem.versions[0]?.id || "");
    }, [activeItem, activeVersionId]);

    useEffect(() => {
        if (!detailQuery.data) return;
        setEditorValue(detailQuery.data.package);
        setEvaluationResult(undefined);
    }, [detailQuery.data]);

    useEffect(() => {
        const error = skillsQuery.error || detailQuery.error;
        if (error) message.error(error instanceof Error ? error.message : "读取工作流 Skill 失败");
    }, [detailQuery.error, message, skillsQuery.error]);

    const invalidateAll = async () => {
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin", "workflow-skills"] }), queryClient.invalidateQueries({ queryKey: ["admin", "workflow-skill-version"] })]);
    };
    const mutationError = (error: unknown) => message.error(error instanceof Error ? error.message : "操作失败");

    const saveMutation = useMutation({
        mutationFn: () => updateAdminWorkflowSkillVersion(token, activeVersionId, { version: activeVersion?.version || "", files: editorValue.files, contract: editorValue.contract }),
        onSuccess: async () => {
            await invalidateAll();
            message.success("草稿已保存，内容哈希已更新");
        },
        onError: mutationError,
    });
    const createMutation = useMutation({
        mutationFn: () => createAdminWorkflowSkillVersion(token, activeItem!.skill.id, { version: draftVersion, files: editorValue.files, contract: editorValue.contract }),
        onSuccess: async (version) => {
            setDraftOpen(false);
            await invalidateAll();
            setActiveVersionId(version.id);
            message.success(`已创建草稿 ${version.version}`);
        },
        onError: mutationError,
    });
    const validateMutation = useMutation({
        mutationFn: () => validateAdminWorkflowSkillVersion(token, activeVersionId),
        onSuccess: (result) => message.success(`契约校验通过：${shortWorkflowHash(result.contentHash)}`),
        onError: mutationError,
    });
    const evaluationMutation = useMutation({
        mutationFn: () => evaluateAdminWorkflowSkillVersion(token, activeVersionId, evaluationForm),
        onSuccess: async (result) => {
            setEvaluationResult(result);
            setEvaluationOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["admin", "workflow-skills"] });
            if (result.evaluation.status === "passed") message.success("同输入评测通过，可以进入项目灰度");
            else message.warning("评测未通过，请查看阻断项");
        },
        onError: mutationError,
    });
    const publishMutation = useMutation({
        mutationFn: (input: { scope: "global" | "project"; scopeId?: string }) => publishAdminWorkflowSkillVersion(token, activeVersionId, input),
        onSuccess: async (_, input) => {
            setPublishOpen(false);
            await invalidateAll();
            message.success(input.scope === "global" ? "已提升为全局版本" : "已发布到测试项目");
        },
        onError: mutationError,
    });
    const rollbackMutation = useMutation({
        mutationFn: () => rollbackAdminWorkflowSkillBinding(token, activeItem!.skill.stageKey, rollbackForm),
        onSuccess: async () => {
            setRollbackOpen(false);
            await invalidateAll();
            message.success("阶段绑定已回滚，新任务将使用所选版本");
        },
        onError: mutationError,
    });

    const isBusy = saveMutation.isPending || createMutation.isPending || validateMutation.isPending || evaluationMutation.isPending || publishMutation.isPending || rollbackMutation.isPending;
    const isDirty = Boolean(detailQuery.data && JSON.stringify({ files: editorValue.files, contract: editorValue.contract }) !== JSON.stringify({ files: detailQuery.data.package.files, contract: detailQuery.data.package.contract }));
    const passingEvaluation = activeItem && latestPassingEvaluation(activeVersion, activeItem.evaluations);
    const publishReady = activeItem && activeVersion ? canPublishSkill({ stageKey: activeItem.skill.stageKey, version: activeVersion, evaluations: activeItem.evaluations }) : false;
    const hasProjectCanary = Boolean(activeItem?.bindings.some((item) => item.scope === "project" && item.skillVersionId === activeVersion?.id));

    if (skillsQuery.isLoading)
        return (
            <main className="p-6">
                <Skeleton active paragraph={{ rows: 12 }} />
            </main>
        );
    if (!activeItem)
        return (
            <main className="p-6">
                <Empty description="尚未初始化工作流 Skill" />
            </main>
        );

    return (
        <main className="p-6 max-md:p-3">
            <Flex vertical gap={16}>
                <Card className="studio-panel overflow-hidden" variant="borderless" styles={{ body: { padding: 0 } }}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6 border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-5 max-md:grid-cols-1">
                        <div>
                            <Typography.Text className="text-xs font-semibold tracking-[0.18em] text-[var(--studio-accent)]">WORKFLOW CONTROL / 6 STAGES</Typography.Text>
                            <Typography.Title level={2} style={{ margin: "8px 0 6px" }}>
                                工作流 Skill 版本中心
                            </Typography.Title>
                            <Typography.Text type="secondary">在这里更新每个阶段的判断与输出规则；发布、灰度、回滚不会要求重新上线整站。</Typography.Text>
                        </div>
                        <Flex gap={8} wrap>
                            <Tag icon={<SafetyCertificateOutlined />} color="success">
                                硬质量门由服务端保留
                            </Tag>
                            <Tag icon={<ApartmentOutlined />}>项目优先，全局兜底</Tag>
                        </Flex>
                    </div>
                    <div className="grid grid-cols-6 max-xl:grid-cols-3 max-md:grid-cols-2">
                        {items.map((item) => (
                            <StageCard
                                key={item.skill.id}
                                item={item}
                                active={item.skill.id === activeItem.skill.id}
                                onClick={() => {
                                    setActiveSkillId(item.skill.id);
                                    setActiveVersionId("");
                                }}
                            />
                        ))}
                    </div>
                </Card>

                <div className="grid grid-cols-[220px_minmax(480px,1fr)_300px] gap-4 max-xl:grid-cols-1">
                    <Card className="studio-panel h-fit" variant="borderless" title="版本轨道" extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => skillsQuery.refetch()} />}>
                        <Flex vertical gap={8}>
                            {activeItem.versions.map((version) => {
                                const isGlobal = activeItem.bindings.some((binding) => binding.scope === "global" && binding.skillVersionId === version.id);
                                const projectCount = activeItem.bindings.filter((binding) => binding.scope === "project" && binding.skillVersionId === version.id).length;
                                return (
                                    <button
                                        key={version.id}
                                        type="button"
                                        className={`w-full rounded-lg border p-3 text-left transition ${version.id === activeVersionId ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] hover:border-[var(--studio-border-strong)]"}`}
                                        onClick={() => setActiveVersionId(version.id)}
                                    >
                                        <Flex align="center" justify="space-between" gap={8}>
                                            <Typography.Text strong>v{version.version}</Typography.Text>
                                            <Tag color={version.status === "draft" ? "warning" : "success"}>{version.status === "draft" ? "草稿" : "已发布"}</Tag>
                                        </Flex>
                                        <Typography.Text type="secondary" className="mt-2 block text-xs">
                                            {shortWorkflowHash(version.contentHash)}
                                        </Typography.Text>
                                        <Flex gap={5} wrap className="mt-2">
                                            {isGlobal ? <Tag color="blue">全局</Tag> : null}
                                            {projectCount ? <Tag color="gold">{projectCount} 个灰度项目</Tag> : null}
                                        </Flex>
                                    </button>
                                );
                            })}
                        </Flex>
                    </Card>

                    <Flex vertical gap={12} style={{ minWidth: 0 }}>
                        <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 14 } }}>
                            <Flex align="center" justify="space-between" gap={12} wrap>
                                <div>
                                    <Flex align="center" gap={8} wrap>
                                        <Typography.Title level={4} style={{ margin: 0 }}>
                                            {activeItem.skill.name} · v{activeVersion?.version || "-"}
                                        </Typography.Title>
                                        {activeVersion ? <Tag color={activeVersion.status === "draft" ? "warning" : "success"}>{activeVersion.status === "draft" ? "可编辑草稿" : "不可变发布版"}</Tag> : null}
                                    </Flex>
                                    <Typography.Text type="secondary">{activeItem.skill.description}</Typography.Text>
                                </div>
                                <Space wrap>
                                    <Button
                                        icon={<FileAddOutlined />}
                                        disabled={!detailQuery.data}
                                        onClick={() => {
                                            setDraftVersion(nextPatchVersion(activeVersion?.version || "1.0.0"));
                                            setDraftOpen(true);
                                        }}
                                    >
                                        从此版本新建草稿
                                    </Button>
                                    <Button icon={<CheckCircleOutlined />} disabled={!activeVersion} loading={validateMutation.isPending} onClick={() => validateMutation.mutate()}>
                                        校验
                                    </Button>
                                    {activeVersion?.status === "draft" ? (
                                        <Button type="primary" icon={<SaveOutlined />} disabled={!isDirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                                            保存草稿
                                        </Button>
                                    ) : null}
                                </Space>
                            </Flex>
                            {isDirty ? <Alert className="mt-3" type="warning" showIcon title="存在未保存修改；保存后内容哈希会变化，旧评测将自动失效。" /> : null}
                        </Card>
                        {detailQuery.isLoading ? (
                            <Card>
                                <Skeleton active />
                            </Card>
                        ) : detailQuery.data ? (
                            <WorkflowSkillEditor value={editorValue} readOnly={activeVersion?.status !== "draft"} onChange={setEditorValue} />
                        ) : null}
                    </Flex>

                    <Flex vertical gap={12}>
                        <ReleaseGateCard
                            item={activeItem}
                            version={activeVersion}
                            passingEvaluation={passingEvaluation}
                            isDirty={isDirty}
                            publishReady={publishReady}
                            hasProjectCanary={hasProjectCanary}
                            busy={isBusy}
                            onEvaluate={() => setEvaluationOpen(true)}
                            onPublishProject={() => setPublishOpen(true)}
                            onPromoteGlobal={() =>
                                modal.confirm({
                                    title: "提升为全局版本？",
                                    content: "所有未设置项目灰度的工作流新任务都会使用此版本。正在运行和已排队任务不会变化。",
                                    okText: "确认提升",
                                    cancelText: "取消",
                                    onOk: () => publishMutation.mutateAsync({ scope: "global" }),
                                })
                            }
                            onRollback={() => {
                                setRollbackForm({ scope: "project", scopeId: "", skillVersionId: activeItem.versions.find((item) => item.status === "published")?.id || "" });
                                setRollbackOpen(true);
                            }}
                        />
                        <WorkflowSkillEvaluationPanel result={evaluationResult} stored={passingEvaluation} />
                        <Card
                            className="studio-panel"
                            variant="borderless"
                            title={
                                <Space>
                                    <HistoryOutlined />
                                    发布审计
                                </Space>
                            }
                        >
                            {activeItem.audits.length ? (
                                <Flex vertical gap={10}>
                                    {activeItem.audits.slice(0, 6).map((audit) => {
                                        const version = activeItem.versions.find((item) => item.id === audit.skillVersionId);
                                        return (
                                            <div key={audit.id} className="border-l-2 border-[var(--studio-border-strong)] pl-3">
                                                <Typography.Text className="block text-xs" strong>
                                                    {workflowAuditLabel(audit.action)} · v{version?.version || "-"}
                                                </Typography.Text>
                                                <Typography.Text type="secondary" className="mt-1 block text-xs">
                                                    {audit.scope === "global" ? "全局" : `项目 ${audit.scopeId}`} · {new Date(audit.createdAt).toLocaleString()}
                                                </Typography.Text>
                                            </div>
                                        );
                                    })}
                                </Flex>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无发布操作" />
                            )}
                        </Card>
                    </Flex>
                </div>
            </Flex>

            <Modal title="从当前内容创建新草稿" open={draftOpen} okText="创建草稿" cancelText="取消" confirmLoading={createMutation.isPending} onCancel={() => setDraftOpen(false)} onOk={() => createMutation.mutate()}>
                <Typography.Paragraph type="secondary">发布版不可直接修改；新草稿会复制当前文件和契约。</Typography.Paragraph>
                <Input addonBefore="版本" value={draftVersion} onChange={(event) => setDraftVersion(event.target.value)} placeholder="例如 1.1.0" />
            </Modal>
            <Modal
                title="同输入 dry-run 与版本对比"
                open={evaluationOpen}
                okText="开始评测"
                cancelText="取消"
                confirmLoading={evaluationMutation.isPending}
                okButtonProps={{ disabled: !evaluationForm.workflowRunId || isDirty }}
                onCancel={() => setEvaluationOpen(false)}
                onOk={() => evaluationMutation.mutate()}
            >
                <Flex vertical gap={14}>
                    <Alert type="info" showIcon title="评测不会创建正式阶段或写入业务素材。Codex 模式不扣应用算力点；API 模式仍会产生上游费用。" />
                    <Field label="测试工作流 Run ID">
                        <Input value={evaluationForm.workflowRunId} onChange={(event) => setEvaluationForm((current) => ({ ...current, workflowRunId: event.target.value }))} />
                    </Field>
                    <Field label="带图来源任务 ID（可选）">
                        <Input value={evaluationForm.sourceAgentRunId} onChange={(event) => setEvaluationForm((current) => ({ ...current, sourceAgentRunId: event.target.value }))} placeholder="复用该任务冻结的图片清单" />
                    </Field>
                    <Checkbox checked={evaluationForm.confirmApiCost} onChange={(event) => setEvaluationForm((current) => ({ ...current, confirmApiCost: event.target.checked }))}>
                        如果当前为 API 模式，我确认本次评测可能产生上游费用
                    </Checkbox>
                </Flex>
            </Modal>
            <Modal
                title="发布到测试项目"
                open={publishOpen}
                okText="项目灰度发布"
                cancelText="取消"
                confirmLoading={publishMutation.isPending}
                okButtonProps={{ disabled: !publishProjectId || !publishReady }}
                onCancel={() => setPublishOpen(false)}
                onOk={() => publishMutation.mutate({ scope: "project", scopeId: publishProjectId })}
            >
                <Alert type="warning" showIcon title="先只影响一个项目。确认真实工作流正常后，再提升为全局版本。" />
                <Input className="mt-4" addonBefore="项目 ID" value={publishProjectId} onChange={(event) => setPublishProjectId(event.target.value)} />
            </Modal>
            <Modal
                title="回滚阶段绑定"
                open={rollbackOpen}
                okText="确认回滚"
                cancelText="取消"
                confirmLoading={rollbackMutation.isPending}
                okButtonProps={{ disabled: !rollbackForm.skillVersionId || (rollbackForm.scope === "project" && !rollbackForm.scopeId) }}
                onCancel={() => setRollbackOpen(false)}
                onOk={() => rollbackMutation.mutate()}
            >
                <Flex vertical gap={14}>
                    <Select
                        value={rollbackForm.scope}
                        onChange={(scope) => setRollbackForm((current) => ({ ...current, scope }))}
                        options={[
                            { value: "project", label: "回滚指定项目" },
                            { value: "global", label: "回滚全局默认" },
                        ]}
                    />
                    {rollbackForm.scope === "project" ? <Input addonBefore="项目 ID" value={rollbackForm.scopeId} onChange={(event) => setRollbackForm((current) => ({ ...current, scopeId: event.target.value }))} /> : null}
                    <Select
                        value={rollbackForm.skillVersionId}
                        onChange={(skillVersionId) => setRollbackForm((current) => ({ ...current, skillVersionId }))}
                        options={activeItem.versions.filter((item) => item.status === "published").map((item) => ({ value: item.id, label: `v${item.version} · ${shortWorkflowHash(item.contentHash)}` }))}
                    />
                </Flex>
            </Modal>
        </main>
    );
}

function workflowAuditLabel(action: string) {
    return ({ publish_project: "项目灰度", promote_global: "提升全局", rollback_project: "项目回滚", rollback_global: "全局回滚" } as Record<string, string>)[action] || action;
}

function StageCard({ item, active, onClick }: { item: WorkflowSkillAdminItem; active: boolean; onClick: () => void }) {
    const globalBinding = item.bindings.find((binding) => binding.scope === "global");
    const globalVersion = item.versions.find((version) => version.id === globalBinding?.skillVersionId)?.version;
    const projectBinding = item.bindings.find((binding) => binding.scope === "project");
    const projectVersion = item.versions.find((version) => version.id === projectBinding?.skillVersionId)?.version;
    return (
        <button
            type="button"
            onClick={onClick}
            className={`group min-h-[122px] border-r border-[var(--studio-border-subtle)] p-4 text-left transition last:border-r-0 ${active ? "bg-[var(--studio-accent-soft)]" : "bg-[var(--studio-panel-bg)] hover:bg-[var(--studio-panel-muted-bg)]"}`}
        >
            <Flex align="center" justify="space-between">
                <Typography.Text className="text-2xl font-light text-[var(--studio-text-muted)]">{workflowSkillStageNumbers[item.skill.stageKey]}</Typography.Text>
                <span className={`size-2 rounded-full ${item.skill.enabled && globalBinding ? "bg-[var(--studio-success)]" : "bg-[var(--studio-warning)]"}`} />
            </Flex>
            <Typography.Text strong className="mt-3 block">
                {workflowSkillStageLabels[item.skill.stageKey]}
            </Typography.Text>
            <Typography.Text type="secondary" className="mt-1 block text-xs">
                {resolveBindingLabel({ global: globalVersion, project: projectVersion })}
            </Typography.Text>
        </button>
    );
}

function ReleaseGateCard({
    item,
    version,
    passingEvaluation,
    isDirty,
    publishReady,
    hasProjectCanary,
    busy,
    onEvaluate,
    onPublishProject,
    onPromoteGlobal,
    onRollback,
}: {
    item: WorkflowSkillAdminItem;
    version?: WorkflowSkillVersion;
    passingEvaluation?: WorkflowSkillAdminItem["evaluations"][number];
    isDirty: boolean;
    publishReady: boolean;
    hasProjectCanary: boolean;
    busy: boolean;
    onEvaluate: () => void;
    onPublishProject: () => void;
    onPromoteGlobal: () => void;
    onRollback: () => void;
}) {
    const globalBinding = item.bindings.find((binding) => binding.scope === "global");
    return (
        <Card className="studio-panel" variant="borderless" title="发布门禁" extra={<Tag color={publishReady || version?.status === "published" ? "success" : "warning"}>{publishReady || version?.status === "published" ? "可推进" : "待检查"}</Tag>}>
            <GateRow label="契约与文件" passed={Boolean(version?.contentHash) && !isDirty} detail={isDirty ? "请先保存修改" : shortWorkflowHash(version?.contentHash || "")} />
            <GateRow label="同哈希评测" passed={Boolean(passingEvaluation) || !["script", "art", "storyboard"].includes(item.skill.stageKey)} detail={passingEvaluation ? "评测通过" : "AI 阶段必须通过"} />
            <GateRow label="项目灰度" passed={hasProjectCanary} detail={hasProjectCanary ? "已绑定测试项目" : "尚未发布灰度"} />
            <GateRow label="全局版本" passed={globalBinding?.skillVersionId === version?.id} detail={globalBinding?.skillVersionId === version?.id ? "当前全局生效" : "未全局生效"} />
            <Divider />
            <Flex vertical gap={8}>
                <Button icon={<ExperimentOutlined />} disabled={!version || isDirty} loading={busy} onClick={onEvaluate}>
                    运行 dry-run 与对比
                </Button>
                {version?.status === "draft" ? (
                    <Button type="primary" icon={<CloudUploadOutlined />} disabled={!publishReady || isDirty} onClick={onPublishProject}>
                        发布到测试项目
                    </Button>
                ) : null}
                {version?.status === "published" ? (
                    <Button type="primary" icon={<CloudUploadOutlined />} disabled={!hasProjectCanary || globalBinding?.skillVersionId === version.id} onClick={onPromoteGlobal}>
                        提升为全局版本
                    </Button>
                ) : null}
                <Button icon={<RollbackOutlined />} disabled={!item.versions.some((candidate) => candidate.status === "published")} onClick={onRollback}>
                    项目 / 全局回滚
                </Button>
            </Flex>
        </Card>
    );
}

function GateRow({ label, passed, detail }: { label: string; passed: boolean; detail: string }) {
    return (
        <Flex align="center" justify="space-between" gap={12} className="border-b border-[var(--studio-border-subtle)] py-2 last:border-b-0">
            <Typography.Text>{label}</Typography.Text>
            <Flex align="center" gap={6}>
                <span className={`size-2 rounded-full ${passed ? "bg-[var(--studio-success)]" : "bg-[var(--studio-warning)]"}`} />
                <Typography.Text type="secondary" className="text-xs">
                    {detail}
                </Typography.Text>
            </Flex>
        </Flex>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Flex vertical gap={6}>
            <Typography.Text type="secondary">{label}</Typography.Text>
            {children}
        </Flex>
    );
}
