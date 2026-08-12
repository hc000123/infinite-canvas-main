"use client";

import { useMutation } from "@tanstack/react-query";
import { App } from "antd";
import { useState } from "react";

import { downloadAdminAIUsageExport, type AIUsageExportQuery } from "@/services/api/usage";
import { useUserStore } from "@/stores/use-user-store";

export function useUsageExport() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const mutation = useMutation({
        mutationFn: (query: AIUsageExportQuery) => downloadAdminAIUsageExport(token, query),
        onSuccess: () => {
            setOpen(false);
            message.success("用量报表已导出");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "用量报表导出失败"),
    });
    return {
        open,
        loading: mutation.isPending,
        openModal: () => setOpen(true),
        closeModal: () => !mutation.isPending && setOpen(false),
        submit: (query: AIUsageExportQuery) => mutation.mutateAsync(query),
    };
}
