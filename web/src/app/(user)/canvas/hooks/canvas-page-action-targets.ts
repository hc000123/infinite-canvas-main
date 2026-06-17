type CanvasPageTargetProject = {
    episodeId?: string;
    episodeTitle?: string;
    projectId?: string;
    scriptId?: string;
};

export function canvasPageReturnTargetForProject(currentProject?: CanvasPageTargetProject) {
    const videoWorkflowHref = canvasVideoWorkflowHref(currentProject);
    if (videoWorkflowHref) return { href: videoWorkflowHref, label: "返回视频生产台" };
    if (currentProject?.projectId) return { href: `/projects/${currentProject.projectId}`, label: "返回项目详情" };
    return { href: "/projects", label: "项目中心" };
}

export function videoWorkflowEpisodeFromCanvasProject(currentProject?: CanvasPageTargetProject) {
    const episodeId = currentProject?.episodeId?.trim() || "";
    if (episodeId.startsWith("video-workflow:")) return episodeId.replace(/^video-workflow:/, "") || currentProject?.episodeTitle || "";
    if (currentProject?.scriptId === "video-workflow") return currentProject.episodeTitle?.trim() || "";
    return "";
}

export function canvasVideoWorkflowHref(currentProject?: CanvasPageTargetProject) {
    const episode = videoWorkflowEpisodeFromCanvasProject(currentProject);
    if (!episode) return "";
    const params = new URLSearchParams({ episode });
    return `/video?${params.toString()}`;
}

export function originalWorkflowHref(episode: string) {
    const params = new URLSearchParams({ episode });
    return `/original-workflow?${params.toString()}`;
}
