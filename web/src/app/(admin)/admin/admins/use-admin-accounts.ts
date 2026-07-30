"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { useState } from "react";

import {
    adjustAdminUserCredits,
    changeAdminAccountRole,
    createAdminAccount,
    deleteAdminAccount,
    fetchAdminAccounts,
    fetchAdminUsers,
    resetAdminAccountPassword,
    updateAdminAccount,
    type AdminAccountQuery,
    type AdminAccountUpdate,
} from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { adminRoleChangeCopy } from "./admin-account-view";

const pageSize = 20;

export function useAdminAccounts(candidateOpen = false, candidateKeyword = "") {
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
    const candidateQuery = useQuery({
        queryKey: ["admin", "admin-candidates", token, candidateKeyword],
        queryFn: () => fetchAdminUsers(token, { keyword: candidateKeyword, page: 1, pageSize: 20 }),
        enabled: Boolean(token) && candidateOpen,
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
    const creditMutation = useMutation({
        mutationFn: ({ id, credits }: { id: string; credits: number }) => adjustAdminUserCredits(token, id, credits),
        onSuccess: async () => {
            await invalidate();
            message.success("管理员算力点已调整");
        },
        onError: showError(message.error),
    });
    const roleMutation = useMutation({
        mutationFn: ({ id, role }: { id: string; role: "admin" | "user" }) => changeAdminAccountRole(token, id, role),
        onSuccess: async (_, input) => {
            await Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: ["admin", "users"] }), queryClient.invalidateQueries({ queryKey: ["admin", "admin-candidates"] })]);
            message.success(adminRoleChangeCopy(input.role).success);
        },
        onError: showError(message.error),
    });
    const updateFilters = (next: Partial<AdminAccountQuery>) =>
        setFilters((current) => ({ ...current, ...next, page: next.page ?? (next.keyword !== undefined || next.role !== undefined || next.status !== undefined || next.pageSize !== undefined ? 1 : current.page) }));

    return {
        accounts: query.data?.items || [],
        promotionCandidates: candidateQuery.data?.items || [],
        total: query.data?.total || 0,
        filters,
        isLoading: query.isFetching || createMutation.isPending || updateMutation.isPending || passwordMutation.isPending || deleteMutation.isPending || creditMutation.isPending || roleMutation.isPending,
        candidateLoading: candidateQuery.isFetching,
        isChangingRole: roleMutation.isPending,
        updateFilters,
        refresh: query.refetch,
        createAccount: createMutation.mutateAsync,
        updateAccount: (id: string, input: AdminAccountUpdate) => updateMutation.mutateAsync({ id, input }),
        resetPassword: (id: string, password: string) => passwordMutation.mutateAsync({ id, password }),
        adjustCredits: (id: string, credits: number) => creditMutation.mutateAsync({ id, credits }),
        changeRole: (id: string, role: "admin" | "user") => roleMutation.mutateAsync({ id, role }),
        deleteAccount: deleteMutation.mutateAsync,
    };
}

function showError(notify: (content: string) => void) {
    return (error: Error) => notify(error?.message || "操作失败");
}
