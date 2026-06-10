"use client";

import { useCanvasNodeDerivativeActions } from "./use-canvas-node-derivative-actions";
import { useCanvasNodeToolActions } from "./use-canvas-node-tool-actions";

type DerivativeOptions = Parameters<typeof useCanvasNodeDerivativeActions>[0];
type ToolOptions = Omit<Parameters<typeof useCanvasNodeToolActions>[0], "captureVideoCurrentFrame" | "generateImageFromTextNode" | "handleContinueVideoNode">;

type Props = {
    derivative: DerivativeOptions;
    tools: ToolOptions;
};

export function useCanvasNodeActionController({ derivative, tools }: Props) {
    const { cropImageNode, generateAngleNode, handleContinueVideoNode, captureVideoCurrentFrame, generateImageFromTextNode } = useCanvasNodeDerivativeActions(derivative);
    const nodeToolActions = useCanvasNodeToolActions({
        ...tools,
        captureVideoCurrentFrame,
        generateImageFromTextNode,
        handleContinueVideoNode,
    });

    return {
        cropImageNode,
        generateAngleNode,
        nodeToolActions,
    };
}
