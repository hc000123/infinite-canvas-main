import type { CanvasNodeData, ViewportTransform } from "../types";

export function initialMeasuredCanvasViewport(nodes: CanvasNodeData[], viewport: ViewportTransform, size: { width: number; height: number }): ViewportTransform {
    if (nodes.length || viewport.x || viewport.y || viewport.k !== 1) return viewport;
    return { x: size.width / 2, y: size.height / 2, k: 1 };
}

export function fitCanvasViewport(nodes: CanvasNodeData[], size: { width: number; height: number }): ViewportTransform {
    if (!nodes.length) return { x: size.width / 2, y: size.height / 2, k: 1 };

    const bounds = nodes.reduce(
        (result, node) => ({
            left: Math.min(result.left, node.position.x),
            top: Math.min(result.top, node.position.y),
            right: Math.max(result.right, node.position.x + node.width),
            bottom: Math.max(result.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const padding = 80;
    const contentWidth = Math.max(bounds.right - bounds.left, 1);
    const contentHeight = Math.max(bounds.bottom - bounds.top, 1);
    const k = Math.max(0.05, Math.min(1, (size.width - padding * 2) / contentWidth, (size.height - padding * 2) / contentHeight));
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;

    return { x: size.width / 2 - centerX * k, y: size.height / 2 - centerY * k, k };
}
