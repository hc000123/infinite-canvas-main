"use client";

import { useEffect, useMemo, useState } from "react";

import type { Asset, AssetFolder, AssetKind, AssetSubject } from "@/stores/use-asset-store";
import type { CanvasProject } from "../canvas/stores/use-canvas-store";
import type { ScriptEpisode } from "../canvas/utils/script-management";
import { isReadableProductionBibleItem, type ProductionBibleItem } from "../canvas/utils/production-bible";
import type { ShotGroup, StoryboardGroup, StoryboardShot, StoryboardTableShot } from "../canvas/utils/storyboard-management";
import { canvasIdsForCreativeProject, type CreativeProject } from "../projects/creative-projects";
import { assetGenerationFilterOptions } from "./asset-generation";
import { assetEpisodeLabels, assetMatchesEpisodeOption, buildAssetEpisodeOptions } from "./asset-episode";
import { buildAssetProjectResultGroups } from "./asset-project-groups";
import { packAssetProjectGroupPages } from "./asset-project-pagination";
import { projectAssetIds, type AssetSourceScope } from "./asset-project-scope";
import { collectOutdatedAssetVersionUsages } from "./asset-version-outdated-references";
import { collectAssetVersionUsageReferences } from "./asset-version-references";
import {
    activeAssetFolderId,
    buildAssetProjectContexts,
    DEFAULT_ASSET_SORT_MODE,
    filterAssetList,
    projectReferencedAssetIds as collectProjectReferencedAssetIds,
    sortAssetList,
    storyboardGroupReferencedAssetIds as collectStoryboardGroupReferencedAssetIds,
    supportedAssetList,
    type AssetSortMode,
    type ProjectLibraryFilter,
} from "./asset-page-filters";
import { assetSearchText, countFolderAssets } from "./asset-utils";
import { buildWorkflowAssetCanonicalView } from "./workflow-asset-dedup";

export type ReferenceVersionFilter = "all" | "outdated";

type Props = {
    assets: Asset[];
    creativeProjects: CreativeProject[];
    folders: AssetFolder[];
    initialProjectId: string;
    previewAsset: Asset | null;
    productionBibleItems: ProductionBibleItem[];
    projects: CanvasProject[];
    scriptEpisodes: ScriptEpisode[];
    shotGroups: ShotGroup[];
    storyboardGroups: StoryboardGroup[];
    storyboardShots: StoryboardShot[];
    storyboardTableShots: StoryboardTableShot[];
    subjects: AssetSubject[];
};

export function useAssetPageQuery({ assets, creativeProjects, folders, initialProjectId, previewAsset, productionBibleItems, projects, scriptEpisodes, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots, subjects }: Props) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [folderFilter, setFolderFilter] = useState<string | "all" | "root">("all");
    const [generationSourceFilter, setGenerationSourceFilter] = useState<string>();
    const [generationActionFilter, setGenerationActionFilter] = useState<string>();
    const [generationModelProviderFilter, setGenerationModelProviderFilter] = useState<string>();
    const [generationTaskFilter, setGenerationTaskFilter] = useState<"all" | "with" | "without">("all");
    const [projectContextFilter, setProjectContextFilter] = useState(initialProjectId);
    const [sourceScope, setSourceScope] = useState<AssetSourceScope>("all");
    const [episodeFilter, setEpisodeFilter] = useState("");
    const [projectLibraryFilter, setProjectLibraryFilter] = useState<ProjectLibraryFilter>("all");
    const [canvasLibraryFilter, setCanvasLibraryFilter] = useState("");
    const [referenceVersionFilter, setReferenceVersionFilter] = useState<ReferenceVersionFilter>("all");
    const [storyboardGroupFilter, setStoryboardGroupFilter] = useState("");
    const [sortMode, setSortMode] = useState<AssetSortMode>(DEFAULT_ASSET_SORT_MODE);
    const [page, setPage] = useState(1);
    const activeFolderId = activeAssetFolderId(folderFilter);
    const canonicalAssetView = useMemo(() => buildWorkflowAssetCanonicalView(supportedAssetList(assets)), [assets]);
    const validAssets = canonicalAssetView.assets;
    const assetAliasIdsByCanonicalId = canonicalAssetView.aliasIdsByCanonicalId;
    const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
    const activeFolderName = activeFolderId ? folderMap.get(activeFolderId)?.name || "当前文件夹" : "";
    const folderCounts = useMemo(() => countFolderAssets(validAssets), [validAssets]);
    const regularFolders = useMemo(() => folders.filter((folder) => !folder.projectId), [folders]);
    const projectFolderRows = useMemo(
        () => creativeProjects.map((project) => ({ project, folder: folders.find((folder) => folder.projectId === project.id) })).filter((item): item is { project: CreativeProject; folder: AssetFolder } => Boolean(item.folder)),
        [creativeProjects, folders],
    );
    const projectOptions = useMemo(() => creativeProjects.map((project) => ({ label: project.title || "未命名项目", value: project.id })), [creativeProjects]);
    const selectedProject = creativeProjects.find((project) => project.id === projectContextFilter);
    const projectCanvasIds = useMemo(() => new Set(selectedProject ? canvasIdsForCreativeProject(selectedProject, projects) : []), [projects, selectedProject]);
    const canvasProjectOptions = useMemo(() => projects.filter((project) => projectCanvasIds.has(project.id)).map((project) => ({ label: project.title || "未命名画布", value: project.id })), [projectCanvasIds, projects]);
    const folderOptions = useMemo(
        () => [{ label: "未分组", value: "" }, ...projectFolderRows.map(({ project, folder }) => ({ label: `项目 / ${project.title || folder.name}`, value: folder.id })), ...regularFolders.map((folder) => ({ label: folder.name, value: folder.id }))],
        [projectFolderRows, regularFolders],
    );
    const canvasLibraryTitles = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.title || "未命名画布"])), [projects]);
    const projectContexts = useMemo(() => buildAssetProjectContexts(creativeProjects, projects), [creativeProjects, projects]);
    const projectLibraryProjectTitles = useMemo(() => Object.fromEntries(projectContexts.map((project) => [project.id, project.title])), [projectContexts]);
    const projectReferenceIds = useMemo(
        () =>
            Array.from(
                new Set(
                    [
                        ...projectContexts.map((project) => project.id),
                        ...productionBibleItems.map((item) => item.projectId),
                        ...storyboardGroups.map((group) => group.projectId),
                        ...storyboardTableShots.map((shot) => shot.projectId),
                        ...shotGroups.map((group) => group.projectId),
                    ].filter(Boolean),
                ),
            ),
        [productionBibleItems, projectContexts, shotGroups, storyboardGroups, storyboardTableShots],
    );
    const projectReferencedAssetIdsByProject = useMemo(
        () => new Map(projectReferenceIds.map((projectId) => [projectId, collectProjectReferencedAssetIds(projectId, productionBibleItems, storyboardGroups, storyboardShots, storyboardTableShots, shotGroups)])),
        [productionBibleItems, projectReferenceIds, shotGroups, storyboardGroups, storyboardShots, storyboardTableShots],
    );
    const folderProjectIdByFolderId = useMemo(() => new Map(folders.flatMap((folder): Array<[string, string]> => (folder.projectId ? [[folder.id, folder.projectId]] : []))), [folders]);
    const canvasProjectIdByCanvasId = useMemo(() => {
        const result = new Map<string, string>();
        creativeProjects.forEach((project) => canvasIdsForCreativeProject(project, projects).forEach((canvasId) => result.set(canvasId, project.id)));
        return result;
    }, [creativeProjects, projects]);
    const selectedProjectAssetIds = useMemo(
        () =>
            projectContextFilter
                ? projectAssetIds(validAssets, projectContextFilter, {
                      folderProjectIdByFolderId,
                      canvasProjectIdByCanvasId,
                      referencedAssetIdsByProject: projectReferencedAssetIdsByProject,
                  })
                : undefined,
        [canvasProjectIdByCanvasId, folderProjectIdByFolderId, projectContextFilter, projectReferencedAssetIdsByProject, validAssets],
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
    const projectFilteredAssets = useMemo(
        () =>
            filterAssetList(validAssets, {
                favoriteOnly,
                keyword,
                kindFilter,
                folderFilter,
                generationSourceFilter,
                generationActionFilter,
                generationModelProviderFilter,
                generationTaskFilter,
                projectContextFilter,
                projectAssetIds: selectedProjectAssetIds,
                projectCanvasIds,
                sourceScope,
                projectLibraryFilter,
                canvasLibraryFilter,
                projectReferencedAssetIds,
                storyboardGroupFilter,
                storyboardGroupAssetIds,
                searchText: assetSearchText,
            }),
        [
            validAssets,
            favoriteOnly,
            keyword,
            kindFilter,
            folderFilter,
            generationSourceFilter,
            generationActionFilter,
            generationModelProviderFilter,
            generationTaskFilter,
            projectContextFilter,
            selectedProjectAssetIds,
            projectCanvasIds,
            sourceScope,
            projectLibraryFilter,
            canvasLibraryFilter,
            projectReferencedAssetIds,
            storyboardGroupFilter,
            storyboardGroupAssetIds,
        ],
    );
    const episodeOptions = useMemo(() => buildAssetEpisodeOptions(projectFilteredAssets, scriptEpisodes, projectContextFilter, projectLibraryProjectTitles), [projectContextFilter, projectFilteredAssets, projectLibraryProjectTitles, scriptEpisodes]);
    const episodeOptionMap = useMemo(() => new Map(episodeOptions.map((option) => [option.value, option])), [episodeOptions]);
    const activeEpisodeOption = episodeFilter ? episodeOptionMap.get(episodeFilter) : undefined;
    const episodeTitleMap = useMemo(() => assetEpisodeLabels(episodeOptions), [episodeOptions]);
    const filteredAssets = useMemo(() => {
        const assetsByEpisode = activeEpisodeOption ? projectFilteredAssets.filter((asset) => assetMatchesEpisodeOption(asset, activeEpisodeOption)) : projectFilteredAssets;
        return sortAssetList(assetsByEpisode, sortMode);
    }, [activeEpisodeOption, projectFilteredAssets, sortMode]);
    const hasScopedAssetFilter = Boolean(
        episodeFilter ||
            favoriteOnly ||
            folderFilter !== "all" ||
            generationSourceFilter ||
            generationActionFilter ||
            generationModelProviderFilter ||
            generationTaskFilter !== "all" ||
            sourceScope !== "all" ||
            canvasLibraryFilter ||
            storyboardGroupFilter ||
            projectLibraryFilter !== "all" ||
            referenceVersionFilter !== "all",
    );
    const visibleProductionBibleItems = useMemo(() => {
        if (sourceScope === "canvas" || canvasLibraryFilter) return [];
        if (favoriteOnly || referenceVersionFilter !== "all" || kindFilter !== "all" || episodeFilter) return [];
        if (generationSourceFilter || generationActionFilter || generationModelProviderFilter || generationTaskFilter !== "all" || storyboardGroupFilter || projectLibraryFilter !== "all") return [];
        if (!projectContextFilter && folderFilter !== "all") return [];
        const query = keyword.trim().toLowerCase();
        return productionBibleItems
            .filter((item) => isReadableProductionBibleItem(item) && (!projectContextFilter || item.projectId === projectContextFilter) && (!query || productionBibleSearchText(item).includes(query)))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, [
        canvasLibraryFilter,
        episodeFilter,
        favoriteOnly,
        folderFilter,
        generationActionFilter,
        generationModelProviderFilter,
        generationSourceFilter,
        generationTaskFilter,
        keyword,
        kindFilter,
        productionBibleItems,
        projectContextFilter,
        projectLibraryFilter,
        referenceVersionFilter,
        storyboardGroupFilter,
        sourceScope,
    ]);
    const allAssetGroups = useMemo(
        () =>
            buildAssetProjectResultGroups({
                assets: filteredAssets,
                folderMap,
                forcedProjectId: projectContextFilter || undefined,
                productionBibleItems: visibleProductionBibleItems,
                projectOrder: projectContexts.map((project) => project.id),
                projectReferencedAssetIdsByProject,
                projectTitles: projectLibraryProjectTitles,
                subjectProjectIds: subjects.filter((subject) => !projectContextFilter || subject.projectId === projectContextFilter).map((subject) => subject.projectId),
            }),
        [filteredAssets, folderMap, projectContextFilter, projectContexts, projectLibraryProjectTitles, projectReferencedAssetIdsByProject, subjects, visibleProductionBibleItems],
    );
    const assetGroupPages = useMemo(() => (projectContextFilter ? [allAssetGroups] : packAssetProjectGroupPages(allAssetGroups)), [allAssetGroups, projectContextFilter]);
    const pageCount = Math.max(1, assetGroupPages.length);
    const visibleAssetGroups = assetGroupPages[page - 1] || [];
    const visibleAssets = visibleAssetGroups.flatMap((group) => group.assets);

    useEffect(() => {
        if (episodeFilter && !episodeOptionMap.has(episodeFilter)) setEpisodeFilter("");
    }, [episodeFilter, episodeOptionMap]);

    useEffect(() => {
        setPage((value) => Math.min(value, pageCount));
    }, [pageCount]);

    useEffect(() => {
        if (activeFolderId && !folderMap.has(activeFolderId)) setFolderFilter("all");
    }, [activeFolderId, folderMap]);

    useEffect(() => {
        if (canvasLibraryFilter && !projectCanvasIds.has(canvasLibraryFilter)) setCanvasLibraryFilter("");
    }, [canvasLibraryFilter, projectCanvasIds]);

    useEffect(() => {
        if (!initialProjectId) return;
        setProjectContextFilter(initialProjectId);
        setFolderFilter("all");
    }, [initialProjectId]);

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
        assetAliasIdsByCanonicalId,
        canvasLibraryFilter,
        canvasLibraryTitles,
        canvasProjectOptions,
        episodeFilter,
        episodeOptions,
        episodeTitleMap,
        favoriteOnly,
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
        hasScopedAssetFilter,
        kindFilter,
        keyword,
        outdatedAssetVersionUsages,
        page,
        pageCount,
        previewAssetUsageReferences,
        projectContextFilter,
        projectFolderRows,
        projectLibraryFilter,
        projectLibraryProjectTitles,
        referenceVersionFilter,
        regularFolders,
        setEpisodeFilter,
        setCanvasLibraryFilter,
        setFavoriteOnly,
        setFolderFilter,
        setGenerationActionFilter,
        setGenerationModelProviderFilter,
        setGenerationSourceFilter,
        setGenerationTaskFilter,
        setKindFilter,
        setKeyword,
        setPage,
        setProjectContextFilter,
        setSourceScope,
        setProjectLibraryFilter,
        setReferenceVersionFilter,
        setSortMode,
        setStoryboardGroupFilter,
        sortMode,
        sourceScope,
        storyboardGroupFilter,
        storyboardGroupOptions,
        validAssets,
        visibleAssetGroups,
        visibleAssets,
        visibleProductionBibleItems,
        projectOptions,
    };
}

function productionBibleSearchText(item: ProductionBibleItem) {
    return [item.name, item.description, item.tags.join(" "), item.promptSnippets.positive || "", item.promptSnippets.negative || "", item.promptSnippets.consistency || ""].join(" ").toLowerCase();
}
