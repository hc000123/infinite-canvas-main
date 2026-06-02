"use client";

import { App } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchAdminAITask, fetchAdminAITasks, refreshAdminAITask, refundAdminAITask, type AdminAITaskQuery } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminAITasks() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [filters, setFilters] = useState<AdminAITaskQuery>({ page: 1, pageSize: defaultPageSize });
    const [detailId, setDetailId] = useState("");

    const query = useQuery({
        queryKey: ["admin", "ai-tasks", token, filters],
        queryFn: () => fetchAdminAITasks(token, filters),
        enabled: Boolean(token),
        retry: false,
    });

    const detailQuery = useQuery({
        queryKey: ["admin", "ai-task", token, detailId],
        queryFn: () => fetchAdminAITask(token, detailId),
        enabled: Boolean(token && detailId),
        retry: false,
    });

    const refreshMutation = useMutation({
        mutationFn: (id: string) => refreshAdminAITask(token, id),
        onSuccess: async (_, id) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "ai-tasks"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "ai-task", token, id] });
            message.success("任务状态已刷新");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "刷新失败"),
    });

    const refundMutation = useMutation({
        mutationFn: (id: string) => refundAdminAITask(token, id),
        onSuccess: async (_, id) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "ai-tasks"] });
            await queryClient.invalidateQueries({ queryKey: ["admin", "ai-task", token, id] });
            message.success("任务已返还");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "返还失败"),
    });

    useEffect(() => {
        if (!query.isError && !detailQuery.isError) return;
        const error = query.error || detailQuery.error;
        const errorMessage = error instanceof Error ? error.message : "读取 AI 任务失败";
        message.error(errorMessage);
        if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
    }, [clearSession, detailQuery.error, detailQuery.isError, message, query.error, query.isError]);

    const updateFilters = (next: AdminAITaskQuery) => {
        const merged = { ...filters, ...next };
        if (
            next.pageSize !== undefined ||
            next.keyword !== undefined ||
            next.user !== undefined ||
            next.status !== undefined ||
            next.kind !== undefined ||
            next.actionType !== undefined ||
            next.model !== undefined ||
            next.provider !== undefined ||
            next.upstreamTaskId !== undefined ||
            next.startAt !== undefined ||
            next.endAt !== undefined
        ) {
            merged.page = 1;
        }
        setFilters(merged);
    };

    const data = query.data;

    return {
        tasks: data?.items || [],
        total: data?.total || 0,
        filters,
        page: filters.page || 1,
        pageSize: filters.pageSize || defaultPageSize,
        detail: detailQuery.data || null,
        detailId,
        isLoading: query.isFetching || refreshMutation.isPending || refundMutation.isPending,
        isDetailLoading: detailQuery.isFetching,
        searchTasks: updateFilters,
        changePage: (page: number) => setFilters({ ...filters, page }),
        changePageSize: (pageSize: number) => updateFilters({ pageSize }),
        resetFilters: () => setFilters({ page: 1, pageSize: defaultPageSize }),
        refreshTasks: () => query.refetch(),
        openDetail: setDetailId,
        closeDetail: () => setDetailId(""),
        refreshTask: (id: string) => refreshMutation.mutateAsync(id),
        refundTask: (id: string) => refundMutation.mutateAsync(id),
    };
}
