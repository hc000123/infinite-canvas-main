"use client";

import { Download, Plus, Upload } from "lucide-react";
import { Button } from "antd";

type Props = {
    onCreate: () => void;
    onExportAll: () => void;
    onImportClick: () => void;
};

export function AssetPageHeader({ onCreate, onExportAll, onImportClick }: Props) {
    return (
        <header className="flex flex-col gap-5 border-b border-[var(--studio-border-subtle)] pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--studio-accent)]">Asset Library</div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">我的素材</h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[var(--studio-text-secondary)]">统一管理图片、视频、音频与文本资产，快速定位项目文件夹、引用关系和生成来源。</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
