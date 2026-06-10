"use client";

import type { Dispatch, SetStateAction } from "react";

import type { AssetKind } from "@/stores/use-asset-store";
import type { AssetSortMode, ProjectLibraryFilter } from "./asset-page-filters";
import type { ReferenceVersionFilter } from "./use-asset-page-query";

type GenerationTaskFilter = "all" | "with" | "without";

type Props = {
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
    setStoryboardGroupFilter: Dispatch<SetStateAction<string>>;
};

export function useAssetFilterActions({
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
    setStoryboardGroupFilter,
}: Props) {
    const resetPage = () => setPage(1);
    return {
        changeFolderFilter(value: string) {
            resetPage();
            setFolderFilter(value);
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
        changeStoryboardGroupFilter(value: string) {
            resetPage();
            setStoryboardGroupFilter(value);
        },
    };
}
