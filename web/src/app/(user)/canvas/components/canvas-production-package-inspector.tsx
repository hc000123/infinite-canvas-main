"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Download, Eye, EyeOff, FileText, Image as ImageIcon, Link2, MessageSquare, Upload, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "../types";
import type { CanvasProductionPackageSummary, CanvasProductionVideoVersion } from "../utils/canvas-production-packages";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

export function ProductionPackageInfoContent({
    productionPackage,
    theme,
    onPreviewProductionVideoVersion,
    onDownloadProductionVideoVersion,
    onSetCurrentProductionVideoVersion,
    onHideProductionVideoVersion,
}: {
    productionPackage: CanvasProductionPackageSummary;
    theme: CanvasTheme;
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
}) {
    return (
        <div className="thin-scrollbar max-h-[70vh] overflow-y-auto">
            <ProductionPackageBindingSection productionPackage={productionPackage} theme={theme} />
            <VideoVersionsSection
                productionPackage={productionPackage}
                theme={theme}
                onPreview={onPreviewProductionVideoVersion}
                onDownload={onDownloadProductionVideoVersion}
                onSetCurrent={onSetCurrentProductionVideoVersion}
                onHide={onHideProductionVideoVersion}
            />
        </div>
    );
}

export function ProductionPackageContentView({
    productionPackage,
    selectedVideoNode,
    theme,
    onPreviewProductionVideoVersion,
    onDownloadProductionVideoVersion,
    onSetCurrentProductionVideoVersion,
    onHideProductionVideoVersion,
    onBindSelectedVideoToProductionPackage,
    onInsertProductionPackageConfigNode,
}: {
    productionPackage: CanvasProductionPackageSummary;
    selectedVideoNode?: CanvasNodeData | null;
    theme: CanvasTheme;
    onPreviewProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onDownloadProductionVideoVersion: (version: CanvasProductionVideoVersion) => void;
    onSetCurrentProductionVideoVersion: (packageId: string, nodeId: string) => void;
    onHideProductionVideoVersion: (nodeId: string) => void;
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
}) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ProductionPackageBindingSection productionPackage={productionPackage} theme={theme} />
            <ProductionPackageSlotSection
                productionPackage={productionPackage}
                selectedVideoNode={selectedVideoNode}
                theme={theme}
                onBindSelectedVideoToProductionPackage={onBindSelectedVideoToProductionPackage}
                onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode}
            />
            <ProductionPackageSourceSection productionPackage={productionPackage} theme={theme} onInsertProductionPackageConfigNode={onInsertProductionPackageConfigNode} />
            <VideoVersionsSection
                productionPackage={productionPackage}
                theme={theme}
                onPreview={onPreviewProductionVideoVersion}
                onDownload={onDownloadProductionVideoVersion}
                onSetCurrent={onSetCurrentProductionVideoVersion}
                onHide={onHideProductionVideoVersion}
            />
        </div>
    );
}

function ProductionPackageSlotSection({
    productionPackage,
    selectedVideoNode,
    theme,
    onBindSelectedVideoToProductionPackage,
    onInsertProductionPackageConfigNode,
}: {
    productionPackage: CanvasProductionPackageSummary;
    selectedVideoNode?: CanvasNodeData | null;
    theme: CanvasTheme;
    onBindSelectedVideoToProductionPackage: (packageId: string, nodeId: string) => void;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
}) {
    const current = productionPackage.currentVersion;
    const selectedVideoTitle = selectedVideoNode ? selectedVideoNode.title || "选中视频节点" : "";
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">结果填充槽</div>
                <span className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: current ? "rgba(34,211,238,.72)" : theme.node.stroke, color: current ? "rgb(103,232,249)" : theme.node.muted }}>
                    {current ? "已填充" : "待填充"}
                </span>
            </div>
            <div className="rounded-xl border border-dashed p-3" style={{ borderColor: current ? "rgba(34,211,238,.72)" : theme.node.stroke, background: theme.node.panel }}>
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                        <Video className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{current ? `${current.label} · ${current.node.title}` : "最终视频节点"}</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {current ? `${current.status} · ${current.duration || "未记录时长"}` : selectedVideoNode ? `已选中：${selectedVideoTitle}` : "先在画布上选中一个已生成视频节点，再填入这个槽位。"}
                        </div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <SmallInspectorButton
                        icon={<Link2 className="size-3.5" />}
                        label={current ? "替换为选中视频" : "填入选中视频"}
                        onClick={() => selectedVideoNode && onBindSelectedVideoToProductionPackage(productionPackage.id, selectedVideoNode.id)}
                        theme={theme}
                        disabled={!selectedVideoNode}
                    />
                    <SmallInspectorButton icon={<Video className="size-3.5" />} label={productionPackage.configNodeId ? "定位配置节点" : "新建视频配置"} onClick={() => onInsertProductionPackageConfigNode(productionPackage.id)} theme={theme} />
                </div>
            </div>
        </section>
    );
}

function ProductionPackageSourceSection({
    productionPackage,
    theme,
    onInsertProductionPackageConfigNode,
}: {
    productionPackage: CanvasProductionPackageSummary;
    theme: CanvasTheme;
    onInsertProductionPackageConfigNode: (packageId: string) => void;
}) {
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 text-sm font-semibold">内容素材</div>
            <div className="space-y-2">
                <SourceRow icon={<FileText className="size-4" />} title="剧情内容" value={productionPackage.sceneName} detail={`镜头范围：${productionPackage.shotRangeLabel}`} theme={theme} />
                <SourceRow icon={<MessageSquare className="size-4" />} title="提示词 / 视频配置" value={productionPackage.configNodeId ? "已放入画布" : "待创建"} detail="可生成视频配置节点后继续编辑提示词和参考输入。" theme={theme} />
                <SourceRow
                    icon={<ImageIcon className="size-4" />}
                    title="参考资产"
                    value={`${Math.max(0, productionPackage.nodeIds.length - productionPackage.versions.length)} 个关联节点`}
                    detail="可从画布节点、素材库或生产包配置继续补齐参考图、音频和文本。"
                    theme={theme}
                />
            </div>
            <div className="mt-3">
                <SmallInspectorButton icon={<Upload className="size-3.5" />} label="导入为视频配置节点" onClick={() => onInsertProductionPackageConfigNode(productionPackage.id)} theme={theme} />
            </div>
        </section>
    );
}

function SourceRow({ icon, title, value, detail, theme }: { icon: ReactNode; title: string; value: string; detail: string; theme: CanvasTheme }) {
    return (
        <div className="flex gap-2 rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: theme.toolbar.panel, color: theme.node.muted }}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{title}</span>
                    <span className="max-w-[160px] truncate" style={{ color: theme.node.muted }}>
                        {value}
                    </span>
                </div>
                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {detail}
                </div>
            </div>
        </div>
    );
}

function ProductionPackageBindingSection({ productionPackage, currentNode, theme }: { productionPackage: CanvasProductionPackageSummary; currentNode?: CanvasNodeData; theme: CanvasTheme }) {
    return (
        <section className="rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">生产包绑定</div>
                    <div className="mt-1 break-words text-base font-semibold">
                        {productionPackage.label} · {productionPackage.title}
                    </div>
                </div>
                <span
                    className="shrink-0 rounded-md border px-2 py-1 text-xs"
                    style={{ borderColor: productionPackage.currentVersion ? "rgba(34,211,238,.72)" : theme.node.stroke, color: productionPackage.currentVersion ? "rgb(103,232,249)" : theme.node.muted }}
                >
                    {productionPackage.statusLabel}
                </span>
            </div>
            <div className="space-y-1.5">
                <InspectorRow label="所属段落" value={productionPackage.sceneName} theme={theme} />
                <InspectorRow label="镜头范围" value={productionPackage.shotRangeLabel} theme={theme} />
                <InspectorRow label="包内节点" value={`${productionPackage.nodeIds.length} 个`} theme={theme} />
                <InspectorRow label="当前版本" value={productionPackage.currentVersion ? `${productionPackage.currentVersion.label} · 已采用` : "暂无"} theme={theme} />
                <InspectorRow label="版本数量" value={`${productionPackage.versions.filter((version) => !version.hidden).length} 个视频结果`} theme={theme} />
                {currentNode ? <InspectorRow label="当前节点" value={currentNode.title} theme={theme} /> : null}
            </div>
        </section>
    );
}

function VideoVersionsSection({
    productionPackage,
    theme,
    onPreview,
    onDownload,
    onSetCurrent,
    onHide,
}: {
    productionPackage: CanvasProductionPackageSummary;
    theme: CanvasTheme;
    onPreview: (version: CanvasProductionVideoVersion) => void;
    onDownload: (version: CanvasProductionVideoVersion) => void;
    onSetCurrent: (packageId: string, nodeId: string) => void;
    onHide: (nodeId: string) => void;
}) {
    const versions = productionPackage.versions;
    return (
        <section className="mt-3 rounded-xl border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">视频版本</div>
                <div className="text-xs" style={{ color: theme.node.muted }}>
                    {versions.filter((version) => !version.hidden).length} 个可用
                </div>
            </div>
            {versions.length ? (
                <div className="space-y-2">
                    {versions.map((version) => (
                        <div
                            key={version.versionId}
                            className="rounded-xl border p-3"
                            style={{
                                background: version.isCurrent ? "rgba(34,211,238,.12)" : theme.node.panel,
                                borderColor: version.isCurrent ? "rgba(34,211,238,.72)" : theme.node.stroke,
                                opacity: version.hidden ? 0.48 : 1,
                            }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-semibold">
                                        {version.label}
                                        {version.isCurrent ? " · 当前采用" : version.hidden ? " · 已隐藏" : ""}
                                    </div>
                                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {formatVersionTime(version.createdAt)} · {version.duration || "未记录时长"} · {version.status}
                                    </div>
                                </div>
                                {version.isCurrent ? (
                                    <span className="shrink-0 rounded-md border px-2 py-1 text-xs" style={{ borderColor: "rgba(34,211,238,.72)", color: "rgb(103,232,249)" }}>
                                        已采用
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-2 break-words text-xs leading-5" style={{ color: theme.node.muted }}>
                                {version.note}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <SmallInspectorButton icon={<Eye className="size-3.5" />} label="预览" onClick={() => onPreview(version)} theme={theme} />
                                <SmallInspectorButton icon={<Download className="size-3.5" />} label="导出" onClick={() => onDownload(version)} theme={theme} disabled={!version.node.metadata?.content} />
                                <SmallInspectorButton
                                    icon={<CheckCircle2 className="size-3.5" />}
                                    label="设为当前"
                                    onClick={() => onSetCurrent(productionPackage.id, version.nodeId)}
                                    theme={theme}
                                    disabled={version.isCurrent || version.hidden || version.node.metadata?.status !== "success"}
                                />
                                <SmallInspectorButton icon={<EyeOff className="size-3.5" />} label="隐藏" onClick={() => onHide(version.nodeId)} theme={theme} disabled={version.hidden} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyStatus text="暂无视频版本。可把配置节点放入画布，或先选中已有视频再绑定到这个生产包。" theme={theme} />
            )}
        </section>
    );
}

function InspectorRow({ label, value, theme }: { label: string; value: string; theme: CanvasTheme }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-xs leading-5">
            <span style={{ color: theme.node.muted }}>{label}</span>
            <span className="break-words font-medium">{value}</span>
        </div>
    );
}

function SmallInspectorButton({ icon, label, onClick, theme, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; theme: CanvasTheme; disabled?: boolean }) {
    return (
        <button
            type="button"
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function EmptyStatus({ text, theme }: { text: string; theme: CanvasTheme }) {
    return (
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            {text}
        </div>
    );
}

function formatVersionTime(value: string) {
    if (!value) return "未记录时间";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
