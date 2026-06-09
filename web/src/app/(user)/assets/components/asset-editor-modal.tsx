"use client";

import { Upload } from "lucide-react";
import type { RefObject } from "react";
import { Button, Form, Input, Modal, Select, Space, Tag, Typography, type FormInstance } from "antd";

import { formatBytes } from "@/lib/image-utils";
import type { Asset, AssetKind, AudioAsset, ImageAsset, VideoAsset } from "@/stores/use-asset-store";

export type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    folderId?: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

export type ImageDraft = ImageAsset["data"] | null;
export type MediaDraft = VideoAsset["data"] | AudioAsset["data"] | null;

type AssetEditorModalProps = {
    open: boolean;
    editingAsset: Asset | null;
    form: FormInstance<AssetFormValues>;
    formKind: AssetKind;
    folderOptions: Array<{ label: string; value: string }>;
    coverUrl: string;
    title: string;
    tags: string[];
    content: string;
    imageDraft: ImageDraft;
    mediaDraft: MediaDraft;
    coverInputRef: RefObject<HTMLInputElement | null>;
    imageInputRef: RefObject<HTMLInputElement | null>;
    mediaInputRef: RefObject<HTMLInputElement | null>;
    onCancel: () => void;
    onSave: () => void | Promise<void>;
    onKindChange: (kind: AssetKind) => void;
    onReadCoverFile: (file?: File) => void | Promise<void>;
    onReadImageFile: (file?: File) => void | Promise<void>;
    onReadMediaFile: (file?: File) => void | Promise<void>;
};

export function AssetEditorModal({
    open,
    editingAsset,
    form,
    formKind,
    folderOptions,
    coverUrl,
    title,
    tags,
    content,
    imageDraft,
    mediaDraft,
    coverInputRef,
    imageInputRef,
    mediaInputRef,
    onCancel,
    onSave,
    onKindChange,
    onReadCoverFile,
    onReadImageFile,
    onReadMediaFile,
}: AssetEditorModalProps) {
    return (
        <Modal className="studio-modal" title={editingAsset ? "编辑素材" : "新增素材"} open={open} width={980} onCancel={onCancel} onOk={() => void onSave()} okText="保存" cancelText="取消" destroyOnHidden>
            <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "text", tags: [] }}>
                    <Form.Item name="kind" label="类型">
                        <Select
                            options={[
                                { label: "文本", value: "text" },
                                { label: "图片", value: "image" },
                                { label: "视频", value: "video" },
                                { label: "音频", value: "audio" },
                            ]}
                            onChange={onKindChange}
                        />
                    </Form.Item>
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input size="large" placeholder="给素材起一个容易检索的名字" />
                    </Form.Item>
                    <Form.Item name="folderId" label="文件夹">
                        <Select options={folderOptions} />
                    </Form.Item>
                    <Form.Item name="coverUrl" label="封面 URL">
                        <Space.Compact className="w-full">
                            <Input placeholder="可粘贴图片 URL，也可以上传本地封面" />
                            <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                上传
                            </Button>
                        </Space.Compact>
                    </Form.Item>
                    <Form.Item name="tags" label="标签">
                        <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item name="source" label="来源">
                            <Input placeholder="手动添加 / 画布 / 提示词库" />
                        </Form.Item>
                        <Form.Item name="note" label="备注">
                            <Input placeholder="可选" />
                        </Form.Item>
                    </div>
                    <AssetContentForm formKind={formKind} imageDraft={imageDraft} mediaDraft={mediaDraft} imageInputRef={imageInputRef} mediaInputRef={mediaInputRef} />
                </Form>
                <AssetEditorPreview formKind={formKind} coverUrl={coverUrl} title={title} tags={tags} content={content} imageDraft={imageDraft} mediaDraft={mediaDraft} />
            </div>
            <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void onReadCoverFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void onReadImageFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
            <input
                ref={mediaInputRef}
                type="file"
                accept={formKind === "audio" ? "audio/*" : "video/*"}
                className="hidden"
                onChange={(event) => {
                    void onReadMediaFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
        </Modal>
    );
}

function AssetContentForm({
    formKind,
    imageDraft,
    mediaDraft,
    imageInputRef,
    mediaInputRef,
}: {
    formKind: AssetKind;
    imageDraft: ImageDraft;
    mediaDraft: MediaDraft;
    imageInputRef: RefObject<HTMLInputElement | null>;
    mediaInputRef: RefObject<HTMLInputElement | null>;
}) {
    if (formKind === "text") {
        return (
            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
            </Form.Item>
        );
    }

    if (formKind === "image") {
        return (
            <Form.Item label="图片内容" required>
                <div className="rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] p-4">
                    <Button icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                        选择图片文件
                    </Button>
                    <Typography.Text className="ml-3 text-sm !text-[var(--studio-text-muted)]">
                        {imageDraft ? `${imageDraft.width}x${imageDraft.height} · ${formatBytes(imageDraft.bytes)}` : "未选择图片"}
                    </Typography.Text>
                </div>
            </Form.Item>
        );
    }

    return (
        <Form.Item label={formKind === "video" ? "视频内容" : "音频内容"} required>
            <div className="rounded-md border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] p-4">
                <Button icon={<Upload className="size-4" />} onClick={() => mediaInputRef.current?.click()}>
                    {formKind === "video" ? "选择视频文件" : "选择音频文件"}
                </Button>
                <Typography.Text className="ml-3 text-sm !text-[var(--studio-text-muted)]">
                    {mediaDraft ? `${formatBytes(mediaDraft.bytes)} · ${mediaDraft.mimeType}` : formKind === "video" ? "未选择视频" : "未选择音频"}
                </Typography.Text>
            </div>
        </Form.Item>
    );
}

function AssetEditorPreview({ formKind, coverUrl, title, tags, content, imageDraft, mediaDraft }: { formKind: AssetKind; coverUrl: string; title: string; tags: string[]; content: string; imageDraft: ImageDraft; mediaDraft: MediaDraft }) {
    return (
        <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
            <Typography.Text strong className="!text-[var(--studio-text-primary)]">
                预览
            </Typography.Text>
            <div className="mt-3 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)]">
                {formKind === "video" && mediaDraft ? (
                    <video src={mediaDraft.url} controls className="aspect-[4/3] w-full bg-black object-contain" />
                ) : formKind === "audio" && mediaDraft ? (
                    <div className="flex aspect-[4/3] items-center justify-center bg-[var(--studio-shell-bg)] p-5">
                        <audio src={mediaDraft.url} controls className="w-full" />
                    </div>
                ) : coverUrl || imageDraft?.dataUrl ? (
                    <img src={coverUrl || imageDraft?.dataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-[var(--studio-shell-bg)] p-5 text-center text-sm text-[var(--studio-text-muted)]">{content || "暂无封面"}</div>
                )}
                <div className="p-4">
                    <Typography.Text strong ellipsis className="block !text-[var(--studio-text-primary)]">
                        {title || "未命名素材"}
                    </Typography.Text>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.length ? (
                            tags.map((tag) => (
                                <Tag key={tag} className="studio-tag">
                                    {tag}
                                </Tag>
                            ))
                        ) : (
                            <Tag className="studio-tag">未打标签</Tag>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
