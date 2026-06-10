"use client";

import type { ChangeEvent, RefObject } from "react";

import type { CanvasProject } from "../stores/use-canvas-store";
import type { ImageBrief } from "../utils/image-brief";
import type { CanvasNodeData } from "../types";
import { AssetPickerModal, type AssetPickerTab, type InsertAssetPayload } from "./asset-picker-modal";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "./canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "./canvas-node-crop-dialog";
import { CanvasNodeInfoModal } from "./canvas-node-info-modal";
import { CanvasImagePreviewModal, ClearCanvasConfirmModal } from "./canvas-page-modals";
import { ImageBriefWorkbenchDrawer } from "./image-brief-workbench-drawer";
import { ScriptManagerDrawer } from "./script-manager-drawer";
import { StoryboardManagerDrawer } from "./storyboard-manager-drawer";

type Props = {
    angleNode: CanvasNodeData | null;
    assetPickerOpen: boolean;
    assetPickerTab: AssetPickerTab;
    canvases: CanvasProject[];
    clearConfirmOpen: boolean;
    cropNode: CanvasNodeData | null;
    imageBriefInitialId: string;
    imageBriefOpen: boolean;
    imageBriefOpenRequestId: number;
    imageInputRef: RefObject<HTMLInputElement | null>;
    infoNode: CanvasNodeData | null;
    previewNode: CanvasNodeData | null;
    projectId: string;
    projectTitle: string;
    scriptInitialEpisodeId?: string;
    scriptManagerOpen: boolean;
    storyboardInitialGroupId: string;
    storyboardManagerOpen: boolean;
    nodes: CanvasNodeData[];
    onAddStoryboardGroupToCanvas: (groupId: string) => void;
    onAddShotGroupToCanvas: (groupId: string) => void;
    onAssetInsert: (payload: InsertAssetPayload) => void;
    onClearCanvas: () => void;
    onCloseAngle: () => void;
    onCloseAssetPicker: () => void;
    onCloseClearConfirm: () => void;
    onCloseCrop: () => void;
    onCloseImageBrief: () => void;
    onCloseInfo: () => void;
    onClosePreview: () => void;
    onCloseScriptManager: () => void;
    onCloseStoryboardManager: () => void;
    onCreateBriefImageConfig: (brief: ImageBrief, canvasId?: string) => void;
    onCropImageNode: (node: CanvasNodeData, crop: CanvasImageCropRect) => void;
    onGenerateAngleNode: (node: CanvasNodeData, params: CanvasImageAngleParams) => void;
    onImageInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onOpenStoryboardGroup: (groupId: string) => void;
};

export function CanvasPageOverlays({
    angleNode,
    assetPickerOpen,
    assetPickerTab,
    canvases,
    clearConfirmOpen,
    cropNode,
    imageBriefInitialId,
    imageBriefOpen,
    imageBriefOpenRequestId,
    imageInputRef,
    infoNode,
    previewNode,
    projectId,
    projectTitle,
    scriptInitialEpisodeId,
    scriptManagerOpen,
    storyboardInitialGroupId,
    storyboardManagerOpen,
    nodes,
    onAddStoryboardGroupToCanvas,
    onAddShotGroupToCanvas,
    onAssetInsert,
    onClearCanvas,
    onCloseAngle,
    onCloseAssetPicker,
    onCloseClearConfirm,
    onCloseCrop,
    onCloseImageBrief,
    onCloseInfo,
    onClosePreview,
    onCloseScriptManager,
    onCloseStoryboardManager,
    onCreateBriefImageConfig,
    onCropImageNode,
    onGenerateAngleNode,
    onImageInputChange,
    onOpenStoryboardGroup,
}: Props) {
    return (
        <>
            <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" multiple onChange={onImageInputChange} />

            <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={onCloseInfo} />

            {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={onCloseCrop} onConfirm={(crop) => onCropImageNode(cropNode, crop)} /> : null}

            {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={onCloseAngle} onConfirm={(params) => onGenerateAngleNode(angleNode, params)} /> : null}

            <CanvasImagePreviewModal node={previewNode || undefined} onClose={onClosePreview} />

            <ClearCanvasConfirmModal open={clearConfirmOpen} onCancel={onCloseClearConfirm} onConfirm={onClearCanvas} />

            <AssetPickerModal open={assetPickerOpen} defaultTab={assetPickerTab} onInsert={onAssetInsert} onClose={onCloseAssetPicker} />

            <ScriptManagerDrawer open={scriptManagerOpen} projectId={projectId} projectTitle={projectTitle} initialEpisodeId={scriptInitialEpisodeId} onClose={onCloseScriptManager} onOpenStoryboardGroup={onOpenStoryboardGroup} />

            <StoryboardManagerDrawer
                open={storyboardManagerOpen}
                projectId={projectId}
                projectTitle={projectTitle}
                initialGroupId={storyboardInitialGroupId}
                canvases={canvases}
                canvasNodes={nodes}
                onClose={onCloseStoryboardManager}
                onAddGroupToCanvas={onAddStoryboardGroupToCanvas}
                onAddShotGroupToCanvas={onAddShotGroupToCanvas}
            />

            <ImageBriefWorkbenchDrawer
                open={imageBriefOpen}
                projectId={projectId}
                projectTitle={projectTitle}
                canvases={canvases}
                onCreateImageConfig={onCreateBriefImageConfig}
                initialBriefId={imageBriefInitialId}
                initialBriefRequestId={imageBriefOpenRequestId}
                onClose={onCloseImageBrief}
            />
        </>
    );
}
