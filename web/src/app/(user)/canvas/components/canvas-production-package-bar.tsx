import { FilePlus2, FileText, Link2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

import type { CanvasProductionPackageSummary } from "../utils/canvas-production-packages";

export function CanvasProductionPackageBar({
    packages,
    activePackageId,
    inspectorCollapsed,
    selectedVideoNodeId,
    onSelect,
    onInsertConfig,
    onEditPrompt,
    onBindVideo,
}: {
    packages: CanvasProductionPackageSummary[];
    activePackageId: string;
    inspectorCollapsed: boolean;
    selectedVideoNodeId: string;
    onSelect: (productionPackage: CanvasProductionPackageSummary) => void;
    onInsertConfig: (packageId: string) => void;
    onEditPrompt: (packageId: string) => void;
    onBindVideo: (packageId: string, nodeId: string) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const activePackageStyle =
        colorTheme === "light"
            ? {
                  background: "rgba(219,234,254,.92)",
                  border: "#2563eb",
                  text: "#1e3a8a",
                  muted: "#2563eb",
                  actionBackground: "rgba(37,99,235,.10)",
              }
            : {
                  background: "rgba(34,211,238,.14)",
                  border: "rgba(34,211,238,.72)",
                  text: "rgb(103,232,249)",
                  muted: "rgb(165,243,252)",
                  actionBackground: "rgba(34,211,238,.18)",
              };
    if (!packages.length) return null;
    return (
        <div className={`pointer-events-none absolute left-4 ${inspectorCollapsed ? "right-14" : "right-[440px]"} top-16 z-40 flex justify-center`}>
            <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto rounded-xl border p-1.5 backdrop-blur-md" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} data-canvas-no-zoom>
                {packages.map((item) => {
                    const active = item.id === activePackageId;
                    const visibleVersionCount = item.versions.filter((version) => !version.hidden).length;
                    return (
                        <div
                            key={item.id}
                            className="min-w-[150px] rounded-lg border px-3 py-2 transition hover:opacity-95"
                            style={{ background: active ? activePackageStyle.background : theme.node.fill, borderColor: active ? activePackageStyle.border : theme.node.stroke, color: active ? activePackageStyle.text : theme.node.text }}
                            title={`${item.label} · ${item.title}`}
                        >
                            <button type="button" className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" onClick={() => onSelect(item)}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="truncate text-sm font-semibold">{item.label}</div>
                                    <span
                                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                                        style={{ borderColor: active ? activePackageStyle.border : theme.node.stroke, background: active ? activePackageStyle.border : "transparent" }}
                                        aria-hidden
                                    >
                                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                                    </span>
                                </div>
                                <div className="mt-1 truncate text-xs" style={{ color: active ? activePackageStyle.muted : theme.node.muted }}>
                                    {item.statusLabel}
                                </div>
                                <div className="mt-1 truncate text-[11px]" style={{ color: active ? activePackageStyle.muted : theme.node.muted }}>
                                    节点 {item.nodeIds.length} · 版本 {visibleVersionCount}
                                </div>
                            </button>
                            <div className="mt-2 flex items-center gap-1.5">
                                <button
                                    type="button"
                                    className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border px-2 text-[11px] font-medium transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                                    onClick={() => onInsertConfig(item.id)}
                                    title={item.configNodeId ? "查看生产包配置节点" : "将生产包配置放入画布"}
                                >
                                    <FilePlus2 className="size-3" />
                                    {item.configNodeId ? "配置节点" : "新建配置"}
                                </button>
                                {selectedVideoNodeId ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                        style={{
                                            background: active ? activePackageStyle.actionBackground : theme.toolbar.panel,
                                            borderColor: active ? activePackageStyle.border : theme.node.stroke,
                                            color: active ? activePackageStyle.text : theme.node.muted,
                                        }}
                                        onClick={() => onBindVideo(item.id, selectedVideoNodeId)}
                                        title={`将选中视频绑定到 ${item.label}`}
                                        aria-label={`将选中视频绑定到 ${item.label}`}
                                    >
                                        <Link2 className="size-3" />
                                    </button>
                                ) : item.configNodeId ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.muted }}
                                        onClick={() => onEditPrompt(item.id)}
                                        title="编辑提示词"
                                        aria-label="编辑提示词"
                                    >
                                        <FileText className="size-3" />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
