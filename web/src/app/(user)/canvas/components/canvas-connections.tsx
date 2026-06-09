import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "../types";

export function ConnectionPath({ connection, from, to, active, onSelect }: { connection: CanvasConnection; from: CanvasNodeData; to: CanvasNodeData; active: boolean; onSelect: () => void }) {
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
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={active ? 3 : 2}
                strokeOpacity={active ? 1 : 0.82}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined, pointerEvents: "none" }}
            />
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

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
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
