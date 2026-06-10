import { Button, Tag } from "antd";

import { workflowMappingPreviewItemKey } from "./agent-runner-workflow-apply-common";
import type { AgentWorkflowMappingPreview } from "./agent-runner-types";

export function WorkflowMappingPreviewPanel({
    previews,
    appliedPreviewItemIds,
    applyingPreviewIds,
    hasCanvasContext,
    hasStoryboardContext,
    onApplyProductionBiblePreview,
    onApplyStoryboardPreview,
    onApplyVideoNodePreview,
}: {
    previews: AgentWorkflowMappingPreview[];
    appliedPreviewItemIds: string[];
    applyingPreviewIds: Record<string, boolean>;
    hasCanvasContext: boolean;
    hasStoryboardContext: boolean;
    onApplyProductionBiblePreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyStoryboardPreview: (preview: AgentWorkflowMappingPreview) => void;
    onApplyVideoNodePreview: (preview: AgentWorkflowMappingPreview) => void;
}) {
    return (
        <div className="mt-3 grid gap-2 rounded-md border border-dashed border-stone-200 p-3 dark:border-stone-700">
            <div className="text-xs font-medium text-stone-500">映射预览</div>
            {previews.map((preview) => {
                const creatableItems = preview.items.filter((item) => item.targetType === preview.targetType && item.action === "create");
                const pendingCreatableItems = creatableItems.filter((item) => !appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId)));
                const appliedCount = creatableItems.length - pendingCreatableItems.length;
                const applyDisabledReason =
                    preview.targetType === "video_node"
                        ? !hasCanvasContext
                            ? "当前缺少画布上下文，不能创建视频配置节点"
                            : !creatableItems.length
                              ? "当前预览没有可创建的视频配置节点"
                              : !pendingCreatableItems.length
                                ? "已创建视频配置节点"
                                : ""
                        : !creatableItems.length
                          ? preview.targetType === "production_bible"
                              ? "当前预览没有可新增的设定库条目"
                              : "当前预览没有可新增的分镜头表条目"
                          : preview.targetType === "storyboard_table" && !hasStoryboardContext
                            ? "当前缺少画布或本集上下文，不能写入分镜头表"
                            : !pendingCreatableItems.length
                              ? preview.targetType === "production_bible"
                                  ? "已写入设定库"
                                  : "已写入分镜头表"
                              : "";
                return (
                    <div key={preview.previewId} className="rounded-md bg-stone-50 p-2 text-xs leading-5 text-stone-600 dark:bg-white/5 dark:text-stone-300">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="m-0">{preview.targetType}</Tag>
                            <span className="font-medium">{preview.title}</span>
                            <Tag className="m-0">条目 {preview.items.length}</Tag>
                            <Tag className="m-0" color={preview.warnings.length ? "orange" : "default"}>
                                warning {preview.warnings.length}
                            </Tag>
                            <Tag className="m-0" color={appliedCount ? "green" : "default"}>
                                {preview.targetType === "video_node" ? `已创建 ${appliedCount}` : `已应用 ${appliedCount}`}
                            </Tag>
                            {preview.targetType === "production_bible" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyProductionBiblePreview(preview)}>
                                    写入设定库
                                </Button>
                            ) : preview.targetType === "storyboard_table" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyStoryboardPreview(preview)}>
                                    写入分镜
                                </Button>
                            ) : preview.targetType === "video_node" ? (
                                <Button size="small" type="primary" disabled={Boolean(applyDisabledReason)} loading={Boolean(applyingPreviewIds[preview.previewId])} onClick={() => onApplyVideoNodePreview(preview)}>
                                    创建节点
                                </Button>
                            ) : (
                                <Tag className="m-0">后续步骤处理</Tag>
                            )}
                        </div>
                        <div className="mt-1">{preview.summary}</div>
                        {preview.warnings.length ? <div className="mt-1 text-amber-600">提示：{preview.warnings.join("；")}</div> : null}
                        {applyDisabledReason ? <div className="mt-1 text-stone-500">{applyDisabledReason}</div> : null}
                        <details className="mt-2">
                            <summary className="cursor-pointer text-stone-500">查看条目与追溯</summary>
                            <div className="mt-2 grid gap-2">
                                {preview.items.map((item) => (
                                    <details key={item.itemId} className="rounded bg-white px-2 py-1.5 dark:bg-black/20">
                                        <summary className="cursor-pointer list-none">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Tag className="m-0">{item.action}</Tag>
                                                <span className="font-medium">{item.title}</span>
                                                {appliedPreviewItemIds.includes(workflowMappingPreviewItemKey(preview, item.itemId)) ? (
                                                    <Tag className="m-0" color="green">
                                                        {preview.targetType === "production_bible" ? "已写入设定库" : preview.targetType === "storyboard_table" ? "已写入分镜头表" : "已创建视频配置节点"}
                                                    </Tag>
                                                ) : null}
                                                {typeof item.confidence === "number" ? <span className="text-stone-400">置信度 {item.confidence}</span> : null}
                                                {item.warnings.length ? (
                                                    <Tag className="m-0" color="orange">
                                                        warning {item.warnings.length}
                                                    </Tag>
                                                ) : null}
                                            </div>
                                            <div className="mt-1">{item.reason}</div>
                                        </summary>
                                        <div className="mt-2 grid gap-2">
                                            <div className="text-stone-500">来源：{item.sourceText}</div>
                                            {item.warnings.length ? <div className="text-amber-600">{item.warnings.join("；")}</div> : null}
                                            <details>
                                                <summary className="cursor-pointer text-stone-500">查看 mappedFields</summary>
                                                <pre className="mt-2 overflow-auto rounded bg-stone-950 p-2 text-[11px] text-stone-50">{JSON.stringify(item.mappedFields, null, 2)}</pre>
                                            </details>
                                        </div>
                                    </details>
                                ))}
                                <details className="rounded bg-white px-2 py-1.5 dark:bg-black/20">
                                    <summary className="cursor-pointer text-stone-500">查看完整追溯信息</summary>
                                    <div className="mt-2 grid gap-1 text-stone-500">
                                        <div>previewId：{preview.previewId}</div>
                                        <div>workflowRunId：{preview.workflowRunId}</div>
                                        <div>sourceStageId：{preview.sourceStageId}</div>
                                        <div>sourceOutputId：{preview.sourceOutputId}</div>
                                        <div>createdAt：{preview.createdAt}</div>
                                    </div>
                                </details>
                            </div>
                        </details>
                    </div>
                );
            })}
        </div>
    );
}
