import type { CanvasProject } from "../stores/use-canvas-store";

export function episodeMainCanvas(projects: CanvasProject[], projectId: string, episodeId: string) {
    let explicit: CanvasProject | undefined;
    let fallback: CanvasProject | undefined;
    for (const canvas of projects) {
        if (canvas.projectId !== projectId || canvas.episodeId !== episodeId || canvas.canvasRole === "child") continue;
        if (canvas.canvasRole === "main") {
            if (!explicit || earlierCanvas(canvas, explicit)) explicit = canvas;
        } else if (!fallback || earlierCanvas(canvas, fallback)) {
            fallback = canvas;
        }
    }
    return explicit || fallback;
}

export function episodeChildCanvases(projects: CanvasProject[], mainCanvasId: string) {
    return projects.filter((canvas) => canvas.canvasRole === "child" && canvas.parentCanvasId === mainCanvasId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function canCreateEpisodeChildCanvas(canvas: CanvasProject | null | undefined, projects: CanvasProject[]) {
    return Boolean(canvas?.projectId && canvas.episodeId && episodeMainCanvas(projects, canvas.projectId, canvas.episodeId)?.id === canvas.id);
}

function earlierCanvas(left: CanvasProject, right: CanvasProject) {
    return left.createdAt < right.createdAt || (left.createdAt === right.createdAt && left.id < right.id);
}
