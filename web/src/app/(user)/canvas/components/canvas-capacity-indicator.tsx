import { useState } from "react";
import { Activity, Database } from "lucide-react";
import { Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { formatCanvasCapacityBytes, type CanvasCapacitySnapshot } from "../utils/canvas-capacity";

export function CanvasCapacityIndicator({ capacity }: { capacity: CanvasCapacitySnapshot }) {
    const [open, setOpen] = useState(false);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const statusColor = capacity.level === "critical" ? "var(--studio-danger)" : capacity.level === "warning" ? "var(--studio-warning)" : theme.node.muted;

    return (
        <>
            <button
                type="button"
                data-canvas-no-zoom
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                style={{ color: statusColor }}
                onClick={() => setOpen(true)}
                aria-label="画布容量"
                title="查看画布容量"
            >
                <Activity className="size-3.5" />
                <span>{capacity.nodeCount} 节点</span>
                <span className="hidden sm:inline">· {capacity.connectionCount} 连线</span>
            </button>
            <Modal rootClassName="studio-modal" title="画布容量" open={open} footer={null} centered onCancel={() => setOpen(false)}>
                <div className="space-y-4 border-t pt-4" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <CapacityItem label="节点" value={capacity.nodeCount} />
                        <CapacityItem label="连线" value={capacity.connectionCount} />
                        <CapacityItem label="生成配置" value={capacity.configNodeCount} />
                        <CapacityItem label="媒体节点" value={capacity.mediaNodeCount} />
                        <CapacityItem label="历史媒体版本" value={capacity.mediaVersionCount} />
                        <CapacityItem label="本画布媒体估算" value={formatCanvasCapacityBytes(capacity.mediaBytes)} />
                    </div>
                    {capacity.storageUsage !== undefined ? (
                        <div className="flex items-center justify-between gap-4 rounded-md px-3 py-2 text-sm" style={{ background: theme.toolbar.panel }}>
                            <span className="inline-flex items-center gap-2" style={{ color: theme.node.muted }}>
                                <Database className="size-4" />浏览器全部本地缓存
                            </span>
                            <span className="font-medium">
                                {formatCanvasCapacityBytes(capacity.storageUsage)}
                                {capacity.storageQuota ? ` / ${formatCanvasCapacityBytes(capacity.storageQuota)}` : ""}
                            </span>
                        </div>
                    ) : null}
                    {capacity.reasons.length ? (
                        <div className="rounded-md border px-3 py-2 text-sm leading-6" style={{ borderColor: statusColor, color: statusColor }}>
                            {capacity.reasons.map((reason) => <div key={reason}>{reason}</div>)}
                        </div>
                    ) : (
                        <div className="text-sm" style={{ color: theme.node.muted }}>当前画布规模正常。</div>
                    )}
                    <div className="text-xs leading-5" style={{ color: theme.node.muted }}>容量状态只做软提醒，不会阻止继续创建、导入或生成。复杂媒体和密集连线会比相同数量的文本节点占用更多资源。</div>
                </div>
            </Modal>
        </>
    );
}

function CapacityItem({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md bg-[var(--studio-panel-muted-bg)] px-3 py-2">
            <div className="text-[11px] text-[var(--studio-text-muted)]">{label}</div>
            <div className="mt-1 text-sm font-semibold text-[var(--studio-text-primary)]">{value}</div>
        </div>
    );
}
