import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";
import { organizeCanvasNodes } from "../utils/canvas-auto-layout";
import { isHiddenBatchChild } from "../utils/canvas-batch-nodes";
import { fitCanvasViewport } from "../utils/canvas-viewport";
import { canvasPageReturnTargetForProject, canvasVideoWorkflowHref, originalWorkflowHref, videoWorkflowEpisodeFromCanvasProject } from "./canvas-page-action-targets";

type CanvasPageActionMessage = {
    success: (text: string) => void;
};

export function useCanvasPageActions({
    activeChatId,
    attachCanvasToCreativeProject,
    backgroundMode,
    canvasId,
    chatSessions,
    cleanupAssetImages,
    connections,
    createProject,
    currentProject,
    deleteProjects,
    flushProjects,
    message,
    navigate,
    nodes,
    renameProject,
    setContextMenu,
    setNodes,
    setTitleDraft,
    setTitleEditing,
    setViewport,
    showImageInfo,
    size,
    titleDraft,
    updateProject,
    viewport,
}: {
    activeChatId: string | null;
    attachCanvasToCreativeProject: (projectId: string, canvasId: string) => void;
    backgroundMode: CanvasBackgroundMode;
    canvasId: string;
    chatSessions: CanvasAssistantSession[];
    cleanupAssetImages: () => void;
    connections: CanvasConnection[];
    createProject: (title?: string, preset?: CanvasProject["preset"], options?: { projectId?: string }) => string;
    currentProject?: CanvasProject;
    deleteProjects: (ids: string[]) => void;
    flushProjects: () => Promise<void>;
    message: CanvasPageActionMessage;
    navigate: (href: string) => void;
    nodes: CanvasNodeData[];
    renameProject: (id: string, title: string) => void;
    setContextMenu: (value: null) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setTitleDraft: Dispatch<SetStateAction<string>>;
    setTitleEditing: Dispatch<SetStateAction<boolean>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    showImageInfo: boolean;
    size: { width: number; height: number };
    titleDraft: string;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
    viewport: ViewportTransform;
}) {
    const visibleNodes = useMemo(() => nodes.filter((node) => !isHiddenBatchChild(node, nodes)), [nodes]);
    const viewportInsets = useMemo(() => ({ top: 24, right: 160, bottom: 32, left: 24 }), []);

    const resetViewport = useCallback(() => {
        setViewport(fitCanvasViewport(visibleNodes, size, viewportInsets));
        setContextMenu(null);
    }, [setContextMenu, setViewport, size, viewportInsets, visibleNodes]);

    const organizeCanvas = useCallback(() => {
        const organized = organizeCanvasNodes(nodes, connections);
        setNodes(organized);
        setViewport(
            fitCanvasViewport(
                organized.filter((node) => !isHiddenBatchChild(node, organized)),
                size,
                viewportInsets,
            ),
        );
        setContextMenu(null);
        message.success("画布节点已按生产流程整理");
    }, [connections, message, nodes, setContextMenu, setNodes, setViewport, size, viewportInsets]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [setContextMenu, setViewport, size.height, size.width],
    );

    const createAndOpenProject = useCallback(() => {
        const targetProjectId = currentProject?.projectId;
        if (!targetProjectId) {
            navigate("/projects");
            return;
        }
        const id = createProject(`眨眼之间 ${useCanvasStore.getState().projects.length + 1}`, currentProject?.preset, { projectId: targetProjectId });
        attachCanvasToCreativeProject(targetProjectId, id);
        navigate(`/canvas/${id}`);
    }, [attachCanvasToCreativeProject, createProject, currentProject?.preset, currentProject?.projectId, navigate]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([canvasId]);
        cleanupAssetImages();
        navigate("/projects");
    }, [canvasId, cleanupAssetImages, deleteProjects, navigate]);

    const saveCurrentProject = useCallback(async () => {
        if (!currentProject) return;
        updateProject(canvasId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo, viewport });
        await flushProjects();
        message.success("画布已保存");
    }, [activeChatId, backgroundMode, canvasId, chatSessions, connections, currentProject, flushProjects, message, nodes, showImageInfo, updateProject, viewport]);

    const openEpisodeWorkbench = useCallback(() => {
        const videoWorkflowHref = canvasVideoWorkflowHref(currentProject);
        if (videoWorkflowHref) {
            navigate(videoWorkflowHref);
            return;
        }
        if (currentProject?.projectId && currentProject.episodeId) {
            navigate(`/projects/${currentProject.projectId}`);
            return;
        }
        if (currentProject?.projectId) {
            navigate(`/projects/${currentProject.projectId}`);
            return;
        }
        navigate("/projects");
    }, [currentProject, navigate]);

    const openWorkflowAssistant = useCallback(() => {
        const videoWorkflowEpisode = videoWorkflowEpisodeFromCanvasProject(currentProject);
        if (videoWorkflowEpisode) {
            navigate(originalWorkflowHref(videoWorkflowEpisode));
            return;
        }
        if (currentProject?.projectId && currentProject.episodeId) {
            navigate(`/projects/${currentProject.projectId}/episodes/${currentProject.episodeId}/workflow?canvasId=${encodeURIComponent(canvasId)}`);
            return;
        }
        if (currentProject?.projectId) {
            navigate(`/projects/${currentProject.projectId}`);
            return;
        }
        navigate("/projects");
    }, [canvasId, currentProject, navigate]);

    const returnTarget = useMemo(() => canvasPageReturnTargetForProject(currentProject), [currentProject]);

    const returnToParent = useCallback(() => navigate(returnTarget.href), [navigate, returnTarget.href]);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || "未命名画布");
        setTitleEditing(true);
    }, [currentProject?.title, setTitleDraft, setTitleEditing]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(canvasId, nextTitle);
        setTitleEditing(false);
    }, [canvasId, renameProject, setTitleEditing, titleDraft]);

    return {
        createAndOpenProject,
        deleteCurrentProject,
        finishTitleEditing,
        openEpisodeWorkbench,
        openWorkflowAssistant,
        organizeCanvas,
        resetViewport,
        returnTarget,
        returnToParent,
        saveCurrentProject,
        setZoomScale,
        startTitleEditing,
    };
}
