import { redirect } from "next/navigation";

type ProjectAgentWorkbenchPageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function ProjectAgentWorkbenchPage({ params }: ProjectAgentWorkbenchPageProps) {
    const { id } = await params;
    redirect(`/projects/${id}/agents`);
}
