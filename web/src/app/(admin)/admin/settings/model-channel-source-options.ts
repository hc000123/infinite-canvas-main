import type { AdminModelChannel } from "../../../../services/api/admin.ts";

export type ChannelModelSourceOption = {
    label: string;
    value: string;
    sources: string[];
    searchText: string;
};

export type ChannelModelSourceGroup = {
    label: string;
    options: ChannelModelSourceOption[];
};

export function isChannelModelSourceOption(value: unknown): value is ChannelModelSourceOption {
    if (!value || typeof value !== "object") return false;
    const option = value as Partial<ChannelModelSourceOption>;
    return typeof option.label === "string" && typeof option.value === "string" && Array.isArray(option.sources) && option.sources.every((source) => typeof source === "string") && typeof option.searchText === "string";
}

export function buildChannelModelSourceGroups(channels: AdminModelChannel[]): ChannelModelSourceGroup[] {
    const channelOrder: string[] = [];
    const sourcesByModel = new Map<string, string[]>();

    channels.filter((channel) => channel.enabled).forEach((channel) => {
        const source = channel.name.trim() || channel.id.trim() || "未命名渠道";
        if (!channelOrder.includes(source)) channelOrder.push(source);
        const seen = new Set<string>();
        channel.models.forEach((value) => {
            const model = value.trim();
            if (!model || seen.has(model) || model.toLowerCase().startsWith("ep-")) return;
            seen.add(model);
            const sources = sourcesByModel.get(model) || [];
            if (!sources.includes(source)) sources.push(source);
            sourcesByModel.set(model, sources);
        });
    });

    const options = Array.from(sourcesByModel, ([model, sources]) => ({ label: model, value: model, sources, searchText: [model, ...sources].join(" ").toLowerCase() }));
    const groups: ChannelModelSourceGroup[] = [];
    const shared = options.filter((option) => option.sources.length > 1);
    if (shared.length) groups.push({ label: "多渠道共享", options: shared });
    channelOrder.forEach((source) => {
        const sourceOptions = options.filter((option) => option.sources.length === 1 && option.sources[0] === source);
        if (sourceOptions.length) groups.push({ label: source, options: sourceOptions });
    });
    return groups;
}
