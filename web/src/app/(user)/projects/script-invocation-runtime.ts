import type {
    ArtifactEnvelope,
    CreateArtifactInput,
    InvocationDetail,
    InvocationPreflightResponse,
    InvocationRequest,
    InvocationReviewInput,
} from "@/services/api/invocations";

export type ScriptInvocationReviewResult = {
    invocationId: string;
    attempt: number;
    artifactSetHash: string;
    artifactId: string;
    productionScript: string;
};

export async function preflightScriptInvocation(
    deps: {
        createArtifact: (input: CreateArtifactInput) => Promise<ArtifactEnvelope>;
        createInvocation: (input: InvocationRequest) => Promise<InvocationPreflightResponse>;
    },
    input: { projectId: string; episodeId?: string; sourceText: string; skillVersionId: string; idempotencyKey: string },
) {
    const sourceArtifact = await deps.createArtifact({
        artifactType: "source_text",
        schemaVersion: "1.0.0",
        projectId: input.projectId,
        ...(input.episodeId ? { episodeId: input.episodeId } : {}),
        payload: { text: input.sourceText },
    });
    const preflight = await deps.createInvocation({
        source: "direct",
        projectId: input.projectId,
        ...(input.episodeId ? { episodeId: input.episodeId } : {}),
        skillVersionId: input.skillVersionId,
        expectedOutputArtifactType: "production_script",
        inputArtifactRefs: [{ bindingName: "source_text", artifactId: sourceArtifact.artifact.id, contentHash: sourceArtifact.artifact.contentHash }],
        parameters: {},
        idempotencyKey: input.idempotencyKey,
    });
    return { sourceArtifact, preflight };
}

export async function executeScriptInvocationToReview(
    deps: {
        confirmInvocation: (id: string, input: { requirementCodes: string[] }) => Promise<unknown>;
        getInvocation: (id: string) => Promise<InvocationDetail>;
        reviewInvocation: (id: string, input: InvocationReviewInput) => Promise<unknown>;
        wait?: (milliseconds: number) => Promise<void>;
    },
    preflight: InvocationPreflightResponse,
    options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<ScriptInvocationReviewResult> {
    if (preflight.blockReasons.length) throw new Error(preflight.blockReasons.map((reason) => reason.message).join("；"));
    await deps.confirmInvocation(preflight.run.id, { requirementCodes: preflight.confirmationRequirements });
    const maxPolls = options.maxPolls ?? 180;
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const wait = deps.wait || ((milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    for (let index = 0; index < maxPolls; index += 1) {
        const detail = await deps.getInvocation(preflight.run.id);
        if (["failed", "blocked", "rejected", "cancelled", "partial"].includes(detail.run.status)) throw new Error(`剧本 Invocation 执行失败：${detail.run.status}`);
        if (detail.run.status === "needs_review") {
            const output = detail.outputArtifacts.find((artifact) => artifact.artifact.artifactType === "production_script");
            const productionScript = typeof output?.payload.productionScript === "string" ? output.payload.productionScript.trim() : "";
            if (!detail.artifactSetHash || !productionScript || !output) throw new Error("剧本 Skill 没有返回可审核的 production_script Artifact");
            const result = {
                invocationId: detail.run.id,
                attempt: detail.run.latestAttempt,
                artifactSetHash: detail.artifactSetHash,
                artifactId: output.artifact.id,
                productionScript,
            };
            await approveScriptInvocationResult({ reviewInvocation: deps.reviewInvocation }, result, "项目分集剧本自动批准");
            return result;
        }
        if (index + 1 < maxPolls) await wait(pollIntervalMs);
    }
    throw new Error("等待剧本 Skill 产物超时，可在 AI 使用记录中查看 Invocation 状态");
}

export function approveScriptInvocationResult(
    deps: { reviewInvocation: (id: string, input: InvocationReviewInput) => Promise<unknown> },
    input: ScriptInvocationReviewResult,
    comment = "项目分集剧本人工批准",
) {
    return deps.reviewInvocation(input.invocationId, {
        decision: "approved",
        attempt: input.attempt,
        artifactSetHash: input.artifactSetHash,
        comment,
    });
}
