"use client";

import { CheckCircle2, Clock3, RotateCcw, UploadCloud, XCircle } from "lucide-react";
import { Button, Drawer, Flex, Progress, Typography } from "antd";

import type { AssetUploadEntry } from "../use-admin-asset-upload";

export function AssetUploadQueue({ open, queue, onClose, onRetry, onClear }: { open: boolean; queue: AssetUploadEntry[]; onClose: () => void; onRetry: (id: string) => void; onClear: () => void }) {
    const finished = queue.filter((item) => item.status === "success").length;
    const percent = queue.length ? Math.round((finished / queue.length) * 100) : 0;
    return (
        <Drawer title="上传队列" open={open} width={420} onClose={onClose} extra={<Button size="small" onClick={onClear}>清理已完成</Button>}>
            <Progress percent={percent} status={queue.some((item) => item.status === "error") ? "exception" : percent === 100 ? "success" : "active"} />
            <div className="mt-4 space-y-2">
                {queue.map((item) => {
                    const Icon = item.status === "success" ? CheckCircle2 : item.status === "error" ? XCircle : item.status === "uploading" ? UploadCloud : Clock3;
                    return (
                        <div key={item.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <Flex align="center" gap={10}>
                                <Icon className={`size-4 shrink-0 ${item.status === "error" ? "text-[var(--studio-danger)]" : item.status === "success" ? "text-[var(--studio-success)]" : "text-[var(--studio-accent)]"}`} />
                                <div className="min-w-0 flex-1"><Typography.Text ellipsis className="block">{item.file.name}</Typography.Text><Typography.Text type="secondary" className="text-xs">{item.status === "waiting" ? "等待上传" : item.status === "uploading" ? "正在上传" : item.status === "success" ? "上传完成" : item.error}</Typography.Text></div>
                                {item.status === "error" ? <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(item.id)} /> : null}
                            </Flex>
                        </div>
                    );
                })}
            </div>
        </Drawer>
    );
}
