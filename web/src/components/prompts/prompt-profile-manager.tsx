"use client";

import { nanoid } from "nanoid";
import { useState } from "react";
import { CirclePlus, LockKeyhole, Pencil, Trash2 } from "lucide-react";
import { App, Button, Col, Empty, Form, Input, Modal, Row, Select, Space, Switch, Tabs, Tag } from "antd";

import { activePromptProfile, usePromptProfileStore } from "@/stores/use-prompt-profile-store";
import type { PromptProfile, PromptProfileBlock, PromptProfileScope, PromptRecipeNodeGroup } from "./prompt-profile";
import { promptSlotLabel, promptSlotOptions } from "./prompt-template";
import { usePromptRecipeContext } from "./use-prompt-recipe-context";

type ProfileFormValues = { name: string; blocks: PromptProfileBlock[] };

const sourceLabels = { task: "本次任务", template: "选用模板", project: "项目风格", personal: "个人习惯", company: "公司标准" } as const;

export function PromptProfileManager({ projectId }: { projectId?: string }) {
    const [nodeGroup, setNodeGroup] = useState<PromptRecipeNodeGroup>("image");

    return <Tabs activeKey={nodeGroup} onChange={(value) => setNodeGroup(value as PromptRecipeNodeGroup)} items={[{ key: "image", label: "图片配方", children: <PromptProfileWorkspace nodeGroup="image" projectId={projectId} /> }, { key: "video", label: "视频配方", children: <PromptProfileWorkspace nodeGroup="video" projectId={projectId} /> }]} />;
}

function PromptProfileWorkspace({ nodeGroup, projectId }: { nodeGroup: PromptRecipeNodeGroup; projectId?: string }) {
    const { modal, message } = App.useApp();
    const [form] = Form.useForm<ProfileFormValues>();
    const [editing, setEditing] = useState<{ scope: PromptProfileScope; profile?: PromptProfile } | null>(null);
    const profiles = usePromptProfileStore((state) => state.profiles);
    const activeProfileIds = usePromptProfileStore((state) => state.activeProfileIds);
    const addProfile = usePromptProfileStore((state) => state.addProfile);
    const updateProfile = usePromptProfileStore((state) => state.updateProfile);
    const removeProfile = usePromptProfileStore((state) => state.removeProfile);
    const setActiveProfile = usePromptProfileStore((state) => state.setActiveProfile);
    const context = usePromptRecipeContext(nodeGroup, projectId);
    const state = { profiles, activeProfileIds };
    const recipe = context.compose("本次任务内容将在使用时填入");

    const openEditor = (scope: PromptProfileScope, profile?: PromptProfile) => {
        form.setFieldsValue({
            name: profile?.name || (scope === "project" ? `${nodeGroup === "image" ? "图片" : "视频"}项目风格` : `${nodeGroup === "image" ? "图片" : "视频"}个人习惯`),
            blocks: profile?.blocks.length ? profile.blocks : [{ id: nanoid(), title: "视觉风格", slot: "style", content: "", enabled: true }],
        });
        setEditing({ scope, profile });
    };

    const saveProfile = async () => {
        if (!editing) return;
        const values = await form.validateFields();
        if (editing.profile) {
            updateProfile(editing.profile.id, values);
            message.success("提示词配置已保存");
        } else {
            const profileId = addProfile({ ...values, scope: editing.scope, projectId: editing.scope === "project" ? projectId : undefined, nodeGroup });
            setActiveProfile(editing.scope, nodeGroup, profileId, editing.scope === "project" ? projectId : undefined);
            message.success("提示词配置已创建并启用");
        }
        setEditing(null);
    };

    const deleteProfile = (profile: PromptProfile) =>
        modal.confirm({
            title: `删除“${profile.name}”？`,
            content: "删除后无法恢复，但不会影响已经写入图片或视频的提示词。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => removeProfile(profile.id),
        });

    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
            <div className="space-y-4">
                <section className="studio-card p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-[var(--studio-text-primary)]">公司标准</div>
                            <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">管理员统一维护；必选项会锁定加入完整配方。</p>
                        </div>
                        <Tag className="studio-tag">{context.companyLoading ? "读取中" : `${context.companyStandards.length} 项`}</Tag>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {context.companyStandards.map((item) => (
                            <Tag key={item.id} className="studio-tag" icon={item.metadata?.policy === "required" ? <LockKeyhole className="size-3" /> : undefined}>
                                {item.title}
                            </Tag>
                        ))}
                        {!context.companyLoading && !context.companyStandards.length ? <span className="text-xs text-[var(--studio-text-muted)]">尚未配置此类公司标准</span> : null}
                    </div>
                </section>
                {projectId ? <ProfileLayerCard title="项目风格" description="只对当前项目生效，用来固定整部作品的画风、镜头与一致性。" scope="project" nodeGroup={nodeGroup} projectId={projectId} profiles={profiles} activeProfile={activePromptProfile(state, "project", nodeGroup, projectId)} onSelect={setActiveProfile} onEdit={openEditor} onDelete={deleteProfile} /> : null}
                <ProfileLayerCard title="我的习惯" description="仅保存在当前用户浏览器中，适合沉淀你每次都会补充的表达。" scope="personal" nodeGroup={nodeGroup} profiles={profiles} activeProfile={activePromptProfile(state, "personal", nodeGroup)} onSelect={setActiveProfile} onEdit={openEditor} onDelete={deleteProfile} />
            </div>
            <section className="studio-card h-fit p-4 xl:sticky xl:top-5">
                <div className="text-sm font-semibold text-[var(--studio-text-primary)]">完整配方预览</div>
                <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">实际使用模板时会替换第一段任务内容，并保留每一层来源。</p>
                {recipe.warnings.map((warning) => <div key={warning} className="mt-3 rounded-md border border-[var(--studio-warning)]/40 px-3 py-2 text-xs text-[var(--studio-warning)]">{warning}</div>)}
                <div className="mt-4 space-y-3">
                    {recipe.sections.map((section) => (
                        <div key={section.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <Tag className="studio-tag">{sourceLabels[section.source]}</Tag>
                                {section.locked ? <span className="flex items-center gap-1 text-[11px] text-[var(--studio-text-muted)]"><LockKeyhole className="size-3" />锁定</span> : null}
                            </div>
                            <div className="whitespace-pre-wrap text-xs leading-5 text-[var(--studio-text-secondary)]">{section.content}</div>
                        </div>
                    ))}
                    {!recipe.sections.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未启用任何内容" /> : null}
                </div>
            </section>

            <Modal rootClassName="studio-modal" title={editing?.profile ? "编辑提示词配置" : "新建提示词配置"} open={Boolean(editing)} width={760} onCancel={() => setEditing(null)} onOk={() => void saveProfile()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></Form.Item>
                    <Form.List name="blocks">
                        {(fields, { add, remove }) => (
                            <div className="space-y-3">
                                {fields.map((field) => (
                                    <div key={field.key} className="rounded-md border border-[var(--studio-border-subtle)] p-3">
                                        <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
                                        <Row gutter={10}>
                                            <Col span={8}><Form.Item name={[field.name, "title"]} label="片段名称"><Input placeholder="例如：电影写实" /></Form.Item></Col>
                                            <Col span={8}><Form.Item name={[field.name, "slot"]} label="内容位置"><Select options={promptSlotOptions} /></Form.Item></Col>
                                            <Col span={5}><Form.Item name={[field.name, "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
                                            <Col span={3} className="flex items-center justify-end pt-4"><Button danger type="text" icon={<Trash2 className="size-4" />} onClick={() => remove(field.name)} aria-label="删除片段" /></Col>
                                        </Row>
                                        <Form.Item name={[field.name, "content"]} label="提示词内容" rules={[{ required: true, message: "请输入提示词内容" }]}><Input.TextArea rows={3} placeholder="写入可以跨任务复用的风格、镜头、质量或负面约束" /></Form.Item>
                                    </div>
                                ))}
                                <Button block icon={<CirclePlus className="size-4" />} onClick={() => add({ id: nanoid(), title: "", slot: "style", content: "", enabled: true })}>添加片段</Button>
                            </div>
                        )}
                    </Form.List>
                </Form>
            </Modal>
        </div>
    );
}

function ProfileLayerCard({ title, description, scope, nodeGroup, projectId, profiles, activeProfile, onSelect, onEdit, onDelete }: { title: string; description: string; scope: PromptProfileScope; nodeGroup: PromptRecipeNodeGroup; projectId?: string; profiles: PromptProfile[]; activeProfile?: PromptProfile; onSelect: (scope: PromptProfileScope, nodeGroup: PromptRecipeNodeGroup, profileId: string, projectId?: string) => void; onEdit: (scope: PromptProfileScope, profile?: PromptProfile) => void; onDelete: (profile: PromptProfile) => void }) {
    const options = profiles.filter((profile) => profile.scope === scope && profile.nodeGroup === nodeGroup && (scope === "personal" || profile.projectId === projectId)).map((profile) => ({ label: profile.name, value: profile.id }));
    return (
        <section className="studio-card p-4">
            <div className="text-sm font-semibold text-[var(--studio-text-primary)]">{title}</div>
            <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">{description}</p>
            <Space wrap className="mt-3 w-full">
                <Select className="min-w-56" allowClear placeholder="暂不启用" value={activeProfile?.id} options={options} onChange={(value) => onSelect(scope, nodeGroup, value || "", projectId)} />
                <Button icon={<CirclePlus className="size-4" />} onClick={() => onEdit(scope)}>新建</Button>
                {activeProfile ? <Button icon={<Pencil className="size-4" />} onClick={() => onEdit(scope, activeProfile)}>编辑</Button> : null}
                {activeProfile ? <Button danger type="text" icon={<Trash2 className="size-4" />} onClick={() => onDelete(activeProfile)}>删除</Button> : null}
            </Space>
            {activeProfile?.blocks.length ? <div className="mt-3 flex flex-wrap gap-2">{activeProfile.blocks.filter((block) => block.enabled).map((block) => <Tag key={block.id} className="studio-tag">{block.title || promptSlotLabel(block.slot)}</Tag>)}</div> : null}
        </section>
    );
}
