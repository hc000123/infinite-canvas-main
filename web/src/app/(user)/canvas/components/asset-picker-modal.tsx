"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Checkbox, Empty, Input, Modal, Pagination, Select, Spin, Tabs, Tag } from "antd";
import { Check, Layers3, RotateCcw, Search } from "lucide-react";
import axios from "axios";

import { cn } from "@/lib/utils";
import { uploadMediaFile } from "@/services/file-storage";
import { fetchAssetLibrary, type AssetLibraryItem } from "@/services/api/assets";
import { useAssetStore, type Asset, type AssetCategory, type VolcengineAssetMetadata } from "@/stores/use-asset-store";
import { buildWorkflowAssetCanonicalView } from "../../assets/workflow-asset-dedup";
import { assetCategoryLabel, assetsForEpisode, subjectAssetGroups } from "../../assets/asset-subjects";
import { buildInsertAssetPayload, type InsertAssetPayload } from "../utils/asset-insert-payload";
import { filterAssetsForPicker, type AssetPickerCategoryFilter, type AssetPickerScopeFilter, type AssetPickerSort } from "../utils/asset-picker-filter";

export type AssetPickerTab = "episode-assets" | "my-assets" | "library";
type AssetPickerKind = InsertAssetPayload["kind"];
type AssetKindOption<T extends string = AssetPickerKind | "all"> = { label: string; value: T };
type PickerSelection = { key: string; kind: AssetPickerKind; title: string; resolve: () => Promise<InsertAssetPayload> };
type SelectionControls = {
    disabled: boolean;
    onSetMany: (items: PickerSelection[], selected: boolean) => void;
    onToggle: (item: PickerSelection) => void;
    selectedKeys: ReadonlySet<string>;
};
export type { InsertAssetPayload } from "../utils/asset-insert-payload";

type Props = {
    open: boolean;
    title?: string;
    defaultTab?: AssetPickerTab;
    defaultKind?: AssetPickerKind | "all";
    allowedKinds?: AssetPickerKind[];
    projectId?: string;
    episodeId?: string;
    onInsert: (payload: InsertAssetPayload) => void | Promise<void>;
    onClose: () => void;
};

export function AssetPickerModal({ open, title = "选择素材", defaultTab = "my-assets", defaultKind = "all", allowedKinds, projectId, episodeId, onInsert, onClose }: Props) {
    const { message } = App.useApp();
    const contextualTab = projectId && episodeId && defaultTab === "my-assets" ? "episode-assets" : defaultTab;
    const [activeTab, setActiveTab] = useState<AssetPickerTab>(contextualTab);
    const [selected, setSelected] = useState<Map<string, PickerSelection>>(new Map());
    const [importing, setImporting] = useState(false);
    const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);

    useEffect(() => {
        if (!open) return;
        setActiveTab(contextualTab);
        setSelected(new Map());
        setImporting(false);
    }, [contextualTab, open]);

    const toggleSelection = useCallback((item: PickerSelection) => {
        setSelected((current) => {
            const next = new Map(current);
            if (next.has(item.key)) next.delete(item.key);
            else next.set(item.key, item);
            return next;
        });
    }, []);

    const setManySelected = useCallback((items: PickerSelection[], shouldSelect: boolean) => {
        setSelected((current) => {
            const next = new Map(current);
            items.forEach((item) => (shouldSelect ? next.set(item.key, item) : next.delete(item.key)));
            return next;
        });
    }, []);

    const insertSelected = async () => {
        if (!selected.size || importing) return;
        setImporting(true);
        let inserted = 0;
        let failed = 0;
        for (const item of selected.values()) {
            try {
                await onInsert(await item.resolve());
                inserted += 1;
            } catch {
                failed += 1;
            }
        }
        setImporting(false);
        if (inserted) {
            if (failed) message.warning(`已导入 ${inserted} 个素材，${failed} 个失败`);
            else message.success(`已导入 ${inserted} 个素材`);
            onClose();
        } else {
            message.error("所选素材导入失败，请检查素材文件后重试");
        }
    };

    const selection: SelectionControls = { disabled: importing, onSetMany: setManySelected, onToggle: toggleSelection, selectedKeys };

    return (
        <Modal
            rootClassName="studio-modal"
            title={title}
            open={open}
            onCancel={() => {
                if (!importing) onClose();
            }}
            footer={null}
            width={980}
            closable={!importing}
            keyboard={!importing}
            mask={{ closable: !importing }}
            destroyOnHidden
            styles={{ body: { padding: "0 24px 20px", minHeight: 560 } }}
        >
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as AssetPickerTab)}
                items={[
                    ...(projectId && episodeId ? [{ key: "episode-assets", label: "本集素材", children: <EpisodeAssetsTab projectId={projectId} episodeId={episodeId} selection={selection} /> }] : []),
                    { key: "my-assets", label: "我的素材", children: <MyAssetsTab allowedKinds={allowedKinds} defaultKind={defaultKind} projectId={projectId} episodeId={episodeId} selection={selection} /> },
                    { key: "library", label: "素材库", children: <LibraryTab allowedKinds={allowedKinds} defaultKind={defaultKind} selection={selection} /> },
                ]}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--studio-border-subtle)] pt-4">
                <div className="text-sm text-[var(--studio-text-secondary)]">
                    已选 <span className="font-semibold text-[var(--studio-accent)]">{selected.size}</span> 个素材
                    <span className="ml-2 text-xs text-[var(--studio-text-muted)]">切换 Tab、筛选或翻页不会丢失选择</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button disabled={!selected.size || importing} onClick={() => setSelected(new Map())}>
                        清空选择
                    </Button>
                    <Button type="primary" icon={<Layers3 className="size-4" />} loading={importing} disabled={!selected.size} onClick={() => void insertSelected()}>
                        导入所选（{selected.size}）
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function EpisodeAssetsTab({ projectId, episodeId, selection }: { projectId: string; episodeId: string; selection: SelectionControls }) {
    const assets = useAssetStore((state) => state.assets);
    const subjects = useAssetStore((state) => state.subjects);
    const [category, setCategory] = useState<AssetCategory | "all">("all");
    const [subjectId, setSubjectId] = useState("all");
    const [range, setRange] = useState<"all" | "episode" | "shared">("all");
    const [sort, setSort] = useState<AssetPickerSort>("title_asc");
    const [keyword, setKeyword] = useState("");
    const subjectMap = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
    const applicable = useMemo(() => assetsForEpisode(assets, projectId, episodeId), [assets, episodeId, projectId]);
    const subjectOptions = useMemo(
        () => subjects.filter((subject) => subject.projectId === projectId && (category === "all" || subject.category === category)).map((subject) => ({ label: `${subject.code} ${subject.name}`, value: subject.id })),
        [category, projectId, subjects],
    );
    const visible = useMemo(() => {
        const query = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filtered = applicable
            .filter((asset) => category === "all" || asset.assetBinding?.category === category)
            .filter((asset) => subjectId === "all" || asset.assetBinding?.subjectId === subjectId)
            .filter((asset) => range === "all" || (range === "shared" ? asset.assetBinding?.allEpisodes : !asset.assetBinding?.allEpisodes))
            .filter((asset) => matchesTerms([asset.title, asset.assetBinding?.variantName, ...(asset.tags || []), asset.assetBinding?.subjectId ? subjectMap.get(asset.assetBinding.subjectId)?.name : ""], query));
        return sortPickerAssets(filtered, sort);
    }, [applicable, category, keyword, range, sort, subjectId, subjectMap]);
    const groups = useMemo(() => subjectAssetGroups(subjects, visible, projectId), [projectId, subjects, visible]);
    const visibleSelections = useMemo(() => visible.map(localAssetSelection), [visible]);
    const allVisibleSelected = visibleSelections.length > 0 && visibleSelections.every((item) => selection.selectedKeys.has(item.key));

    const reset = () => {
        setCategory("all");
        setSubjectId("all");
        setRange("all");
        setSort("title_asc");
        setKeyword("");
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-56 flex-1"
                    size="small"
                    allowClear
                    prefix={<Search className="size-3.5 text-[var(--studio-text-muted)]" />}
                    placeholder="搜索角色、场景、道具、标签或形态"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                    {(["all", "character", "scene", "prop", "other"] as const).map((value) => (
                        <Tag.CheckableTag
                            key={value}
                            checked={category === value}
                            className={cn("prompt-filter-tag", category === value && "is-active")}
                            onChange={() => {
                                setCategory(value);
                                setSubjectId("all");
                            }}
                        >
                            {value === "all" ? "全部分类" : assetCategoryLabel(value)}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
                <Select size="small" className="min-w-40" showSearch optionFilterProp="label" value={subjectId} options={[{ label: "全部资产主体", value: "all" }, ...subjectOptions]} onChange={setSubjectId} />
                <Select
                    size="small"
                    className="w-32"
                    value={range}
                    options={[
                        { label: "全部适用范围", value: "all" },
                        { label: "全剧通用", value: "shared" },
                        { label: "仅本集", value: "episode" },
                    ]}
                    onChange={setRange}
                />
                <Select size="small" className="w-32" value={sort} options={sortOptions} onChange={setSort} />
                <span className="text-xs text-[var(--studio-text-muted)]">筛选结果 {visible.length}</span>
                <Button className="ml-auto" size="small" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
                    重置
                </Button>
                <Button size="small" disabled={!visibleSelections.length || selection.disabled} onClick={() => selection.onSetMany(visibleSelections, !allVisibleSelected)}>
                    {allVisibleSelected ? "取消全选结果" : "全选筛选结果"}
                </Button>
            </div>
            {groups.length ? (
                <div className="grid max-h-[405px] gap-4 overflow-y-auto pr-1">
                    {groups.map(({ subject, assets: variants }) => (
                        <section key={subject.id} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                            <div className="mb-3 flex items-center gap-2">
                                <Tag className="m-0">{assetCategoryLabel(subject.category)}</Tag>
                                <span className="text-xs text-[var(--studio-accent)]">{subject.code}</span>
                                <span className="font-semibold text-[var(--studio-text-primary)]">{subject.name}</span>
                                <span className="text-xs text-[var(--studio-text-muted)]">{variants.length} 个形态</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                                {variants.map((asset) => (
                                    <LocalPickerCard key={asset.id} asset={asset} subtitle={asset.assetBinding?.variantName} selection={selection} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合筛选条件的本集素材" className="py-16" />
            )}
        </div>
    );
}

const PAGE_SIZE = 12;

const kindOptions: AssetKindOption[] = [
    { label: "全部类型", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

const sortOptions = [
    { label: "最近更新", value: "updated_desc" },
    { label: "最近创建", value: "created_desc" },
    { label: "名称排序", value: "title_asc" },
];

function MyAssetsTab({ allowedKinds, defaultKind = "all", projectId, episodeId, selection }: { allowedKinds?: AssetPickerKind[]; defaultKind?: AssetPickerKind | "all"; projectId?: string; episodeId?: string; selection: SelectionControls }) {
    const rawAssets = useAssetStore((state) => state.assets);
    const folders = useAssetStore((state) => state.folders);
    const subjects = useAssetStore((state) => state.subjects);
    const assets = useMemo(() => buildWorkflowAssetCanonicalView(rawAssets).assets, [rawAssets]);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetPickerKind | "all">(defaultKind);
    const [category, setCategory] = useState<AssetPickerCategoryFilter>("all");
    const [scope, setScope] = useState<AssetPickerScopeFilter>("all");
    const [folder, setFolder] = useState<string | "all" | "root">("all");
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [sort, setSort] = useState<AssetPickerSort>("updated_desc");
    const [page, setPage] = useState(1);
    const allowedKindSet = useMemo<ReadonlySet<AssetPickerKind>>(() => new Set(allowedKinds || ["text", "image", "video", "audio"]), [allowedKinds]);
    const filteredKindSet = useMemo<ReadonlySet<AssetPickerKind>>(() => (kindFilter === "all" ? allowedKindSet : new Set([kindFilter])), [allowedKindSet, kindFilter]);
    const options = assetKindOptions(allowedKinds);
    const folderProjectIdByFolderId = useMemo(() => new Map(folders.flatMap((item): Array<[string, string]> => (item.projectId ? [[item.id, item.projectId]] : []))), [folders]);
    const subjectNameById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects]);
    const filtered = useMemo(
        () => filterAssetsForPicker(assets, { allowedKinds: filteredKindSet, category, episodeId, favoriteOnly, folder, folderProjectIdByFolderId, keyword, projectId, scope, sort, subjectNameById }),
        [assets, category, episodeId, favoriteOnly, filteredKindSet, folder, folderProjectIdByFolderId, keyword, projectId, scope, sort, subjectNameById],
    );
    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
    const filteredSelections = useMemo(() => filtered.map(localAssetSelection), [filtered]);
    const allFilteredSelected = filteredSelections.length > 0 && filteredSelections.every((item) => selection.selectedKeys.has(item.key));

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        setPage((value) => Math.min(value, maxPage));
    }, [filtered.length]);

    const reset = () => {
        setKeyword("");
        setKindFilter(defaultKind);
        setCategory("all");
        setScope("all");
        setFolder("all");
        setFavoriteOnly(false);
        setSort("updated_desc");
        setPage(1);
    };

    const scopeOptions = [{ label: "全部项目范围", value: "all" }, ...(projectId ? [{ label: "当前项目", value: "project" }] : []), ...(projectId && episodeId ? [{ label: "当前集可用", value: "episode" }] : []), { label: "未绑定项目", value: "unbound" }];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-56 flex-1"
                    size="small"
                    prefix={<Search className="size-3.5 text-[var(--studio-text-muted)]" />}
                    placeholder="搜索名称、标签、备注、来源、主体或形态"
                    value={keyword}
                    allowClear
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                />
                <div className="flex flex-wrap gap-1.5">
                    {options.map((option) => (
                        <Tag.CheckableTag
                            key={option.value}
                            checked={kindFilter === option.value}
                            className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option.value);
                            }}
                        >
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
                <Select
                    size="small"
                    className="w-32"
                    value={category}
                    options={[
                        { label: "全部资产分类", value: "all" },
                        { label: "角色", value: "character" },
                        { label: "场景", value: "scene" },
                        { label: "道具", value: "prop" },
                        { label: "其他", value: "other" },
                        { label: "未分类", value: "unclassified" },
                    ]}
                    onChange={(value) => {
                        setPage(1);
                        setCategory(value);
                    }}
                />
                <Select
                    size="small"
                    className="w-32"
                    value={scope}
                    options={scopeOptions}
                    onChange={(value) => {
                        setPage(1);
                        setScope(value as AssetPickerScopeFilter);
                    }}
                />
                <Select
                    size="small"
                    className="min-w-36"
                    showSearch
                    optionFilterProp="label"
                    value={folder}
                    options={[{ label: "全部文件夹", value: "all" }, { label: "未分组", value: "root" }, ...folders.map((item) => ({ label: item.name, value: item.id }))]}
                    onChange={(value) => {
                        setPage(1);
                        setFolder(value);
                    }}
                />
                <Select size="small" className="w-28" value={sort} options={sortOptions} onChange={setSort} />
                <Checkbox
                    checked={favoriteOnly}
                    onChange={(event) => {
                        setPage(1);
                        setFavoriteOnly(event.target.checked);
                    }}
                >
                    仅收藏
                </Checkbox>
                <span className="text-xs text-[var(--studio-text-muted)]">{filtered.length} 个结果</span>
                <Button className="ml-auto" size="small" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
                    重置
                </Button>
                <Button size="small" disabled={!filteredSelections.length || selection.disabled} onClick={() => selection.onSetMany(filteredSelections, !allFilteredSelected)}>
                    {allFilteredSelected ? "取消全选结果" : "全选筛选结果"}
                </Button>
            </div>
            {visible.length ? (
                <div className="grid max-h-[350px] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                    {visible.map((asset) => (
                        <LocalPickerCard key={asset.id} asset={asset} subtitle={asset.assetBinding?.variantName} selection={selection} />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合筛选条件的素材" className="py-12" />
            )}
            {filtered.length > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}

function LibraryTab({ allowedKinds, defaultKind = "all", selection }: { allowedKinds?: AssetPickerKind[]; defaultKind?: AssetPickerKind | "all"; selection: SelectionControls }) {
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState(defaultKind === "all" ? "" : defaultKind);
    const [tags, setTags] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const options = remoteAssetKindOptions(allowedKinds);
    const query = useQuery({
        queryKey: ["asset-picker-library", keyword, kindFilter, tags, page],
        queryFn: () => fetchAssetLibrary({ keyword, type: kindFilter, tag: tags, page, pageSize: PAGE_SIZE }),
        retry: false,
    });
    const items = useMemo(() => query.data?.items || [], [query.data?.items]);
    const total = query.data?.total || 0;
    const pageSelections = useMemo(() => items.map(libraryAssetSelection), [items]);
    const allPageSelected = pageSelections.length > 0 && pageSelections.every((item) => selection.selectedKeys.has(item.key));
    const reset = () => {
        setKeyword("");
        setKindFilter(defaultKind === "all" ? "" : defaultKind);
        setTags([]);
        setPage(1);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="min-w-56 flex-1"
                    size="small"
                    prefix={<Search className="size-3.5 text-[var(--studio-text-muted)]" />}
                    placeholder="搜索素材标题、说明或内容"
                    value={keyword}
                    allowClear
                    onChange={(event) => {
                        setPage(1);
                        setKeyword(event.target.value);
                    }}
                />
                <div className="flex flex-wrap gap-1.5">
                    {options.map((option) => (
                        <Tag.CheckableTag
                            key={option.value || "all"}
                            checked={kindFilter === option.value}
                            className={cn("prompt-filter-tag", kindFilter === option.value && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option.value);
                            }}
                        >
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2">
                <Select
                    mode="multiple"
                    size="small"
                    className="min-w-64 flex-1"
                    maxTagCount="responsive"
                    allowClear
                    placeholder="按标签筛选，可多选"
                    value={tags}
                    options={(query.data?.tags || []).map((tag) => ({ label: tag, value: tag }))}
                    onChange={(value) => {
                        setPage(1);
                        setTags(value);
                    }}
                />
                <span className="text-xs text-[var(--studio-text-muted)]">共 {total} 个结果</span>
                <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
                    重置
                </Button>
                <Button size="small" disabled={!pageSelections.length || selection.disabled} onClick={() => selection.onSetMany(pageSelections, !allPageSelected)}>
                    {allPageSelected ? "取消全选本页" : "全选当前页"}
                </Button>
            </div>
            {query.isLoading ? (
                <div className="flex justify-center py-16">
                    <Spin />
                </div>
            ) : query.isError ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="素材库加载失败" className="py-12" />
            ) : items.length ? (
                <div className="grid max-h-[350px] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                    {items.map((asset) => (
                        <PickerCard
                            key={asset.id}
                            title={asset.title}
                            kind={asset.type}
                            cover={asset.coverUrl}
                            previewUrl={asset.type === "video" ? asset.url : ""}
                            selected={selection.selectedKeys.has(`library:${asset.id}`)}
                            disabled={selection.disabled}
                            onClick={() => selection.onToggle(libraryAssetSelection(asset))}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合筛选条件的素材" className="py-12" />
            )}
            {total > PAGE_SIZE ? (
                <div className="flex justify-center">
                    <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} showSizeChanger={false} />
                </div>
            ) : null}
        </div>
    );
}

function LocalPickerCard({ asset, subtitle, selection }: { asset: Asset; subtitle?: string; selection: SelectionControls }) {
    const item = localAssetSelection(asset);
    return (
        <PickerCard
            title={asset.title}
            subtitle={subtitle}
            kind={asset.kind}
            cover={asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "")}
            previewUrl={asset.kind === "video" ? asset.data.url : ""}
            selected={selection.selectedKeys.has(item.key)}
            disabled={selection.disabled}
            onClick={() => selection.onToggle(item)}
        />
    );
}

function PickerCard({ title, subtitle, kind, cover, previewUrl, selected, disabled, onClick }: { title: string; subtitle?: string; kind: string; cover: string; previewUrl?: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
    const videoPreviewUrl = kind === "video" ? videoCoverUrl(previewUrl || cover) : "";
    return (
        <button
            type="button"
            aria-pressed={selected}
            className={cn(
                "group relative cursor-pointer overflow-hidden rounded-md border bg-[var(--studio-panel-bg)] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]",
                selected ? "border-[var(--studio-accent)] ring-2 ring-[var(--studio-focus-ring)]" : "border-[var(--studio-border-subtle)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)]",
            )}
            onClick={onClick}
            disabled={disabled}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute left-2 top-2 z-10 grid size-5 place-items-center rounded border bg-[var(--studio-panel-bg)]",
                    selected ? "border-[var(--studio-accent)] text-[var(--studio-accent)]" : "border-[var(--studio-border-strong)] text-transparent",
                )}
            >
                <Check className="size-3.5" />
            </span>
            {cover ? (
                <img src={cover} alt={title} className="aspect-[4/3] w-full object-cover" />
            ) : videoPreviewUrl ? (
                <video src={videoPreviewUrl} muted playsInline preload="metadata" className="aspect-[4/3] w-full bg-[var(--studio-panel-muted-bg)] object-cover" />
            ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-[var(--studio-panel-muted-bg)] p-3 text-center text-xs leading-5 text-[var(--studio-text-muted)]">{title}</div>
            )}
            <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs font-medium text-[var(--studio-text-primary)]">{title}</span>
                    <Tag className="m-0 shrink-0 text-[10px]">{assetTypeLabel(kind)}</Tag>
                </div>
                {subtitle ? <div className="mt-1 truncate text-[11px] text-[var(--studio-text-muted)]">{subtitle}</div> : null}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--studio-media-overlay-soft)] text-sm font-medium text-[var(--studio-on-media)] opacity-0 transition group-hover:bg-[var(--studio-media-overlay)] group-hover:opacity-100">
                {selected ? "取消选择" : "选择"}
            </div>
        </button>
    );
}

function localAssetSelection(asset: Asset): PickerSelection {
    return { key: `local:${asset.id}`, kind: asset.kind, title: asset.title, resolve: async () => buildInsertAssetPayload(asset) };
}

function libraryAssetSelection(asset: AssetLibraryItem): PickerSelection {
    return { key: `library:${asset.id}`, kind: asset.type, title: asset.title, resolve: () => buildLibraryInsertPayload(asset) };
}

async function buildLibraryInsertPayload(asset: AssetLibraryItem): Promise<InsertAssetPayload> {
    if (asset.type === "text") return { kind: "text", content: asset.content, title: asset.title };
    if (asset.type === "image") return { kind: "image", dataUrl: await remoteImageToDataUrl(asset.url), title: asset.title, volcengineAsset: assetLibraryVolcengineMetadata(asset) };
    if (asset.type === "video") {
        const media = await uploadMediaFile(await remoteAssetBlob(asset.url), "video");
        return { kind: "video", url: media.url, storageKey: media.storageKey, title: asset.title, width: media.width, height: media.height, volcengineAsset: assetLibraryVolcengineMetadata(asset) };
    }
    const media = await uploadMediaFile(await remoteAssetBlob(asset.url), "audio");
    return { kind: "audio", url: media.url, storageKey: media.storageKey, title: asset.title, bytes: media.bytes, mimeType: media.mimeType };
}

function sortPickerAssets<T extends Asset>(assets: T[], sort: AssetPickerSort) {
    if (sort === "title_asc") return [...assets].sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN", { numeric: true }));
    return [...assets].sort((left, right) => (sort === "created_desc" ? right.createdAt.localeCompare(left.createdAt) : right.updatedAt.localeCompare(left.updatedAt)));
}

function matchesTerms(values: Array<string | undefined>, terms: string[]) {
    if (!terms.length) return true;
    const text = values.filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
}

function assetKindOptions(allowedKinds?: AssetPickerKind[]): AssetKindOption[] {
    const allowed = new Set(allowedKinds || ["text", "image", "video", "audio"]);
    return kindOptions.filter((item) => item.value !== "all" || allowed.size > 1).filter((item) => item.value === "all" || allowed.has(item.value));
}

function remoteAssetKindOptions(allowedKinds?: AssetPickerKind[]): AssetKindOption<string>[] {
    return assetKindOptions(allowedKinds).map((item) => ({ ...item, value: item.value === "all" ? "" : item.value }));
}

function assetLibraryVolcengineMetadata(asset: AssetLibraryItem): VolcengineAssetMetadata | undefined {
    if (!asset.volcengineAssetId) return undefined;
    return {
        assetId: asset.volcengineAssetId,
        groupId: asset.volcengineGroupId || "",
        projectName: asset.volcengineProjectName || "default",
        status: asset.volcengineStatus || "Processing",
        error: asset.volcengineError || "",
        publicUrl: asset.volcenginePublicUrl || asset.url,
        submittedAt: asset.volcengineSubmittedAt || "",
        updatedAt: asset.volcengineUpdatedAt || "",
    };
}

function videoCoverUrl(url: string) {
    if (!url || url.includes("#")) return url;
    return `${url}#t=0.1`;
}

async function remoteImageToDataUrl(url: string) {
    const response = await axios.get(url, { responseType: "blob" });
    const blob = response.data as Blob;
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function remoteAssetBlob(url: string) {
    const response = await axios.get(url, { responseType: "blob" });
    return response.data as Blob;
}

function assetTypeLabel(type: string) {
    if (type === "image") return "图片";
    if (type === "video") return "视频";
    if (type === "audio") return "音频";
    return "文本";
}
