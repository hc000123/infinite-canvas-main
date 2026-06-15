"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { buildModelPickerOptions, filterModelPickerOptions, groupModelPickerOptions, resolveCustomModelCandidate, resolveModelProvider } from "@/components/model-picker-options";
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

export function ModelPicker({ config, value, onChange, className, fullWidth = false, placeholder = "选择模型", modelType, allowCustomModel = config.channelMode === "local", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const modelOptions = useMemo(() => resolveModelOptions(config, modelType), [config, modelType]);
    const current = normalizePickerValue(config, modelType, value, modelOptions);
    const options = useMemo(() => buildModelPickerOptions({ models: modelOptions, value: current }), [modelOptions, current]);
    const filteredOptions = useMemo(() => filterModelPickerOptions(options, keyword), [keyword, options]);
    const optionGroups = useMemo(() => groupModelPickerOptions(filteredOptions), [filteredOptions]);
    const customModel = resolveCustomModelCandidate(keyword, options, allowCustomModel);
    const emptyText = keyword.trim() ? (config.channelMode === "remote" ? "暂无匹配模型" : "没有匹配的模型") : config.channelMode === "remote" ? "暂无可用模型" : allowCustomModel ? "输入模型 ID 后回车使用" : "请先到配置里拉取模型列表";

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
        onChange(model);
        setKeyword("");
        setOpen(false);
    };

    const selectBestKeyboardMatch = () => {
        const exactMatch = options.find((option) => option.value.toLowerCase() === keyword.trim().toLowerCase());
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
                    title={current || placeholder}
                >
                    <ModelIcon model={current} />
                    <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current || placeholder}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-60" />
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    data-canvas-no-zoom
                    className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-elevated-bg)] p-2 text-[var(--studio-text-primary)] shadow-[var(--studio-shadow)]"
                    align="start"
                    side="bottom"
                    sideOffset={6}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                >
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
                                            <ModelOptionButton key={option.value} model={option.value} active={option.value === current} onSelect={() => selectModel(option.value)} />
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
    if (modelType === "image") {
        return uniquePickerModels([...(config.imageModels || []), config.imageModel, ...(config.models || []).filter((model) => !isLikelyVideoModel(model) && !isEndpointModel(model))]);
    }
    if (modelType === "video") {
        const videoModels = config.videoModels || [];
        if (videoModels.length) {
            const currentConfiguredModel = config.channelMode === "remote" ? "" : config.videoProtocol === "volcengine-ark" ? config.seedanceModel : config.videoModel;
            return uniquePickerModels([...videoModels, currentConfiguredModel]).filter((model) => model && !isEndpointModel(model));
        }
        return (config.models || []).filter((model) => !isEndpointModel(model));
    }
    if (modelType === "text") return config.textModels?.length ? config.textModels : config.models || [];
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

function isLikelyVideoModel(model: string) {
    const name = model.trim().toLowerCase();
    return ["seedance", "video", "veo", "sora", "kling", "hailuo", "runway", "wan"].some((keyword) => name.includes(keyword));
}

function ModelOptionButton({ model, active, onSelect }: { model: string; active: boolean; onSelect: () => void }) {
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
                <span className="block truncate text-xs text-[var(--studio-text-muted)]">{resolveModelProvider(model).label}</span>
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
