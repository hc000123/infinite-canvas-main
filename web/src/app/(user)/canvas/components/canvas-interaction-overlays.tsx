"use client";

import type { CanvasPendingConnectionCreate } from "../hooks/use-canvas-connections";
import { CanvasNodeType, type Position, type SelectionBox } from "../types";
import { ConnectionCreateMenu } from "./canvas-connection-create-menu";

type CreatableNodeType = CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio;

type Props = {
    nodeCreateMenuPosition: Position | null;
    onCancelPendingConnectionCreate: () => void;
    onCloseNodeCreateMenu: () => void;
    onCreateConnectedNode: (type: CreatableNodeType, pending: CanvasPendingConnectionCreate) => void;
    onCreateNode: (type: CreatableNodeType, position: Position) => void;
    pendingConnectionCreate: CanvasPendingConnectionCreate | null;
    selectionBox: SelectionBox | null;
    selectionFill: string;
    selectionStroke: string;
};

export function CanvasInteractionOverlays({
    nodeCreateMenuPosition,
    onCancelPendingConnectionCreate,
    onCloseNodeCreateMenu,
    onCreateConnectedNode,
    onCreateNode,
    pendingConnectionCreate,
    selectionBox,
    selectionFill,
    selectionStroke,
}: Props) {
    return (
        <>
            {selectionBox ? (
                <div
                    className="pointer-events-none absolute z-[100] border"
                    style={{
                        left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                        top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                        width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                        height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                        borderColor: selectionStroke,
                        background: selectionFill,
                    }}
                />
            ) : null}
            {nodeCreateMenuPosition ? <ConnectionCreateMenu position={nodeCreateMenuPosition} title="新建节点" onCreate={(type) => onCreateNode(type, nodeCreateMenuPosition)} onClose={onCloseNodeCreateMenu} /> : null}
            {pendingConnectionCreate ? <ConnectionCreateMenu position={pendingConnectionCreate.position} onCreate={(type) => onCreateConnectedNode(type, pendingConnectionCreate)} onClose={onCancelPendingConnectionCreate} /> : null}
        </>
    );
}
