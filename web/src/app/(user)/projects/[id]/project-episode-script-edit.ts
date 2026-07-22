export function buildOriginalScriptEditPatch(value: string) {
    const sourceSummary = value.trim();
    if (!sourceSummary) throw new Error("剧本正文不能为空");
    return { sourceSummary, summary: "", structuredScript: undefined };
}
