"use client";

import { useRef, useState } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { AssetPickerTab } from "../components/asset-picker-modal";
import type { CanvasInspectorView } from "../components/canvas-side-inspector";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState, Position, ViewportTransform } from "../types";

export function useCanvasPageLocalState() {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const didInitialCenterRef = useRef(false);
    const handledFocusNodeIdRef = useRef("");
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const recoveringVideoTaskIdsRef = useRef<Set<string>>(new Set());
    const processingQueueItemIdsRef = useRef<Set<string>>(new Set());
    const connectionsRef = useRef<CanvasConnection[]>([]);
    const selectedNodeIdsRef = useRef<Set<string>>(new Set());
    const viewportRef = useRef<ViewportTransform>({ x: 0, y: 0, k: 1 });

    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [nodeCreateMenuPosition, setNodeCreateMenuPosition] = useState<Position | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTab, setAssetPickerTab] = useState<AssetPickerTab>("my-assets");
    const [scriptManagerOpen, setScriptManagerOpen] = useState(false);
    const [storyboardManagerOpen, setStoryboardManagerOpen] = useState(false);
    const [imageBriefOpen, setImageBriefOpen] = useState(false);
    const imageBriefInitialId = "";
    const imageBriefOpenRequestId = 0;
    const [storyboardInitialGroupId, setStoryboardInitialGroupId] = useState("");
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [inspectorView, setInspectorView] = useState<CanvasInspectorView>("context");
    const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
    const [activeTimelineShotId, setActiveTimelineShotId] = useState("");
    const [activeProductionPackageId, setActiveProductionPackageId] = useState("");
    const [lastSelectedVideoNodeId, setLastSelectedVideoNodeId] = useState("");
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");

    return {
        activeChatId,
        activeProductionPackageId,
        activeTimelineShotId,
        angleNodeId,
        assetPickerOpen,
        assetPickerTab,
        assistantMounted,
        backgroundMode,
        chatSessions,
        clearConfirmOpen,
        connections,
        connectionsRef,
        containerRef,
        contextMenu,
        cropNodeId,
        dialogNodeId,
        didInitialCenterRef,
        editRequestNonce,
        editingNodeId,
        handledFocusNodeIdRef,
        hoveredNodeId,
        imageBriefInitialId,
        imageBriefOpen,
        imageBriefOpenRequestId,
        imageInputRef,
        infoNodeId,
        inspectorView,
        isInspectorCollapsed,
        isMiniMapOpen,
        lastSelectedVideoNodeId,
        nodeCreateMenuPosition,
        nodeImageSettingsOpen,
        nodes,
        nodesRef,
        previewNodeId,
        processingQueueItemIdsRef,
        projectLoaded,
        recoveringVideoTaskIdsRef,
        runningNodeId,
        scriptManagerOpen,
        selectedConnectionId,
        selectedNodeIds,
        selectedNodeIdsRef,
        setActiveChatId,
        setActiveProductionPackageId,
        setActiveTimelineShotId,
        setAngleNodeId,
        setAssetPickerOpen,
        setAssetPickerTab,
        setAssistantCollapsed,
        setAssistantMounted,
        setBackgroundMode,
        setChatSessions,
        setClearConfirmOpen,
        setConnections,
        setContextMenu,
        setCropNodeId,
        setDialogNodeId,
        setEditRequestNonce,
        setEditingNodeId,
        setHoveredNodeId,
        setImageBriefOpen,
        setInfoNodeId,
        setInspectorView,
        setIsInspectorCollapsed,
        setIsMiniMapOpen,
        setLastSelectedVideoNodeId,
        setNodeCreateMenuPosition,
        setNodeImageSettingsOpen,
        setNodes,
        setPreviewNodeId,
        setProjectLoaded,
        setRunningNodeId,
        setScriptManagerOpen,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setShowImageInfo,
        setSize,
        setStoryboardInitialGroupId,
        setStoryboardManagerOpen,
        setTitleDraft,
        setTitleEditing,
        setToolbarNodeId,
        setViewport,
        showImageInfo,
        size,
        storyboardInitialGroupId,
        storyboardManagerOpen,
        titleDraft,
        titleEditing,
        toolbarNodeId,
        uploadTargetRef,
        viewport,
        viewportRef,
    };
}
