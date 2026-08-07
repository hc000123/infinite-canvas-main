"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { fetchAdminAIUsageSummary, type AdminAIUsageSummaryResponse } from "@/services/api/admin";
import { fetchAdminAIUsageRecords, fetchMyAIUsageRecords, fetchMyAIUsageSummary, type AIUsagePeriod, type AIUsageRecordQuery, type AIUsageScope, type UserAIUsageSummary } from "@/services/api/usage";
import { useUserStore } from "@/stores/use-user-store";
import { dataCenterDefaultScope } from "./data-center-view";

export type DataCenterRecordFilters = {
    user: string;
    kind: string;
    model: string;
    status: string;
    startAt: string;
    endAt: string;
    page: number;
    pageSize: number;
};

export type DataCenterSummary = UserAIUsageSummary | AdminAIUsageSummaryResponse;

const defaultFilters: DataCenterRecordFilters = {
    user: "",
    kind: "",
    model: "",
    status: "",
    startAt: "",
    endAt: "",
    page: 1,
    pageSize: 20,
};

export function useDataCenter() {
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const updateCredits = useUserStore((state) => state.updateCredits);
    const role = user?.role || "user";
    const [scope, setScopeState] = useState<AIUsageScope>(() => dataCenterDefaultScope(role));
    const [period, setPeriodState] = useState<AIUsagePeriod>("month");
    const [filters, setFilters] = useState<DataCenterRecordFilters>(defaultFilters);
    const isAdmin = role === "admin" || role === "superadmin";

    useEffect(() => setScopeState(dataCenterDefaultScope(role)), [role]);

    const summaryQuery = useQuery<DataCenterSummary>({
        queryKey: ["data-center", "summary", token, scope, period],
        queryFn: () => (scope === "all" ? fetchAdminAIUsageSummary(token, { period, page: 1, pageSize: 500 }) : fetchMyAIUsageSummary(token, period)),
        enabled: Boolean(token && (scope === "mine" || isAdmin)),
        retry: false,
    });

    const recordQuery: AIUsageRecordQuery = { period, ...filters, user: scope === "all" ? filters.user : undefined };
    const recordsQuery = useQuery({
        queryKey: ["data-center", "records", token, scope, recordQuery],
        queryFn: () => (scope === "all" ? fetchAdminAIUsageRecords(token, recordQuery) : fetchMyAIUsageRecords(token, recordQuery)),
        enabled: Boolean(token && (scope === "mine" || isAdmin)),
        retry: false,
    });

    useEffect(() => {
        if (scope === "mine" && summaryQuery.data && "balance" in summaryQuery.data) updateCredits(summaryQuery.data.balance);
    }, [scope, summaryQuery.data, updateCredits]);

    const setScope = (value: AIUsageScope) => {
        if (value === "all" && !isAdmin) return;
        setScopeState(value);
        setFilters(defaultFilters);
    };
    const setPeriod = (value: AIUsagePeriod) => {
        setPeriodState(value);
        setFilters((current) => ({ ...current, startAt: "", endAt: "", page: 1 }));
    };
    const updateFilters = (next: Partial<DataCenterRecordFilters>) => {
        setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));
    };

    return {
        role,
        isAdmin,
        scope,
        period,
        filters,
        balance: user?.credits || 0,
        summary: summaryQuery.data as DataCenterSummary | undefined,
        records: recordsQuery.data,
        summaryLoading: summaryQuery.isFetching,
        recordsLoading: recordsQuery.isFetching,
        summaryError: summaryQuery.error instanceof Error ? summaryQuery.error.message : summaryQuery.isError ? "使用概览读取失败" : "",
        recordsError: recordsQuery.error instanceof Error ? recordsQuery.error.message : recordsQuery.isError ? "消费明细读取失败" : "",
        setScope,
        setPeriod,
        updateFilters,
        retrySummary: summaryQuery.refetch,
        retryRecords: recordsQuery.refetch,
    };
}
