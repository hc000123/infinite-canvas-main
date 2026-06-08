"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Dropdown, Input } from "antd";
import { Ban, Bot, CheckCircle2, Eye, ImagePlus, MoreHorizontal, Pencil, Send, Star, WandSparkles } from "lucide-react";

import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useImageBriefStore } from "../../../../../../canvas/stores/use-image-brief-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { buildImageBriefPrimaryAssetPatch, imageBriefGenerationGate, imageBriefKindLabel, type ImageBrief, type ImageBriefKind, type ImageBriefWriteInput } from "../../../../../../canvas/utils/image-brief";
import { EpisodeStatusPill, type EpisodeStatusTone } from "./episode-module-panel";

type EpisodeBriefFilter = "全部" | "角色图" | "场景图" | "道具图" | "服装图" | "氛围图";
type EpisodeBriefStatus = "Agent 草案" | "待审核" | "待补素材" | "可生成" | "生成中" | "已生成" | "已回流" | "已驳回";
type EpisodeBriefStatusTab = "待审核" | "待补素材" | "可生成" | "已生成" | "已回流";
type OpenImageWorkbenchPayload = { assetId?: string; briefId?: string; prompt: string; title?: string };

export type EpisodeBriefAsset = {
    description: string;
    episodeLabel: string;
    id: string;
    item?: { itemId: string };
    libraryMatchCount: number;
    name: string;
    promptDraft: string;
    referencedShotLabels: string[];
    sourceReason: string;
    status: "已绑定" | "待绑定" | "待生成" | "待确认" | "缺素材";
    type: "角色" | "场景" | "道具" | "服装";
};

export type EpisodeBriefReviewRow = {
    asset?: EpisodeBriefAsset;
    brief?: ImageBrief;
    description: string;
    id: string;
    kind: ImageBriefKind;
    source: string;
    sourceDetail: string;
    status: EpisodeBriefStatus;
    title: string;
    typeLabel: EpisodeBriefFilter;
};

export function EpisodeImageBriefReviewPage({
    assets,
    episode,
    onOpenAssets,
    onOpenImageWorkbench,
    projectId,
    projectTitle,
}: {
    assets: EpisodeBriefAsset[];
    episode: ScriptEpisode;
    onOpenAssets: () => void;
    onOpenImageWorkbench: (payload: OpenImageWorkbenchPayload) => void;
    projectId: string;
    projectTitle: string;
}) {
    const { message } = App.useApp();
    const briefs = useImageBriefStore((state) => state.briefs).filter((brief) => brief.projectId === projectId && brief.episodeId === episode.id);
    const addBrief = useImageBriefStore((state) => state.addBrief);
    const updateBrief = useImageBriefStore((state) => state.updateBrief);
    const assetLibrary = useAssetStore((state) => state.assets);
    const [typeFilter, setTypeFilter] = useState<EpisodeBriefFilter>("全部");
    const [statusTab, setStatusTab] = useState<EpisodeBriefStatusTab>("待审核");
    const [selectedRowId, setSelectedRowId] = useState("");
    const [rejectedIds, setRejectedIds] = useState<string[]>([]);
    const [promptDraft, setPromptDraft] = useState("");
    const rows = useMemo(() => buildEpisodeBriefReviewRows({ assets, briefs, rejectedIds }), [assets, briefs, rejectedIds]);
    const statusCounts = summarizeEpisodeBriefRows(rows);
    const filteredRows = rows.filter((row) => briefRowMatchesStatusTab(row, statusTab)).filter((row) => typeFilter === "全部" || row.typeLabel === typeFilter);
    const selectedRow = rows.find((row) => row.id === selectedRowId) || filteredRows[0] || rows[0];
    const assetsById = useMemo(() => new Map(assetLibrary.map((asset) => [asset.id, asset])), [assetLibrary]);

    useEffect(() => {
        if (!rows.length) {
            setSelectedRowId("");
            return;
        }
        if (!selectedRow || !rows.some((row) => row.id === selectedRow.id)) setSelectedRowId(filteredRows[0]?.id || rows[0].id);
    }, [filteredRows, rows, selectedRow]);

    useEffect(() => {
        setPromptDraft(selectedRow?.brief?.finalPrompt || selectedRow?.brief?.prompt || selectedRow?.asset?.promptDraft || "");
    }, [selectedRow?.id, selectedRow?.brief?.finalPrompt, selectedRow?.brief?.prompt, selectedRow?.asset?.promptDraft]);

    const ensureBrief = (row: EpisodeBriefReviewRow) => {
        if (row.brief) return row.brief.id;
        const briefId = addBrief(buildEpisodeBriefInput(row, projectId, episode));
        message.success("已生成 Brief 草案，等待审核");
        return briefId;
    };

    const runBriefAgent = () => {
        const missing = rows.filter((row) => !row.brief && row.status !== "已驳回");
        if (!missing.length) {
            message.info("当前生图需求都已有 Brief 草案。");
            return;
        }
        missing.forEach((row) => addBrief(buildEpisodeBriefInput(row, projectId, episode)));
        message.success(`已生成 ${missing.length} 条 Brief 草案，未触发生图。`);
    };

    const manualSupplement = () => {
        const id = addBrief({
            projectId,
            canvasId: "",
            episodeId: episode.id,
            episodeTitle: episode.title,
            sourceType: "manual",
            sourceId: `manual-${Date.now()}`,
            kind: "mood",
            mode: "reminder",
            title: "手动补充需求",
            scriptText: "",
            fields: { mood: "待补充", palette: "", lighting: "", texture: "", reference: "" },
            referenceAssets: [],
            finalPrompt: "",
            resultAssetIds: [],
        });
        setSelectedRowId(`brief-${id}`);
        message.success("已新增低频补救需求。");
    };

    const generateReference = (row: EpisodeBriefReviewRow) => {
        if (!row.brief) {
            message.warning("请先审核并生成 Brief 草案。");
            return;
        }
        const gate = imageBriefGenerationGate(row.brief);
        if (!gate.allowed) {
            message.warning(gate.messages.join(" / ") || "Brief 未审核通过，不能生成参考图。");
            return;
        }
        onOpenImageWorkbench({
            assetId: row.asset?.id,
            briefId: row.brief.id,
            prompt: promptDraft || row.brief.finalPrompt || row.brief.prompt || row.asset?.promptDraft || row.description,
            title: row.title,
        });
    };

    const savePrompt = () => {
        if (!selectedRow?.brief) return message.warning("请先生成 Brief 草案。");
        updateBrief(selectedRow.brief.id, { finalPrompt: promptDraft });
        message.success("最终提示词草案已保存。");
    };

    const setPrimaryAsset = (brief: ImageBrief, assetId: string) => {
        updateBrief(brief.id, buildImageBriefPrimaryAssetPatch(brief, assetId));
        message.success("已设为当前主参考图。");
    };

    const syncSource = (brief: ImageBrief) => {
        message.info(brief.sourceType === "manual" ? "手动补充需求没有上游来源，仅更新当前主参考选择。" : "已准备同步到来源；真实回写仍以项目资产库绑定为准。");
    };

    return (
        <section className="grid gap-5">
            <div className="grid gap-4 border-b border-slate-800 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
                        <span>{projectTitle}</span>
                        <span>/</span>
                        <span>第 {padEpisodeOrder(episode.order)} 集</span>
                        <span>/</span>
                        <span className="text-cyan-300">生图需求</span>
                    </div>
                    <h2 className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-50">生图需求审核台</h2>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-500">Agent 生成 Brief 草案，用户审核后生成参考图并回流项目资产库。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="primary" icon={<Bot className="size-4" />} onClick={runBriefAgent}>
                        运行 Brief Agent
                    </Button>
                    <Dropdown
                        menu={{
                            items: [{ key: "manual", label: "手动补充需求" }],
                            onClick: manualSupplement,
                        }}
                    >
                        <Button className="!border-slate-700 !bg-slate-950/55 !text-slate-200" icon={<MoreHorizontal className="size-4" />}>
                            更多
                        </Button>
                    </Dropdown>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
                {[
                    { label: "Agent 草案", value: statusCounts.agentDraft },
                    { label: "待审核", value: statusCounts.review },
                    { label: "待补素材", value: statusCounts.material },
                    { label: "可生成", value: statusCounts.ready },
                    { label: "已生成", value: statusCounts.generated },
                    { label: "已回流", value: statusCounts.synced },
                ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/45 px-4 py-3">
                        <div className="text-xs text-slate-500">{item.label}</div>
                        <div className="mt-1 text-2xl font-semibold text-cyan-100">{item.value}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    {(["待审核", "待补素材", "可生成", "已生成", "已回流"] as EpisodeBriefStatusTab[]).map((item) => (
                        <button key={item} type="button" className={`rounded-md border px-3 py-1.5 text-sm transition ${statusTab === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`} onClick={() => setStatusTab(item)}>
                            {item}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    {(["全部", "角色图", "场景图", "道具图", "服装图", "氛围图"] as EpisodeBriefFilter[]).map((item) => (
                        <button key={item} type="button" className={`rounded-md border px-3 py-1.5 text-sm transition ${typeFilter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`} onClick={() => setTypeFilter(item)}>
                            {item}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                <EpisodeBriefReviewTable
                    rows={filteredRows}
                    selectedRowId={selectedRow?.id || ""}
                    onEnsureBrief={ensureBrief}
                    onGenerateReference={generateReference}
                    onReject={(row) => setRejectedIds((current) => [...new Set([...current, row.id])])}
                    onSelect={(row) => setSelectedRowId(row.id)}
                    onOpenAssets={onOpenAssets}
                />
                <EpisodeBriefDetailPanel assetsById={assetsById} promptDraft={promptDraft} row={selectedRow} onGenerateReference={generateReference} onPromptDraftChange={setPromptDraft} onSavePrompt={savePrompt} onSetPrimaryAsset={setPrimaryAsset} onEnsureBrief={ensureBrief} onSyncSource={syncSource} />
            </div>
        </section>
    );
}

function EpisodeBriefReviewTable({
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
                                        <Button size="small" className="!border-slate-700 !bg-slate-950/55 !text-slate-200" icon={<ImagePlus className="size-3.5" />} onClick={row.brief?.referenceAssets.length ? () => onGenerateReference(row) : onOpenAssets}>
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

function EpisodeBriefDetailPanel({
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
                                    <div className="flex h-14 w-16 items-center justify-center overflow-hidden rounded-md bg-slate-900 text-xs text-slate-500">{asset.coverUrl ? <img src={asset.coverUrl} alt={asset.title} className="h-full w-full object-cover" /> : "结果"}</div>
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

export function buildEpisodeBriefReviewRows({ assets, briefs, rejectedIds }: { assets: EpisodeBriefAsset[]; briefs: ImageBrief[]; rejectedIds: string[] }): EpisodeBriefReviewRow[] {
    const matchedBriefIds = new Set<string>();
    const rows = assets.map((asset) => {
        const brief = briefs.find((item) => item.sourceType === "asset_breakdown" && item.sourceId === asset.id) || briefs.find((item) => item.title.includes(asset.name));
        if (brief) matchedBriefIds.add(brief.id);
        const kind = brief?.kind || briefKindFromEpisodeAsset(asset);
        const typeLabel = briefTypeLabelFromAsset(asset, kind);
        return {
            asset,
            brief,
            description: brief?.scriptText || asset.description,
            id: brief ? `brief-${brief.id}` : `need-${asset.id}`,
            kind,
            source: asset.item ? "资产提取 Agent" : "导演分析",
            sourceDetail: asset.sourceReason || asset.episodeLabel,
            status: rejectedIds.includes(`need-${asset.id}`) || (brief && rejectedIds.includes(`brief-${brief.id}`)) ? "已驳回" : episodeBriefStatus(brief, asset),
            title: brief?.title || `${asset.name} · ${typeLabel}`,
            typeLabel,
        } satisfies EpisodeBriefReviewRow;
    });
    const extraRows = briefs
        .filter((brief) => !matchedBriefIds.has(brief.id))
        .map((brief) => ({
            brief,
            description: brief.scriptText || brief.finalPrompt || brief.prompt,
            id: `brief-${brief.id}`,
            kind: brief.kind,
            source: briefSourceLabel(brief.sourceType),
            sourceDetail: brief.sourceId || brief.episodeTitle,
            status: rejectedIds.includes(`brief-${brief.id}`) ? "已驳回" : episodeBriefStatus(brief),
            title: brief.title,
            typeLabel: briefTypeLabelFromKind(brief.kind),
        }));
    return [...rows, ...extraRows].sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.title.localeCompare(b.title));
}

function buildEpisodeBriefInput(row: EpisodeBriefReviewRow, projectId: string, episode: ScriptEpisode): ImageBriefWriteInput {
    const asset = row.asset;
    const kind = row.kind;
    const description = row.description || asset?.description || "";
    return {
        projectId,
        canvasId: "",
        episodeId: episode.id,
        episodeTitle: episode.title,
        sourceType: asset ? "asset_breakdown" : "manual",
        sourceId: asset?.id || `manual-${Date.now()}`,
        kind,
        mode: "standard",
        title: row.title,
        scriptText: description,
        fields: briefFieldsFromRequirement(kind, row.title, description, asset),
        referenceAssets: [],
        finalPrompt: asset?.promptDraft || "",
        resultAssetIds: [],
        metadata: {
            agentRunId: asset?.item?.itemId,
            agentAssetKind: asset?.type,
            suggestedBriefKind: kind,
            tags: asset ? [asset.type, episode.title] : ["手动补充"],
            warnings: asset?.status === "缺素材" ? ["缺少参考素材"] : [],
        },
    };
}

function summarizeEpisodeBriefRows(rows: EpisodeBriefReviewRow[]) {
    return {
        agentDraft: rows.filter((row) => row.status === "Agent 草案").length,
        review: rows.filter((row) => row.status === "待审核").length,
        material: rows.filter((row) => row.status === "待补素材").length,
        ready: rows.filter((row) => row.status === "可生成").length,
        generated: rows.filter((row) => row.status === "已生成").length,
        synced: rows.filter((row) => row.status === "已回流").length,
    };
}

function briefRowMatchesStatusTab(row: EpisodeBriefReviewRow, tab: EpisodeBriefStatusTab) {
    if (tab === "待审核") return row.status === "Agent 草案" || row.status === "待审核";
    return row.status === tab;
}

function episodeBriefStatus(brief?: ImageBrief, asset?: EpisodeBriefAsset): EpisodeBriefStatus {
    if (!brief) return asset?.item ? "Agent 草案" : "待审核";
    if (brief.status === "archived") return "已回流";
    if (brief.status === "generated") return "已生成";
    if (brief.validationResult.severity === "error" || (!brief.referenceAssets.length && asset?.status === "缺素材")) return "待补素材";
    if (brief.status === "prompt_ready") return "可生成";
    return "待审核";
}

function briefFieldsFromRequirement(kind: ImageBriefKind, title: string, description: string, asset?: EpisodeBriefAsset): Record<string, string> {
    if (kind === "scene") return { location: title, timeOfDay: "", atmosphere: description, composition: "", lighting: "" };
    if (kind === "character") return { appearance: description, costume: asset?.type === "服装" ? description : "待美术审核确认", expression: "", pose: "", consistency: asset?.referencedShotLabels.join("、") || "保持本集镜头连续性" };
    if (kind === "prop") return { material: "待美术审核确认", shape: "待美术审核确认", scale: "", usage: description, details: description };
    return { mood: description, palette: "", lighting: "", texture: "", reference: asset?.sourceReason || "" };
}

function briefKindFromEpisodeAsset(asset: EpisodeBriefAsset): ImageBriefKind {
    if (asset.type === "角色" || asset.type === "服装") return "character";
    if (asset.type === "场景") return "scene";
    if (asset.type === "道具") return "prop";
    return "mood";
}

function briefTypeLabelFromAsset(asset: EpisodeBriefAsset, kind: ImageBriefKind): EpisodeBriefFilter {
    if (asset.type === "角色") return "角色图";
    if (asset.type === "场景") return "场景图";
    if (asset.type === "道具") return "道具图";
    if (asset.type === "服装") return "服装图";
    return briefTypeLabelFromKind(kind);
}

function briefTypeLabelFromKind(kind: ImageBriefKind): EpisodeBriefFilter {
    if (kind === "character") return "角色图";
    if (kind === "scene") return "场景图";
    if (kind === "prop") return "道具图";
    return "氛围图";
}

function briefSourceLabel(sourceType: ImageBrief["sourceType"]) {
    if (sourceType === "asset_breakdown") return "资产提取 Agent";
    if (sourceType === "production_bible") return "设定库";
    if (sourceType === "storyboard") return "分镜生产包";
    return "手动补充";
}

function briefTone(status: EpisodeBriefStatus): EpisodeStatusTone {
    if (status === "可生成" || status === "已生成" || status === "已回流") return "green";
    if (status === "待补素材") return "amber";
    if (status === "已驳回") return "red";
    return "cyan";
}

function statusOrder(status: EpisodeBriefStatus) {
    return ["Agent 草案", "待审核", "待补素材", "可生成", "生成中", "已生成", "已回流", "已驳回"].indexOf(status);
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}
