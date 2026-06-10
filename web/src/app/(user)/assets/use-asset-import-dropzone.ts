import { useRef, useState, type DragEvent as ReactDragEvent, type RefObject } from "react";

import type { AssetWriteInput } from "@/stores/use-asset-store";
import { assetImportSuccessMessage } from "./asset-import-payloads";
import { importableAssetFiles, importAssetFileList } from "./asset-import-actions";
import { hasImportableDragItems } from "./asset-utils";

type AssetImportMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useAssetImportDropzone({
    activeFolderId,
    activeFolderName,
    addAssetOnce,
    assetInputRef,
    message,
    setPage,
}: {
    activeFolderId?: string;
    activeFolderName: string;
    addAssetOnce: (asset: AssetWriteInput, options?: { blob?: Blob }) => Promise<string>;
    assetInputRef: RefObject<HTMLInputElement | null>;
    message: AssetImportMessage;
    setPage: (page: number) => void;
}) {
    const dragDepthRef = useRef(0);
    const [isDraggingUpload, setIsDraggingUpload] = useState(false);

    const importAssetFiles = async (files?: FileList | File[]) => {
        const fileList = importableAssetFiles(files);
        if (!fileList.length) {
            message.warning("请选择图片、视频、音频或素材压缩包");
            return;
        }
        try {
            const result = await importAssetFileList(fileList, { folderId: activeFolderId, addAssetOnce });
            setPage(1);
            message.success(assetImportSuccessMessage(result.count, activeFolderName));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败，请选择有效的素材压缩包或媒体文件");
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const handleUploadDragEnter = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingUpload(true);
    };

    const handleUploadDragOver = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };

    const handleUploadDragLeave = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingUpload(false);
    };

    const handleUploadDrop = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasImportableDragItems(event.dataTransfer)) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingUpload(false);
        void importAssetFiles(event.dataTransfer.files);
    };

    return {
        handleUploadDragEnter,
        handleUploadDragLeave,
        handleUploadDragOver,
        handleUploadDrop,
        importAssetFiles,
        isDraggingUpload,
    };
}
