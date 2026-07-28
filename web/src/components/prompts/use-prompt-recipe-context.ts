"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchPrompts } from "@/services/api/prompts";
import { activePromptProfile, usePromptProfileStore } from "@/stores/use-prompt-profile-store";
import { composePromptRecipe, type PromptRecipeNodeGroup } from "./prompt-profile";
import { normalizePromptMetadata } from "./prompt-template";

export function usePromptRecipeContext(nodeGroup: PromptRecipeNodeGroup, projectId?: string) {
    const hydrated = usePromptProfileStore((state) => state.hydrated);
    const profiles = usePromptProfileStore((state) => state.profiles);
    const activeProfileIds = usePromptProfileStore((state) => state.activeProfileIds);
    const query = useQuery({
        queryKey: ["prompt-company-standards", nodeGroup],
        queryFn: () => fetchPrompts({ nodeGroup, page: 1, pageSize: 500 }),
        staleTime: 60_000,
    });
    const companyStandards = useMemo(
        () =>
            (query.data?.items || []).filter((prompt) => {
                const metadata = normalizePromptMetadata(prompt.metadata);
                return metadata.kind === "standard" && metadata.enabled !== false;
            }),
        [query.data?.items],
    );
    const profileState = useMemo(() => ({ profiles, activeProfileIds }), [activeProfileIds, profiles]);
    const projectProfile = useMemo(() => (projectId ? activePromptProfile(profileState, "project", nodeGroup, projectId) : undefined), [nodeGroup, profileState, projectId]);
    const personalProfile = useMemo(() => activePromptProfile(profileState, "personal", nodeGroup), [nodeGroup, profileState]);
    const compose = useCallback(
        (task: string, template = "") => {
            const recipe = composePromptRecipe({ task, template, companyStandards, projectProfile, personalProfile, companyAvailable: !query.isError });
            if (!hydrated || query.isLoading) recipe.warnings.unshift("正在读取公司标准和本地配置，请稍候。");
            return recipe;
        },
        [companyStandards, hydrated, personalProfile, projectProfile, query.isError, query.isLoading],
    );

    return {
        hydrated,
        ready: hydrated && !query.isLoading,
        companyStandards,
        companyAvailable: !query.isError,
        companyLoading: query.isLoading,
        projectProfile,
        personalProfile,
        compose,
    };
}
