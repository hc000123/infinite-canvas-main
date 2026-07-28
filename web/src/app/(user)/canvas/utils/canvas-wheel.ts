export type CanvasWheelAction = "ignore" | "pan" | "zoom";

export function resolveCanvasWheelAction({ ctrlKey, metaKey, deltaMode, deltaX, deltaY, excludedTarget }: { ctrlKey: boolean; metaKey: boolean; deltaMode: number; deltaX: number; deltaY: number; excludedTarget: boolean }): CanvasWheelAction {
    if (excludedTarget) return "ignore";
    if (ctrlKey || metaKey) return "zoom";
    if (deltaMode !== 0) return "zoom";

    const looksLikeCoarseMouseWheel = deltaX === 0 && Math.abs(deltaY) >= 80 && Math.abs(deltaY) % 100 === 0;
    return looksLikeCoarseMouseWheel ? "zoom" : "pan";
}
