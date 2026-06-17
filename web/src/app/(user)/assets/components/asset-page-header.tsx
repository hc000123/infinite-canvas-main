"use client";

import { ArrowLeft, Download, Plus, Upload } from "lucide-react";
import { Button } from "antd";

import { ToolMetricGrid } from "../../components/tool-workbench";

type Props = {
    filteredCount: number;
    onCreate: () => void;
    onExportAll: () => void;
    onImportClick: () => void;
    returnHref: string;
    returnLabel: string;
    selectedCount: number;
    totalCount: number;
};

export function AssetPageHeader({ filteredCount, onCreate, onExportAll, onImportClick, returnHref, returnLabel, selectedCount, totalCount }: Props) {
    return (
        <header className="studio-page-header grid gap-5 px-5 py-4 2xl:grid-cols-[minmax(0,1fr)_520px] 2xl:items-end">
            <div className="min-w-0">
                <div className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">素材工作台</div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">我的素材</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">统一管理图片、视频、音频与文本资产，快速定位项目文件夹、引用关系和生成来源。</p>
                <ToolMetricGrid
                    className="mt-5 max-w-2xl sm:grid-cols-3"
                    items={[
                        { label: "素材总数", value: totalCount },
                        { label: "当前匹配", value: filteredCount },
                        { label: "已选择", value: selectedCount },
                    ]}
                />
            </div>
            <div className="flex flex-wrap gap-2 2xl:justify-end">
                <Button className="studio-toolbar-button" href={returnHref} icon={<ArrowLeft className="size-4" />}>
                    {returnLabel}
                </Button>
                <Button className="studio-toolbar-button" icon={<Download className="size-4" />} onClick={onExportAll}>
                    导出全部
                </Button>
                <Button className="studio-toolbar-button" icon={<Upload className="size-4" />} onClick={onImportClick}>
                    导入素材
                </Button>
                <Button className="studio-primary-action" type="primary" icon={<Plus className="size-4" />} onClick={onCreate}>
                    新增素材
                </Button>
            </div>
        </header>
    );
}
