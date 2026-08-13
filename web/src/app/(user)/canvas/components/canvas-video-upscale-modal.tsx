"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Segmented } from "antd";
import { CloudUpload, Sparkles } from "lucide-react";

import type { VideoUpscaleCapabilities } from "@/services/api/video-upscale";
import type { CanvasNodeData } from "../types";

type Target = "1080p" | "2k";

export function CanvasVideoUpscaleModal({ node, capabilities, loading, onClose, onSubmit }: { node: CanvasNodeData | null; capabilities: VideoUpscaleCapabilities | null; loading: boolean; onClose: () => void; onSubmit: (node: CanvasNodeData, target: Target) => void }) {
    const width = Math.round(node?.metadata?.naturalWidth || node?.width || 0);
    const height = Math.round(node?.metadata?.naturalHeight || node?.height || 0);
    const shortEdge = Math.min(width, height);
    const availableTargets = useMemo<Target[]>(() => {
        if (!shortEdge) return capabilities?.targets || [];
        if (shortEdge < 1080) return capabilities?.targets.includes("1080p") ? ["1080p"] : [];
        if (shortEdge < 1440) return capabilities?.targets.includes("2k") ? ["2k"] : [];
        return [];
    }, [capabilities, shortEdge]);
    const [target, setTarget] = useState<Target>("1080p");
    useEffect(() => setTarget(availableTargets[0] || "1080p"), [node?.id, availableTargets]);
    const output = outputSize(width, height, target);
    const duration = node?.metadata?.videoUpscale?.inputDurationSeconds || Number(node?.metadata?.duration || node?.metadata?.seconds || 0);
    const enabled = capabilities?.enabled === true;
    const canSubmit = enabled && availableTargets.includes(target);

    return (
        <Modal title="视频超分" open={Boolean(node)} onCancel={onClose} footer={null} width={480} centered destroyOnHidden>
            {node ? (
                <div className="space-y-4">
                    <Alert showIcon icon={<CloudUpload className="size-4" />} type="info" title="视频将上传到云端付费服务处理" description="将使用火山引擎完成增强。原视频节点不会被替换，结果会作为右侧新节点加入画布并归档到资产。" />
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--studio-panel-muted-bg)] p-3 text-sm">
                        <Spec label="源规格" value={width && height ? `${width} × ${height}` : "等待服务端识别"} />
                        <Spec label="目标规格" value={output ? `${output.width} × ${output.height}` : target === "2k" ? "2K" : "1080p"} />
                        <Spec label="时长" value={duration ? `${duration} 秒` : "保持原时长"} />
                    </div>
                    {availableTargets.length ? (
                        <div>
                            <div className="mb-2 text-sm font-medium">目标清晰度</div>
                            <Segmented block value={target} options={availableTargets.map((value) => ({ label: value === "2k" ? "2K" : "1080p", value }))} onChange={(value) => setTarget(value as Target)} />
                        </div>
                    ) : null}
                    {shortEdge >= 1440 ? <Alert type="success" showIcon title="当前视频已达到 2K" description="首期无需继续超分，因此不会提交云端任务。" /> : null}
                    {!enabled ? <Alert type="warning" showIcon title={capabilities ? "服务端尚未启用视频超分" : "暂时无法确认视频超分配置"} description="请让管理员在后台设置中启用视频超分并配置火山视频点播空间。" /> : null}
                    <Button type="primary" block size="large" icon={<Sparkles className="size-4" />} loading={loading} disabled={!canSubmit} onClick={() => onSubmit(node, target)}>
                        开始视频超分
                    </Button>
                </div>
            ) : null}
        </Modal>
    );
}

function Spec({ label, value }: { label: string; value: string }) {
    return <div><div className="text-xs text-[var(--studio-text-tertiary)]">{label}</div><div className="mt-1 font-medium text-[var(--studio-text-primary)]">{value}</div></div>;
}

function outputSize(width: number, height: number, target: Target) {
    if (!width || !height) return null;
    const targetShortEdge = target === "2k" ? 1440 : 1080;
    const scale = targetShortEdge / Math.min(width, height);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
