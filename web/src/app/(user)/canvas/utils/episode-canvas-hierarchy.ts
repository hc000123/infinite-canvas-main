import type { CanvasProject } from "../stores/use-canvas-store";

export function episodeMainCanvas(projects: CanvasProject[], projectId: string, episodeId: string) {
    return projects.find((canvas) => canvas.projectId === projectId && canvas.episodeId === episodeId && canvas.canvasRole === "main");
}

export function episodeChildCanvases(projects: CanvasProject[], mainCanvasId: string) {
    return projects.filter((canvas) => canvas.canvasRole === "child" && canvas.parentCanvasId === mainCanvasId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function canCreateEpisodeChildCanvas(canvas: CanvasProject | null | undefined) {
    return canvas?.canvasRole === "main" && Boolean(canvas.projectId && canvas.episodeId);
}
