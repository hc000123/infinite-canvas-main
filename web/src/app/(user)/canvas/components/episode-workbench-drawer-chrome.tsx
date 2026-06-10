"use client";

import { Button, Empty, Modal, Select, Space } from "antd";
import { Bot, FileText } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { canvasEpisodeLabel } from "../utils/canvas-episode-context";
import type { EpisodeWorkbenchCanvas } from "../utils/episode-workbench";

export function EpisodeWorkbenchHeader({
    activeCanvas,
    canvases,
    onBindScript,
    onCanvasChange,
    onOpenAgentSettings,
    projectTitle,
}: {
    activeCanvas?: EpisodeWorkbenchCanvas;
    canvases: EpisodeWorkbenchCanvas[];
    onBindScript: () => void;
    onCanvasChange: (canvasId: string) => void;
    onOpenAgentSettings?: () => void;
    projectTitle: string;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-white/5">
            <div>
                <div className="text-sm text-stone-500">当前项目：{projectTitle}</div>
                <div className="mt-1 text-xl font-semibold">{activeCanvas?.episodeTitle || activeCanvas?.title || "未选择画布"}</div>
            </div>
            <Space wrap>
                <Select className="min-w-72" value={activeCanvas?.id} options={canvases.map((canvas) => ({ label: `${canvasEpisodeLabel(canvas)} · ${canvas.title}`, value: canvas.id }))} onChange={onCanvasChange} />
                <Button icon={<FileText className="size-4" />} onClick={onBindScript}>
                    绑定 / 导入剧本
                </Button>
                {onOpenAgentSettings ? (
                    <Button icon={<Bot className="size-4" />} onClick={onOpenAgentSettings}>
                        Agent 工作台
                    </Button>
                ) : null}
            </Space>
        </div>
    );
}

export function EpisodeWorkbenchEmptyCanvas({ onCreateCanvas }: { onCreateCanvas?: () => void }) {
    return (
        <Empty description="当前项目还没有画布">
            {onCreateCanvas ? (
                <Button type="primary" onClick={onCreateCanvas}>
                    最后创建承接画布
                </Button>
            ) : null}
        </Empty>
    );
}

export function EpisodeWorkbenchAssetPreviewModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    return (
        <Modal title={asset?.title || "素材详情"} open={Boolean(asset)} onCancel={onClose} footer={null} destroyOnHidden>
            {asset ? (
                <div className="space-y-3 text-sm">
                    {asset.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="max-h-96 w-full rounded-lg object-contain" /> : null}
                    <div className="text-stone-500">素材 ID：{asset.id}</div>
                    <div className="text-stone-500">类型：{asset.kind}</div>
                </div>
            ) : null}
        </Modal>
    );
}
