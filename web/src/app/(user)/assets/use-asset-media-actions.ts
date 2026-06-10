"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import type { Asset } from "@/stores/use-asset-store";
import { exportAssets } from "./asset-transfer";
import { assetVersionFileName, resolveAssetVersionDownloadTarget, resolveRestoredAssetPatch } from "./asset-version-files";
import { assetVersionRecords, buildRestoreAssetVersionPatch } from "./asset-version-history";

type Props = {
    message: {
        error: (content: string) => void;
        success: (content: string) => void;
        warning: (content: string) => void;
    };
    removeAsset: (id: string) => void;
    selectedAssets: Asset[];
    setPreviewAsset: Dispatch<SetStateAction<Asset | null>>;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    validAssets: Asset[];
};

export function useAssetMediaActions({ message, removeAsset, selectedAssets, setPreviewAsset, updateAsset, validAssets }: Props) {
    const copyText = useCopyText();
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);

    const restoreAssetVersion = async (asset: Asset, versionId: string) => {
        const now = new Date().toISOString();
        const patch = buildRestoreAssetVersionPatch(asset, versionId, now);
        if (!patch) {
            message.error("无法恢复该版本");
            return;
        }
        const resolvedPatch = await resolveRestoredAssetPatch(patch);
        updateAsset(asset.id, resolvedPatch);
        setPreviewAsset((current) => (current?.id === asset.id ? ({ ...current, ...resolvedPatch, metadata: { ...(current.metadata || {}), ...(resolvedPatch.metadata || {}) }, updatedAt: now } as Asset) : current));
        message.success("已恢复素材版本");
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadMedia = (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
        saveAs(asset.kind === "image" ? asset.data.dataUrl : asset.data.url, `${asset.title || "asset"}.${asset.data.mimeType.split("/")[1] || "bin"}`);
    };

    const downloadAssetVersion = async (asset: Asset, versionId: string) => {
        const version = assetVersionRecords(asset).find((item) => item.id === versionId);
        if (!version) {
            message.error("没有找到该版本");
            return;
        }
        const target = await resolveAssetVersionDownloadTarget(version);
        if (!target) {
            message.error("该版本没有可下载的本地文件");
            return;
        }
        saveAs(target, assetVersionFileName(asset, version));
    };

    const exportSelectedAssets = async () => {
        if (!selectedAssets.length) {
            message.warning("请先选择要导出的素材");
            return;
        }
        await exportAssets(selectedAssets);
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        await exportAssets(validAssets);
    };

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success("素材已删除");
        setDeletingAsset(null);
    };

    return {
        deletingAsset,
        confirmDelete,
        copyAssetText,
        downloadAssetVersion,
        downloadMedia,
        exportAllAssets,
        exportSelectedAssets,
        restoreAssetVersion,
        setDeletingAsset,
    };
}
