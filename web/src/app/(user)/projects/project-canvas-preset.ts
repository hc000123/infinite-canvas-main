import type { CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";

export function editableCanvasPreset(canvasPreset?: CanvasProjectPreset, projectPreset?: CanvasProjectPreset) {
    return canvasPreset || projectPreset;
}
