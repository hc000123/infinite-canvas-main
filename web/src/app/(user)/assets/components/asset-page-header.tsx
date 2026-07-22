"use client";

import { ArrowLeft, Download, Plus, Upload } from "lucide-react";
import { Button } from "antd";

type Props = {
    onCreate: () => void;
    onExportAll: () => void;
    onImportClick: () => void;
    returnHref: string;
    returnLabel: string;
};

export function AssetPageHeader({ onCreate, onExportAll, onImportClick, returnHref, returnLabel }: Props) {
    return (
        <header className="studio-page-header flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
                <div className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">素材工作台</div>
                <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">我的素材</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--studio-text-secondary)]">管理本地素材、项目归属与生成来源。</p>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
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
