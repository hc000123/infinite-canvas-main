"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { useState } from "react";

import { createAdminAccount, deleteAdminAccount, fetchAdminAccounts, resetAdminAccountPassword, updateAdminAccount, type AdminAccountQuery, type AdminAccountUpdate } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const pageSize = 20;

export function useAdminAccounts() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [filters, setFilters] = useState<AdminAccountQuery>({ page: 1, pageSize });
    const query = useQuery({
        queryKey: ["admin", "admins", token, filters],
        queryFn: () => fetchAdminAccounts(token, filters),
        enabled: Boolean(token),
        retry: false,
    });
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });
    const createMutation = useMutation({
        mutationFn: (input: AdminAccountUpdate & { password: string }) => createAdminAccount(token, input),
        onSuccess: async () => {
            await invalidate();
            message.success("管理员已新增");
        },
        onError: showError(message.error),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: string; input: AdminAccountUpdate }) => updateAdminAccount(token, id, input),
        onSuccess: async () => {
            await invalidate();
            message.success("管理员已保存");
        },
        onError: showError(message.error),
    });
    const passwordMutation = useMutation({ mutationFn: ({ id, password }: { id: string; password: string }) => resetAdminAccountPassword(token, id, password), onSuccess: () => message.success("密码已重置"), onError: showError(message.error) });
    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminAccount(token, id),
        onSuccess: async () => {
            await invalidate();
            message.success("管理员已删除");
        },
        onError: showError(message.error),
    });
    const updateFilters = (next: Partial<AdminAccountQuery>) =>
        setFilters((current) => ({ ...current, ...next, page: next.page ?? (next.keyword !== undefined || next.role !== undefined || next.status !== undefined || next.pageSize !== undefined ? 1 : current.page) }));

    return {
        accounts: query.data?.items || [],
        total: query.data?.total || 0,
        filters,
        isLoading: query.isFetching || createMutation.isPending || updateMutation.isPending || passwordMutation.isPending || deleteMutation.isPending,
        updateFilters,
        refresh: query.refetch,
        createAccount: createMutation.mutateAsync,
        updateAccount: (id: string, input: AdminAccountUpdate) => updateMutation.mutateAsync({ id, input }),
        resetPassword: (id: string, password: string) => passwordMutation.mutateAsync({ id, password }),
        deleteAccount: deleteMutation.mutateAsync,
    };
}

function showError(notify: (content: string) => void) {
    return (error: Error) => notify(error?.message || "操作失败");
}
