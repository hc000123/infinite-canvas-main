"use client";

import { DeleteOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { App, Button, Drawer, Form, Input, Select, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type { AdminAsset } from "@/services/api/admin";
import { assetTypeLabel } from "./asset-file-grid";

type AssetForm = { title: string; category: string; tags: string[]; description: string; content: string; episodeNumbers: string[]; allEpisodes: boolean };

export function AssetDetailDrawer({ asset, onClose, onSave, onDelete, onSubmitReview, onRefreshReview }: { asset: AdminAsset | null; onClose: () => void; onSave: (asset: Partial<AdminAsset>) => Promise<unknown>; onDelete: (id: string) => Promise<unknown>; onSubmitReview: (asset: AdminAsset) => Promise<unknown>; onRefreshReview: (asset: AdminAsset) => Promise<unknown> }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<AssetForm>();
    const [saving, setSaving] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const allEpisodes = Form.useWatch("allEpisodes", form);

    useEffect(() => {
        if (!asset) return;
        form.setFieldsValue({ title: asset.title, category: asset.category || "", tags: asset.tags || [], description: asset.description || "", content: asset.content || "", episodeNumbers: asset.episodeNumbers || [], allEpisodes: Boolean(asset.allEpisodes) });
    }, [asset, form]);

    const save = async () => {
        if (!asset) return;
        const values = await form.validateFields();
        setSaving(true);
        try {
            await onSave({ ...asset, ...values, episodeNumbers: values.allEpisodes ? [] : values.episodeNumbers || [] });
            message.success("素材信息已保存");
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存素材失败");
        } finally {
            setSaving(false);
        }
    };
    const remove = () => {
        if (!asset) return;
        modal.confirm({ title: `删除“${asset.title}”？`, content: "素材记录和已上传文件都会被删除，此操作无法撤销。", okText: "确认删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: async () => { try { await onDelete(asset.id); message.success("素材已删除"); onClose(); } catch (error) { message.error(error instanceof Error ? error.message : "删除素材失败"); } } });
    };
    const review = async (refresh: boolean) => {
        if (!asset) return;
        setReviewing(true);
        try {
            await (refresh ? onRefreshReview(asset) : onSubmitReview(asset));
            message.success(refresh ? "审核状态已刷新" : "已提交火山素材审核");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材审核操作失败");
        } finally {
            setReviewing(false);
        }
    };

    return (
        <Drawer title="素材详情" open={Boolean(asset)} width={520} onClose={onClose} extra={<Space><Button danger type="text" icon={<DeleteOutlined />} onClick={remove}>删除</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存</Button></Space>}>
            {asset ? (
                <>
                    {asset.type === "image" && (asset.coverUrl || asset.url) ? <img src={asset.coverUrl || asset.url} alt={asset.title} className="mb-5 aspect-video w-full rounded-lg bg-[var(--studio-panel-muted-bg)] object-contain" /> : null}
                    {asset.type === "video" && asset.url ? <video src={asset.url} controls className="mb-5 aspect-video w-full rounded-lg bg-black" /> : null}
                    {asset.type === "audio" && asset.url ? <audio src={asset.url} controls className="mb-5 w-full" /> : null}
                    <div className="mb-4 flex flex-wrap gap-2"><Tag>{assetTypeLabel(asset.type)}</Tag>{asset.volcengineStatus ? <Tag color={asset.volcengineStatus === "Active" ? "success" : asset.volcengineStatus === "Failed" ? "error" : "processing"}>{asset.volcengineStatus}</Tag> : null}</div>
                    <Form form={form} layout="vertical" requiredMark={false}>
                        <Form.Item name="title" label="名称" rules={[{ required: true, message: "请输入素材名称" }]}><Input /></Form.Item>
                        <Form.Item name="category" label="分类（可选）"><Input placeholder="例如：角色、场景、道具" /></Form.Item>
                        <Form.Item name="tags" label="标签（可选）"><Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入后回车" /></Form.Item>
                        <Form.Item name="allEpisodes" label="适用范围" valuePropName="checked"><Switch checkedChildren="全剧通用" unCheckedChildren="按集标记" onChange={(checked) => { if (checked) form.setFieldValue("episodeNumbers", []); }} /></Form.Item>
                        <Form.Item name="episodeNumbers" label="适用集数（可多选）"><Select mode="tags" disabled={allEpisodes} tokenSeparators={[",", "，", " "]} placeholder="例如：1、2、5" /></Form.Item>
                        <Form.Item name="description" label="描述（可选）"><Input.TextArea rows={3} /></Form.Item>
                        {asset.type === "text" ? <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}><Input.TextArea rows={8} /></Form.Item> : null}
                    </Form>
                    {asset.type !== "text" ? (
                        <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <Typography.Text strong>火山素材审核</Typography.Text>
                            <Typography.Paragraph type="secondary" className="!mb-3 !mt-1">上传和整理不依赖审核，需要用于视频参考时再提交。</Typography.Paragraph>
                            {asset.volcengineAssetId ? <Button icon={<ReloadOutlined />} loading={reviewing} onClick={() => void review(true)}>刷新审核状态</Button> : <Button icon={<SafetyCertificateOutlined />} loading={reviewing} onClick={() => void review(false)}>提交审核</Button>}
                        </div>
                    ) : null}
                </>
            ) : null}
        </Drawer>
    );
}
