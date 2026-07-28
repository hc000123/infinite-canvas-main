import { Button, Empty, Table, Tag } from "antd";
import { FolderInput, Trash2 } from "lucide-react";

import type { ProjectCacheFile } from "@/services/api/project-cache";

const categoryLabels = { character: "角色", scene: "场景", prop: "道具", storyboard: "分镜", other: "其他" };
const kindLabels = { image: "图片", video: "视频", audio: "音频" };

export function CacheFileTable({ files, onDelete, onMove }: { files: ProjectCacheFile[]; onDelete: (file: ProjectCacheFile) => void; onMove?: (file: ProjectCacheFile) => void }) {
    if (!files.length) return <Empty className="py-16" description="当前分类没有缓存文件" />;
    return (
        <Table
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            dataSource={files}
            columns={[
                {
                    title: "文件",
                    dataIndex: "originalName",
                    render: (value: string, item: ProjectCacheFile) => (
                        <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--studio-text-primary)]">{value || item.id}</div>
                            <div className="mt-1 truncate text-xs text-[var(--studio-text-muted)]">{item.relativePath}</div>
                        </div>
                    ),
                },
                { title: "分类", width: 120, render: (_: unknown, item: ProjectCacheFile) => <Tag>{categoryLabels[item.category]}</Tag> },
                { title: "类型", width: 90, render: (_: unknown, item: ProjectCacheFile) => kindLabels[item.kind] },
                { title: "分集", width: 140, render: (_: unknown, item: ProjectCacheFile) => item.context.episodeName || "项目共享" },
                { title: "大小", width: 100, render: (_: unknown, item: ProjectCacheFile) => formatBytes(item.bytes) },
                { title: "状态", width: 90, render: (_: unknown, item: ProjectCacheFile) => <Tag color={item.status === "missing" ? "error" : "success"}>{item.status === "missing" ? "文件缺失" : "已缓存"}</Tag> },
                {
                    title: "操作",
                    width: onMove ? 112 : 72,
                    render: (_: unknown, item: ProjectCacheFile) => (
                        <div className="flex items-center">
                            {onMove ? <Button type="text" icon={<FolderInput className="size-4" />} onClick={() => onMove(item)} aria-label="归属到项目" /> : null}
                            <Button type="text" danger icon={<Trash2 className="size-4" />} onClick={() => onDelete(item)} aria-label="删除缓存文件" />
                        </div>
                    ),
                },
            ]}
        />
    );
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
