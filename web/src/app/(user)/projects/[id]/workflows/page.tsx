import { redirect } from "next/navigation";

import { agentWorkspaceHref } from "../../agent-workspace-route";

type LegacyProjectWorkflowPageProps = {
    params: Promise<{ id: string }>;
};

export default async function LegacyProjectWorkflowPage({ params }: LegacyProjectWorkflowPageProps) {
    const { id: projectId } = await params;
    redirect(agentWorkspaceHref({ projectId }));
}
