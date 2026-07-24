"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { useState } from "react";

import { decideAdminLoginApproval, fetchAdminLoginApprovals } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export function useLoginApprovals() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const client = useQueryClient();
    const [status, setStatus] = useState("pending");
    const query = useQuery({ queryKey: ["admin", "login-approvals", token, status], queryFn: () => fetchAdminLoginApprovals(token, { status, page: 1, pageSize: 100 }), enabled: Boolean(token), refetchInterval: 5000, retry: false });
    const mutation = useMutation({
        mutationFn: ({ id, approve, scope }: { id: string; approve: boolean; scope?: "once" | "whitelist" }) => decideAdminLoginApproval(token, id, approve, scope),
        onSuccess: async () => {
            await client.invalidateQueries({ queryKey: ["admin", "login-approvals"] });
            message.success("审批已处理");
        },
        onError: (error: Error) => message.error(error.message),
    });
    return { items: query.data?.items || [], total: query.data?.total || 0, status, setStatus, isLoading: query.isFetching || mutation.isPending, decide: mutation.mutateAsync };
}
