"use client";

import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { App, Button, Card, Dropdown, Empty, Flex, Input, Modal, Spin, Typography } from "antd";
import { useState } from "react";

import type { AdminAssetProject } from "@/services/api/admin";

export function AssetProjectBrowser({ projects, loading, onOpen, onSave, onDelete }: { projects: AdminAssetProject[]; loading: boolean; onOpen: (project: AdminAssetProject) => void; onSave: (project: Partial<AdminAssetProject>) => Promise<AdminAssetProject>; onDelete: (id: string) => Promise<unknown> }) {
    const { message, modal } = App.useApp();
    const [editing, setEditing] = useState<Partial<AdminAssetProject> | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    const openEditor = (project: Partial<AdminAssetProject> = {}) => {
        setEditing(project);
        setName(project.name || "");
    };
    const save = async () => {
        if (!name.trim()) return message.warning("请输入项目名称");
        setSaving(true);
        try {
            const saved = await onSave({ ...editing, name: name.trim() });
            message.success(editing?.id ? "项目已重命名" : "项目已创建");
            setEditing(null);
            if (!editing?.id) onOpen(saved);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存项目失败");
        } finally {
            setSaving(false);
        }
    };
    const remove = (project: AdminAssetProject) => {
        modal.confirm({
            title: `删除“${project.name}”？`,
            content: `项目中的 ${project.assetCount} 个素材、全部文件夹和已上传文件都会被删除，此操作无法撤销。`,
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await onDelete(project.id);
                    message.success("素材项目已删除");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除项目失败");
                }
            },
        });
    };

    return (
        <main className="p-6">
            <Flex justify="space-between" align="center" gap={16} wrap>
                <div>
                    <Typography.Title level={3} style={{ margin: 0 }}>素材项目</Typography.Title>
                    <Typography.Text type="secondary">先创建项目，再把素材一次导入并慢慢整理。</Typography.Text>
                </div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor()}>新建项目</Button>
            </Flex>

            {loading && !projects.length ? <div className="grid min-h-[360px] place-items-center"><Spin /></div> : null}
            {!loading && !projects.length ? (
                <Card variant="borderless" className="mt-6"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有素材项目"><Button type="primary" onClick={() => openEditor()}>新建第一个项目</Button></Empty></Card>
            ) : null}
            {projects.length ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {projects.map((project) => (
                        <Card key={project.id} variant="borderless" className="group cursor-pointer transition hover:-translate-y-0.5" styles={{ body: { padding: 18 } }} onClick={() => onOpen(project)}>
                            <Flex justify="space-between" align="start" gap={12}>
                                <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] text-[var(--studio-accent)]"><FolderKanban className="size-5" /></span>
                                <Dropdown
                                    trigger={["click"]}
                                    menu={{ items: [
                                        { key: "rename", icon: <Pencil className="size-3.5" />, label: "重命名" },
                                        { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除项目" },
                                    ], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === "rename") openEditor(project); else remove(project); } }}
                                >
                                    <Button type="text" size="small" icon={<MoreHorizontal className="size-4" />} onClick={(event) => event.stopPropagation()} />
                                </Dropdown>
                            </Flex>
                            <Typography.Title level={5} ellipsis style={{ margin: "16px 0 6px" }}>{project.name}</Typography.Title>
                            <Typography.Text type="secondary">{project.assetCount} 个素材 · {formatProjectDate(project.updatedAt)} 更新</Typography.Text>
                        </Card>
                    ))}
                </div>
            ) : null}

            <Modal title={editing?.id ? "重命名项目" : "新建素材项目"} open={Boolean(editing)} confirmLoading={saving} okText={editing?.id ? "保存" : "创建并进入"} cancelText="取消" onOk={() => void save()} onCancel={() => setEditing(null)} destroyOnHidden>
                <Input autoFocus value={name} maxLength={80} placeholder="例如：古装短剧第一季" onPressEnter={() => void save()} onChange={(event) => setName(event.target.value)} />
            </Modal>
        </main>
    );
}

function formatProjectDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
