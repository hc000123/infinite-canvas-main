import { useCallback, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";

import { confirmVideoPromptReview } from "../utils/canvas-prompt-review-confirm";
import type { PromptReviewResult } from "../utils/canvas-prompt-review";
import type { CanvasAssistantSession, CanvasNodeData, ContextMenuState } from "../types";

export function useCanvasUiActions({
    cancelPendingConnectionCreate,
    modal,
    setActiveChatId,
    setAngleNodeId,
    setChatSessions,
    setContextMenu,
    setCropNodeId,
    setDialogNodeId,
    setEditingNodeId,
    setHoveredNodeId,
    setInfoNodeId,
    setNodes,
    setPreviewNodeId,
    setToolbarNodeId,
    skipNextHistoryCommit,
}: {
    cancelPendingConnectionCreate: () => void;
    modal: Parameters<typeof confirmVideoPromptReview>[1];
    setActiveChatId: Dispatch<SetStateAction<string | null>>;
    setAngleNodeId: Dispatch<SetStateAction<string | null>>;
    setChatSessions: Dispatch<SetStateAction<CanvasAssistantSession[]>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setEditingNodeId: Dispatch<SetStateAction<string | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setPreviewNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    skipNextHistoryCommit: () => void;
}) {
    const closeCanvasOverlays = useCallback(() => {
        cancelPendingConnectionCreate();
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
    }, [cancelPendingConnectionCreate, setAngleNodeId, setCropNodeId, setDialogNodeId, setEditingNodeId, setHoveredNodeId, setInfoNodeId, setPreviewNodeId, setToolbarNodeId]);

    const handleFontSizeChange = useCallback(
        (nodeId: string, fontSize: number) => {
            setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
        },
        [setNodes],
    );

    const handleAssistantSessionsChange = useCallback(
        (sessions: CanvasAssistantSession[], activeId: string | null, options?: { skipCanvasHistory?: boolean }) => {
            if (options?.skipCanvasHistory) skipNextHistoryCommit();
            setChatSessions(sessions);
            setActiveChatId(activeId);
        },
        [setActiveChatId, setChatSessions, skipNextHistoryCommit],
    );

    const preventCanvasContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            if ((event.target as HTMLElement).closest("[data-node-id]")) return;
            event.preventDefault();
            setContextMenu(null);
        },
        [setContextMenu],
    );

    const confirmVideoPromptReviewWithTheme = useCallback((review: PromptReviewResult) => confirmVideoPromptReview(review, modal), [modal]);

    return { closeCanvasOverlays, confirmVideoPromptReviewWithTheme, handleAssistantSessionsChange, handleFontSizeChange, preventCanvasContextMenu };
}
