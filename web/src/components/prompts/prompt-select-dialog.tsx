"use client";

import { Check, Search } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Empty, Input, Modal, Spin, Tag } from "antd";

import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { PromptCard } from "./prompt-card";
import { PromptDetailDialog } from "./prompt-detail-dialog";
import { promptTypeLabel, promptTypeOptions } from "./prompt-template";
import { usePromptList } from "./use-prompt-list";

export function PromptSelectDialog({ open, projectId, allowedTypes, onOpenChange, onSelect }: { open: boolean; projectId?: string; allowedTypes?: string[]; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedType, setSelectedType] = useState(ALL_PROMPTS_OPTION);
    const [selectedScenario, setSelectedScenario] = useState(ALL_PROMPTS_OPTION);
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const {
        query,
        items,
        tags: promptTags,
        categories: promptCategories,
        types: promptTypes,
        scenarios,
    } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, type: selectedType, scenario: selectedScenario, favorite: favoriteOnly, enabled: open });
    const typeOptions = [
        ALL_PROMPTS_OPTION,
        ...promptTypeOptions.map((item) => item.value).filter((value) => !allowedTypes?.length || allowedTypes.includes(value)),
        ...promptTypes.filter((value) => value !== ALL_PROMPTS_OPTION && (!allowedTypes?.length || allowedTypes.includes(value)) && !promptTypeOptions.some((item) => item.value === value)),
    ];
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const selectPrompt = (promptText: string) => {
        onSelect(promptText);
        setSelectedPrompt(null);
        onOpenChange(false);
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
    }, [message, query.error, query.isError]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <Modal title="提示词库" open={open} onCancel={() => onOpenChange(false)} footer={null} width={1040} centered>
            <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <div className="mx-auto max-w-2xl">
                    <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按标题查询" />
                </div>
                <div className="mt-5 grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                        <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">分类</div>
                        <div className="flex flex-wrap gap-2">
                            {promptCategories.map((category) => (
                                <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                    {category}
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                        <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">类型</div>
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
                        <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">场景</div>
                        <div className="flex flex-wrap gap-2">
                            {scenarios.map((scenario) => (
                                <Tag.CheckableTag key={scenario} checked={selectedScenario === scenario} className={cn("prompt-filter-tag", selectedScenario === scenario && "is-active")} onChange={() => setSelectedScenario(scenario)}>
                                    {scenario}
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                        <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                        <div className="flex flex-wrap gap-2">
                            {promptTags.map((tag) => {
                                const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                return (
                                    <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                        {tag}
                                    </Tag.CheckableTag>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="thin-scrollbar mt-6 max-h-[520px] overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                    {query.isLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <PromptCard key={item.id} item={item} onOpen={() => setSelectedPrompt(item)} onCopy={() => setSelectedPrompt(item)} actionLabel="使用此提示词" actionIcon={<Check className="size-3.5" />} actionType="primary" />
                        ))}
                    </div>
                    {!query.isLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-8" /> : null}
                    {query.isFetchingNextPage ? (
                        <div className="py-4 text-center">
                            <Spin size="small" />
                        </div>
                    ) : null}
                </div>
            </div>
            <PromptDetailDialog prompt={selectedPrompt} projectId={projectId} onClose={() => setSelectedPrompt(null)} onCopy={(text) => selectPrompt(text)} onUse={selectPrompt} />
        </Modal>
    );
}
