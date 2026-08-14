import { redirect } from "next/navigation";

import { legacyAgentRedirectHref } from "../projects/agent-workspace-route";

type AgentPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AgentPage({ searchParams }: AgentPageProps) {
    const query = await searchParams;
    redirect(legacyAgentRedirectHref(query));
}
