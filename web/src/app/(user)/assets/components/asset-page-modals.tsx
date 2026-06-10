"use client";

import { Input, Modal, Select } from "antd";
import type { Asset, AssetFolder } from "@/stores/use-asset-store";

type FolderOption = { label: string; value: string };
type OutdatedUsageConfirmItem = {
    id: string;
    label: string;
    currentVersionNumber?: number;
    latestVersionNumber?: number;
};

export function AssetPageModals({
    bulkDeleteOpen,
    bulkMoveFolderId,
    bulkMoveOpen,
    bulkOutdatedOpen,
    bulkTagOpen,
    bulkTags,
    deletingAsset,
    editingFolder,
    folderDialogOpen,
    folderName,
    folderOptions,
    selectedCount,
    selectedOutdatedUsageConfirmItems,
    onApplyBulkDelete,
    onApplyBulkMove,
    onApplyBulkTags,
    onApplySelectedOutdatedUsages,
    onBulkMoveFolderChange,
    onBulkTagsChange,
    onCancelBulkDelete,
    onCancelBulkMove,
    onCancelBulkOutdated,
    onCancelBulkTag,
    onCancelDeleteAsset,
    onCancelFolder,
    onConfirmDeleteAsset,
    onFolderNameChange,
    onSaveFolder,
}: {
    bulkDeleteOpen: boolean;
    bulkMoveFolderId?: string;
    bulkMoveOpen: boolean;
    bulkOutdatedOpen: boolean;
    bulkTagOpen: boolean;
    bulkTags: string[];
    deletingAsset: Asset | null;
    editingFolder: AssetFolder | null;
    folderDialogOpen: boolean;
    folderName: string;
    folderOptions: FolderOption[];
    selectedCount: number;
    selectedOutdatedUsageConfirmItems: OutdatedUsageConfirmItem[];
    onApplyBulkDelete: () => void;
    onApplyBulkMove: () => void;
    onApplyBulkTags: () => void;
    onApplySelectedOutdatedUsages: () => void;
    onBulkMoveFolderChange: (value?: string) => void;
    onBulkTagsChange: (value: string[]) => void;
    onCancelBulkDelete: () => void;
    onCancelBulkMove: () => void;
    onCancelBulkOutdated: () => void;
    onCancelBulkTag: () => void;
    onCancelDeleteAsset: () => void;
    onCancelFolder: () => void;
    onConfirmDeleteAsset: () => void;
    onFolderNameChange: (value: string) => void;
    onSaveFolder: () => void;
}) {
    return (
        <>
            <Modal title={editingFolder ? "重命名文件夹" : "新建文件夹"} open={folderDialogOpen} onCancel={onCancelFolder} onOk={onSaveFolder} okText="保存" cancelText="取消" destroyOnHidden>
                <Input value={folderName} autoFocus placeholder="输入文件夹名称" onChange={(event) => onFolderNameChange(event.target.value)} onPressEnter={onSaveFolder} />
            </Modal>

            <Modal title="批量移动文件夹" open={bulkMoveOpen} onCancel={onCancelBulkMove} onOk={onApplyBulkMove} okText="移动" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-500">将 {selectedCount} 个素材移动到：</div>
                    <Select className="w-full" allowClear placeholder="未分组" value={bulkMoveFolderId} options={folderOptions} onChange={(value) => onBulkMoveFolderChange(value || undefined)} />
                </div>
            </Modal>

            <Modal title="批量添加标签" open={bulkTagOpen} onCancel={onCancelBulkTag} onOk={onApplyBulkTags} okText="添加" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-500">为 {selectedCount} 个素材追加标签，已有标签会保留并自动去重。</div>
                    <Select mode="tags" className="w-full" placeholder="输入标签后回车" value={bulkTags} onChange={onBulkTagsChange} />
                </div>
            </Modal>

            <Modal title="批量删除素材" open={bulkDeleteOpen} onCancel={onCancelBulkDelete} onOk={onApplyBulkDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消" destroyOnHidden>
                确定删除已选择的 {selectedCount} 个素材吗？删除后会从我的素材中移除。
            </Modal>

            <Modal title="批量更新过期引用" open={bulkOutdatedOpen} onCancel={onCancelBulkOutdated} onOk={onApplySelectedOutdatedUsages} okText="更新到最新版" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-stone-600 dark:text-stone-300">将更新以下 {selectedOutdatedUsageConfirmItems.length} 处引用。更新只修改引用方记录，不修改素材本体。</div>
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                        {selectedOutdatedUsageConfirmItems.map((usage) => (
                            <div key={usage.id} className="rounded-md bg-stone-50 px-3 py-2 text-sm dark:bg-stone-900/70">
                                <div className="font-medium text-stone-900 dark:text-stone-100">{usage.label}</div>
                                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                    v{usage.currentVersionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            <Modal title="删除素材" open={Boolean(deletingAsset)} onCancel={onCancelDeleteAsset} onOk={onConfirmDeleteAsset} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从我的素材中移除。
            </Modal>
        </>
    );
}
