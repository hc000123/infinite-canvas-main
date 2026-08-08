"use client";

import { Alert, Button, Modal, Spin } from "antd";
import { Download, ExternalLink } from "lucide-react";
import { saveAs } from "file-saver";

import type { ProjectCacheFile } from "@/services/api/project-cache";
import { useCacheFileObjectUrl } from "../use-cache-file-object-url";

export function CacheFilePreviewModal({ file, onClose }: { file?: ProjectCacheFile; onClose: () => void }) {
    const { url, blob, filename, loading, error } = useCacheFileObjectUrl(file?.id || "", Boolean(file && file.status === "ready"));
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
            <div className="grid min-h-[360px] place-items-center overflow-hidden rounded-lg bg-[var(--studio-panel-muted-bg)] p-4">
                {loading ? <Spin description="正在读取缓存文件" /> : error ? <Alert type="error" showIcon message="无法预览" description={error} /> : file && url ? <CacheMedia file={file} url={url} /> : null}
            </div>
        </Modal>
    );
}

function CacheMedia({ file, url }: { file: ProjectCacheFile; url: string }) {
    if (file.kind === "image") return <img src={url} alt={file.originalName || "缓存图片"} className="max-h-[70vh] max-w-full object-contain" />;
    if (file.kind === "video") return <video src={url} controls autoPlay className="max-h-[70vh] max-w-full" />;
    return <audio src={url} controls autoPlay className="w-full" />;
}
