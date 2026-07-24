"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchAdminUser, fetchAdminUserAITasks, fetchAdminUserCreditLogs, type AdminAITaskQuery, type AdminUserQuery } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminUserDetail(userId: string) {
    const token = useUserStore((state) => state.token);
    const [aiTaskQuery, setAITaskQuery] = useState<AdminAITaskQuery>({ page: 1, pageSize: 10 });
    const [creditQuery, setCreditQuery] = useState<AdminUserQuery>({ page: 1, pageSize: 10 });
    const overview = useQuery({ queryKey: ["admin", "user", token, userId], queryFn: () => fetchAdminUser(token, userId), enabled: Boolean(token && userId), retry: false });
    const tasks = useQuery({ queryKey: ["admin", "user", userId, "ai-tasks", token, aiTaskQuery], queryFn: () => fetchAdminUserAITasks(token, userId, aiTaskQuery), enabled: Boolean(token && userId), retry: false });
    const creditLogs = useQuery({ queryKey: ["admin", "user", userId, "credit-logs", token, creditQuery], queryFn: () => fetchAdminUserCreditLogs(token, userId, creditQuery), enabled: Boolean(token && userId), retry: false });
    return {
        overview: overview.data,
        error: overview.error,
        tasks: tasks.data?.items || [],
        taskTotal: tasks.data?.total || 0,
        creditLogs: creditLogs.data?.items || [],
        creditTotal: creditLogs.data?.total || 0,
        aiTaskQuery,
        creditQuery,
        setAITaskQuery,
        setCreditQuery,
        isLoading: overview.isFetching || tasks.isFetching || creditLogs.isFetching,
    };
}
