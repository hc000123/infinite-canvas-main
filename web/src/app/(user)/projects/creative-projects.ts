import type { CanvasProject } from "../canvas/stores/use-canvas-store";
import type { CanvasProjectPreset } from "../canvas/utils/canvas-project-preset";

export type CreativeProjectStatus = "active" | "archived";

export type CreativeProject = {
    id: string;
    title: string;
    description: string;
    status: CreativeProjectStatus;
    preset?: CanvasProjectPreset;
    coverAssetId?: string;
    canvasIds: string[];
    createdAt: string;
    updatedAt: string;
};

export type CreativeProjectWriteInput = {
    title: string;
    description?: string;
    status?: CreativeProjectStatus;
    preset?: CanvasProjectPreset;
    coverAssetId?: string;
    canvasIds?: string[];
};

export const UNFILED_CREATIVE_PROJECT_TITLE = "未归档项目";

export function createCreativeProject(input: CreativeProjectWriteInput, id: string, now: string): CreativeProject {
    return {
        id,
        title: normalizeCreativeProjectTitle(input.title),
        description: input.description?.trim() || "",
        status: input.status || "active",
        preset: input.preset,
        coverAssetId: input.coverAssetId,
        canvasIds: uniqueIds(input.canvasIds || []),
        createdAt: now,
        updatedAt: now,
    };
}

export function updateCreativeProject(project: CreativeProject, patch: Partial<CreativeProjectWriteInput>, now: string): CreativeProject {
    return {
        ...project,
        title: patch.title === undefined ? project.title : normalizeCreativeProjectTitle(patch.title),
        description: patch.description === undefined ? project.description : patch.description.trim(),
        status: patch.status || project.status,
        preset: patch.preset === undefined ? project.preset : patch.preset,
        coverAssetId: patch.coverAssetId === undefined ? project.coverAssetId : patch.coverAssetId,
        canvasIds: patch.canvasIds === undefined ? project.canvasIds : uniqueIds(patch.canvasIds),
        updatedAt: now,
    };
}

export function attachCanvasToCreativeProject(project: CreativeProject, canvasId: string, now: string): CreativeProject {
    if (!canvasId || project.canvasIds.includes(canvasId)) return project;
    return { ...project, canvasIds: [...project.canvasIds, canvasId], updatedAt: now };
}

export function detachCanvasFromCreativeProject(project: CreativeProject, canvasId: string, now: string): CreativeProject {
    if (!project.canvasIds.includes(canvasId)) return project;
    return { ...project, canvasIds: project.canvasIds.filter((id) => id !== canvasId), updatedAt: now };
}

export function canvasIdsForCreativeProject(project: CreativeProject, canvases: Pick<CanvasProject, "id" | "projectId">[]) {
    return uniqueIds([...project.canvasIds, ...canvases.filter((canvas) => canvas.projectId === project.id).map((canvas) => canvas.id)]);
}

export function unfiledCanvasProjects(canvases: CanvasProject[], projects: CreativeProject[]) {
    const knownCanvasIds = new Set(projects.flatMap((project) => project.canvasIds));
    const knownProjectIds = new Set(projects.map((project) => project.id));
    return canvases.filter((canvas) => !canvas.projectId && !knownCanvasIds.has(canvas.id) && !knownProjectIds.has(canvas.id));
}

export function normalizeCreativeProjectTitle(title: string) {
    return title.trim() || "未命名项目";
}

function uniqueIds(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean)));
}
