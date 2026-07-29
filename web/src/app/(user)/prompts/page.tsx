"use client";

import { ChevronDown, ChevronUp, FolderPlus, Plus, Search } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Empty, Form, Input, Segmented, Select, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptCreateDialog, type PromptCreateFormValues } from "@/components/prompts/prompt-select-dialog";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { PromptProfileManager } from "@/components/prompts/prompt-profile-manager";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { defaultPromptTypeForNodeGroup, parsePromptVariablesText, promptTypeLabel, promptTypeOptions } from "@/components/prompts/prompt-template";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { saveAdminPrompt } from "@/services/api/admin";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { useCreativeProjectStore } from "../projects/use-creative-project-store";
import { ToolMetricGrid, ToolWorkbenchLayout } from "../components/tool-workbench";

const SCENARIO_FILTER_COLLAPSED_COUNT = 8;
const TAG_FILTER_COLLAPSED_COUNT = 12;

function getVisibleFilterOptions(options: string[], expanded: boolean, selectedValues: string[], collapsedCount: number) {
    if (expanded || options.length <= collapsedCount) return options;
    const pinnedValues = selectedValues.filter((value) => value !== ALL_PROMPTS_OPTION && options.includes(value));
    const selectedOutside = pinnedValues.filter((value) => !options.slice(0, collapsedCount).includes(value));
    const baseCount = Math.max(options[0] === ALL_PROMPTS_OPTION ? 1 : 0, collapsedCount - selectedOutside.length);
    return Array.from(new Set([...options.slice(0, baseCount), ...selectedOutside]));
}

export default function PromptsPage() {
    const { message } = App.useApp();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [createForm] = Form.useForm<PromptCreateFormValues>();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedType, setSelectedType] = useState(ALL_PROMPTS_OPTION);
    const [selectedScenario, setSelectedScenario] = useState(ALL_PROMPTS_OPTION);
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const [scenarioFiltersExpanded, setScenarioFiltersExpanded] = useState(false);
    const [tagFiltersExpanded, setTagFiltersExpanded] = useState(false);
    const [workspaceMode, setWorkspaceMode] = useState<"active" | "library">("active");
    const [profileProjectId, setProfileProjectId] = useState(searchParams.get("projectId") || "");
    const allProjects = useCreativeProjectStore((state) => state.projects);
    const projects = useMemo(() => allProjects.filter((project) => project.status === "active"), [allProjects]);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const {
        query,
        items: promptItems,
        tags: promptTags,
        categories: promptCategoryOptions,
        types: promptTypes,
        scenarios: promptScenarios,
        total: totalPrompts,
    } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory, type: selectedType, scenario: selectedScenario, favorite: favoriteOnly });
    const typeOptions = [ALL_PROMPTS_OPTION, ...promptTypeOptions.map((item) => item.value), ...promptTypes.filter((type) => type !== ALL_PROMPTS_OPTION && !promptTypeOptions.some((item) => item.value === type))];
    const promptSummaryText = query.isLoading ? "正在读取提示词库..." : query.isError ? "提示词读取失败，请稍后重试。" : `共 ${totalPrompts} 条提示词，按标题、标签与分类快速查找灵感。`;
    const showPromptContent = !query.isLoading && !query.isError;
    const listFooterText = query.isFetchingNextPage ? "加载更多提示词..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? `已显示全部 ${promptItems.length} 条提示词` : null;
    const activeFilterCount = (selectedCategory !== ALL_PROMPTS_OPTION ? 1 : 0) + (selectedType !== ALL_PROMPTS_OPTION ? 1 : 0) + (selectedScenario !== ALL_PROMPTS_OPTION ? 1 : 0) + selectedTags.length + (favoriteOnly ? 1 : 0);
    const defaultCreateCategory = () => (selectedCategory !== ALL_PROMPTS_OPTION ? selectedCategory : promptCategoryOptions.find((category) => category !== ALL_PROMPTS_OPTION) || "system");
    const visiblePromptScenarios = useMemo(
        () => getVisibleFilterOptions(promptScenarios, scenarioFiltersExpanded, selectedScenario === ALL_PROMPTS_OPTION ? [] : [selectedScenario], SCENARIO_FILTER_COLLAPSED_COUNT),
        [promptScenarios, scenarioFiltersExpanded, selectedScenario],
    );
    const visiblePromptTags = useMemo(() => getVisibleFilterOptions(promptTags, tagFiltersExpanded, selectedTags, TAG_FILTER_COLLAPSED_COUNT), [promptTags, selectedTags, tagFiltersExpanded]);
    const hiddenScenarioCount = Math.max(0, promptScenarios.length - visiblePromptScenarios.length);
    const hiddenTagCount = Math.max(0, promptTags.length - visiblePromptTags.length);

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的素材");
    };

    const openCreatePrompt = () => {
        if (!token) {
            message.warning("请先登录管理员账号后再新建提示词");
            return;
        }
        createForm.setFieldsValue({
            title: "",
            category: defaultCreateCategory(),
            coverUrl: "",
            prompt: "",
            tagText: "",
            variableText: "",
            metadata: {
                nodeGroup: "image",
                type: defaultPromptTypeForNodeGroup("image"),
                scenario: "",
                favorite: false,
            },
        });
        setCreateOpen(true);
    };

    const saveCreatedPrompt = async () => {
        if (!token) {
            message.warning("请先登录管理员账号后再新建提示词");
            return;
        }
        const value = await createForm.validateFields();
        const { tagText = "", variableText = "", metadata, ...promptValue } = value;
        const nextNodeGroup = metadata?.nodeGroup || "image";
        setIsSavingPrompt(true);
        try {
            const saved = await saveAdminPrompt(token, {
                ...promptValue,
                category: promptValue.category || defaultCreateCategory(),
                coverUrl: promptValue.coverUrl || "/logo.svg",
                tags: tagText
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                metadata: {
                    ...metadata,
                    nodeGroup: nextNodeGroup,
                    variables: parsePromptVariablesText(variableText),
                    favorite: metadata?.favorite === true,
                },
            });
            setCreateOpen(false);
            setSelectedPrompt(saved);
            await queryClient.invalidateQueries({ queryKey: ["prompts"] });
            message.success("提示词已新建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "新建提示词失败");
        } finally {
            setIsSavingPrompt(false);
        }
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[var(--studio-shell-bg)] text-[var(--studio-text-primary)]">
            <main className="studio-shell min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 xl:px-7" onScroll={handleListScroll}>
                <div className="studio-page-header mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">提示词配方台</p>
                        <h1 className="mt-1 text-2xl font-semibold text-[var(--studio-text-primary)]">让标准、项目风格和个人习惯一起生效</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {workspaceMode === "active" ? <Select className="min-w-52" allowClear placeholder="未选择项目" value={profileProjectId || undefined} options={projects.map((project) => ({ label: project.title, value: project.id }))} onChange={(value) => setProfileProjectId(value || "")} /> : null}
                        <Segmented value={workspaceMode} options={[{ label: "当前生效", value: "active" }, { label: "全部模板", value: "library" }]} onChange={(value) => setWorkspaceMode(value as "active" | "library")} />
                    </div>
                </div>
                {workspaceMode === "active" ? (
                    <section className="studio-section p-4">
                        <PromptProfileManager projectId={profileProjectId || undefined} />
                    </section>
                ) : (
                <ToolWorkbenchLayout
                    sidebar={
                        <aside className="studio-rail h-fit p-4 lg:sticky lg:top-5">
                            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">提示词中心</p>
                            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--studio-text-primary)]">提示词中心</h1>
                            <p className="mt-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{promptSummaryText}</p>

                            <ToolMetricGrid
                                className="mt-5 grid-cols-2"
                                items={[
                                    { label: "提示词", value: totalPrompts },
                                    { label: "筛选项", value: activeFilterCount },
                                ]}
                            />

                            {showPromptContent ? (
                                <div className="mt-5 grid gap-4 border-t border-[var(--studio-border-subtle)] pt-4">
                                    <div>
                                        <div className="mb-2 text-xs font-medium text-[var(--studio-text-muted)]">分类</div>
                                        <div className="flex flex-wrap gap-2">
                                            {promptCategoryOptions.map((category) => (
                                                <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                                    {category}
                                                </Tag.CheckableTag>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-xs font-medium text-[var(--studio-text-muted)]">类型</div>
                                        <div className="flex flex-wrap gap-2">
                                            {typeOptions.map((type) => (
                                                <Tag.CheckableTag
                                                    key={type}
                                                    checked={selectedType === type}
                                                    className={cn("prompt-filter-tag", selectedType === type && "is-active")}
                                                    onChange={() => {
                                                        setSelectedType(type);
                                                        setSelectedScenario(ALL_PROMPTS_OPTION);
                                                    }}
                                                >
                                                    {type === ALL_PROMPTS_OPTION ? "全部" : promptTypeLabel(type)}
                                                </Tag.CheckableTag>
                                            ))}
                                            <Tag.CheckableTag checked={favoriteOnly} className={cn("prompt-filter-tag", favoriteOnly && "is-active")} onChange={() => setFavoriteOnly((value) => !value)}>
                                                常用
                                            </Tag.CheckableTag>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-xs font-medium text-[var(--studio-text-muted)]">场景</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {visiblePromptScenarios.map((scenario) => (
                                                <Tag.CheckableTag key={scenario} checked={selectedScenario === scenario} className={cn("prompt-filter-tag", selectedScenario === scenario && "is-active")} onChange={() => setSelectedScenario(scenario)}>
                                                    {scenario}
                                                </Tag.CheckableTag>
                                            ))}
                                            {promptScenarios.length > SCENARIO_FILTER_COLLAPSED_COUNT ? (
                                                <Button
                                                    size="middle"
                                                    type="text"
                                                    className="!h-8 !px-2 !text-[var(--studio-text-secondary)] hover:!text-[var(--studio-text-primary)]"
                                                    icon={scenarioFiltersExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                                    onClick={() => setScenarioFiltersExpanded((value) => !value)}
                                                >
                                                    {scenarioFiltersExpanded ? "收起场景" : `展开${hiddenScenarioCount ? ` ${hiddenScenarioCount} 个` : ""}场景`}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-xs font-medium text-[var(--studio-text-muted)]">标签</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {visiblePromptTags.map((tag) => (
                                                <Tag.CheckableTag
                                                    key={tag}
                                                    checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                    className={cn("prompt-filter-tag", (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)) && "is-active")}
                                                    onChange={() => toggleTag(tag)}
                                                >
                                                    {tag}
                                                </Tag.CheckableTag>
                                            ))}
                                            {promptTags.length > TAG_FILTER_COLLAPSED_COUNT ? (
                                                <Button
                                                    size="middle"
                                                    type="text"
                                                    className="!h-8 !px-2 !text-[var(--studio-text-secondary)] hover:!text-[var(--studio-text-primary)]"
                                                    icon={tagFiltersExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                                    onClick={() => setTagFiltersExpanded((value) => !value)}
                                                >
                                                    {tagFiltersExpanded ? "收起标签" : `展开${hiddenTagCount ? ` ${hiddenTagCount} 个` : ""}标签`}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </aside>
                    }
                >
                    <section className="min-w-0">
                        <header className="studio-page-header flex flex-wrap items-start justify-between gap-4 px-4 py-3">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">提示词列表</p>
                                <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-normal text-[var(--studio-text-primary)]">灵感检索</h2>
                                <p className="mt-2 text-sm text-[var(--studio-text-secondary)]">{promptItems.length ? `当前显示 ${promptItems.length} 条提示词` : promptSummaryText}</p>
                            </div>
                            {showPromptContent ? (
                                <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                                    <Input
                                        size="large"
                                        className="min-w-0 rounded-lg border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-primary)] placeholder:text-[var(--studio-text-muted)] sm:w-[360px] xl:w-[420px]"
                                        prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                                        value={titleKeyword}
                                        placeholder="搜索标题、内容或标签"
                                        onChange={(event) => setTitleKeyword(event.target.value)}
                                    />
                                    <Button size="large" type="primary" icon={<Plus className="size-4" />} onClick={openCreatePrompt}>
                                        新建提示词
                                    </Button>
                                </div>
                            ) : null}
                        </header>

                        {query.isLoading ? (
                            <div className="studio-section mt-5 flex h-60 flex-col items-center justify-center gap-3 text-sm text-[var(--studio-text-secondary)]">
                                <Spin />
                                <span>正在读取提示词...</span>
                            </div>
                        ) : null}
                        {query.isError ? (
                            <Alert
                                className="mt-5"
                                type="error"
                                showIcon
                                message="提示词读取失败"
                                description={query.error instanceof Error ? query.error.message : "请确认后端服务已启动后重试。"}
                                action={
                                    <Button size="small" onClick={() => void query.refetch()}>
                                        重试
                                    </Button>
                                }
                            />
                        ) : null}
                        {showPromptContent ? (
                            <div className="studio-section mt-5 p-4">
                                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                    {promptItems.map((item) => (
                                        <PromptCard
                                            key={item.id}
                                            item={item}
                                            onOpen={() => setSelectedPrompt(item)}
                                            onCopy={() => copyText(item.prompt, "提示词已复制")}
                                            extraAction={
                                                <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                                    加入我的素材
                                                </Button>
                                            }
                                        />
                                    ))}
                                </div>
                                {promptItems.length === 0 ? (
                                    <div className="flex min-h-[360px] items-center justify-center">
                                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词">
                                            <Button type="primary" icon={<Plus className="size-4" />} onClick={openCreatePrompt}>
                                                新建提示词
                                            </Button>
                                        </Empty>
                                    </div>
                                ) : null}
                                <div className="mt-6 text-center text-xs text-[var(--studio-text-muted)]">{listFooterText}</div>
                            </div>
                        ) : null}
                    </section>
                </ToolWorkbenchLayout>
                )}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
            <PromptCreateDialog form={createForm} open={createOpen} categories={promptCategoryOptions} saving={isSavingPrompt} onCancel={() => setCreateOpen(false)} onSave={saveCreatedPrompt} />
        </div>
    );
}
