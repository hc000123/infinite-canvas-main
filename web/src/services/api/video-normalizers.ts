export function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

export function normalizeVideoSize(value: string) {
    if (value === "auto" || value === "adaptive") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

export function normalizeVideoResolution(value: string) {
    if (value === "low") return "720p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return Number(resolution) >= 1080 ? "1080p" : "720p";
}

export function isSeedance25Model(model?: string) {
    return /^(?:doubao[\s._-]*)?seedance[\s._-]*2[\s._-]*5(?:[\s._-]+\d{6})?$/i.test((model || "").trim());
}

export function normalizeSeedanceDuration(value: string, model?: string, taskMode?: string) {
    if (isSeedance25Model(model) && taskMode === "edit") return -1;
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(4, Math.min(isSeedance25Model(model) ? 30 : 15, seconds));
}

export function normalizeSeedanceRatio(value: string, model?: string, taskMode?: string, imageRoleMode?: string) {
    let ratio: string;
    if (value === "auto" || value === "adaptive") ratio = "adaptive";
    else if (["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) ratio = value;
    else {
        const size = normalizeVideoSize(value);
        if (!size) ratio = "16:9";
        else if (["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"].includes(size)) ratio = size;
        else if (size === "1024x1024") ratio = "1:1";
        else if (size === "720x1280" || size === "1024x1792") ratio = "9:16";
        else if (size === "1280x720" || size === "1792x1024") ratio = "16:9";
        else if (size === "2560x1080" || size === "1920x810") ratio = "21:9";
        else ratio = size.includes("x") && Number(size.split("x")[0]) < Number(size.split("x")[1]) ? "9:16" : "16:9";
    }
    return isSeedance25Model(model) && (taskMode === "edit" || taskMode === "extend" || imageRoleMode === "first_frame" || imageRoleMode === "first_last_frame") ? "adaptive" : ratio;
}

export function normalizeSeedanceResolution(value: string, model?: string) {
    if (isSeedance25Model(model)) {
        const resolution = Number(value.toLowerCase().replace(/p$/i, ""));
        return resolution > 0 && resolution <= 480 ? "480p" : "720p";
    }
    if (isSeedanceFastModel(model)) return "720p";
    const resolution = Number(normalizeVideoResolution(value).replace(/p$/i, "")) || 720;
    return resolution >= 1080 ? "1080p" : "720p";
}

export function normalizeSeedanceSeed(value: string) {
    const seed = Math.floor(Number(value));
    return Number.isFinite(seed) && value.trim() ? seed : undefined;
}

export function isRemoteOrInlineMediaUrl(url: string) {
    return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("asset://");
}

function isSeedanceFastModel(model?: string) {
    return (model || "").toLowerCase().includes("seedance-2-0-fast");
}
