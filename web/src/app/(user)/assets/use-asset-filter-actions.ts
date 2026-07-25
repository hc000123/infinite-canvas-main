"use client";

import type { Dispatch, SetStateAction } from "react";

import type { AssetKind } from "@/stores/use-asset-store";
import type { AssetSortMode, ProjectLibraryFilter } from "./asset-page-filters";
import type { ReferenceVersionFilter } from "./use-asset-page-query";
import type { AssetSourceScope } from "./asset-project-scope";

type GenerationTaskFilter = "all" | "with" | "without";

type Props = {
    setCanvasLibraryFilter: Dispatch<SetStateAction<string>>;
    setEpisodeFilter: Dispatch<SetStateAction<string>>;
    setFavoriteOnly: Dispatch<SetStateAction<boolean>>;
    setFolderFilter: Dispatch<SetStateAction<string>>;
    setGenerationActionFilter: Dispatch<SetStateAction<string | undefined>>;
    setGenerationModelProviderFilter: Dispatch<SetStateAction<string | undefined>>;
    setGenerationSourceFilter: Dispatch<SetStateAction<string | undefined>>;
    setGenerationTaskFilter: Dispatch<SetStateAction<GenerationTaskFilter>>;
    setKindFilter: Dispatch<SetStateAction<AssetKind | "all">>;
    setKeyword: Dispatch<SetStateAction<string>>;
    setPage: Dispatch<SetStateAction<number>>;
    setProjectContextFilter: Dispatch<SetStateAction<string>>;
    setProjectLibraryFilter: Dispatch<SetStateAction<ProjectLibraryFilter>>;
    setReferenceVersionFilter: Dispatch<SetStateAction<ReferenceVersionFilter>>;
    setSortMode: Dispatch<SetStateAction<AssetSortMode>>;
    setSourceScope: Dispatch<SetStateAction<AssetSourceScope>>;
    setStoryboardGroupFilter: Dispatch<SetStateAction<string>>;
};

export function useAssetFilterActions({
    setCanvasLibraryFilter,
    setEpisodeFilter,
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
    setProjectLibraryFilter,
    setReferenceVersionFilter,
    setSortMode,
    setSourceScope,
    setStoryboardGroupFilter,
}: Props) {
    const resetPage = () => setPage(1);
    return {
        changeCanvasLibraryFilter(value: string) {
            resetPage();
            setCanvasLibraryFilter(value);
        },
        changeFolderFilter(value: string) {
            resetPage();
            setEpisodeFilter("");
            setFolderFilter(value);
        },
        changeFavoriteOnly(value: boolean) {
            resetPage();
            setFavoriteOnly(value);
        },
        changeEpisodeFilter(value: string) {
            resetPage();
            setEpisodeFilter(value);
        },
        changeGenerationActionFilter(value?: string) {
            resetPage();
            setGenerationActionFilter(value);
        },
        changeGenerationModelProviderFilter(value?: string) {
            resetPage();
            setGenerationModelProviderFilter(value);
        },
        changeGenerationSourceFilter(value?: string) {
            resetPage();
            setGenerationSourceFilter(value);
        },
        changeGenerationTaskFilter(value: GenerationTaskFilter) {
            resetPage();
            setGenerationTaskFilter(value);
        },
        changeKindFilter(value: AssetKind | "all") {
            resetPage();
            setKindFilter(value);
        },
        changeKeyword(value: string) {
            resetPage();
            setKeyword(value);
        },
        changeProjectContextFilter(value: string) {
            resetPage();
            setCanvasLibraryFilter("");
            setEpisodeFilter("");
            setFolderFilter("all");
            setProjectLibraryFilter("all");
            setReferenceVersionFilter("all");
            setSourceScope("all");
            setStoryboardGroupFilter("");
            setProjectContextFilter(value);
        },
        changeProjectLibraryFilter(value: ProjectLibraryFilter) {
            resetPage();
            setProjectLibraryFilter(value);
        },
        changeReferenceVersionFilter(value: ReferenceVersionFilter) {
            resetPage();
            setReferenceVersionFilter(value);
        },
        changeSortMode(value: AssetSortMode) {
            resetPage();
            setSortMode(value);
        },
        changeSourceScope(value: AssetSourceScope) {
            resetPage();
            setCanvasLibraryFilter("");
            setEpisodeFilter("");
            setProjectLibraryFilter("all");
            setReferenceVersionFilter("all");
            setSourceScope(value);
            setStoryboardGroupFilter("");
        },
        changeStoryboardGroupFilter(value: string) {
            resetPage();
            setStoryboardGroupFilter(value);
        },
    };
}
