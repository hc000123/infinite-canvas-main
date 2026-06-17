"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, FolderPlus, PencilLine, Search, Trash2 } from "lucide-react";
import { Button, Input, Select, Tag } from "antd";

import { cn } from "@/lib/utils";
import type { AssetFolder, AssetKind } from "@/stores/use-asset-store";
import type { AssetEpisodeOption } from "../asset-episode";
import type { ProjectLibraryFilter } from "../asset-page-filters";
import { AssetIconButton } from "./asset-card";

type ReferenceVersionFilter = "all" | "outdated";
type GenerationTaskFilter = "all" | "with" | "without";
type FilterProjectRow = { project: { id: string; title?: string }; folder: AssetFolder };
type FilterOption = { label: string; value: string };
type AssetFilterPanelActions = {
    onClearSelectedOutdatedUsages: () => void;
    onCreateFolder: () => void;
    onDeleteFolder: (folder: AssetFolder) => void;
    onEditFolder: (folder: AssetFolder) => void;
    onEpisodeFilterChange: (value: string) => void;
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
};
type AssetFilterPanelCounts = {
    filteredCount: number;
    folderCounts: Record<string, number>;
    outdatedUsageCount: number;
    selectedCount: number;
    validAssetCount: number;
};
type AssetFilterPanelOptions = {
    episodeOptions: AssetEpisodeOption[];
    generationFilterOptions: { actions: FilterOption[]; modelProviders: FilterOption[]; sources: FilterOption[] };
    projectFolderRows: FilterProjectRow[];
    regularFolders: AssetFolder[];
    storyboardGroupOptions: FilterOption[];
};
type AssetFilterPanelValues = {
    activeFolderId?: string;
    episodeFilter: string;
    folderFilter: string;
    generationActionFilter?: string;
    generationModelProviderFilter?: string;
    generationSourceFilter?: string;
    generationTaskFilter: GenerationTaskFilter;
    kindFilter: AssetKind | "all";
    keyword: string;
    projectContextFilter: string;
    projectLibraryFilter: ProjectLibraryFilter;
    referenceVersionFilter: ReferenceVersionFilter;
    storyboardGroupFilter: string;
};

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];
const PROJECT_FILTER_COLLAPSED_COUNT = 6;

export function AssetFilterPanel({
    actions,
    counts,
    options,
    values,
}: {
    actions: AssetFilterPanelActions;
    counts: AssetFilterPanelCounts;
    options: AssetFilterPanelOptions;
    values: AssetFilterPanelValues;
}) {
    const {
        activeFolderId,
        episodeFilter,
        folderFilter,
        generationActionFilter,
        generationModelProviderFilter,
        generationSourceFilter,
        generationTaskFilter,
        kindFilter,
        keyword,
        projectContextFilter,
        projectLibraryFilter,
        referenceVersionFilter,
        storyboardGroupFilter,
    } = values;
    const { filteredCount, folderCounts, outdatedUsageCount, selectedCount, validAssetCount } = counts;
    const { episodeOptions, generationFilterOptions, projectFolderRows, regularFolders, storyboardGroupOptions } = options;
    const {
        onClearSelectedOutdatedUsages,
        onCreateFolder,
        onDeleteFolder,
        onEditFolder,
        onEpisodeFilterChange,
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
    } = actions;
    const activeRegularFolder = activeFolderId ? regularFolders.find((folder) => folder.id === activeFolderId) : undefined;
    const [projectFiltersExpanded, setProjectFiltersExpanded] = useState(false);
    const episodeAssetCount = episodeOptions.reduce((sum, option) => sum + option.count, 0);
    const visibleProjectFolderRows = useMemo(() => {
        if (projectFiltersExpanded || projectFolderRows.length <= PROJECT_FILTER_COLLAPSED_COUNT) return projectFolderRows;
        const collapsedRows = projectFolderRows.slice(0, PROJECT_FILTER_COLLAPSED_COUNT);
        const activeRow = projectFolderRows.find(({ folder, project }) => folder.id === folderFilter || project.id === projectContextFilter);
        if (!activeRow || collapsedRows.some(({ project }) => project.id === activeRow.project.id)) return collapsedRows;
        return [...collapsedRows.slice(0, PROJECT_FILTER_COLLAPSED_COUNT - 1), activeRow];
    }, [folderFilter, projectContextFilter, projectFolderRows, projectFiltersExpanded]);
    const hiddenProjectCount = Math.max(0, projectFolderRows.length - visibleProjectFolderRows.length);
    const selectAllProjects = () => {
        onProjectContextFilterChange("");
        onFolderFilterChange("all");
        onStoryboardGroupFilterChange("");
        onProjectLibraryFilterChange("all");
        onReferenceVersionFilterChange("all");
        onClearSelectedOutdatedUsages();
    };
    const selectProjectFolder = (projectId: string, folderId: string) => {
        onProjectContextFilterChange(projectId);
        onFolderFilterChange(folderId);
        onStoryboardGroupFilterChange("");
        onProjectLibraryFilterChange("all");
        onReferenceVersionFilterChange("all");
        onClearSelectedOutdatedUsages();
    };
    const selectRegularFolder = (value: string) => {
        onProjectContextFilterChange("");
        onFolderFilterChange(value);
    };
    return (
        <>
            <div className="studio-toolbar mt-4 grid gap-4 p-3 lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center">
                <Input
                    className="studio-command-input w-full"
                    size="large"
                    allowClear
                    prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                    value={keyword}
                    placeholder="搜索标题、内容、标签或来源"
                    onChange={(event) => onKeywordChange(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--studio-text-secondary)] lg:justify-end">
                    <span className="font-medium text-[var(--studio-text-primary)]">{filteredCount}</span>
                    <span>个素材匹配当前条件</span>
                    <span className="h-4 w-px bg-[var(--studio-border-subtle)]" />
                    <span>{selectedCount} 个已选</span>
                </div>
            </div>

            <div className="studio-rail mt-4 grid gap-3 p-4 text-left">
                <div>
                    <div className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">筛选控制台</div>
                    <div className="mt-1 text-sm text-[var(--studio-text-secondary)]">按类型、项目、文件夹与生成来源缩小当前资产视图。</div>
                </div>
                <FilterBlock label="类型">
                    <div className="flex flex-wrap gap-2">
                        {kindOptions.map((option) => (
                            <Tag.CheckableTag key={option.value} checked={kindFilter === option.value} className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")} onChange={() => onKindFilterChange(option.value as AssetKind | "all")}>
                                {option.label}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                </FilterBlock>
                <FilterBlock label="项目">
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag.CheckableTag
                            checked={!projectContextFilter && folderFilter === "all"}
                            className={cn("prompt-filter-tag", !projectContextFilter && folderFilter === "all" && "is-active")}
                            onChange={selectAllProjects}
                        >
                            全部项目 {validAssetCount}
                        </Tag.CheckableTag>
                        {visibleProjectFolderRows.map(({ project, folder }) => (
                            <Tag.CheckableTag
                                key={project.id}
                                checked={folderFilter === folder.id}
                                className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                onChange={() => selectProjectFolder(project.id, folder.id)}
                            >
                                {project.title || folder.name} {folderCounts[folder.id] || 0}
                            </Tag.CheckableTag>
                        ))}
                        {projectFolderRows.length > PROJECT_FILTER_COLLAPSED_COUNT ? (
                            <Button
                                size="middle"
                                type="text"
                                className="!h-8 !px-2 !text-[var(--studio-text-secondary)] hover:!text-[var(--studio-text-primary)]"
                                icon={projectFiltersExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                onClick={() => setProjectFiltersExpanded((value) => !value)}
                            >
                                {projectFiltersExpanded ? "收起项目" : `展开${hiddenProjectCount ? ` ${hiddenProjectCount} 个` : ""}项目`}
                            </Button>
                        ) : null}
                        <Select
                            size="middle"
                            allowClear
                            showSearch
                            className="min-w-48"
                            placeholder="分镜组筛选"
                            value={storyboardGroupFilter || undefined}
                            options={storyboardGroupOptions}
                            optionFilterProp="label"
                            disabled={!storyboardGroupOptions.length}
                            onChange={(value) => onStoryboardGroupFilterChange(value || "")}
                        />
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
                </FilterBlock>
                {projectContextFilter ? (
                    <FilterBlock label="集数">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag.CheckableTag checked={!episodeFilter} className={cn("prompt-filter-tag", !episodeFilter && "is-active")} onChange={() => onEpisodeFilterChange("")}>
                                全部集数 {episodeAssetCount}
                            </Tag.CheckableTag>
                            {episodeOptions.map((option) => (
                                <Tag.CheckableTag key={option.value} checked={episodeFilter === option.value} className={cn("prompt-filter-tag", episodeFilter === option.value && "is-active")} onChange={() => onEpisodeFilterChange(option.value)}>
                                    {option.label} {option.count}
                                </Tag.CheckableTag>
                            ))}
                            {!episodeOptions.length ? <span className="text-sm text-[var(--studio-text-muted)]">暂无可筛选集数</span> : null}
                        </div>
                    </FilterBlock>
                ) : null}
                <FilterBlock align="start" label="文件夹">
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag.CheckableTag
                            checked={folderFilter === "all"}
                            className={cn("prompt-filter-tag", folderFilter === "all" && "is-active")}
                            onChange={() => selectRegularFolder("all")}
                        >
                            全部 {validAssetCount}
                        </Tag.CheckableTag>
                        <Tag.CheckableTag
                            checked={folderFilter === "root"}
                            className={cn("prompt-filter-tag", folderFilter === "root" && "is-active")}
                            onChange={() => selectRegularFolder("root")}
                        >
                            未分组 {folderCounts.root || 0}
                        </Tag.CheckableTag>
                        {regularFolders.map((folder) => (
                            <Tag.CheckableTag
                                key={folder.id}
                                checked={folderFilter === folder.id}
                                className={cn("prompt-filter-tag", folderFilter === folder.id && "is-active")}
                                onChange={() => selectRegularFolder(folder.id)}
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
                </FilterBlock>
                <FilterBlock align="start" label="生成">
                    <div className="grid gap-2 md:grid-cols-4">
                        <Select size="middle" allowClear placeholder="来源" value={generationSourceFilter} options={generationFilterOptions.sources} onChange={onGenerationSourceFilterChange} />
                        <Select size="middle" allowClear placeholder="生成方式" value={generationActionFilter} options={generationFilterOptions.actions} onChange={onGenerationActionFilterChange} />
                        <Select
                            size="middle"
                            allowClear
                            showSearch
                            placeholder="模型 / 供应商"
                            value={generationModelProviderFilter}
                            options={generationFilterOptions.modelProviders}
                            optionFilterProp="label"
                            onChange={onGenerationModelProviderFilterChange}
                        />
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
                </FilterBlock>
            </div>
        </>
    );
}

function FilterBlock({
    align = "center",
    children,
    label,
}: {
    align?: "center" | "start";
    children: ReactNode;
    label: string;
}) {
    return (
        <div className={cn("grid gap-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-3 sm:grid-cols-[64px_minmax(0,1fr)]", align === "center" ? "sm:items-center" : "sm:items-start")}>
            <div className={cn("text-sm font-medium text-[var(--studio-text-secondary)]", align === "start" && "pt-1")}>{label}</div>
            {children}
        </div>
    );
}
