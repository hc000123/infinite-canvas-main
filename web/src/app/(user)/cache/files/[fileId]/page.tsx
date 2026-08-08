"use client";

import { Alert, Button, Spin } from "antd";
import { ArrowLeft, Download, X } from "lucide-react";
import { saveAs } from "file-saver";
import { useParams } from "next/navigation";

import { useUserStore } from "@/stores/use-user-store";
import { useCacheFileObjectUrl } from "../../use-cache-file-object-url";

export default function CacheFileViewerPage() {
    const params = useParams<{ fileId: string }>();
    const fileId = params.fileId || "";
    const isReady = useUserStore((state) => state.isReady);
    const token = useUserStore((state) => state.token);
    const { url, blob, filename, mimeType, loading, error } = useCacheFileObjectUrl(fileId, isReady && Boolean(token));
    const sessionError = isReady && !token ? "登录状态不可用，请重新登录后再查看" : "";

    return (
        <main className="studio-workspace studio-shell h-full min-h-0 overflow-auto bg-[var(--studio-shell-bg)] p-4 text-[var(--studio-text-primary)] md:p-6">
            <div className="mx-auto flex min-h-full max-w-[1440px] flex-col overflow-hidden rounded-xl border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)]">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border-subtle)] px-5 py-4">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold">{filename || "缓存原文件"}</h1>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">文件通过当前登录身份安全读取，地址中不包含本地磁盘路径</p>
                    </div>
                    <div className="flex gap-2">
                        <Button href="/cache" icon={<ArrowLeft className="size-4" />}>返回缓存管理</Button>
                        <Button icon={<Download className="size-4" />} disabled={!blob} onClick={() => blob && saveAs(blob, filename || fileId)}>下载</Button>
                        <Button icon={<X className="size-4" />} onClick={() => window.close()}>关闭页面</Button>
                    </div>
                </header>
                <section className="grid min-h-[560px] flex-1 place-items-center bg-[var(--studio-panel-muted-bg)] p-5">
                    {!isReady || loading ? <Spin description="正在读取缓存文件" /> : sessionError || error ? <Alert type="error" showIcon message="无法打开原文件" description={sessionError || error} /> : url ? <ViewerMedia url={url} mimeType={mimeType || blob?.type || ""} filename={filename || fileId} /> : null}
                </section>
            </div>
        </main>
    );
}

function ViewerMedia({ url, mimeType, filename }: { url: string; mimeType: string; filename: string }) {
    if (mimeType.startsWith("image/")) return <img src={url} alt={filename} className="max-h-[calc(100dvh-190px)] max-w-full object-contain" />;
    if (mimeType.startsWith("video/")) return <video src={url} controls autoPlay className="max-h-[calc(100dvh-190px)] max-w-full" />;
    if (mimeType.startsWith("audio/")) return <audio src={url} controls autoPlay className="w-full max-w-3xl" />;
    return <Alert type="info" showIcon message="当前文件类型不支持浏览器预览" description="可以使用页面右上角的下载按钮保存原文件。" />;
}
