"use client";

import { FolderPlus, Plus, Search } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Form, Input, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptCreateDialog, type PromptCreateFormValues } from "@/components/prompts/prompt-select-dialog";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { defaultPromptTypeForNodeGroup, parsePromptVariablesText, promptTypeLabel, promptTypeOptions } from "@/components/prompts/prompt-template";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { saveAdminPrompt } from "@/services/api/admin";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
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
    const defaultCreateCategory = () => (selectedCategory !== ALL_PROMPTS_OPTION ? selectedCategory : promptCategoryOptions.find((category) => category !== ALL_PROMPTS_OPTION) || "system");

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
                    ...(metadata || {}),
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
            <main className="studio-shell min-h-0 flex-1 overflow-y-auto px-6 py-8" onScroll={handleListScroll}>
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-normal text-[var(--studio-text-primary)]">提示词中心</h1>
                        <p className="mt-3 text-sm text-[var(--studio-text-secondary)]">共 {totalPrompts} 条提示词，按标题、标签与分类快速查找灵感。</p>
                    </div>
                    {query.isLoading ? (
                        <div className="studio-panel mx-auto mt-8 flex h-60 max-w-3xl items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!query.isLoading ? (
                        <>
                            <div className="mx-auto mt-8 flex w-full max-w-3xl gap-3">
                                <Input
                                    size="large"
                                    className="min-w-0 flex-1 rounded-lg border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] text-[var(--studio-text-primary)] placeholder:text-[var(--studio-text-muted)]"
                                    prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />}
                                    value={titleKeyword}
                                    placeholder="按标题查询"
                                    onChange={(event) => setTitleKeyword(event.target.value)}
                                />
                                <Button size="large" type="primary" icon={<Plus className="size-4" />} onClick={openCreatePrompt}>
                                    新建提示词
                                </Button>
                            </div>
                            <div className="studio-panel-muted mx-auto mt-6 grid max-w-6xl gap-3 p-4 text-left">
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-[var(--studio-text-muted)]">分类</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptCategoryOptions.map((category) => (
                                            <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                                {category}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-[var(--studio-text-muted)]">类型</div>
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
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-[var(--studio-text-muted)]">场景</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptScenarios.map((scenario) => (
                                            <Tag.CheckableTag key={scenario} checked={selectedScenario === scenario} className={cn("prompt-filter-tag", selectedScenario === scenario && "is-active")} onChange={() => setSelectedScenario(scenario)}>
                                                {scenario}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-[var(--studio-text-muted)]">标签</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptTags.map((tag) => (
                                            <Tag.CheckableTag
                                                key={tag}
                                                checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                className={cn("prompt-filter-tag", (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)) && "is-active")}
                                                onChange={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {!query.isLoading ? (
                    <div>
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16">
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={openCreatePrompt}>
                                    新建提示词
                                </Button>
                            </Empty>
                        ) : null}
                        <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-[var(--studio-text-muted)]">{query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}</div>
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
            <PromptCreateDialog form={createForm} open={createOpen} categories={promptCategoryOptions} saving={isSavingPrompt} onCancel={() => setCreateOpen(false)} onSave={saveCreatedPrompt} />
        </div>
    );
}
