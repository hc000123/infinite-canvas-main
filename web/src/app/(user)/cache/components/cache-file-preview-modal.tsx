"use client";

import { Alert, App, Button, Modal, Spin, Tag } from "antd";
import { Copy, Download, ExternalLink } from "lucide-react";
import copy from "copy-to-clipboard";
import { saveAs } from "file-saver";

import type { ProjectCacheFile } from "@/services/api/project-cache";
import { useCacheFileObjectUrl } from "../use-cache-file-object-url";

export function CacheFilePreviewModal({ file, onClose }: { file?: ProjectCacheFile; onClose: () => void }) {
    const { message } = App.useApp();
    const { url, blob, filename, loading, error } = useCacheFileObjectUrl(file?.id || "", Boolean(file && file.status === "ready"));
    const prompt = file?.context.prompt.trim() || "";
    return (
        <Modal
            rootClassName="studio-modal"
            open={Boolean(file)}
            title={file?.originalName || "缓存文件预览"}
            width={960}
            footer={file ? (
                <div className="flex justify-end gap-2">
                    <Button icon={<ExternalLink className="size-4" />} href={`/cache/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">新标签查看原文件</Button>
                    <Button type="primary" icon={<Download className="size-4" />} disabled={!blob} onClick={() => blob && saveAs(blob, filename || file.originalName || file.id)}>下载</Button>
                </div>
            ) : null}
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="space-y-3">
                <div className="grid min-h-[360px] place-items-center overflow-hidden rounded-lg bg-[var(--studio-panel-muted-bg)] p-4">
                    {loading ? <Spin description="正在读取缓存文件" /> : error ? <Alert type="error" showIcon message="无法预览" description={error} /> : file && url ? <CacheMedia file={file} url={url} /> : null}
                </div>
                {file?.kind === "video" ? (
                    <section className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">生成提示词</h3>
                            {file.context.model ? <Tag className="m-0">{file.context.model}</Tag> : null}
                            {file.context.provider ? <Tag className="m-0">{file.context.provider}</Tag> : null}
                            {prompt ? <Button className="ml-auto" type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => { copy(prompt); message.success("提示词已复制"); }}>复制提示词</Button> : null}
                        </div>
                        {prompt ? <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--studio-panel-bg)] p-3 text-sm leading-6 text-[var(--studio-text-secondary)]">{prompt}</pre> : <p className="mt-3 text-sm text-[var(--studio-text-muted)]">该缓存未记录生成提示词</p>}
                    </section>
                ) : null}
            </div>
        </Modal>
    );
}

function CacheMedia({ file, url }: { file: ProjectCacheFile; url: string }) {
    if (file.kind === "image") return <img src={url} alt={file.originalName || "缓存图片"} className="max-h-[70vh] max-w-full object-contain" />;
    if (file.kind === "video") return <video src={url} controls autoPlay className="max-h-[70vh] max-w-full" />;
    return <audio src={url} controls autoPlay className="w-full" />;
}
