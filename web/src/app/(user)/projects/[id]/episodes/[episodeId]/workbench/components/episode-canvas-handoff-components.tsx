import { Button } from "antd";

import type { CanvasProject } from "../../../../../../canvas/stores/use-canvas-store";
import { EpisodeStatusPill } from "./episode-module-panel";
import { padEpisodeOrder, type CanvasHandoffPackageRow } from "./episode-canvas-handoff-utils";

export function CanvasHandoffTable({
    onImport,
    onOpenAssets,
    onOpenCanvas,
    onOpenStoryboard,
    onPreview,
    rows,
    selectedPackageId,
}: {
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenAssets: () => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    onPreview: (row: CanvasHandoffPackageRow) => void;
    rows: CanvasHandoffPackageRow[];
    selectedPackageId: string;
}) {
    if (!rows.length) return <div className="px-5 py-10 text-center text-sm text-[var(--studio-text-muted)]">暂无符合筛选的生产包。</div>;
    return (
        <div className="max-h-[calc(100vh-430px)] min-h-[520px] overflow-auto">
            <div className="min-w-[800px]">
                <div className="grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-b border-[var(--studio-border-subtle)] px-5 py-3 text-xs font-medium text-[var(--studio-text-muted)]">
                    <div>生产包</div>
                    <div>内容</div>
                    <div>所属剧情段落</div>
                    <div>时长</div>
                    <div>镜头</div>
                    <div>资产</div>
                    <div>承接状态</div>
                    <div>操作</div>
                </div>
                <div className="divide-y divide-[var(--studio-border-subtle)]">
                    {rows.map((row) => {
                        const selected = row.pkg.id === selectedPackageId;
                        return (
                            <div
                                key={row.pkg.id}
                                role="button"
                                tabIndex={0}
                                className={`grid grid-cols-[56px_minmax(150px,1fr)_112px_50px_50px_72px_76px_126px] gap-2 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-[var(--studio-accent)] bg-[var(--studio-active-bg)]" : row.status === "缺资产" ? "border-[var(--studio-warning)] bg-[color-mix(in_srgb,var(--studio-warning)_6%,var(--studio-panel-bg))] hover:bg-[color-mix(in_srgb,var(--studio-warning)_10%,var(--studio-panel-bg))]" : "border-transparent hover:bg-[var(--studio-hover-bg)]"}`}
                                onClick={() => onPreview(row)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") onPreview(row);
                                }}
                            >
                                <div className="self-center text-lg font-semibold text-[var(--studio-text-primary)]">P{padEpisodeOrder(row.pkg.order)}</div>
                                <div className="min-w-0 self-center">
                                    <div className="break-words font-semibold text-[var(--studio-text-primary)]">{row.pkg.title}</div>
                                    <div className="mt-1 break-words text-[var(--studio-text-muted)]">{row.status === "已导入" ? `已创建 ${row.importedNodeCount} 个画布节点` : row.pkg.summary}</div>
                                </div>
                                <div className="self-center break-words text-[var(--studio-text-secondary)]">
                                    S{padEpisodeOrder(row.segment.order)} · {row.segment.title}
                                </div>
                                <div className="self-center font-semibold text-[var(--studio-text-secondary)]">{row.pkg.duration}s</div>
                                <div className="self-center text-[var(--studio-text-secondary)]">{row.pkg.shots.length} 镜</div>
                                <div className={`self-center font-semibold ${row.status === "缺资产" ? "text-[var(--studio-warning)]" : "text-[var(--studio-text-secondary)]"}`}>{row.assetState}</div>
                                <div className="self-center">
                                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                                </div>
                                <div className="flex flex-wrap gap-2 self-center" onClick={(event) => event.stopPropagation()}>
                                    <CanvasHandoffActionButton disabled={!row.canImport} label="导入" primary={row.canImport} onClick={() => onImport(row)} />
                                    <CanvasHandoffActionButton label="预览" onClick={() => onPreview(row)} />
                                    <CanvasHandoffActionButton label="查看画布" onClick={onOpenCanvas} />
                                    {row.status === "缺资产" ? <CanvasHandoffActionButton label="补资产" onClick={onOpenAssets} /> : null}
                                    <CanvasHandoffActionButton label="返回分镜" onClick={onOpenStoryboard} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export function CanvasHandoffPreviewPanel({
    boundCanvas,
    onCreateCanvas,
    onImport,
    onOpenCanvas,
    onOpenStoryboard,
    row,
}: {
    boundCanvas?: CanvasProject;
    onCreateCanvas: () => void;
    onImport: (row: CanvasHandoffPackageRow) => void;
    onOpenCanvas: () => void;
    onOpenStoryboard: () => void;
    row?: CanvasHandoffPackageRow;
}) {
    if (!row) return <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-5 text-sm text-[var(--studio-text-muted)] shadow-[var(--studio-shadow)] backdrop-blur-xl">请选择一个生产包查看导入预览。</aside>;
    const allAssetsBound = row.status !== "缺资产" && row.pkg.assetLabels.length > 0;
    return (
        <aside className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] shadow-[var(--studio-shadow)] backdrop-blur-xl xl:sticky xl:top-5">
            <div className="border-b border-[var(--studio-border-subtle)] p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-2xl font-semibold text-[var(--studio-text-primary)]">导入预览</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-muted)]">
                            P{padEpisodeOrder(row.pkg.order)} · {row.pkg.title}
                        </p>
                    </div>
                    <EpisodeStatusPill status={row.status} tone={row.tone} />
                </div>
            </div>
            <div className="grid max-h-[calc(100vh-260px)] gap-5 overflow-auto p-5">
                <CanvasHandoffNodePreview row={row} />
                <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                    {[
                        ["所属段落", `S${padEpisodeOrder(row.segment.order)} · ${row.segment.title}`],
                        ["预计时长", `${row.pkg.duration} 秒`],
                        ["包内镜头", `${row.pkg.shots.length} 个`],
                        ["引用资产", `${row.pkg.assetLabels.length} 项，${allAssetsBound ? "全部已绑定" : "存在缺口"}`],
                        ["承接画布", boundCanvas ? boundCanvas.title : "未创建"],
                        ["导入后", "创建剧本、资产、提示词、配置和结果占位节点"],
                    ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-[var(--studio-border-subtle)] px-4 py-3 text-sm last:border-b-0">
                            <div className="text-[var(--studio-text-muted)]">{label}</div>
                            <div className="break-words font-semibold text-[var(--studio-text-primary)]">{value}</div>
                        </div>
                    ))}
                </div>
                <div className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-4">
                    <div className="text-sm font-semibold text-[var(--studio-text-primary)]">重要限制</div>
                    <div className="mt-2 break-words text-sm leading-6 text-[var(--studio-text-muted)]">当前页面只负责导入画布节点组和查看承接状态；最终节点检查和视频生成必须进入完整画布后手动完成。</div>
                </div>
            </div>
            <div className="border-t border-[var(--studio-border-subtle)] p-5">
                <div className="grid gap-2">
                    <Button className="!rounded-md" type="primary" disabled={!row.canImport} onClick={() => onImport(row)}>
                        导入 P{padEpisodeOrder(row.pkg.order)} 到画布
                    </Button>
                    <Button className="!rounded-md" onClick={boundCanvas ? onOpenCanvas : onCreateCanvas}>
                        {boundCanvas ? "进入完整画布" : "先创建承接画布"}
                    </Button>
                    <Button className="!rounded-md" onClick={onOpenStoryboard}>
                        返回分镜生产包
                    </Button>
                </div>
            </div>
        </aside>
    );
}

function CanvasHandoffActionButton({ disabled, label, onClick, primary }: { disabled?: boolean; label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${primary ? "border-[var(--studio-border-strong)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)] hover:bg-[var(--studio-hover-bg)]" : "border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] text-[var(--studio-text-secondary)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]"}`}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function CanvasHandoffNodePreview({ row }: { row: CanvasHandoffPackageRow }) {
    const nodes = [
        { className: "studio-semantic-info studio-semantic-notice left-[6%] top-[12%]", label: "原剧本", sub: "片段节点" },
        { className: "studio-semantic-warning studio-semantic-notice left-[38%] top-[38%]", label: "引用资产", sub: `${row.pkg.assetLabels.length || 1} 项` },
        { className: "studio-semantic-success studio-semantic-notice right-[7%] top-[62%]", label: "提示词 + 配置", sub: "待画布检查" },
        { className: "left-[10%] bottom-[12%] border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]", label: "结果占位", sub: "生成后回流" },
    ];
    return (
        <div className="overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
            <div className="border-b border-[var(--studio-border-subtle)] px-4 py-3 text-sm font-semibold text-[var(--studio-text-primary)]">导入后会创建的画布节点</div>
            <div className="relative h-64 bg-[linear-gradient(var(--studio-border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--studio-border-subtle)_1px,transparent_1px)] bg-[size:28px_28px]">
                <div className="absolute left-[27%] top-[26%] h-px w-[29%] rotate-[20deg] bg-[color-mix(in_srgb,var(--studio-accent)_34%,transparent)]" />
                <div className="absolute left-[58%] top-[52%] h-px w-[26%] rotate-[24deg] bg-[color-mix(in_srgb,var(--studio-accent)_34%,transparent)]" />
                <div className="absolute left-[20%] top-[58%] h-px w-[28%] -rotate-[28deg] bg-[color-mix(in_srgb,var(--studio-accent)_22%,transparent)]" />
                {nodes.map((node) => (
                    <div key={node.label} className={`absolute w-32 rounded-md border px-3 py-3 shadow-[var(--studio-shadow)] ${node.className}`}>
                        <div className="text-sm font-semibold text-[var(--studio-text-primary)]">{node.label}</div>
                        <div className="mt-1 text-xs text-[var(--studio-text-muted)]">{node.sub}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
