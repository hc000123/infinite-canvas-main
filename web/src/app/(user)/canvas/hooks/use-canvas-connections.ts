import { useCallback, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject, type SetStateAction } from "react";
import { nanoid } from "nanoid";

import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ConnectionHandle, type ContextMenuState, type Position } from "../types";
import { placeCanvasNodeAwayFromNodes } from "../utils/canvas-node-placement";

export type CanvasPendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

type ConnectionDraft = {
    fromNodeId: string;
    toNodeId: string;
    fromHandle?: string;
    toHandle?: string;
};

type UseCanvasConnectionsOptions = {
    nodesRef: RefObject<CanvasNodeData[]>;
    connectionsRef: RefObject<CanvasConnection[]>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    normalizeConnection: (firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target", firstHandleId?: string) => ConnectionDraft | null;
    isNodeHidden: (node: CanvasNodeData, nodes: CanvasNodeData[]) => boolean;
    createNode: (type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata) => CanvasNodeData;
    configNodeMetadata: CanvasNodeMetadata;
    showWarning: (message: string) => void;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasConnections({
    nodesRef,
    connectionsRef,
    screenToCanvas,
    normalizeConnection,
    isNodeHidden,
    createNode,
    configNodeMetadata,
    showWarning,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setDialogNodeId,
}: UseCanvasConnectionsOptions) {
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<CanvasPendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const connectingParamsRef = useRef<ConnectionHandle | null>(null);
    const connectionTargetNodeIdRef = useRef<string | null>(null);
    const pendingConnectionCreateRef = useRef<CanvasPendingConnectionCreate | null>(null);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const cancelPendingConnectionCreate = useCallback(() => {
        pendingConnectionCreateRef.current = null;
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

    const applyConnectionHandleMetadata = useCallback(
        (connection: ConnectionDraft, scopedNodes?: CanvasNodeData[]) => {
            if (scopedNodes) {
                const nextNodes = applyFrameConnectionMetadata(scopedNodes, connection);
                if (nextNodes !== scopedNodes) setNodes(nextNodes);
                return;
            }
            setNodes((prev) => applyFrameConnectionMetadata(prev, connection));
        },
        [setNodes],
    );

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType, current.handleId);
            if (!connection) {
                showWarning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId && conn.fromHandle === connection.fromHandle && conn.toHandle === connection.toHandle);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, ...connection }]);
                applyConnectionHandleMetadata(connection);
            }
            setContextMenu(null);
        },
        [applyConnectionHandleMetadata, connectionsRef, normalizeConnection, nodesRef, setConnections, setContextMenu, showWarning],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: CanvasPendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? configNodeMetadata : undefined;
            const newNode = placeCanvasNodeAwayFromNodes(createNode(type, connectedNodePosition(type, pending, nodesRef.current), metadata), nodesRef.current);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType, pending.connection.handleId);
            if (!connection) {
                showWarning("配置节点之间不能连接");
                return;
            }
            const nextNodes = applyFrameConnectionMetadata([...nodesRef.current, newNode], connection);
            setNodes(nextNodes);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio) setDialogNodeId(newNode.id);
            pendingConnectionCreateRef.current = null;
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [configNodeMetadata, createNode, normalizeConnection, nodesRef, setConnecting, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, showWarning],
    );

    const getConnectableNodeAtPoint = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle) => {
            const world = screenToCanvas(clientX, clientY);
            return (
                [...nodesRef.current]
                    .filter((node) => !isNodeHidden(node, nodesRef.current))
                    .reverse()
                    .find(
                        (node) =>
                            node.id !== current.nodeId &&
                            Boolean(normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType, current.handleId)) &&
                            world.x >= node.position.x &&
                            world.x <= node.position.x + node.width &&
                            world.y >= node.position.y &&
                            world.y <= node.position.y + node.height,
                    )?.id || null
            );
        },
        [isNodeHidden, nodesRef, normalizeConnection, screenToCanvas],
    );

    const moveConnectionTarget = useCallback(
        (clientX: number, clientY: number) => {
            const current = connectingParamsRef.current;
            if (!current || pendingConnectionCreateRef.current) return;
            const targetNodeId = getConnectableNodeAtPoint(clientX, clientY, current);
            connectionTargetNodeIdRef.current = targetNodeId;
            setConnectionTargetNodeId(targetNodeId);
            setMouseWorld(screenToCanvas(clientX, clientY));
        },
        [getConnectableNodeAtPoint, screenToCanvas],
    );

    const finishConnection = useCallback(
        (clientX: number, clientY: number) => {
            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (!currentConnection) return;
            const targetNodeId = getConnectableNodeAtPoint(clientX, clientY, currentConnection) || connectionTargetNodeIdRef.current;
            if (targetNodeId) {
                connectNodes(currentConnection, targetNodeId);
                setConnecting(null);
                return;
            }
            const position = screenToCanvas(clientX, clientY);
            setMouseWorld(position);
            const pending = { connection: currentConnection, position };
            pendingConnectionCreateRef.current = pending;
            setPendingConnectionCreate(pending);
        },
        [connectNodes, getConnectableNodeAtPoint, screenToCanvas, setConnecting],
    );

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target", handleId?: string) => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType, handleId });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting, setSelectedConnectionId],
    );

    return {
        connectingParams,
        connectionTargetNodeId,
        pendingConnectionCreate,
        pendingConnectionCreateRef,
        mouseWorld,
        cancelPendingConnectionCreate,
        createConnectedNode,
        finishConnection,
        handleConnectStart,
        moveConnectionTarget,
    };
}

function applyFrameConnectionMetadata(nodes: CanvasNodeData[], connection: ConnectionDraft): CanvasNodeData[] {
    if (connection.toHandle !== "first_frame" && connection.toHandle !== "last_frame") return nodes;
    const fromNode = nodes.find((node) => node.id === connection.fromNodeId);
    const toNode = nodes.find((node) => node.id === connection.toNodeId);
    if (fromNode?.type !== CanvasNodeType.Image || toNode?.type !== CanvasNodeType.Video) return nodes;
    let changed = false;
    const next = nodes.map((node): CanvasNodeData => {
        if (node.id !== connection.toNodeId) return node;
        const role = connection.toHandle!;
        const referenceRoles = [
            ...(node.metadata?.referenceRoles || []).filter((item) => !(item.kind === "image" && (item.nodeId === connection.fromNodeId || item.role === role))),
            { nodeId: connection.fromNodeId, kind: "image" as const, role, index: role === "first_frame" ? 1 : 2 },
        ];
        changed = true;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                videoReferenceImageMode: "first_last_frame",
                referenceRoles,
            },
        };
    });
    return changed ? next : nodes;
}

function connectedNodePosition(type: CanvasNodeType, pending: CanvasPendingConnectionCreate, nodes: CanvasNodeData[]): Position {
    const source = nodes.find((node) => node.id === pending.connection.nodeId);
    if (!source) return pending.position;
    const spec = getNodeSpec(type);
    const gap = 56;
    const right = pending.connection.handleType === "source";
    return {
        x: right ? source.position.x + source.width + gap + spec.width / 2 : source.position.x - gap - spec.width / 2,
        y: source.position.y + source.height / 2,
    };
}
