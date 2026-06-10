import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasNodeData, type Position, type ViewportTransform } from "../types";

type Props = {
    containerRef: RefObject<HTMLDivElement | null>;
    didInitialCenterRef: RefObject<boolean>;
    nodesRef: RefObject<CanvasNodeData[]>;
    selectedNodeIds: Set<string>;
    setSize: Dispatch<SetStateAction<{ width: number; height: number }>>;
    setViewport: Dispatch<SetStateAction<ViewportTransform>>;
    size: { width: number; height: number };
    viewportRef: RefObject<ViewportTransform>;
};

export function useCanvasViewportGeometry({ containerRef, didInitialCenterRef, nodesRef, selectedNodeIds, setSize, setViewport, size, viewportRef }: Props) {
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [containerRef, didInitialCenterRef, setSize, setViewport]);

    const screenToCanvas = useCallback(
        (clientX: number, clientY: number): Position => {
            const rect = containerRef.current?.getBoundingClientRect();
            const currentViewport = viewportRef.current;
            const localX = clientX - (rect?.left || 0);
            const localY = clientY - (rect?.top || 0);

            return {
                x: (localX - currentViewport.x) / currentViewport.k,
                y: (localY - currentViewport.y) / currentViewport.k,
            };
        },
        [containerRef, viewportRef],
    );

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [containerRef, screenToCanvas, size.height, size.width]);

    const getAppendNodeCenter = useCallback(
        (type: CanvasNodeType) => {
            const anchor = selectedNodeIds.size === 1 ? nodesRef.current.find((node) => selectedNodeIds.has(node.id)) : nodesRef.current.at(-1);
            if (!anchor) return getCanvasCenter();
            const spec = getNodeSpec(type);
            return {
                x: anchor.position.x + anchor.width + 72 + spec.width / 2,
                y: anchor.position.y + anchor.height / 2,
            };
        },
        [getCanvasCenter, nodesRef, selectedNodeIds],
    );

    return { screenToCanvas, getCanvasCenter, getAppendNodeCenter };
}
