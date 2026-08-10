"use client";

import { Button, Dropdown, Input, Select, type MenuProps } from "antd";
import { Download, Plus, Search, Upload } from "lucide-react";

import type { AssetCategory, AssetKind } from "@/stores/use-asset-store";
import type { AssetSortMode } from "../asset-page-filters";

type Option = { label: string; value: string };
type Props = {
    kindFilter: AssetKind | "all";
    keyword: string;
    projectContextFilter: string;
    projectOptions: Option[];
    sortMode: AssetSortMode;
    onCreate: (kind: AssetKind, category?: AssetCategory) => void;
    onCreateFolder: () => void;
    onExportAll: () => void;
    onImportClick: () => void;
    onKindFilterChange: (kind: AssetKind | "all") => void;
    onKeywordChange: (value: string) => void;
    onProjectChange: (projectId: string) => void;
    onSortModeChange: (sortMode: AssetSortMode) => void;
};

const createItems: MenuProps["items"] = [
    { key: "folder", label: "新建文件夹" },
    { type: "divider" },
    { key: "character", label: "人设" },
    { key: "scene", label: "场景" },
    { key: "prop", label: "道具" },
    { key: "position", label: "站位" },
    { type: "divider" },
    { key: "video", label: "视频" },
    { key: "audio", label: "音频" },
];

const kindOptions = [
    { label: "全部资产", value: "all" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

const sortOptions = [
    { label: "名称升序", value: "title_asc" },
    { label: "最近更新", value: "updated_desc" },
    { label: "最近生成", value: "generation_desc" },
    { label: "创建时间", value: "created_desc" },
    { label: "原始顺序", value: "default" },
];

export function AssetPageHeader({ kindFilter, keyword, projectContextFilter, projectOptions, sortMode, onCreate, onCreateFolder, onExportAll, onImportClick, onKindFilterChange, onKeywordChange, onProjectChange, onSortModeChange }: Props) {
    const createFromMenu: MenuProps["onClick"] = ({ key }) => {
        if (key === "folder") return onCreateFolder();
        if (key === "character" || key === "scene" || key === "prop") return onCreate("image", key);
        if (key === "position") return onCreate("image", "blocking");
        onCreate(key as AssetKind);
    };

    return (
        <header className="studio-toolbar flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                <h1 className="shrink-0 text-xl font-semibold text-[var(--studio-text-primary)]">资产</h1>
                <span className="text-[var(--studio-text-muted)]">/</span>
                <Select
                    showSearch
                    className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                    value={projectContextFilter || "__all__"}
                    optionFilterProp="label"
                    options={[{ label: "所有项目", value: "__all__" }, ...projectOptions]}
                    onChange={(value) => onProjectChange(value === "__all__" ? "" : value)}
                />
                <span className="shrink-0 text-sm tabular-nums text-[var(--studio-text-muted)]">{projectOptions.length}</span>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center xl:justify-end">
                <Select className="min-w-0 xl:w-40 xl:shrink-0" value={kindFilter} options={kindOptions} onChange={(value) => onKindFilterChange(value as AssetKind | "all")} />
                <Input className="min-w-0 xl:!w-56 xl:shrink-0" allowClear prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} value={keyword} placeholder="模糊搜索" onChange={(event) => onKeywordChange(event.target.value)} />
                <Select className="min-w-0 xl:w-36 xl:shrink-0" value={sortMode} options={sortOptions} onChange={(value) => onSortModeChange(value as AssetSortMode)} />
                <Button className="studio-toolbar-button shrink-0" icon={<Download className="size-4" />} onClick={onExportAll}>
                    导出全部
                </Button>
                <Button className="studio-toolbar-button shrink-0" icon={<Upload className="size-4" />} onClick={onImportClick}>
                    批量导入
                </Button>
                <Dropdown menu={{ items: createItems, onClick: createFromMenu }} trigger={["click"]} placement="bottomRight">
                    <Button className="studio-primary-action shrink-0" type="primary" icon={<Plus className="size-4" />}>
                        新建
                    </Button>
                </Dropdown>
            </div>
        </header>
    );
}
