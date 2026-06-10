"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Dropdown } from "antd";
import { Bot, MoreHorizontal } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { useImageBriefStore } from "../../../../../../canvas/stores/use-image-brief-store";
import type { ScriptEpisode } from "../../../../../../canvas/utils/script-management";
import { buildImageBriefPrimaryAssetPatch, imageBriefGenerationGate, type ImageBrief } from "../../../../../../canvas/utils/image-brief";
import { EpisodeBriefDetailPanel, EpisodeBriefReviewTable } from "./episode-image-brief-review-components";
import {
    briefRowMatchesStatusTab,
    buildEpisodeBriefInput,
    buildEpisodeBriefReviewRows,
    padEpisodeOrder,
    summarizeEpisodeBriefRows,
    type EpisodeBriefAsset,
    type EpisodeBriefFilter,
    type EpisodeBriefReviewRow,
    type EpisodeBriefStatusTab,
    type OpenImageWorkbenchPayload,
} from "./episode-image-brief-review-utils";

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
                        <button
                            key={item}
                            type="button"
                            className={`rounded-md border px-3 py-1.5 text-sm transition ${statusTab === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                            onClick={() => setStatusTab(item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    {(["全部", "角色图", "场景图", "道具图", "服装图", "氛围图"] as EpisodeBriefFilter[]).map((item) => (
                        <button
                            key={item}
                            type="button"
                            className={`rounded-md border px-3 py-1.5 text-sm transition ${typeFilter === item ? "border-cyan-400/70 bg-cyan-400/12 text-cyan-100" : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-200"}`}
                            onClick={() => setTypeFilter(item)}
                        >
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
                <EpisodeBriefDetailPanel
                    assetsById={assetsById}
                    promptDraft={promptDraft}
                    row={selectedRow}
                    onGenerateReference={generateReference}
                    onPromptDraftChange={setPromptDraft}
                    onSavePrompt={savePrompt}
                    onSetPrimaryAsset={setPrimaryAsset}
                    onEnsureBrief={ensureBrief}
                    onSyncSource={syncSource}
                />
            </div>
        </section>
    );
}
