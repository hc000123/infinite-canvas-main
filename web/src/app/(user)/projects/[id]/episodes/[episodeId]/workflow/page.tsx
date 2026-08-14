import { EpisodeWorkflowWorkbench } from "./episode-workflow-workbench";

type WorkflowPageProps = {
    params: Promise<{ episodeId: string; id: string }>;
    searchParams: Promise<{ returnLabel?: string; returnTo?: string }>;
};

export default async function WorkflowPage({ params, searchParams }: WorkflowPageProps) {
    const [{ episodeId, id: projectId }, query] = await Promise.all([params, searchParams]);
    const returnTo = query.returnTo?.trim() || "";
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/projects/${encodeURIComponent(projectId)}`;
    const returnLabel = safeReturnTo.startsWith("/agent") ? "返回生产总控" : query.returnLabel?.trim() || "返回项目";
    return <EpisodeWorkflowWorkbench episodeId={episodeId} projectId={projectId} returnHref={safeReturnTo} returnLabel={returnLabel} />;
}
