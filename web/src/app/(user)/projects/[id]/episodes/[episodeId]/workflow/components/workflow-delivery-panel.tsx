import { Button, Progress } from "antd";
import { saveAs } from "file-saver";
import { CheckCircle2, CircleAlert, Download, PackageCheck } from "lucide-react";

import type { ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import type { Asset } from "@/stores/use-asset-store";

import { buildDeliveryReport, buildProductionAcceptanceManifest } from "../workflow-delivery-check";

export function WorkflowDeliveryPanel({ assets, episodeId, packages, projectId, scriptSnapshot, workflowRunId }: { assets: Asset[]; episodeId: string; packages: ProductionPackage[]; projectId: string; scriptSnapshot: string; workflowRunId?: string }) {
    const report = buildDeliveryReport(packages, assets);
    const percent = report.total ? Math.round((report.completedCount / report.total) * 100) : 0;
    const exportManifest = () => {
        const manifest = buildProductionAcceptanceManifest({ assets, episodeId, packages, projectId, scriptSnapshot, workflowRunId });
        saveAs(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" }), `生产验收清单_${episodeId}.json`);
    };
    return (
        <div className="space-y-3">
            <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <PackageCheck className="size-4 text-[var(--studio-accent)]" />
                            本集交付检查
                        </div>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">检查剧本快照、提示词、参考资产、生成版本、后处理任务与费用追溯。</p>
                    </div>
                    <Button type="primary" icon={<Download className="size-4" />} disabled={!report.ready} onClick={exportManifest}>
                        导出交付清单
                    </Button>
                </div>
                <div className="mt-4 flex items-center gap-4">
                    <Progress percent={percent} showInfo={false} strokeColor="var(--studio-accent)" railColor="var(--studio-panel-muted-bg)" />
                    <span className="shrink-0 text-xs tabular-nums text-[var(--studio-text-secondary)]">
                        {report.completedCount}/{report.total}
                    </span>
                </div>
                <div className={`mt-3 flex gap-2 rounded-md border p-3 text-xs ${report.ready ? "border-[var(--studio-success)]/40 text-[var(--studio-success)]" : "border-[var(--studio-warning)]/40 text-[var(--studio-warning)]"}`}>
                    {report.ready ? <CheckCircle2 className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
                    {report.ready ? "本集已满足交付条件" : report.total ? `还有 ${report.blockingCount} 条分镜需要处理，交付动作已暂时锁定` : "尚未生成视频生产包，完成前置阶段后可开始交付检查"}
                </div>
            </section>
            <section className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]">
                <div className="border-b border-[var(--studio-border-subtle)] px-4 py-3 text-xs font-semibold">逐条检查结果</div>
                <div className="divide-y divide-[var(--studio-border-subtle)]">
                    {report.items.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${item.ready ? "bg-[var(--studio-success)]/10 text-[var(--studio-success)]" : "bg-[var(--studio-warning)]/10 text-[var(--studio-warning)]"}`}>
                                {item.ready ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                            </span>
                            <div className="min-w-0">
                                <div className="text-xs font-semibold">{item.id}</div>
                                <div className="mt-1 text-[11px] leading-5 text-[var(--studio-text-secondary)]">{item.ready ? "已确认、已归档，可交付" : item.issues.join("；")}</div>
                            </div>
                        </div>
                    ))}
                    {!report.items.length ? <div className="px-4 py-12 text-center text-xs text-[var(--studio-text-muted)]">还没有视频生产包</div> : null}
                </div>
            </section>
        </div>
    );
}
