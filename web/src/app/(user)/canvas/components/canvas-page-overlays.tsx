"use client";

import type { ChangeEvent, RefObject } from "react";

import type { CanvasProject } from "../stores/use-canvas-store";
import type { ImageBrief } from "../utils/image-brief";
import type { CanvasNodeData } from "../types";
import { AssetPickerModal, type AssetPickerTab, type InsertAssetPayload } from "./asset-picker-modal";
import { CanvasNodeAngleDialog, type CanvasImageAngleParams } from "./canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "./canvas-node-crop-dialog";
import { CanvasNodeInfoModal } from "./canvas-node-info-modal";
import { CanvasMediaPreviewModal, ClearCanvasConfirmModal } from "./canvas-page-modals";
import { ImageBriefWorkbenchDrawer } from "./image-brief-workbench-drawer";
import { ScriptManagerDrawer } from "./script-manager-drawer";
import { StoryboardManagerDrawer } from "./storyboard-manager-drawer";
import { CanvasTextEditorModal } from "./canvas-text-editor-modal";
import { CanvasImageUpscaleModal } from "./canvas-image-upscale-modal";
import type { ImageUpscaleCapabilities } from "@/services/api/image-upscale";

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
    expandedTextNode: CanvasNodeData | null;
    previewNode: CanvasNodeData | null;
    upscaleNode: CanvasNodeData | null;
    upscaleCapabilities: ImageUpscaleCapabilities | null;
    upscaleSubmitting: boolean;
    projectId: string;
    projectTitle: string;
    episodeId?: string;
    scriptInitialEpisodeId?: string;
    scriptManagerOpen: boolean;
    storyboardInitialGroupId: string;
    storyboardManagerOpen: boolean;
    nodes: CanvasNodeData[];
    onAddStoryboardGroupToCanvas: (groupId: string) => void;
    onAddShotGroupToCanvas: (groupId: string) => void;
    onAssetInsert: (payload: InsertAssetPayload) => void | Promise<void>;
    onClearCanvas: () => void;
    onCloseAngle: () => void;
    onCloseAssetPicker: () => void;
    onCloseClearConfirm: () => void;
    onCloseCrop: () => void;
    onCloseImageBrief: () => void;
    onCloseInfo: () => void;
    onCloseTextEditor: () => void;
    onClosePreview: () => void;
    onCloseUpscale: () => void;
    onCloseScriptManager: () => void;
    onCloseStoryboardManager: () => void;
    onCreateBriefImageConfig: (brief: ImageBrief, canvasId?: string) => void;
    onCropImageNode: (node: CanvasNodeData, crop: CanvasImageCropRect, mode?: "single" | "grid") => void;
    onGenerateAngleNode: (node: CanvasNodeData, params: CanvasImageAngleParams) => void;
    onImageInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onUpscaleImageNode: (node: CanvasNodeData, scale: 2 | 4) => void;
    onOpenStoryboardGroup: (groupId: string) => void;
    onSaveTextNode: (nodeId: string, content: string) => void;
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
    expandedTextNode,
    previewNode,
    upscaleNode,
    upscaleCapabilities,
    upscaleSubmitting,
    projectId,
    projectTitle,
    episodeId,
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
    onCloseTextEditor,
    onClosePreview,
    onCloseUpscale,
    onCloseScriptManager,
    onCloseStoryboardManager,
    onCreateBriefImageConfig,
    onCropImageNode,
    onGenerateAngleNode,
    onImageInputChange,
    onUpscaleImageNode,
    onOpenStoryboardGroup,
    onSaveTextNode,
}: Props) {
    return (
        <>
            <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" multiple onChange={onImageInputChange} />

            <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={onCloseInfo} />

            <CanvasTextEditorModal node={expandedTextNode} onClose={onCloseTextEditor} onSave={onSaveTextNode} />

            {cropNode?.metadata?.content ? (
                <CanvasNodeCropDialog
                    dataUrl={cropNode.metadata.content}
                    open={Boolean(cropNode)}
                    onClose={onCloseCrop}
                    onConfirm={(crop) => onCropImageNode(cropNode, crop)}
                    onConfirmGrid={() => onCropImageNode(cropNode, { x: 0, y: 0, width: 1, height: 1 }, "grid")}
                />
            ) : null}

            {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={onCloseAngle} onConfirm={(params) => onGenerateAngleNode(angleNode, params)} /> : null}

            <CanvasMediaPreviewModal node={previewNode || undefined} onClose={onClosePreview} />

            <CanvasImageUpscaleModal node={upscaleNode} capabilities={upscaleCapabilities} loading={upscaleSubmitting} onClose={onCloseUpscale} onSubmit={onUpscaleImageNode} />

            <ClearCanvasConfirmModal open={clearConfirmOpen} onCancel={onCloseClearConfirm} onConfirm={onClearCanvas} />

            <AssetPickerModal open={assetPickerOpen} title="选择本地资产主体" defaultTab={assetPickerTab} projectId={projectId} episodeId={episodeId} onInsert={onAssetInsert} onClose={onCloseAssetPicker} />

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
