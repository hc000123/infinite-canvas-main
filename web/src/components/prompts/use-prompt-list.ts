"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts } from "@/services/api/prompts";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({
    keyword,
    tags,
    category,
    type = ALL_PROMPTS_OPTION,
    scenario = ALL_PROMPTS_OPTION,
    favorite = false,
    enabled = true,
}: {
    keyword: string;
    tags: string[];
    category: string;
    type?: string;
    scenario?: string;
    favorite?: boolean;
    enabled?: boolean;
}) {
    const query = useInfiniteQuery({
        queryKey: ["prompts", keyword, tags, category, type, scenario, favorite],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword, tag: tags, category, type, scenario, favorite, page: pageParam, pageSize: PROMPT_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled,
    });
    const firstPage = query.data?.pages[0];
    return {
        query,
        items: useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]),
        tags: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.tags || [])], [firstPage?.tags]),
        categories: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.categories || [])], [firstPage?.categories]),
        types: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.types || [])], [firstPage?.types]),
        scenarios: useMemo(() => [ALL_PROMPTS_OPTION, ...(firstPage?.scenarios || [])], [firstPage?.scenarios]),
        total: firstPage?.total || 0,
    };
}
