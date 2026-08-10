import { redirect } from "next/navigation";

type LegacyProjectSkillPageProps = {
    params: Promise<{ id: string }>;
};

export default async function LegacyProjectSkillPage({ params }: LegacyProjectSkillPageProps) {
    const { id } = await params;
    redirect(`/projects/${id}`);
}
