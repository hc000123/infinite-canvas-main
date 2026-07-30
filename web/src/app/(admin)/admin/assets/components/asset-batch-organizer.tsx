"use client";

import { FolderInput, Tags, Trash2 } from "lucide-react";
import { App, Button, Form, Input, Modal, Select, Switch, Typography } from "antd";
import { useState } from "react";

import type { AdminAssetBatchUpdate, AdminAssetFolder } from "@/services/api/admin";
import { assetFolderOptions } from "./asset-folder-tree";

type OrganizeForm = { category: string; tags: string[]; episodeNumbers: string[]; allEpisodes: boolean };

export function AssetBatchOrganizer({ folders, selectedIds, onClear, onUpdate, onDelete }: { folders: AdminAssetFolder[]; selectedIds: string[]; onClear: () => void; onUpdate: (input: Omit<AdminAssetBatchUpdate, "projectId">) => Promise<unknown>; onDelete: (ids: string[]) => Promise<unknown> }) {
    const { message, modal } = App.useApp();
    const [moveOpen, setMoveOpen] = useState(false);
    const [organizeOpen, setOrganizeOpen] = useState(false);
    const [folderId, setFolderId] = useState("");
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<OrganizeForm>();
    const allEpisodes = Form.useWatch("allEpisodes", form);
    if (!selectedIds.length) return null;

    const update = async (input: Omit<AdminAssetBatchUpdate, "projectId">, done: () => void) => {
        setSaving(true);
        try {
            await onUpdate(input);
            message.success(`已整理 ${selectedIds.length} 个素材`);
            done();
            onClear();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量整理失败");
        } finally {
            setSaving(false);
        }
    };
    const remove = () => modal.confirm({ title: `删除选中的 ${selectedIds.length} 个素材？`, content: "素材记录和已上传文件都会被删除，此操作无法撤销。", okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { try { await onDelete(selectedIds); message.success("所选素材已删除"); onClear(); } catch (error) { message.error(error instanceof Error ? error.message : "批量删除失败"); } } });

    return (
        <>
            <div className="sticky bottom-3 z-10 mx-auto mt-4 flex w-fit flex-wrap items-center gap-2 rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-elevated-bg)] px-3 py-2 shadow-lg">
                <Typography.Text strong>已选 {selectedIds.length} 个</Typography.Text>
                <Button size="small" icon={<FolderInput className="size-3.5" />} onClick={() => setMoveOpen(true)}>移动</Button>
                <Button size="small" icon={<Tags className="size-3.5" />} onClick={() => { form.setFieldsValue({ category: "", tags: [], episodeNumbers: [], allEpisodes: false }); setOrganizeOpen(true); }}>批量整理</Button>
                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={remove}>删除</Button>
                <Button type="text" size="small" onClick={onClear}>取消选择</Button>
            </div>
            <Modal title="移动所选素材" open={moveOpen} confirmLoading={saving} okText="移动" cancelText="取消" onCancel={() => setMoveOpen(false)} onOk={() => void update({ ids: selectedIds, folderId }, () => setMoveOpen(false))} destroyOnHidden>
                <Select className="w-full" value={folderId} options={assetFolderOptions(folders)} onChange={setFolderId} />
            </Modal>
            <Modal title="批量整理素材" open={organizeOpen} confirmLoading={saving} okText="应用到所选素材" cancelText="取消" onCancel={() => setOrganizeOpen(false)} onOk={async () => { const values = await form.validateFields(); await update({ ids: selectedIds, ...values, episodeNumbers: values.allEpisodes ? [] : values.episodeNumbers || [] }, () => setOrganizeOpen(false)); }} destroyOnHidden>
                <Typography.Paragraph type="secondary">这里填写的内容会替换所选素材原有的分类、标签和集数标记。</Typography.Paragraph>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="category" label="分类"><Input placeholder="可留空清除分类" /></Form.Item>
                    <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入后回车；留空清除标签" /></Form.Item>
                    <Form.Item name="allEpisodes" label="适用范围" valuePropName="checked"><Switch checkedChildren="全剧通用" unCheckedChildren="按集标记" onChange={(checked) => { if (checked) form.setFieldValue("episodeNumbers", []); }} /></Form.Item>
                    <Form.Item name="episodeNumbers" label="适用集数"><Select mode="tags" disabled={allEpisodes} tokenSeparators={[",", "，", " "]} placeholder="可多选；留空清除集数" /></Form.Item>
                </Form>
            </Modal>
        </>
    );
}
