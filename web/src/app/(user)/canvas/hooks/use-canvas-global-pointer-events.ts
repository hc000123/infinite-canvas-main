import { useEffect } from "react";

export function useCanvasGlobalPointerEvents({
    clearSelectionBox,
    finishConnection,
    finishNodeDrag,
    moveConnectionTarget,
    moveNodeDrag,
    moveSelectionBox,
}: {
    clearSelectionBox: () => void;
    finishConnection: (clientX: number, clientY: number) => void;
    finishNodeDrag: (clientX?: number, clientY?: number) => void;
    moveConnectionTarget: (clientX: number, clientY: number) => void;
    moveNodeDrag: (event: MouseEvent) => boolean;
    moveSelectionBox: (event: PointerEvent) => void;
}) {
    useEffect(() => {
        const handleGlobalMouseMove = (event: MouseEvent) => {
            if (moveNodeDrag(event)) return;
            moveConnectionTarget(event.clientX, event.clientY);
        };
        const handleGlobalMouseUp = (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);
            clearSelectionBox();
            finishConnection(event.clientX, event.clientY);
        };
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();

        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", moveSelectionBox);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", moveSelectionBox);
        };
    }, [clearSelectionBox, finishConnection, finishNodeDrag, moveConnectionTarget, moveNodeDrag, moveSelectionBox]);
}
