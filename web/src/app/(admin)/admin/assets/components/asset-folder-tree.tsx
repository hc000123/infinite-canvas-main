"use client";

import { Folder, FolderOpen, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { App, Button, Dropdown, Flex, Input, Modal, Tree, Typography, type TreeDataNode } from "antd";
import { useMemo, useState } from "react";

import type { AdminAssetFolder, AdminAssetProject } from "@/services/api/admin";

export const assetRootFolderKey = "__root__";

export function AssetFolderTree({ project, folders, selectedId, onSelect, onSave, onDelete }: { project: AdminAssetProject; folders: AdminAssetFolder[]; selectedId: string; onSelect: (id: string) => void; onSave: (folder: Partial<AdminAssetFolder> & { projectId: string }) => Promise<AdminAssetFolder>; onDelete: (id: string) => Promise<unknown> }) {
    const { message, modal } = App.useApp();
    const [editing, setEditing] = useState<Partial<AdminAssetFolder> | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const treeData = useMemo(() => buildFolderTree(project, folders), [folders, project]);
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

    const openEditor = (folder: Partial<AdminAssetFolder> = {}) => {
        setEditing(folder);
        setName(folder.name || "");
    };
    const save = async () => {
        if (!name.trim()) return message.warning("请输入文件夹名称");
        setSaving(true);
        try {
            await onSave({ ...editing, projectId: project.id, parentId: editing?.id ? editing.parentId : selectedId, name: name.trim() });
            message.success(editing?.id ? "文件夹已重命名" : "文件夹已创建");
            setEditing(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存文件夹失败");
        } finally {
            setSaving(false);
        }
    };
    const remove = (folder: AdminAssetFolder) => {
        modal.confirm({
            title: `删除“${folder.name}”？`,
            content: "该文件夹、全部子文件夹和其中的素材都会被删除，此操作无法撤销。",
            okText: "确认删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    if (selectedId === folder.id || isFolderDescendant(folders, selectedId, folder.id)) onSelect(folder.parentId || "");
                    await onDelete(folder.id);
                    message.success("文件夹已删除");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除文件夹失败");
                }
            },
        });
    };

    return (
        <aside className="studio-panel flex min-h-0 w-full flex-col p-3 lg:w-64 lg:shrink-0">
            <Flex justify="space-between" align="center" className="px-1 pb-3">
                <Typography.Text strong>文件夹</Typography.Text>
                <Button type="text" size="small" icon={<Plus className="size-4" />} onClick={() => openEditor()}>新建</Button>
            </Flex>
            <div className="min-h-0 overflow-y-auto">
                <Tree
                    blockNode
                    showIcon
                    defaultExpandAll
                    selectedKeys={[selectedId || assetRootFolderKey]}
                    treeData={treeData}
                    onSelect={(keys) => onSelect(keys[0] === assetRootFolderKey ? "" : String(keys[0] || ""))}
                    titleRender={(node) => {
                        const folder = folderMap.get(String(node.key));
                        return (
                            <Flex justify="space-between" align="center" gap={4} style={{ minWidth: 0 }}>
                                <span className="truncate">{String(node.title)}</span>
                                {folder ? (
                                    <Dropdown trigger={["click"]} menu={{ items: [
                                        { key: "rename", icon: <Pencil className="size-3.5" />, label: "重命名" },
                                        { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除" },
                                    ], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === "rename") openEditor(folder); else remove(folder); } }}>
                                        <Button type="text" size="small" icon={<MoreHorizontal className="size-3.5" />} onClick={(event) => event.stopPropagation()} />
                                    </Dropdown>
                                ) : null}
                            </Flex>
                        );
                    }}
                />
            </div>
            <Modal title={editing?.id ? "重命名文件夹" : "新建文件夹"} open={Boolean(editing)} confirmLoading={saving} okText="保存" cancelText="取消" onOk={() => void save()} onCancel={() => setEditing(null)} destroyOnHidden>
                <Input autoFocus value={name} maxLength={80} placeholder="文件夹名称" onPressEnter={() => void save()} onChange={(event) => setName(event.target.value)} />
            </Modal>
        </aside>
    );
}

function buildFolderTree(project: AdminAssetProject, folders: AdminAssetFolder[]): TreeDataNode[] {
    const byParent = new Map<string, AdminAssetFolder[]>();
    folders.forEach((folder) => byParent.set(folder.parentId, [...(byParent.get(folder.parentId) || []), folder]));
    const children = (parentId: string): TreeDataNode[] => (byParent.get(parentId) || []).map((folder) => ({ key: folder.id, title: folder.name, icon: <Folder className="size-4" />, children: children(folder.id) }));
    return [{ key: assetRootFolderKey, title: project.name, icon: <FolderOpen className="size-4" />, children: children("") }];
}

function isFolderDescendant(folders: AdminAssetFolder[], folderId: string, ancestorId: string) {
    const parents = new Map(folders.map((folder) => [folder.id, folder.parentId]));
    for (let id = folderId; id; id = parents.get(id) || "") if (id === ancestorId) return true;
    return false;
}

export function assetFolderPath(folders: AdminAssetFolder[], folderId: string) {
    const map = new Map(folders.map((folder) => [folder.id, folder]));
    const path: AdminAssetFolder[] = [];
    for (let current = map.get(folderId); current; current = map.get(current.parentId)) path.unshift(current);
    return path;
}

export function assetFolderOptions(folders: AdminAssetFolder[]) {
    const options: Array<{ label: string; value: string }> = [{ label: "项目根目录", value: "" }];
    const append = (parentId: string, depth: number) => folders.filter((folder) => folder.parentId === parentId).forEach((folder) => { options.push({ label: `${"　".repeat(depth)}${folder.name}`, value: folder.id }); append(folder.id, depth + 1); });
    append("", 0);
    return options;
}
