"use client";

import type { ReactNode } from "react";
import { Button, Input } from "antd";
import { Ban, CheckCircle2, Eye, ImagePlus, Pencil, Send, Star, WandSparkles } from "lucide-react";

import type { Asset } from "@/stores/use-asset-store";
import { imageBriefKindLabel, type ImageBrief } from "../../../../../../canvas/utils/image-brief";
import { EpisodeStatusPill } from "./episode-module-panel";
import { briefTone, type EpisodeBriefReviewRow } from "./episode-image-brief-review-utils";

export function EpisodeBriefReviewTable({
    rows,
    selectedRowId,
    onEnsureBrief,
    onGenerateReference,
    onOpenAssets,
    onReject,
    onSelect,
}: {
    rows: EpisodeBriefReviewRow[];
    selectedRowId: string;
    onEnsureBrief: (row: EpisodeBriefReviewRow) => string;
    onGenerateReference: (row: EpisodeBriefReviewRow) => void;
    onOpenAssets: () => void;
    onReject: (row: EpisodeBriefReviewRow) => void;
    onSelect: (row: EpisodeBriefReviewRow) => void;
}) {
    if (!rows.length) return <div className="rounded-lg border border-slate-800 bg-[#091018]/88 px-5 py-14 text-center text-sm text-slate-500">暂无符合筛选的生图需求。</div>;
    return (
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-[#091018]/88">
            <div className="overflow-x-auto">
                <div className="min-w-[1080px]">
                    <div className="grid grid-cols-[92px_minmax(240px,1fr)_150px_130px_110px_260px] gap-4 border-b border-slate-800 px-5 py-3 text-sm font-medium text-slate-500">
                        <div>类型</div>
                        <div>Brief 草案标题 / 描述</div>
                        <div>来源</div>
                        <div>参考素材</div>
                        <div>当前状态</div>
                        <div>操作</div>
                    </div>
                    <div className="divide-y divide-slate-800/90">
                        {rows.map((row) => {
                            const selected = row.id === selectedRowId;
                            const referenceState = row.brief?.referenceAssets.length ? `已绑定 ${row.brief.referenceAssets.length}` : row.asset?.libraryMatchCount ? `候选 ${row.asset.libraryMatchCount}` : "待补素材";
                            return (
                                <div
                                    key={row.id}
                                    role="button"
                                    tabIndex={0}
                                    className={`grid grid-cols-[92px_minmax(240px,1fr)_150px_130px_110px_260px] gap-4 border-l-4 px-5 py-4 text-sm transition ${selected ? "border-cyan-300 bg-cyan-400/[0.08]" : "border-transparent hover:bg-white/[0.025]"}`}
                                    onClick={() => onSelect(row)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") onSelect(row);
                                    }}
                                >
                                    <div className="self-center font-semibold text-slate-200">{row.typeLabel}</div>
                                    <div className="min-w-0 self-center">
                                        <div className="break-words font-semibold text-slate-100">{row.title}</div>
                                        <div className="mt-1 line-clamp-2 break-words text-slate-500">{row.description}</div>
                                    </div>
                                    <div className="self-center text-slate-400">{row.source}</div>
                                    <div className="self-center text-slate-300">{referenceState}</div>
                                    <div className="self-center">
                                        <EpisodeStatusPill status={row.status} tone={briefTone(row.status)} />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 self-center" onClick={(event) => event.stopPropagation()}>
                                        <Button size="small" type={row.brief ? "default" : "primary"} icon={<CheckCircle2 className="size-3.5" />} onClick={() => onEnsureBrief(row)}>
                                            审核
                                        </Button>
                                        <Button size="small" className="!border-slate-700 !bg-slate-950/55 !text-slate-200" icon={<Pencil className="size-3.5" />} onClick={() => onSelect(row)}>
                                            编辑
                                        </Button>
                                        <Button
                                            size="small"
                                            className="!border-slate-700 !bg-slate-950/55 !text-slate-200"
                                            icon={<ImagePlus className="size-3.5" />}
                                            onClick={row.brief?.referenceAssets.length ? () => onGenerateReference(row) : onOpenAssets}
                                        >
                                            {row.brief?.referenceAssets.length ? "生成参考图" : "补素材"}
                                        </Button>
                                        <Button size="small" className="!border-slate-700 !bg-slate-950/55 !text-slate-200" icon={<Eye className="size-3.5" />} onClick={() => onSelect(row)}>
                                            查看结果
                                        </Button>
                                        <Button size="small" danger type="text" icon={<Ban className="size-3.5" />} onClick={() => onReject(row)}>
                                            驳回草案
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function EpisodeBriefDetailPanel({
    assetsById,
    onEnsureBrief,
    onGenerateReference,
    onPromptDraftChange,
    onSavePrompt,
    onSetPrimaryAsset,
    onSyncSource,
    promptDraft,
    row,
}: {
    assetsById: Map<string, Asset>;
    onEnsureBrief: (row: EpisodeBriefReviewRow) => string;
    onGenerateReference: (row: EpisodeBriefReviewRow) => void;
    onPromptDraftChange: (value: string) => void;
    onSavePrompt: () => void;
    onSetPrimaryAsset: (brief: ImageBrief, assetId: string) => void;
    onSyncSource: (brief: ImageBrief) => void;
    promptDraft: string;
    row?: EpisodeBriefReviewRow;
}) {
    if (!row) return <aside className="rounded-lg border border-slate-800 bg-[#091018]/88 p-5 text-sm text-slate-500">请选择一条生图需求。</aside>;
    const brief = row.brief;
    const fields = brief?.fields || {};
    const resultAssets = brief?.resultAssetIds.flatMap((assetId) => (assetsById.get(assetId) ? [assetsById.get(assetId)!] : [])) || [];
    return (
        <aside className="rounded-lg border border-slate-800 bg-[#091018]/92 shadow-[0_18px_80px_rgba(0,0,0,0.28)] xl:sticky xl:top-5">
            <div className="border-b border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-semibold text-cyan-300">{row.typeLabel}</div>
                        <h3 className="mt-1 break-words text-2xl font-semibold leading-tight text-slate-50">{row.title}</h3>
                        <p className="mt-2 break-words text-sm leading-6 text-slate-500">{row.description}</p>
                    </div>
                    <EpisodeStatusPill status={row.status} tone={briefTone(row.status)} />
                </div>
            </div>
            <div className="thin-scrollbar grid max-h-[calc(100vh-260px)] gap-4 overflow-auto p-5">
                <DetailBlock title="Brief 草案来源">
                    <DetailLine label="Agent run" value={brief?.metadata?.agentRunId || row.asset?.item?.itemId || "待运行 Brief Agent"} />
                    <DetailLine label="资产需求" value={row.asset?.name || row.sourceDetail} />
                    <DetailLine label="剧本证据" value={brief?.scriptText || row.asset?.sourceReason || "等待 Agent 证据"} />
                    <DetailLine label="导演分析依据" value={row.source} />
                </DetailBlock>
                <DetailBlock title="结构化 Brief">
                    <DetailLine label="用途" value={imageBriefKindLabel(row.kind)} />
                    <DetailLine label="视觉描述" value={fields.appearance || fields.location || fields.details || fields.mood || row.description} />
                    <DetailLine label="风格要求" value={fields.lighting || fields.palette || fields.composition || "待审核补充"} />
                    <DetailLine label="禁忌点" value={brief?.metadata?.warnings?.join("；") || "待补充"} />
                    <DetailLine label="参考素材" value={brief?.referenceAssets.length ? `${brief.referenceAssets.length} 个参考` : "待补素材"} />
                </DetailBlock>
                <DetailBlock title="最终提示词草案">
                    <Input.TextArea className="!bg-slate-950/70 !text-slate-100" rows={7} value={promptDraft} onChange={(event) => onPromptDraftChange(event.target.value)} />
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="small" type="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => (brief ? onSavePrompt() : onEnsureBrief(row))}>
                            {brief ? "保存审核" : "生成 Brief 草案"}
                        </Button>
                        <Button
                            size="small"
                            className="!border-slate-700 !bg-slate-950/55 !text-slate-200"
                            icon={<WandSparkles className="size-3.5" />}
                            onClick={() => onPromptDraftChange(`${promptDraft.trim() || "请基于结构化 Brief 优化为可执行生图提示词。"}\n\n优化方向：强化主体一致性、画面构图、光影质感和禁忌点。`)}
                        >
                            让 Agent 优化
                        </Button>
                    </div>
                </DetailBlock>
                <DetailBlock title="生成参数">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <DetailMetric label="模型" value="gpt-image-1" />
                        <DetailMetric label="尺寸" value="1024x1024" />
                        <DetailMetric label="数量" value="2" />
                    </div>
                    <div className="mt-3 text-sm text-slate-500">参考图：{brief?.referenceAssets.length || 0} 张</div>
                    <Button className="mt-3 w-full" type="primary" icon={<ImagePlus className="size-4" />} onClick={() => onGenerateReference(row)}>
                        生成参考图
                    </Button>
                </DetailBlock>
                <DetailBlock title="生成结果">
                    {resultAssets.length ? (
                        <div className="grid gap-2">
                            {resultAssets.map((asset) => (
                                <div key={asset.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                                    <div className="flex h-14 w-16 items-center justify-center overflow-hidden rounded-md bg-slate-900 text-xs text-slate-500">
                                        {asset.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="h-full w-full object-cover" /> : "结果"}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="break-words text-sm font-semibold text-slate-100">{asset.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">{asset.id === brief?.primaryAssetId ? "主参考图" : "生成结果"}</div>
                                        {brief ? (
                                            <div className="mt-1 flex flex-wrap gap-2">
                                                <button type="button" className="text-xs text-cyan-300 underline underline-offset-2" onClick={() => onSetPrimaryAsset(brief, asset.id)}>
                                                    <Star className="inline size-3" /> 设为主参考
                                                </button>
                                                <button type="button" className="text-xs text-cyan-300 underline underline-offset-2" onClick={() => onSyncSource(brief)}>
                                                    <Send className="inline size-3" /> 同步到来源
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">暂无生成结果；生成后会绑定当前生图需求并写入项目资产库。</div>
                    )}
                </DetailBlock>
            </div>
        </aside>
    );
}

function DetailBlock({ children, title }: { children: ReactNode; title: string }) {
    return (
        <section className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">{title}</div>
            {children}
        </section>
    );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-1 text-sm leading-6">
            <div className="text-slate-500">{label}</div>
            <div className="min-w-0 break-words text-slate-200">{value || "-"}</div>
        </div>
    );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-2">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="mt-1 break-words font-semibold text-slate-200">{value}</div>
        </div>
    );
}
