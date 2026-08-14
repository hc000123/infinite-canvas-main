export function assetSubjectHref(subjectId: string, pathname: string, query = "") {
    const returnTo = query ? `${pathname}?${query}` : pathname;
    const params = new URLSearchParams({ returnTo, returnLabel: "返回素材" });
    return `/assets/${encodeURIComponent(subjectId)}?${params.toString()}`;
}
