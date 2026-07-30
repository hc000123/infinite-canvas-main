"use client";

import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";

import { batchDeleteAdminAssets, batchUpdateAdminAssets, deleteAdminAsset, fetchAdminAssets, saveAdminAsset, type AdminAsset, type AdminAssetBatchUpdate } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminAssets(projectId: string, folderId: string) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [keyword, setKeyword] = useState("");
    const [type, setType] = useState("");
    const [category, setCategory] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [episodeNumber, setEpisodeNumber] = useState("");
    const [allEpisodes, setAllEpisodes] = useState("");
    const [folderScope, setFolderScope] = useState<"current" | "project">("current");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(24);
    const deferredKeyword = useDeferredValue(keyword);

    useEffect(() => setPage(1), [folderId, projectId]);

    const queryKey = ["admin", "assets", token, projectId, folderId, folderScope, deferredKeyword, type, category, tags, episodeNumber, allEpisodes, page, pageSize];
    const query = useQuery({
        queryKey,
        queryFn: () => fetchAdminAssets(token, { projectId, folderId, folderScope, keyword: deferredKeyword, type, category, tag: tags, episodeNumber, allEpisodes, page, pageSize }),
        enabled: Boolean(token && projectId),
        retry: false,
    });

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : "读取素材失败");
    }, [message, query.error, query.isError]);

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ["admin", "assets"] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "asset-projects"] });
    };
    const saveMutation = useMutation({ mutationFn: (asset: Partial<AdminAsset>) => saveAdminAsset(token, asset), onSuccess: refresh });
    const deleteMutation = useMutation({ mutationFn: (id: string) => deleteAdminAsset(token, id), onSuccess: refresh });
    const batchUpdateMutation = useMutation({ mutationFn: (input: AdminAssetBatchUpdate) => batchUpdateAdminAssets(token, input), onSuccess: refresh });
    const batchDeleteMutation = useMutation({ mutationFn: (ids: string[]) => batchDeleteAdminAssets(token, projectId, ids), onSuccess: refresh });

    const resetFilters = () => {
        setKeyword("");
        setType("");
        setCategory("");
        setTags([]);
        setEpisodeNumber("");
        setAllEpisodes("");
        setPage(1);
    };

    return {
        assets: query.data?.items || [],
        availableTags: query.data?.tags || [],
        total: query.data?.total || 0,
        isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending || batchUpdateMutation.isPending || batchDeleteMutation.isPending,
        keyword,
        type,
        category,
        tags,
        episodeNumber,
        allEpisodes,
        folderScope,
        page,
        pageSize,
        setKeyword: (value: string) => { setKeyword(value); setPage(1); },
        setType: (value: string) => { setType(value); setPage(1); },
        setCategory: (value: string) => { setCategory(value); setPage(1); },
        setTags: (value: string[]) => { setTags(value); setPage(1); },
        setEpisodeNumber: (value: string) => { setEpisodeNumber(value); setPage(1); },
        setAllEpisodes: (value: string) => { setAllEpisodes(value); setPage(1); },
        setFolderScope: (value: "current" | "project") => { setFolderScope(value); setPage(1); },
        setPage,
        setPageSize: (value: number) => { setPageSize(value); setPage(1); },
        resetFilters,
        refresh,
        saveAsset: (asset: Partial<AdminAsset>) => saveMutation.mutateAsync(asset),
        deleteAsset: (id: string) => deleteMutation.mutateAsync(id),
        batchUpdate: (input: Omit<AdminAssetBatchUpdate, "projectId">) => batchUpdateMutation.mutateAsync({ ...input, projectId }),
        batchDelete: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    };
}
