"use client";

import { FolderPlus, PencilLine, Search, Trash2 } from "lucide-react";
import { Button, Input, Select, Tag } from "antd";

import { cn } from "@/lib/utils";
import type { AssetFolder, AssetKind } from "@/stores/use-asset-store";
import type { ProjectLibraryFilter } from "../asset-page-filters";
import { AssetIconButton } from "./asset-card";

type ReferenceVersionFilter = "all" | "outdated";
type GenerationTaskFilter = "all" | "with" | "without";
type FilterProjectRow = { project: { id: string; title?: string }; folder: AssetFolder };
type FilterOption = { label: string; value: string };

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export function AssetFilterPanel({
    activeFolderId,
    filteredCount,
    folderCounts,
    folderFilter,
    generationActionFilter,
    generationFilterOptions,
    generationModelProviderFilter,
    generationSourceFilter,
    generationTaskFilter,
    kindFilter,
    keyword,
    outdatedUsageCount,
    projectContextFilter,
    projectFolderRows,
    projectLibraryFilter,
    referenceVersionFilter,
    regularFolders,
    selectedCount,
    storyboardGroupFilter,
    storyboardGroupOptions,
    validAssetCount,
    onClearSelectedOutdatedUsages,
    onCreateFolder,
    onDeleteFolder,
    onEditFolder,
    onFolderFilterChange,
    onGenerationActionFilterChange,
    onGenerationModelProviderFilterChange,
    onGenerationSourceFilterChange,
    onGenerationTaskFilterChange,
    onKindFilterChange,
    onKeywordChange,
    onProjectContextFilterChange,
    onProjectLibraryFilterChange,
    onReferenceVersionFilterChange,
    onStoryboardGroupFilterChange,
}: {
    activeFolderId?: string;
    filteredCount: number;
    folderCounts: Record<string, number>;
    folderFilter: string;
    generationActionFilter?: string;
    generationFilterOptions: { actions: FilterOption[]; modelProviders: FilterOption[]; sources: FilterOption[] };
    generationModelProviderFilter?: string;
    generationSourceFilter?: string;
    generationTaskFilter: GenerationTaskFilter;
    kindFilter: AssetKind | "all";
    keyword: string;
    outdatedUsageCount: number;
    projectContextFilter: string;
    projectFolderRows: FilterProjectRow[];
    projectLibraryFilter: ProjectLibraryFilter;
    referenceVersionFilter: ReferenceVersionFilter;
    regularFolders: AssetFolder[];
    selectedCount: number;
    storyboardGroupFilter: string;
    storyboardGroupOptions: FilterOption[];
    validAssetCount: number;
    onClearSelectedOutdatedUsages: () => void;
    onCreateFolder: () => void;
    onDeleteFolder: (folder: AssetFolder) => void;
    onEditFolder: (folder: AssetFolder) => void;
    onFolderFilterChange: (value: string) => void;
    onGenerationActionFilterChange: (value?: string) => void;
    onGenerationModelProviderFilterChange: (value?: string) => void;
    onGenerationSourceFilterChange: (value?: string) => void;
    onGenerationTaskFilterChange: (value: GenerationTaskFilter) => void;
    onKindFilterChange: (value: AssetKind | "all") => void;
    onKeywordChange: (value: string) => void;
    onProjectContextFilterChange: (value: string) => void;
    onProjectLibraryFilterChange: (value: ProjectLibraryFilter) => void;
    onReferenceVersionFilterChange: (value: ReferenceVersionFilter) => void;
    onStoryboardGroupFilterChange: (value: string) => void;
}) {
    const activeRegularFolder = activeFolderId ? regularFolders.find((folder) => folder.id === activeFolderId) : undefined;
    return (
        <>
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center">
                <Input className="studio-command-input w-full" size="large" allowClear prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} value={keyword} placeholder="搜索标题、内容、标签或来源" onChange={(event) => onKeywordChange(event.target.value)} />
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--studio-text-secondary)] lg:justify-end">
                    <span className="font-medium text-[var(--studio-text-primary)]">{filteredCount}</span>
                    <span>个素材匹配当前条件</span>
                    <span className="h-4 w-px bg-[var(--studio-border-subtle)]" />
                    <span>{selectedCount} 个已选</span>
                </div>
            </div>

            <div className="studio-panel-muted mt-5 grid gap-4 p-5 text-left">
                <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-center">
                    <div className="text-sm font-medium text-[var(--studio-text-secondary)]">类型</div>
                    <div className="flex flex-wrap gap-2">
                        {kindOptions.map((option) => (
                            <Tag.CheckableTag key={option.value} checked={kindFilter === option.value} className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")} onChange={() => onKindFilterChange(option.value as AssetKind | "all")}>
                                {option.label}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-center">
                    <div className="text-sm font-medium text-[var(--studio-text-secondary)]">项目</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag.CheckableTag
                            checked={!projectContextFilter && folderFilter === "all"}
                            className={cn("prompt-filter-tag", !projectContextFilter && folderFilter === "all" && "is-active")}
                            onChange={() => {
                                onProjectContextFilterChange("");
                                onFolderFilterChange("all");
                                onStoryboardGroupFilterChange("");
                                onProjectLibraryFilterChange("all");
                                onReferenceVersionFilterChange("all");
                                onClearSelectedOutdatedUsages();
                            }}
                        >
                            全部项目 {validAssetCount}
                        </Tag.CheckableTag>
                        {projectFolderRows.map(({ project, folder }) => (
                            <Tag.CheckableTag
                                key={project.id}
                                checked={folderFilter === folder.id}
                                className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                onChange={() => {
                                    onProjectContextFilterChange(project.id);
                                    onFolderFilterChange(folder.id);
                                    onStoryboardGroupFilterChange("");
                                    onProjectLibraryFilterChange("all");
                                    onReferenceVersionFilterChange("all");
                                    onClearSelectedOutdatedUsages();
                                }}
                            >
                                {project.title || folder.name} {folderCounts[folder.id] || 0}
                            </Tag.CheckableTag>
                        ))}
                        <Select size="middle" allowClear showSearch className="min-w-48" placeholder="分镜组筛选" value={storyboardGroupFilter || undefined} options={storyboardGroupOptions} optionFilterProp="label" disabled={!storyboardGroupOptions.length} onChange={(value) => onStoryboardGroupFilterChange(value || "")} />
                        <Select
                            size="middle"
                            className="min-w-36"
                            value={projectLibraryFilter}
                            disabled={!projectContextFilter}
                            options={[
                                { label: "项目库：全部", value: "all" },
                                { label: "仅项目库", value: "shared" },
                                { label: "未入项目库", value: "not_shared" },
                            ]}
                            onChange={(value) => onProjectLibraryFilterChange(value as ProjectLibraryFilter)}
                        />
                        <Select
                            size="middle"
                            className="min-w-36"
                            value={referenceVersionFilter}
                            disabled={!projectContextFilter}
                            options={[
                                { label: "引用：全部", value: "all" },
                                { label: `过期引用${outdatedUsageCount ? ` ${outdatedUsageCount}` : ""}`, value: "outdated" },
                            ]}
                            onChange={(value) => {
                                onReferenceVersionFilterChange(value as ReferenceVersionFilter);
                                onClearSelectedOutdatedUsages();
                            }}
                        />
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
                    <div className="pt-1 text-sm font-medium text-[var(--studio-text-secondary)]">文件夹</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag.CheckableTag
                            checked={folderFilter === "all"}
                            className={cn("prompt-filter-tag", folderFilter === "all" && "is-active")}
                            onChange={() => {
                                onProjectContextFilterChange("");
                                onFolderFilterChange("all");
                            }}
                        >
                            全部 {validAssetCount}
                        </Tag.CheckableTag>
                        <Tag.CheckableTag
                            checked={folderFilter === "root"}
                            className={cn("prompt-filter-tag", folderFilter === "root" && "is-active")}
                            onChange={() => {
                                onProjectContextFilterChange("");
                                onFolderFilterChange("root");
                            }}
                        >
                            未分组 {folderCounts.root || 0}
                        </Tag.CheckableTag>
                        {regularFolders.map((folder) => (
                            <Tag.CheckableTag
                                key={folder.id}
                                checked={folderFilter === folder.id}
                                className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                onChange={() => {
                                    onProjectContextFilterChange("");
                                    onFolderFilterChange(folder.id);
                                }}
                            >
                                {folder.name} {folderCounts[folder.id] || 0}
                            </Tag.CheckableTag>
                        ))}
                        <Button size="middle" icon={<FolderPlus className="size-3.5" />} onClick={onCreateFolder}>
                            新建文件夹
                        </Button>
                        {activeRegularFolder ? (
                            <>
                                <AssetIconButton title="重命名文件夹" icon={<PencilLine className="size-3.5" />} onClick={() => onEditFolder(activeRegularFolder)} />
                                <AssetIconButton title="删除文件夹" icon={<Trash2 className="size-3.5" />} danger onClick={() => onDeleteFolder(activeRegularFolder)} />
                            </>
                        ) : null}
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[64px_minmax(0,1fr)] sm:items-start">
                    <div className="pt-1 text-sm font-medium text-[var(--studio-text-secondary)]">生成</div>
                    <div className="grid gap-2 md:grid-cols-4">
                        <Select size="middle" allowClear placeholder="来源" value={generationSourceFilter} options={generationFilterOptions.sources} onChange={onGenerationSourceFilterChange} />
                        <Select size="middle" allowClear placeholder="生成方式" value={generationActionFilter} options={generationFilterOptions.actions} onChange={onGenerationActionFilterChange} />
                        <Select size="middle" allowClear showSearch placeholder="模型 / 供应商" value={generationModelProviderFilter} options={generationFilterOptions.modelProviders} optionFilterProp="label" onChange={onGenerationModelProviderFilterChange} />
                        <Select
                            size="middle"
                            value={generationTaskFilter}
                            options={[
                                { label: "全部任务", value: "all" },
                                { label: "有 taskId", value: "with" },
                                { label: "无 taskId", value: "without" },
                            ]}
                            onChange={(value) => onGenerationTaskFilterChange(value as GenerationTaskFilter)}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
