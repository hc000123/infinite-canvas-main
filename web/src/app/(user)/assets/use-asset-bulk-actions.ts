import { useState } from "react";

import type { Asset } from "@/stores/use-asset-store";
import { buildBulkMoveAssetPatches, buildBulkTagAssetPatches, normalizeTags } from "./asset-bulk-actions";
import { buildProjectLibraryAssetPatch, buildRemoveProjectLibraryAssetPatch } from "./asset-project-library";

type AssetBulkMessage = {
    success: (text: string) => void;
    warning: (text: string) => void;
};

export function useAssetBulkActions({
    activeFolderId,
    clearSelectedAssets,
    message,
    projectContextFilter,
    removeAsset,
    selectedAssets,
    updateAsset,
}: {
    activeFolderId?: string;
    clearSelectedAssets: () => void;
    message: AssetBulkMessage;
    projectContextFilter: string;
    removeAsset: (id: string) => void;
    selectedAssets: Asset[];
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
}) {
    const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
    const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string | undefined>();
    const [bulkTagOpen, setBulkTagOpen] = useState(false);
    const [bulkTags, setBulkTags] = useState<string[]>([]);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    const openBulkMove = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkMoveFolderId(activeFolderId || undefined);
        setBulkMoveOpen(true);
    };

    const applyBulkMove = () => {
        buildBulkMoveAssetPatches(selectedAssets, bulkMoveFolderId).forEach((item) => updateAsset(item.id, item.patch));
        message.success(`已移动 ${selectedAssets.length} 个素材`);
        setBulkMoveOpen(false);
    };

    const openBulkTag = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkTags([]);
        setBulkTagOpen(true);
    };

    const applyBulkTags = () => {
        const tags = normalizeTags(bulkTags);
        if (!tags.length) return message.warning("请填写要添加的标签");
        buildBulkTagAssetPatches(selectedAssets, tags).forEach((item) => updateAsset(item.id, item.patch));
        message.success(`已为 ${selectedAssets.length} 个素材添加标签`);
        setBulkTagOpen(false);
    };

    const openBulkDelete = () => {
        if (!selectedAssets.length) return message.warning("请先选择素材");
        setBulkDeleteOpen(true);
    };

    const applyBulkDelete = () => {
        const count = selectedAssets.length;
        selectedAssets.forEach((asset) => removeAsset(asset.id));
        clearSelectedAssets();
        setBulkDeleteOpen(false);
        message.success(`已删除 ${count} 个素材`);
    };

    const addSelectedToProjectLibrary = () => {
        if (!projectContextFilter) return message.warning("请先选择项目文件夹");
        if (!selectedAssets.length) return message.warning("请先选择素材");
        const now = new Date().toISOString();
        selectedAssets.forEach((asset) => updateAsset(asset.id, buildProjectLibraryAssetPatch(asset, projectContextFilter, now)));
        message.success(`已加入项目共享库：${selectedAssets.length} 个素材`);
    };

    const removeSelectedFromProjectLibrary = () => {
        if (!projectContextFilter) return message.warning("请先选择项目文件夹");
        if (!selectedAssets.length) return message.warning("请先选择素材");
        selectedAssets.forEach((asset) => updateAsset(asset.id, buildRemoveProjectLibraryAssetPatch(asset, projectContextFilter)));
        message.success(`已移出项目共享库：${selectedAssets.length} 个素材`);
    };

    return {
        addSelectedToProjectLibrary,
        applyBulkDelete,
        applyBulkMove,
        applyBulkTags,
        bulkDeleteOpen,
        bulkMoveFolderId,
        bulkMoveOpen,
        bulkTagOpen,
        bulkTags,
        openBulkDelete,
        openBulkMove,
        openBulkTag,
        removeSelectedFromProjectLibrary,
        setBulkDeleteOpen,
        setBulkMoveFolderId,
        setBulkMoveOpen,
        setBulkTagOpen,
        setBulkTags,
    };
}
