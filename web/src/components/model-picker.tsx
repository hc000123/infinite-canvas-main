"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { buildModelPickerOptions, filterModelPickerOptions, groupModelPickerOptions, resolveCustomModelCandidate, resolveModelProvider } from "@/components/model-picker-options";
import { modelsForCapability } from "@/lib/ai-model-catalog";
import { cn } from "@/lib/utils";
import type { AiConfig, AiModelKind } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    modelType?: AiModelKind;
    allowCustomModel?: boolean;
    onMissingConfig?: () => void;
};

type ModelSourceOption = {
    key: string;
    label: string;
    protocolLabel: string;
    modelSet: Set<string>;
    modelCount: number;
};

export function ModelPicker({ config, value, onChange, className, fullWidth = false, placeholder = "选择模型", modelType, allowCustomModel = config.channelMode === "local", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [selectedSourceKey, setSelectedSourceKey] = useState("");
    const modelOptions = useMemo(() => resolveModelOptions(config, modelType), [config, modelType]);
    const current = normalizePickerValue(config, modelType, value, modelOptions);
    const options = useMemo(
        () =>
            buildModelPickerOptions({
                models: modelOptions,
                value: current,
                modelSources: config.modelSources,
                modelCosts: config.modelCosts,
                modelCapabilities: config.modelCapabilities,
            }),
        [modelOptions, current, config.modelSources, config.modelCosts, config.modelCapabilities],
    );
    const sourceOptions = useMemo(() => resolveModelSourceOptions(config, modelOptions), [config, modelOptions]);
    const activeSource = useMemo(() => resolveActiveModelSource(sourceOptions, current, selectedSourceKey), [current, selectedSourceKey, sourceOptions]);
    const currentSourceLabel = useMemo(() => resolveCurrentModelSourceLabel(sourceOptions, current, activeSource, selectedSourceKey), [activeSource, current, selectedSourceKey, sourceOptions]);
    const sourceFilteredOptions = useMemo(() => filterOptionsBySource(options, activeSource), [activeSource, options]);
    const searchableOptions = useMemo(() => withModelSourceSearchText(sourceFilteredOptions, sourceOptions, activeSource), [activeSource, sourceFilteredOptions, sourceOptions]);
    const filteredOptions = useMemo(() => filterModelPickerOptions(searchableOptions, keyword), [keyword, searchableOptions]);
    const optionGroups = useMemo(() => groupModelPickerOptions(filteredOptions), [filteredOptions]);
    const customModel = resolveCustomModelCandidate(keyword, sourceFilteredOptions, allowCustomModel);
    const emptyText = keyword.trim() ? (config.channelMode === "remote" ? "暂无匹配模型" : "没有匹配的模型") : config.channelMode === "remote" ? "暂无可用模型" : allowCustomModel ? "输入模型 ID 后回车使用" : "请先到配置里拉取模型列表";
    const triggerText = current ? (currentSourceLabel ? `${currentSourceLabel} / ${current}` : current) : placeholder;
    const triggerTitle = current ? (currentSourceLabel ? `${current} · 来源：${currentSourceLabel}` : current) : placeholder;

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    const changeOpen = (nextOpen: boolean) => {
        if (nextOpen && !options.length && !config.models.length && config.channelMode === "local" && onMissingConfig) {
            onMissingConfig();
            return;
        }
        if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        if (!nextOpen) setKeyword("");
        setOpen(nextOpen);
    };

    const selectModel = (model: string) => {
        if (activeSource?.modelSet.has(model)) setSelectedSourceKey(activeSource.key);
        onChange(model);
        setKeyword("");
        setOpen(false);
    };

    const selectBestKeyboardMatch = () => {
        const exactMatch = sourceFilteredOptions.find((option) => option.value.toLowerCase() === keyword.trim().toLowerCase());
        if (exactMatch) return selectModel(exactMatch.value);
        const onlyOption = filteredOptions.length === 1 ? filteredOptions[0] : undefined;
        if (onlyOption) return selectModel(onlyOption.value);
        if (customModel) selectModel(customModel);
    };

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
            <PopoverPrimitive.Trigger asChild>
                <button
                    type="button"
                    aria-label={current ? `当前模型：${current}` : placeholder}
                    className={cn(
                        "canvas-composer-model-picker flex h-8 w-fit max-w-full items-center gap-2 rounded-full border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-3 text-sm font-normal text-[var(--studio-text-primary)] shadow-none transition hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]",
                        fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                        open && "border-[var(--studio-accent)] bg-[var(--studio-active-bg)] ring-2 ring-[var(--studio-focus-ring)]",
                        className,
                    )}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    title={triggerTitle}
                >
                    <ModelIcon model={current} />
                    <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{triggerText}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-60" />
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    data-canvas-no-zoom
                    className="z-[1200] w-[22rem] max-w-[calc(100vw-24px)] rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-2 text-[var(--studio-text-primary)] shadow-[var(--studio-shadow)]"
                    align="start"
                    side="bottom"
                    sideOffset={6}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {sourceOptions.length ? (
                        <div className="mb-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)]">
                            <div className="flex items-center justify-between gap-2 px-2 pt-2 text-xs font-medium text-[var(--studio-text-muted)]">
                                <span>模型来源</span>
                                <span>{activeSource?.modelCount || 0} 个模型</span>
                            </div>
                            <div className="mt-1 max-h-28 space-y-1 overflow-y-auto p-1">
                                {sourceOptions.map((source) => (
                                    <ModelSourceButton
                                        key={source.key}
                                        source={source}
                                        active={source.key === activeSource?.key}
                                        onSelect={() => {
                                            setSelectedSourceKey(source.key);
                                            setKeyword("");
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-control-bg)] px-2 focus-within:border-[var(--studio-accent)] focus-within:ring-2 focus-within:ring-[var(--studio-focus-ring)]">
                        <Search className="size-4 shrink-0 text-[var(--studio-text-muted)]" />
                        <input
                            autoFocus
                            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--studio-text-primary)] outline-none placeholder:text-[var(--studio-text-muted)]"
                            value={keyword}
                            placeholder={allowCustomModel ? "搜索或输入模型 ID" : "搜索模型名"}
                            onChange={(event) => setKeyword(event.target.value)}
                            onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    selectBestKeyboardMatch();
                                }
                                if (event.key === "Escape") changeOpen(false);
                            }}
                        />
                    </div>
                    <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                        {optionGroups.length ? (
                            optionGroups.map((group) => (
                                <div key={group.key} className="py-1">
                                    <div className="px-2 pb-1 text-xs font-medium text-[var(--studio-text-muted)]">{group.label}</div>
                                    <div className="space-y-1">
                                        {group.options.map((option) => (
                                            <ModelOptionButton
                                                key={option.value}
                                                model={option.value}
                                                sourceLabel={activeSource ? resolveModelSourceOptionLabel(option.value, sourceOptions, activeSource) : option.sourceLabel}
                                                costLabel={option.costLabel}
                                                active={option.value === current}
                                                onSelect={() => selectModel(option.value)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : !customModel ? (
                            <div className="px-2 py-6 text-center text-sm text-[var(--studio-text-muted)]">{emptyText}</div>
                        ) : null}
                        {customModel ? (
                            <div className="border-t border-[var(--studio-border-subtle)] pt-2">
                                <button
                                    type="button"
                                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--studio-text-secondary)] outline-none transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] focus-visible:bg-[var(--studio-hover-bg)] focus-visible:text-[var(--studio-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]"
                                    onClick={() => selectModel(customModel)}
                                >
                                    <Cpu className="size-4 shrink-0 text-[var(--studio-accent)]" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs text-[var(--studio-text-muted)]">使用自定义模型 ID</span>
                                        <span className="block truncate">{customModel}</span>
                                    </span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

function resolveModelOptions(config: AiConfig, modelType?: AiModelKind) {
    if (modelType) return modelsForCapability(config, modelType).filter((model) => !isEndpointModel(model));
    return config.models || [];
}

function normalizePickerValue(config: AiConfig, modelType: AiModelKind | undefined, value: string | undefined, models: string[]) {
    const current = value || "";
    if (modelType !== "video" || config.channelMode !== "remote") return current;
    return current && models.includes(current) && !isEndpointModel(current) ? current : models[0] || "";
}

function uniquePickerModels(models: Array<string | undefined>) {
    const seen = new Set<string>();
    return models
        .map((model) => model?.trim() || "")
        .filter((model) => {
            if (!model || seen.has(model)) return false;
            seen.add(model);
            return true;
        });
}

function isEndpointModel(model: string) {
    return model.trim().toLowerCase().startsWith("ep-");
}

function resolveModelSourceOptions(config: AiConfig, models: string[]): ModelSourceOption[] {
    const visibleModels = new Set(models);
    const bySource = new Map<string, { key: string; label: string; protocolLabel: string; modelSet: Set<string> }>();
    for (const item of config.modelSources || []) {
        const model = item.model.trim();
        if (!model || !visibleModels.has(model)) continue;
        const protocolLabel = modelProtocolLabel(item.protocol);
        const label = item.channelName.trim() || protocolLabel;
        const key = `${item.channelId.trim() || label}:${item.protocol}`;
        const source = bySource.get(key) || { key, label, protocolLabel, modelSet: new Set<string>() };
        source.modelSet.add(model);
        bySource.set(key, source);
    }
    return Array.from(bySource.values()).map((source) => ({
        ...source,
        modelCount: source.modelSet.size,
    }));
}

function resolveActiveModelSource(sources: ModelSourceOption[], current: string, selectedSourceKey: string) {
    if (!sources.length) return undefined;
    const selected = sources.find((source) => source.key === selectedSourceKey);
    if (selected) return selected;
    if (current) {
        const matched = sources.filter((source) => source.modelSet.has(current));
        if (matched.length) return matched[0];
    }
    return sources[0];
}

function filterOptionsBySource<T extends { value: string }>(options: T[], source?: ModelSourceOption) {
    if (!source) return options;
    return options.filter((option) => source.modelSet.has(option.value));
}

function withModelSourceSearchText<T extends { value: string; searchText: string }>(options: T[], sources: ModelSourceOption[], activeSource?: ModelSourceOption) {
    return options.map((option) => ({
        ...option,
        searchText: [option.searchText, resolveModelSourceOptionLabel(option.value, sources, activeSource)].join(" ").toLowerCase(),
    }));
}

function resolveCurrentModelSourceLabel(sources: ModelSourceOption[], model: string, activeSource: ModelSourceOption | undefined, selectedSourceKey: string) {
    if (!model || !sources.length) return "";
    if (selectedSourceKey && activeSource?.modelSet.has(model)) return activeSource.label;
    const matched = sources.filter((source) => source.modelSet.has(model));
    if (matched.length === 1) return matched[0].label;
    if (matched.length > 1) return "多个渠道";
    return "";
}

function resolveModelSourceOptionLabel(model: string, sources: ModelSourceOption[], activeSource?: ModelSourceOption) {
    if (activeSource?.modelSet.has(model)) return `${activeSource.label} · ${activeSource.protocolLabel}`;
    const matched = sources.filter((source) => source.modelSet.has(model));
    if (matched.length === 1) return `${matched[0].label} · ${matched[0].protocolLabel}`;
    if (matched.length > 1) return `${matched.length} 个渠道`;
    return resolveModelProvider(model).label;
}

function modelProtocolLabel(protocol: string) {
    if (protocol === "volcengine-ark") return "火山 Ark";
    if (protocol === "jimeng-cli") return "即梦 CLI";
    if (protocol === "xinglian-cloud") return "星链云 SD2";
    if (protocol === "minimax") return "MiniMax H3";
    return "OpenAI 兼容";
}

function ModelSourceButton({ source, active, onSelect }: { source: ModelSourceOption; active: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--studio-text-secondary)] outline-none transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] focus-visible:bg-[var(--studio-hover-bg)] focus-visible:text-[var(--studio-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]",
                active && "bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-accent)]",
            )}
            onClick={onSelect}
            title={`${source.label} · ${source.protocolLabel}`}
        >
            <Cpu className="size-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1">
                <span className="block truncate">{source.label}</span>
                <span className="block truncate text-xs text-[var(--studio-text-muted)]">
                    {source.protocolLabel} · {source.modelCount} 个模型
                </span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-[var(--studio-accent)]" /> : null}
        </button>
    );
}

function ModelOptionButton({ model, sourceLabel, costLabel, active, onSelect }: { model: string; sourceLabel: string; costLabel: string; active: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--studio-text-secondary)] outline-none transition hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] focus-visible:bg-[var(--studio-hover-bg)] focus-visible:text-[var(--studio-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]",
                active && "bg-[var(--studio-active-bg)] text-[var(--studio-text-primary)] shadow-[inset_0_-2px_0_var(--studio-accent)]",
            )}
            onClick={onSelect}
        >
            <ModelIcon model={model} />
            <span className="min-w-0 flex-1">
                <span className="block truncate">{model}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--studio-text-muted)]">
                    <span className="min-w-0 flex-1 truncate">{sourceLabel}</span>
                    {costLabel ? (
                        <>
                            <span aria-hidden className="shrink-0 opacity-60">·</span>
                            <span className="shrink-0">{costLabel}</span>
                        </>
                    ) : null}
                </span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-[var(--studio-accent)]" /> : null}
        </button>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(model);
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const provider = resolveModelProvider(model).key;
    if (provider === "anthropic") return "/icons/claude.svg";
    if (provider === "google") return "/icons/gemini.svg";
    if (provider === "openai") return "/icons/openai.svg";
    if (provider === "xai") return "/icons/grok.svg";
    if (provider === "deepseek") return "/icons/deepseek.svg";
    if (provider === "zhipu") return "/icons/glm.svg";
    return "";
}
