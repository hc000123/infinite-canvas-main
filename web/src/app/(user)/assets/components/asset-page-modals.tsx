"use client";

import { Input, Modal, Select } from "antd";
import type { Asset, AssetFolder } from "@/stores/use-asset-store";
import type { ProductionBibleItem } from "../../canvas/utils/production-bible";

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
    bulkProductionBibleDeleteOpen,
    bulkTagOpen,
    bulkTags,
    deletingAsset,
    deletingProductionBibleItem,
    editingFolder,
    folderDialogOpen,
    folderName,
    folderOptions,
    selectedCount,
    selectedOutdatedUsageConfirmItems,
    selectedProductionBibleCount,
    selectedProductionBibleSummary,
    onApplyBulkDelete,
    onApplyBulkMove,
    onApplyBulkProductionBibleDelete,
    onApplyBulkTags,
    onApplySelectedOutdatedUsages,
    onBulkMoveFolderChange,
    onBulkTagsChange,
    onCancelBulkDelete,
    onCancelBulkMove,
    onCancelBulkOutdated,
    onCancelBulkProductionBibleDelete,
    onCancelBulkTag,
    onCancelDeleteAsset,
    onCancelDeleteProductionBibleItem,
    onCancelFolder,
    onConfirmDeleteAsset,
    onConfirmDeleteProductionBibleItem,
    onFolderNameChange,
    onSaveFolder,
}: {
    bulkDeleteOpen: boolean;
    bulkMoveFolderId?: string;
    bulkMoveOpen: boolean;
    bulkOutdatedOpen: boolean;
    bulkProductionBibleDeleteOpen: boolean;
    bulkTagOpen: boolean;
    bulkTags: string[];
    deletingAsset: Asset | null;
    deletingProductionBibleItem: ProductionBibleItem | null;
    editingFolder: AssetFolder | null;
    folderDialogOpen: boolean;
    folderName: string;
    folderOptions: FolderOption[];
    selectedCount: number;
    selectedOutdatedUsageConfirmItems: OutdatedUsageConfirmItem[];
    selectedProductionBibleCount: number;
    selectedProductionBibleSummary: string;
    onApplyBulkDelete: () => void;
    onApplyBulkMove: () => void;
    onApplyBulkProductionBibleDelete: () => void;
    onApplyBulkTags: () => void;
    onApplySelectedOutdatedUsages: () => void;
    onBulkMoveFolderChange: (value?: string) => void;
    onBulkTagsChange: (value: string[]) => void;
    onCancelBulkDelete: () => void;
    onCancelBulkMove: () => void;
    onCancelBulkOutdated: () => void;
    onCancelBulkProductionBibleDelete: () => void;
    onCancelBulkTag: () => void;
    onCancelDeleteAsset: () => void;
    onCancelDeleteProductionBibleItem: () => void;
    onCancelFolder: () => void;
    onConfirmDeleteAsset: () => void;
    onConfirmDeleteProductionBibleItem: () => void;
    onFolderNameChange: (value: string) => void;
    onSaveFolder: () => void;
}) {
    return (
        <>
            <Modal rootClassName="studio-modal" title={editingFolder ? "重命名文件夹" : "新建文件夹"} open={folderDialogOpen} onCancel={onCancelFolder} onOk={onSaveFolder} okText="保存" cancelText="取消" destroyOnHidden>
                <Input value={folderName} autoFocus placeholder="输入文件夹名称" onChange={(event) => onFolderNameChange(event.target.value)} onPressEnter={onSaveFolder} />
            </Modal>

            <Modal rootClassName="studio-modal" title="批量移动文件夹" open={bulkMoveOpen} onCancel={onCancelBulkMove} onOk={onApplyBulkMove} okText="移动" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-[var(--studio-text-muted)]">将 {selectedCount} 个素材移动到：</div>
                    <Select className="w-full" allowClear placeholder="未分组" value={bulkMoveFolderId} options={folderOptions} onChange={(value) => onBulkMoveFolderChange(value || undefined)} />
                </div>
            </Modal>

            <Modal rootClassName="studio-modal" title="批量添加标签" open={bulkTagOpen} onCancel={onCancelBulkTag} onOk={onApplyBulkTags} okText="添加" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-[var(--studio-text-muted)]">为 {selectedCount} 个素材追加标签，已有标签会保留并自动去重。</div>
                    <Select mode="tags" className="w-full" placeholder="输入标签后回车" value={bulkTags} onChange={onBulkTagsChange} />
                </div>
            </Modal>

            <Modal rootClassName="studio-modal" title="批量删除素材" open={bulkDeleteOpen} onCancel={onCancelBulkDelete} onOk={onApplyBulkDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消" destroyOnHidden>
                确定删除已选择的 {selectedCount} 个资产吗？删除后会从资产中移除。
            </Modal>

            <Modal rootClassName="studio-modal" title="批量删除设定" open={bulkProductionBibleDeleteOpen} onCancel={onCancelBulkProductionBibleDelete} onOk={onApplyBulkProductionBibleDelete} okText="删除" okButtonProps={{ danger: true }} cancelText="取消" destroyOnHidden>
                <div className="space-y-2">
                    <div>确定删除已选择的 {selectedProductionBibleCount} 个设定吗？删除后会从设定库中移除，但不会删除已经生成或上传的素材文件。</div>
                    {selectedProductionBibleSummary ? <div className="text-sm text-[var(--studio-text-muted)]">{selectedProductionBibleSummary}</div> : null}
                </div>
            </Modal>

            <Modal rootClassName="studio-modal" title="批量更新过期引用" open={bulkOutdatedOpen} onCancel={onCancelBulkOutdated} onOk={onApplySelectedOutdatedUsages} okText="更新到最新版" cancelText="取消" destroyOnHidden>
                <div className="space-y-3">
                    <div className="text-sm text-[var(--studio-text-secondary)]">将更新以下 {selectedOutdatedUsageConfirmItems.length} 处引用。更新只修改引用方记录，不修改素材本体。</div>
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
                        {selectedOutdatedUsageConfirmItems.map((usage) => (
                            <div key={usage.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] px-3 py-2 text-sm">
                                <div className="font-medium text-[var(--studio-text-primary)]">{usage.label}</div>
                                <div className="mt-1 text-xs text-[var(--studio-text-muted)]">
                                    v{usage.currentVersionNumber || "?"} → v{usage.latestVersionNumber || "最新"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>

            <Modal rootClassName="studio-modal" title="删除素材" open={Boolean(deletingAsset)} onCancel={onCancelDeleteAsset} onOk={onConfirmDeleteAsset} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingAsset?.title}」吗？删除后会从资产中移除。
            </Modal>

            <Modal rootClassName="studio-modal" title="删除设定" open={Boolean(deletingProductionBibleItem)} onCancel={onCancelDeleteProductionBibleItem} onOk={onConfirmDeleteProductionBibleItem} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deletingProductionBibleItem?.name || "未命名设定"}」吗？删除后会从设定库中移除，但不会删除已经生成或上传的素材文件。
            </Modal>
        </>
    );
}
