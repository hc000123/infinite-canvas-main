import Link from "next/link";
import { Button, Progress, Tooltip } from "antd";
import { ArrowLeft, CircleAlert, RefreshCw, Settings2 } from "lucide-react";

export function WorkflowHeader(props: {
    blockerCount: number;
    episodeTitle: string;
    loading: boolean;
    modelSummary: string;
    onContinue: () => void;
    onRefresh: () => void;
    progress: number;
    projectTitle: string;
    returnHref: string;
    returnLabel: string;
    workerReady: boolean;
}) {
    return (
        <header className="shrink-0 border-b border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)]/80 px-5 py-3 backdrop-blur xl:px-7">
            <div className="flex min-w-0 items-center justify-between gap-5">
                <div className="flex min-w-0 items-center gap-4">
                    <Link href={props.returnHref} aria-label={props.returnLabel} title={props.returnLabel} className="grid size-9 shrink-0 place-items-center rounded-md text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)]">
                        <ArrowLeft className="size-4" />
                    </Link>
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-base font-semibold text-[var(--studio-text-primary)]">{props.projectTitle}</h1>
                            <span className="text-[var(--studio-text-muted)]">/</span>
                            <span className="truncate text-sm text-[var(--studio-text-secondary)]">{props.episodeTitle}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--studio-text-muted)]">
                            <span className="inline-flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${props.workerReady ? "bg-[var(--studio-success)]" : "bg-[var(--studio-warning)]"}`} />
                                {props.workerReady ? "云端执行器在线" : "云端执行器待恢复"}
                            </span>
                            <span className="hidden items-center gap-1 md:inline-flex"><Settings2 className="size-3" />视频模型：{props.modelSummary}</span>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden min-w-40 items-center gap-3 lg:flex">
                        <Progress percent={props.progress} showInfo={false} size="small" strokeColor="var(--studio-accent)" railColor="var(--studio-panel-muted-bg)" />
                        <span className="w-9 text-right text-xs tabular-nums text-[var(--studio-text-secondary)]">{props.progress}%</span>
                    </div>
                    {props.blockerCount ? <span className="hidden items-center gap-1 text-xs text-[var(--studio-warning)] md:inline-flex"><CircleAlert className="size-3.5" />{props.blockerCount} 项待处理</span> : null}
                    <Tooltip title="刷新运行状态">
                        <Button aria-label="刷新运行状态" icon={<RefreshCw className={`size-4 ${props.loading ? "animate-spin" : ""}`} />} onClick={props.onRefresh} />
                    </Tooltip>
                    <Button type="primary" onClick={props.onContinue}>继续下一项</Button>
                </div>
            </div>
        </header>
    );
}
