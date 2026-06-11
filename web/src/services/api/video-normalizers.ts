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

export function normalizeSeedanceDuration(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return Math.max(4, Math.min(15, seconds));
}

export function normalizeSeedanceRatio(value: string) {
    if (value === "auto" || value === "adaptive") return "adaptive";
    if (["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"].includes(value)) return value;
    const size = normalizeVideoSize(value);
    if (!size) return "16:9";
    if (["21:9", "16:9", "9:16", "1:1", "4:3", "3:4"].includes(size)) return size;
    if (size === "1024x1024") return "1:1";
    if (size === "720x1280" || size === "1024x1792") return "9:16";
    if (size === "1280x720" || size === "1792x1024") return "16:9";
    if (size === "2560x1080" || size === "1920x810") return "21:9";
    return size.includes("x") && Number(size.split("x")[0]) < Number(size.split("x")[1]) ? "9:16" : "16:9";
}

export function normalizeSeedanceResolution(value: string, model?: string) {
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
