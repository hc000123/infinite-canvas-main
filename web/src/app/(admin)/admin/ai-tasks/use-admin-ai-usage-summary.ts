"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchAdminAIUsageSummary, type AdminAIUsagePeriod } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminAIUsageSummary() {
    const token = useUserStore((state) => state.token);
    const [period, setPeriod] = useState<AdminAIUsagePeriod>("month");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);
    const query = useQuery({
        queryKey: ["admin", "ai-usage-summary", token, period, page, pageSize],
        queryFn: () => fetchAdminAIUsageSummary(token, { period, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    return {
        data: query.data,
        period,
        page,
        pageSize,
        isLoading: query.isFetching,
        isError: query.isError,
        errorMessage: query.error instanceof Error ? query.error.message : "统计数据读取失败",
        changePeriod: (value: AdminAIUsagePeriod) => {
            setPeriod(value);
            setPage(1);
        },
        changePage: setPage,
        changePageSize: (value: number) => {
            setPageSize(value);
            setPage(1);
        },
        refreshSummary: query.refetch,
    };
}
