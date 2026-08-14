import { EpisodeWorkflowWorkbench } from "./episode-workflow-workbench";
import { workflowReturnTarget, type WorkflowNavigationSearchParams } from "./workflow-navigation";

type WorkflowPageProps = {
    params: Promise<{ episodeId: string; id: string }>;
    searchParams: Promise<WorkflowNavigationSearchParams>;
};

export default async function WorkflowPage({ params, searchParams }: WorkflowPageProps) {
    const [{ episodeId, id: projectId }, query] = await Promise.all([params, searchParams]);
    const returnTarget = workflowReturnTarget(projectId, query);
    return <EpisodeWorkflowWorkbench episodeId={episodeId} projectId={projectId} returnHref={returnTarget.href} returnLabel={returnTarget.label} />;
}
