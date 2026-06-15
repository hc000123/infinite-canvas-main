"use client";

import { useEffect, useMemo, useState } from "react";

import type { Asset, AssetFolder, AssetKind } from "@/stores/use-asset-store";
import type { CanvasProject } from "../canvas/stores/use-canvas-store";
import { isReadableProductionBibleItem, type ProductionBibleItem } from "../canvas/utils/production-bible";
import type { ShotGroup, StoryboardGroup, StoryboardShot, StoryboardTableShot } from "../canvas/utils/storyboard-management";
import type { CreativeProject } from "../projects/creative-projects";
import { assetGenerationFilterOptions } from "./asset-generation";
import { buildAssetProjectResultGroups } from "./asset-project-groups";
import { collectOutdatedAssetVersionUsages } from "./asset-version-outdated-references";
import { collectAssetVersionUsageReferences } from "./asset-version-references";
import {
    activeAssetFolderId,
    buildAssetProjectContexts,
    filterAssetList,
    paginateAssetList,
    projectReferencedAssetIds as collectProjectReferencedAssetIds,
    sortAssetList,
    storyboardGroupReferencedAssetIds as collectStoryboardGroupReferencedAssetIds,
    supportedAssetList,
    type AssetSortMode,
    type ProjectLibraryFilter,
} from "./asset-page-filters";
import { assetSearchText, countFolderAssets } from "./asset-utils";

export type ReferenceVersionFilter = "all" | "outdated";

type Props = {
    assets: Asset[];
    creativeProjects: CreativeProject[];
    folders: AssetFolder[];
    initialProjectId: string;
    previewAsset: Asset | null;
    productionBibleItems: ProductionBibleItem[];
    projects: CanvasProject[];
    shotGroups: ShotGroup[];
    storyboardGroups: StoryboardGroup[];
    storyboardShots: StoryboardShot[];
    storyboardTableShots: StoryboardTableShot[];
};

export function useAssetPageQuery({ assets, creativeProjects, folders, initialProjectId, previewAsset, productionBibleItems, projects, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots }: Props) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [folderFilter, setFolderFilter] = useState<string | "all" | "root">("all");
    const [generationSourceFilter, setGenerationSourceFilter] = useState<string>();
    const [generationActionFilter, setGenerationActionFilter] = useState<string>();
    const [generationModelProviderFilter, setGenerationModelProviderFilter] = useState<string>();
    const [generationTaskFilter, setGenerationTaskFilter] = useState<"all" | "with" | "without">("all");
    const [projectContextFilter, setProjectContextFilter] = useState(initialProjectId);
    const [projectLibraryFilter, setProjectLibraryFilter] = useState<ProjectLibraryFilter>("all");
    const canvasLibraryFilter = "";
    const [referenceVersionFilter, setReferenceVersionFilter] = useState<ReferenceVersionFilter>("all");
    const [storyboardGroupFilter, setStoryboardGroupFilter] = useState("");
    const [sortMode, setSortMode] = useState<AssetSortMode>("default");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const activeFolderId = activeAssetFolderId(folderFilter);
    const validAssets = useMemo(() => supportedAssetList(assets), [assets]);
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const activeFolderName = activeFolderId ? folderMap.get(activeFolderId)?.name || "当前文件夹" : "";
    const folderCounts = useMemo(() => countFolderAssets(validAssets), [validAssets]);
    const regularFolders = useMemo(() => folders.filter((folder) => !folder.projectId), [folders]);
    const projectFolderRows = useMemo(
        () => creativeProjects.map((project) => ({ project, folder: folders.find((folder) => folder.projectId === project.id) })).filter((item): item is { project: CreativeProject; folder: AssetFolder } => Boolean(item.folder)),
        [creativeProjects, folders],
    );
    const folderOptions = useMemo(
        () => [{ label: "未分组", value: "" }, ...projectFolderRows.map(({ project, folder }) => ({ label: `项目 / ${project.title || folder.name}`, value: folder.id })), ...regularFolders.map((folder) => ({ label: folder.name, value: folder.id }))],
        [projectFolderRows, regularFolders],
    );
    const canvasLibraryTitles = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.title || "未命名画布"])), [projects]);
    const projectContexts = useMemo(() => buildAssetProjectContexts(creativeProjects, projects), [creativeProjects, projects]);
    const projectLibraryProjectTitles = useMemo(() => Object.fromEntries(projectContexts.map((project) => [project.id, project.title])), [projectContexts]);
    const projectReferenceIds = useMemo(
        () => Array.from(new Set([...projectContexts.map((project) => project.id), ...productionBibleItems.map((item) => item.projectId), ...storyboardGroups.map((group) => group.projectId), ...storyboardTableShots.map((shot) => shot.projectId), ...shotGroups.map((group) => group.projectId)].filter(Boolean))),
        [productionBibleItems, projectContexts, shotGroups, storyboardGroups, storyboardTableShots],
    );
    const projectReferencedAssetIdsByProject = useMemo(
        () => new Map(projectReferenceIds.map((projectId) => [projectId, collectProjectReferencedAssetIds(projectId, productionBibleItems, storyboardGroups, storyboardShots, storyboardTableShots, shotGroups)])),
        [productionBibleItems, projectReferenceIds, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots],
    );
    const previewAssetUsageReferences = useMemo(() => {
        if (!previewAsset) return [];
        return collectAssetVersionUsageReferences(previewAsset, {
            canvasProjects: projects,
            storyboardGroups,
            storyboardShots,
            storyboardTableShots,
            shotGroups,
            productionBibleItems,
            projectTitles: projectLibraryProjectTitles,
        });
    }, [previewAsset, productionBibleItems, projectLibraryProjectTitles, projects, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots]);
    const storyboardGroupOptions = useMemo(
        () =>
            storyboardGroups
                .filter((group) => !projectContextFilter || group.projectId === projectContextFilter)
                .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hans-CN"))
                .map((group) => ({ label: group.title || "未命名分镜组", value: group.id })),
        [projectContextFilter, storyboardGroups],
    );
    const generationFilterOptions = useMemo(() => assetGenerationFilterOptions(validAssets), [validAssets]);
    const projectReferencedAssetIds = useMemo(() => {
        return collectProjectReferencedAssetIds(projectContextFilter, productionBibleItems, storyboardGroups, storyboardShots, storyboardTableShots, shotGroups);
    }, [productionBibleItems, projectContextFilter, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots]);
    const storyboardGroupAssetIds = useMemo(() => collectStoryboardGroupReferencedAssetIds(storyboardGroupFilter, storyboardShots), [storyboardGroupFilter, storyboardShots]);
    const outdatedAssetVersionUsages = useMemo(
        () =>
            collectOutdatedAssetVersionUsages(
                validAssets,
                {
                    canvasProjects: projects,
                    storyboardGroups,
                    storyboardShots,
                    storyboardTableShots,
                    shotGroups,
                    productionBibleItems,
                    projectTitles: projectLibraryProjectTitles,
                },
                projectContextFilter,
            ),
        [validAssets, projects, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots, productionBibleItems, projectLibraryProjectTitles, projectContextFilter],
    );
    const filteredAssets = useMemo(() => {
        return sortAssetList(
            filterAssetList(validAssets, {
                keyword,
                kindFilter,
                folderFilter,
                generationSourceFilter,
                generationActionFilter,
                generationModelProviderFilter,
                generationTaskFilter,
                projectContextFilter,
                projectLibraryFilter,
                canvasLibraryFilter,
                projectReferencedAssetIds,
                storyboardGroupFilter,
                storyboardGroupAssetIds,
                searchText: assetSearchText,
            }),
            sortMode,
        );
    }, [
        validAssets,
        keyword,
        kindFilter,
        folderFilter,
        generationSourceFilter,
        generationActionFilter,
        generationModelProviderFilter,
        generationTaskFilter,
        projectContextFilter,
        projectLibraryFilter,
        canvasLibraryFilter,
        projectReferencedAssetIds,
        storyboardGroupFilter,
        storyboardGroupAssetIds,
        sortMode,
    ]);
    const visibleAssets = useMemo(() => paginateAssetList(filteredAssets, page, pageSize), [filteredAssets, page, pageSize]);
    const visibleProductionBibleItems = useMemo(() => {
        if (referenceVersionFilter !== "all" || kindFilter !== "all") return [];
        if (generationSourceFilter || generationActionFilter || generationModelProviderFilter || generationTaskFilter !== "all" || storyboardGroupFilter || projectLibraryFilter !== "all") return [];
        if (!projectContextFilter && folderFilter !== "all") return [];
        const query = keyword.trim().toLowerCase();
        return productionBibleItems
            .filter((item) => isReadableProductionBibleItem(item) && (!projectContextFilter || item.projectId === projectContextFilter) && (!query || productionBibleSearchText(item).includes(query)))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [folderFilter, generationActionFilter, generationModelProviderFilter, generationSourceFilter, generationTaskFilter, keyword, kindFilter, productionBibleItems, projectContextFilter, projectLibraryFilter, referenceVersionFilter, storyboardGroupFilter]);
    const visibleAssetGroups = useMemo(
        () =>
            buildAssetProjectResultGroups({
                assets: visibleAssets,
                folderMap,
                productionBibleItems: visibleProductionBibleItems,
                projectOrder: projectContexts.map((project) => project.id),
                projectReferencedAssetIdsByProject,
                projectTitles: projectLibraryProjectTitles,
            }),
        [folderMap, projectContexts, projectLibraryProjectTitles, projectReferencedAssetIdsByProject, visibleAssets, visibleProductionBibleItems],
    );

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    useEffect(() => {
        if (activeFolderId && !folderMap.has(activeFolderId)) setFolderFilter("all");
    }, [activeFolderId, folderMap]);

    useEffect(() => {
        if (!initialProjectId) return;
        const projectFolder = projectFolderRows.find((item) => item.project.id === initialProjectId)?.folder;
        setProjectContextFilter(initialProjectId);
        if (projectFolder) setFolderFilter(projectFolder.id);
    }, [initialProjectId, projectFolderRows]);

    useEffect(() => {
        if (storyboardGroupFilter && !storyboardGroupOptions.some((option) => option.value === storyboardGroupFilter)) setStoryboardGroupFilter("");
    }, [storyboardGroupFilter, storyboardGroupOptions]);

    useEffect(() => {
        if (!projectContextFilter && projectLibraryFilter !== "all") setProjectLibraryFilter("all");
    }, [projectContextFilter, projectLibraryFilter]);

    useEffect(() => {
        if (!projectContextFilter && referenceVersionFilter !== "all") setReferenceVersionFilter("all");
    }, [projectContextFilter, referenceVersionFilter]);

    return {
        activeFolderId,
        activeFolderName,
        canvasLibraryFilter,
        canvasLibraryTitles,
        filteredAssets,
        folderCounts,
        folderFilter,
        folderMap,
        folderOptions,
        generationActionFilter,
        generationFilterOptions,
        generationModelProviderFilter,
        generationSourceFilter,
        generationTaskFilter,
        kindFilter,
        keyword,
        outdatedAssetVersionUsages,
        page,
        pageSize,
        previewAssetUsageReferences,
        projectContextFilter,
        projectFolderRows,
        projectLibraryFilter,
        projectLibraryProjectTitles,
        referenceVersionFilter,
        regularFolders,
        setFolderFilter,
        setGenerationActionFilter,
        setGenerationModelProviderFilter,
        setGenerationSourceFilter,
        setGenerationTaskFilter,
        setKindFilter,
        setKeyword,
        setPage,
        setPageSize,
        setProjectContextFilter,
        setProjectLibraryFilter,
        setReferenceVersionFilter,
        setSortMode,
        setStoryboardGroupFilter,
        sortMode,
        storyboardGroupFilter,
        storyboardGroupOptions,
        validAssets,
        visibleAssetGroups,
        visibleAssets,
        visibleProductionBibleItems,
    };
}

function productionBibleSearchText(item: ProductionBibleItem) {
    return [item.name, item.description, item.tags.join(" "), item.promptSnippets.positive || "", item.promptSnippets.negative || "", item.promptSnippets.consistency || ""].join(" ").toLowerCase();
}
