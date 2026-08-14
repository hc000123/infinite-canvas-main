"use client";

import { Alert, Button, Modal } from "antd";
import { CloudUpload, Eraser } from "lucide-react";

import type { VideoSubtitleEraseCapabilities } from "@/services/api/video-subtitle-erase";
import type { CanvasNodeData } from "../types";

export function CanvasVideoSubtitleEraseModal({ node, capabilities, loading, onClose, onSubmit }: { node: CanvasNodeData | null; capabilities: VideoSubtitleEraseCapabilities | null; loading: boolean; onClose: () => void; onSubmit: (node: CanvasNodeData) => void }) {
    const width = Math.round(node?.metadata?.naturalWidth || node?.width || 0);
    const height = Math.round(node?.metadata?.naturalHeight || node?.height || 0);
    const duration = node?.metadata?.subtitleErase?.inputDurationSeconds || Number(node?.metadata?.duration || node?.metadata?.seconds || 0);
    const unitPriceCny = capabilities?.pricing.unitPriceCny;
    const estimatedCostCny = duration > 0 && unitPriceCny !== undefined ? (duration / 60) * unitPriceCny : null;
    const exceedsInputLimit = Boolean(capabilities && width && height && (width > capabilities.maxInputWidth || height > capabilities.maxInputHeight));
    const canSubmit = capabilities?.enabled === true && !exceedsInputLimit;

    return (
        <Modal title="擦除视频硬字幕" open={Boolean(node)} onCancel={onClose} footer={null} width={520} centered destroyOnHidden>
            {node ? (
                <div className="space-y-4">
                    <Alert showIcon icon={<CloudUpload className="size-4" />} type="info" title="视频将上传到云端付费服务处理" description="将使用火山引擎 LAS 擦除画面内嵌硬字幕。原视频节点不会被替换，结果会作为右侧新节点加入画布并归档到资产。" />
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--studio-panel-muted-bg)] p-3 text-sm">
                        <Spec label="源规格" value={width && height ? `${width} × ${height}` : "待识别"} />
                        <Spec label="时长" value={duration ? `${formatNumber(duration)} 秒` : "待识别"} />
                        <Spec label="计费单价" value={unitPriceCny !== undefined ? `${formatNumber(unitPriceCny)} 元/分钟` : "0.4 元/分钟（待确认）"} />
                    </div>
                    <div className="rounded-lg border border-[var(--studio-border-subtle)] p-3">
                        <div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium">费用预估</span><span className="font-semibold text-[var(--studio-text-primary)]">{estimatedCostCny === null ? "待识别" : `¥${estimatedCostCny.toFixed(2)}`}</span></div>
                        <div className="mt-2 text-xs text-[var(--studio-text-tertiary)]">按视频时长 × {unitPriceCny !== undefined ? `${formatNumber(unitPriceCny)} 元/分钟` : "0.4 元/分钟"}估算，实际费用以火山引擎账单为准。</div>
                    </div>
                    <Alert type="warning" showIcon title="适用性与规格限制" description="输入最高 2K，输出最高 1080P。竖屏白色字幕效果更佳，复杂背景可能模糊；擦除区域也可能出现轻微修补痕迹。" />
                    {exceedsInputLimit ? <Alert type="error" showIcon title="当前视频超过最高 2K 输入限制" description="请先缩小视频分辨率后再提交，避免创建无效云端任务。" /> : null}
                    {!capabilities?.enabled ? <Alert type="warning" showIcon title={capabilities ? "服务端尚未启用字幕擦除" : "暂时无法确认字幕擦除配置"} description="请让管理员在后台 LAS 视频处理设置中启用字幕擦除。" /> : null}
                    <Button type="primary" block size="large" icon={<Eraser className="size-4" />} loading={loading} disabled={!canSubmit} onClick={() => onSubmit(node)}>
                        {estimatedCostCny === null ? "确认云端付费 · 开始擦字幕" : `预计 ¥${estimatedCostCny.toFixed(2)} · 开始擦字幕`}
                    </Button>
                </div>
            ) : null}
        </Modal>
    );
}

function Spec({ label, value }: { label: string; value: string }) {
    return <div><div className="text-xs text-[var(--studio-text-tertiary)]">{label}</div><div className="mt-1 font-medium text-[var(--studio-text-primary)]">{value}</div></div>;
}

function formatNumber(value: number) {
    return Number(value.toFixed(3)).toString();
}
