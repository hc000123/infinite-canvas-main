import type { CanvasNodeData, ViewportTransform } from "../types";

export type CanvasViewportInsets = {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
};

export function initialMeasuredCanvasViewport(nodes: CanvasNodeData[], viewport: ViewportTransform, size: { width: number; height: number }): ViewportTransform {
    if (nodes.length || viewport.x || viewport.y || viewport.k !== 1) return viewport;
    return { x: size.width / 2, y: size.height / 2, k: 1 };
}

export function fitCanvasViewport(nodes: CanvasNodeData[], size: { width: number; height: number }, insets: CanvasViewportInsets = {}): ViewportTransform {
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
    const left = padding + (insets.left || 0);
    const right = padding + (insets.right || 0);
    const top = padding + (insets.top || 0);
    const bottom = padding + (insets.bottom || 0);
    const availableWidth = Math.max(size.width - left - right, 1);
    const availableHeight = Math.max(size.height - top - bottom, 1);
    const contentWidth = Math.max(bounds.right - bounds.left, 1);
    const contentHeight = Math.max(bounds.bottom - bounds.top, 1);
    const k = Math.max(0.05, Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight));
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;

    return { x: left + availableWidth / 2 - centerX * k, y: top + availableHeight / 2 - centerY * k, k };
}
