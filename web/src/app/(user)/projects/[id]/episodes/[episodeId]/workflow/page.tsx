import { redirect } from "next/navigation";

import { agentWorkspaceHref } from "../../../../agent-workspace-route";

type LegacyWorkflowPageProps = {
    params: Promise<{ episodeId: string; id: string }>;
    searchParams: Promise<{ shot?: string; stage?: string }>;
};

export default async function LegacyWorkflowPage({ params, searchParams }: LegacyWorkflowPageProps) {
    const [{ episodeId, id: projectId }, query] = await Promise.all([params, searchParams]);
    redirect(agentWorkspaceHref({ projectId, episodeId, stage: query.stage || "script", shot: query.shot }));
}
