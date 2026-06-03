import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { CanvasProject } from "../stores/use-canvas-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState, ViewportTransform } from "../types";
import { canvasHistoryAvailability, createEmptyCanvasHistoryStack, isSameCanvasHistoryEntry, pushCanvasHistoryEntry, redoCanvasHistory, undoCanvasHistory, type CanvasHistoryEntry, type CanvasHistoryStack } from "../utils/canvas-history";

type CanvasProjectPatch = Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>;

type UseCanvasHistoryOptions = {
    projectId: string;
    projectLoaded: boolean;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasHistoryEntry["backgroundMode"];
    showImageInfo: boolean;
    viewport: ViewportTransform;
    updateProject: (id: string, patch: CanvasProjectPatch) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setBackgroundMode: Dispatch<SetStateAction<CanvasHistoryEntry["backgroundMode"]>>;
    setShowImageInfo: Dispatch<SetStateAction<boolean>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
};

export function useCanvasHistory({
    projectId,
    projectLoaded,
    nodes,
    connections,
    chatSessions,
    activeChatId,
    backgroundMode,
    showImageInfo,
    viewport,
    updateProject,
    setNodes,
    setConnections,
    setChatSessions,
    setActiveChatId,
    setBackgroundMode,
    setShowImageInfo,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
}: UseCanvasHistoryOptions) {
    const historyRef = useRef<CanvasHistoryStack>(createEmptyCanvasHistoryStack());
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const skipNextHistoryCommitRef = useRef(false);
    const [historyState, setHistoryState] = useState(canvasHistoryAvailability(historyRef.current));

    const clearHistoryCommitTimer = useCallback(() => {
        if (!historyCommitTimerRef.current) return;
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
    }, []);

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes,
            connections,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, connections, nodes, showImageInfo],
    );

    const resetHistory = useCallback(
        (entry: CanvasHistoryEntry) => {
            historyRef.current = createEmptyCanvasHistoryStack();
            clearHistoryCommitTimer();
            lastHistoryRef.current = entry;
            setHistoryState(canvasHistoryAvailability(historyRef.current));
        },
        [clearHistoryCommitTimer],
    );

    const getCleanupHistory = useCallback(() => ({ history: historyRef.current, lastHistory: lastHistoryRef.current }), []);
    const pauseHistory = useCallback(() => {
        historyPausedRef.current = true;
    }, []);
    const resumeHistory = useCallback(() => {
        historyPausedRef.current = false;
    }, []);
    const skipNextHistoryCommit = useCallback(() => {
        skipNextHistoryCommitRef.current = true;
    }, []);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (isSameCanvasHistoryEntry(previous, next)) return;

        if (skipNextHistoryCommitRef.current) {
            skipNextHistoryCommitRef.current = false;
            lastHistoryRef.current = next;
            clearHistoryCommitTimer();
            return;
        }

        clearHistoryCommitTimer();
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current = pushCanvasHistoryEntry(historyRef.current, last);
            setHistoryState(canvasHistoryAvailability(historyRef.current));
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return clearHistoryCommitTimer;
    }, [clearHistoryCommitTimer, createHistoryEntry, projectLoaded]);

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
    }, [activeChatId, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    const applyHistory = useCallback(
        (entry: CanvasHistoryEntry) => {
            clearHistoryCommitTimer();
            applyingHistoryRef.current = true;
            setNodes(entry.nodes);
            setConnections(entry.connections);
            setChatSessions(entry.chatSessions);
            setActiveChatId(entry.activeChatId);
            setBackgroundMode(entry.backgroundMode);
            setShowImageInfo(entry.showImageInfo);
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setContextMenu(null);
            setTimeout(() => {
                lastHistoryRef.current = entry;
                applyingHistoryRef.current = false;
                setHistoryState(canvasHistoryAvailability(historyRef.current));
            });
        },
        [clearHistoryCommitTimer, setActiveChatId, setBackgroundMode, setChatSessions, setConnections, setContextMenu, setNodes, setSelectedConnectionId, setSelectedNodeIds, setShowImageInfo],
    );

    const undoCanvas = useCallback(() => {
        const result = undoCanvasHistory(historyRef.current, lastHistoryRef.current);
        if (!result.entry) return;
        historyRef.current = result.stack;
        applyHistory(result.entry);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const result = redoCanvasHistory(historyRef.current, lastHistoryRef.current);
        if (!result.entry) return;
        historyRef.current = result.stack;
        applyHistory(result.entry);
    }, [applyHistory]);

    return { historyState, resetHistory, undoCanvas, redoCanvas, pauseHistory, resumeHistory, skipNextHistoryCommit, getCleanupHistory };
}
