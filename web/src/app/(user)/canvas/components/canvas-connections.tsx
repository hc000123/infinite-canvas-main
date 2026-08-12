import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { X } from "lucide-react";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "../types";

export function ConnectionPath({ connection, from, to, active, selected, onSelect, onDelete }: { connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData; active: boolean; selected: boolean; onSelect: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const start = connectionPoint(from, "source", connection.fromHandle);
    const end = connectionPoint(to, "target", connection.toHandle);
    const startX = start.x;
    const startY = start.y;
    const endX = end.x;
    const endY = end.y;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;

    return (
        <g>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.accent : theme.node.muted}
                strokeWidth={active ? 2.5 : 2}
                strokeOpacity={active ? 1 : 0.82}
                fill="none"
                style={{ pointerEvents: "none" }}
            />
            {selected ? (
                <foreignObject x={(startX + endX) / 2 - 14} y={(startY + endY) / 2 - 14} width="28" height="28" style={{ overflow: "visible", pointerEvents: "auto" }}>
                    <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full border transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: "var(--studio-danger)" }}
                        aria-label="删除连线"
                        title="删除连线"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                    >
                        <X className="size-3.5" />
                    </button>
                </foreignObject>
            ) : null}
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const nodePoint = connectionPoint(node, handle.handleType, handle.handleId);
    const startX = handle.handleType === "source" ? nodePoint.x : mouseWorld.x;
    const startY = handle.handleType === "source" ? nodePoint.y : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : nodePoint.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : nodePoint.y;
    const distance = Math.abs(endX - startX);
    const pathD = `M ${startX} ${startY} C ${startX + distance * 0.5} ${startY}, ${endX - distance * 0.5} ${endY}, ${endX} ${endY}`;

    return <path d={pathD} stroke={theme.accent} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}

function connectionPoint(node: CanvasNodeData, handleType: "source" | "target", handleId?: string): Position {
    if (handleType === "target" && (handleId === "first_frame" || handleId === "last_frame")) {
        return {
            x: node.position.x + node.width * (handleId === "first_frame" ? 0.35 : 0.65),
            y: node.position.y,
        };
    }
    return handleType === "source" ? { x: node.position.x + node.width, y: node.position.y + node.height / 2 } : { x: node.position.x, y: node.position.y + node.height / 2 };
}
