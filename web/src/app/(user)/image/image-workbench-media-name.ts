export type ImageWorkbenchFilenameContext = {
    title?: string;
    projectTitle?: string;
};

export function imageWorkbenchResultFilename(context: ImageWorkbenchFilenameContext, index: number, mimeType?: string) {
    const title = safeFilenamePart(context.title || context.projectTitle || "生图工作台");
    return `${title}-结果${String(index + 1).padStart(3, "0")}.${imageExtension(mimeType)}`;
}

function safeFilenamePart(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "生图工作台";
}

function imageExtension(mimeType?: string) {
    const subtype = mimeType?.split(";")[0]?.split("/")[1]?.toLowerCase();
    return subtype === "jpeg" ? "jpg" : subtype || "png";
}
