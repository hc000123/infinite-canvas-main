import { EpisodeWorkflowWorkbench } from "./episode-workflow-workbench";

type WorkflowPageProps = { params: Promise<{ episodeId: string; id: string }> };

export default async function WorkflowPage({ params }: WorkflowPageProps) {
    const { episodeId, id: projectId } = await params;
    return <EpisodeWorkflowWorkbench episodeId={episodeId} projectId={projectId} />;
}
