import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

export function useCanvasNodeToolbarHover({
    nodeDraggingRef,
    nodeImageSettingsOpen,
    setToolbarNodeId,
}: {
    nodeDraggingRef: RefObject<boolean>;
    nodeImageSettingsOpen: boolean;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
}) {
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeDraggingRef, nodeImageSettingsOpen, setToolbarNodeId],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, 120);
    }, [setToolbarNodeId]);

    return { hideNodeToolbar, keepNodeToolbar };
}
