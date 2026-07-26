import { preferredCapabilityOutputText } from "../../../components/capability-runtime/capability-run-model.ts";
import type { CapabilityConsumeTrace } from "../../../components/capability-runtime/use-capability-run";
import type { ArtifactEnvelope } from "../../../services/api/invocations-contract";

export type ImageCapabilityTrace = CapabilityConsumeTrace;

export function selectImagePromptArtifact(artifacts: ArtifactEnvelope[], assetId = ""): ArtifactEnvelope | undefined {
    const briefs = artifacts.filter((item) => item.artifact.artifactType === "asset_brief");
    const matching = assetId ? briefs.find((item) => item.payload.assetId === assetId) : undefined;
    return matching || briefs[0] || artifacts.find((item) => item.artifact.artifactType === "production_script" || item.artifact.artifactType === "video_prompt_package");
}

export function imagePromptFromArtifacts(artifacts: ArtifactEnvelope[], options: { approved: boolean; assetId?: string }): string {
    if (!options.approved || !artifacts.length) return "";
    const selected = selectImagePromptArtifact(artifacts, options.assetId);
    if (!selected) return "";
    if (selected.artifact.artifactType === "asset_brief" && (typeof selected.payload.brief !== "string" || !selected.payload.brief.trim())) return "";
    if (selected.artifact.artifactType === "production_script" && (typeof selected.payload.productionScript !== "string" || !selected.payload.productionScript.trim())) return "";
    if (selected.artifact.artifactType === "video_prompt_package") {
        const first = Array.isArray(selected.payload.items) ? selected.payload.items[0] : undefined;
        if (!first || typeof first !== "object" || typeof (first as Record<string, unknown>).prompt !== "string" || !(first as Record<string, string>).prompt.trim()) return "";
    }
    return preferredCapabilityOutputText(selected).trim();
}

export function buildImageCapabilityTrace(trace: CapabilityConsumeTrace): ImageCapabilityTrace {
    return {
        invocationId: trace.invocationId,
        artifactIds: [...trace.artifactIds],
        skillVersionId: trace.skillVersionId,
        appliedAt: trace.appliedAt,
    };
}
