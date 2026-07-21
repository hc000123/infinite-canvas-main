export type DeliveryPackageLike = { assetStatus: string; generation?: { assetId?: string; status?: string }; id: string; promptStatus: string };

export function buildDeliveryReport<T extends DeliveryPackageLike>(packages: T[]) {
    const items = packages.map((item) => {
        const issues: string[] = [];
        if (item.promptStatus !== "已确认") issues.push("提示词尚未确认");
        if (item.assetStatus !== "完整") issues.push("参考资产仍有缺口");
        if (["checking", "creating", "queued", "running"].includes(item.generation?.status || "")) issues.push("视频任务仍在运行");
        if (item.generation?.status === "failed" || item.generation?.status === "cancelled") issues.push("视频任务失败或已停止");
        if (item.generation?.status !== "succeeded") issues.push("缺少成功视频版本");
        else if (!item.generation.assetId) issues.push("成功版本尚未归档到我的素材");
        return { id: item.id, issues, ready: issues.length === 0 };
    });
    const blockingCount = items.filter((item) => !item.ready).length;
    return { blockingCount, completedCount: items.length - blockingCount, items, ready: packages.length > 0 && blockingCount === 0, total: packages.length };
}
