import { redirect } from "next/navigation";

import { agentWorkspaceHref } from "../../../../agent-workspace-route";

export default async function EpisodeProductionWorkbenchRedirectPage({ params }: { params: Promise<{ episodeId: string; id: string }> }) {
    const { episodeId, id: projectId } = await params;
    redirect(agentWorkspaceHref({ projectId, episodeId, stage: "script" }));
}
