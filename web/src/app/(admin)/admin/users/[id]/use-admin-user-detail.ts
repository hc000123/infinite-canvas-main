"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { App } from "antd";

import {
    addAdminUserAllowedIP,
    deleteAdminUserAllowedIP,
    fetchAdminUser,
    fetchAdminUserActivities,
    fetchAdminUserAITasks,
    fetchAdminUserAllowedIPs,
    fetchAdminUserCreditLogs,
    fetchAdminUserSession,
    forceLogoutAdminUser,
    setAdminUserIPPolicy,
    type AdminAITaskQuery,
    type AdminUserActivityQuery,
    type AdminUserQuery,
} from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useAdminUserDetail(userId: string) {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const client = useQueryClient();
    const [aiTaskQuery, setAITaskQuery] = useState<AdminAITaskQuery>({ page: 1, pageSize: 10 });
    const [creditQuery, setCreditQuery] = useState<AdminUserQuery>({ page: 1, pageSize: 10 });
    const [activityQuery, setActivityQuery] = useState<AdminUserActivityQuery>({ page: 1, pageSize: 10 });
    const enabled = Boolean(token && userId);
    const overview = useQuery({ queryKey: ["admin", "user", token, userId], queryFn: () => fetchAdminUser(token, userId), enabled, retry: false });
    const tasks = useQuery({ queryKey: ["admin", "user", userId, "ai-tasks", token, aiTaskQuery], queryFn: () => fetchAdminUserAITasks(token, userId, aiTaskQuery), enabled, retry: false });
    const creditLogs = useQuery({ queryKey: ["admin", "user", userId, "credit-logs", token, creditQuery], queryFn: () => fetchAdminUserCreditLogs(token, userId, creditQuery), enabled, retry: false });
    const activities = useQuery({ queryKey: ["admin", "user", userId, "activity-logs", token, activityQuery], queryFn: () => fetchAdminUserActivities(token, userId, activityQuery), enabled, retry: false });
    const allowedIPs = useQuery({ queryKey: ["admin", "user", userId, "allowed-ips", token], queryFn: () => fetchAdminUserAllowedIPs(token, userId), enabled, retry: false });
    const session = useQuery({ queryKey: ["admin", "user", userId, "session", token], queryFn: () => fetchAdminUserSession(token, userId), enabled, retry: false });
    const invalidateIP = () => Promise.all([client.invalidateQueries({ queryKey: ["admin", "user", token, userId] }), client.invalidateQueries({ queryKey: ["admin", "user", userId, "allowed-ips"] })]);
    const addIP = useMutation({ mutationFn: (cidr: string) => addAdminUserAllowedIP(token, userId, cidr), onSuccess: invalidateIP });
    const deleteIP = useMutation({ mutationFn: (id: string) => deleteAdminUserAllowedIP(token, userId, id), onSuccess: invalidateIP });
    const setPolicy = useMutation({ mutationFn: (value: boolean) => setAdminUserIPPolicy(token, userId, value), onSuccess: invalidateIP });
    const forceLogout = useMutation({
        mutationFn: (reason: string) => forceLogoutAdminUser(token, userId, reason),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ["admin", "user", userId, "session"] }), client.invalidateQueries({ queryKey: ["admin", "user", userId, "activity-logs"] }), client.invalidateQueries({ queryKey: ["admin", "users"] })]);
            message.success("账号已强制下线");
        },
        onError: (error: Error) => message.error(error.message || "强制下线失败"),
    });
    return {
        overview: overview.data,
        error: overview.error,
        tasks: tasks.data?.items || [],
        taskTotal: tasks.data?.total || 0,
        aiTaskQuery,
        setAITaskQuery,
        creditLogs: creditLogs.data?.items || [],
        creditTotal: creditLogs.data?.total || 0,
        creditQuery,
        setCreditQuery,
        activities: activities.data?.items || [],
        activityTotal: activities.data?.total || 0,
        activityQuery,
        setActivityQuery,
        allowedIPs: allowedIPs.data || [],
        session: session.data,
        addAllowedIP: addIP.mutateAsync,
        deleteAllowedIP: deleteIP.mutateAsync,
        setIPPolicy: setPolicy.mutateAsync,
        forceLogout: forceLogout.mutateAsync,
        isLoading: overview.isFetching || tasks.isFetching || creditLogs.isFetching || activities.isFetching || allowedIPs.isFetching || session.isFetching || addIP.isPending || deleteIP.isPending || setPolicy.isPending || forceLogout.isPending,
    };
}
