import type { CanvasGenerationMode } from "../types.ts";

export function promptPreviewTextareaClass(mode: CanvasGenerationMode) {
    const base = "thin-scrollbar w-full resize-none rounded-xl border px-3 py-2 outline-none";
    if (mode === "video") return `${base} h-52 max-h-52 overflow-y-auto`;
    return `${base} h-24 text-sm leading-5`;
}

export function promptPreviewTextareaStyle(mode: CanvasGenerationMode) {
    return mode === "video" ? { fontSize: 15, lineHeight: "24px" } : undefined;
}

export function promptPreviewNoZoomProps() {
    return { "data-canvas-no-zoom": true };
}
