export type ScriptAgentRef = { agentId: string; agentVersionId: string };

export function resolveSystemScriptAgent(items: Array<{ agent: { id: string; recommendedVersionId: string } }>): ScriptAgentRef {
    const item = items.find((candidate) => candidate.agent.id === "agent-system-script" && candidate.agent.recommendedVersionId);
    if (!item) throw new Error("系统剧本制作 Agent 没有可用的推荐版本");
    return { agentId: item.agent.id, agentVersionId: item.agent.recommendedVersionId };
}

type SourceArtifact = {
    artifact: { id: string; contentHash: string };
};

type AgentPlanState = {
    id: string;
    currentRevision: number;
    confirmationFingerprint: string;
    status: string;
    estimatedCredits: number;
};

type AgentPlanStepState = { step: { invocationId: string; status: string } };

export type ScriptAgentPreflight = {
    plan: AgentPlanState;
    steps: AgentPlanStepState[];
    confirmationRequirements: Array<{ code: string; message: string }>;
};

type AgentPlanProgress = {
    plan: AgentPlanState;
    steps: AgentPlanStepState[];
};

type InvocationState = {
    run: { id: string; status: string; latestAttempt: number };
    artifactSetHash: string;
    outputArtifacts: Array<{ artifact: { id: string; artifactType: string }; payload: Record<string, unknown> }>;
};

export type PreparedScriptAgentRun = {
    sourceArtifact: SourceArtifact;
    preflight: ScriptAgentPreflight;
};

export type ScriptAgentReviewResult = {
    planId: string;
    invocationId: string;
    attempt: number;
    artifactSetHash: string;
    artifactId: string;
    productionScript: string;
};

export function assertScriptReviewMatches(value: string, review: Pick<ScriptAgentReviewResult, "productionScript">) {
    if (value.trim() !== review.productionScript.trim()) throw new Error("待审剧本内容已变更，不能继续使用原 Artifact 的审核坐标；请重新运行剧本制作 Agent");
}

export async function preflightScriptAgent(
    deps: {
        createArtifact: (input: Record<string, unknown>) => Promise<SourceArtifact>;
        createAgentPlan: (input: Record<string, unknown>) => Promise<{ plan: { id: string } }>;
        preflightAgentPlan: (id: string) => Promise<ScriptAgentPreflight>;
    },
    input: { projectId: string; episodeId?: string; episodeTitle: string; sourceText: string; agent: ScriptAgentRef; idempotencyKey: string },
): Promise<PreparedScriptAgentRun> {
    const sourceArtifact = await deps.createArtifact({
        artifactType: "source_text",
        schemaVersion: "1.0.0",
        projectId: input.projectId,
        ...(input.episodeId ? { episodeId: input.episodeId } : {}),
        payload: { text: input.sourceText },
    });
    const detail = await deps.createAgentPlan({
        projectId: input.projectId,
        ...(input.episodeId ? { episodeId: input.episodeId } : {}),
        agentId: input.agent.agentId,
        agentVersionId: input.agent.agentVersionId,
        goal: `将《${input.episodeTitle}》整理为下游可直接使用的生产剧本`,
        sourceArtifactRefs: [{ bindingName: "source_text", artifactId: sourceArtifact.artifact.id, contentHash: sourceArtifact.artifact.contentHash }],
        idempotencyKey: input.idempotencyKey,
    });
    return { sourceArtifact, preflight: await deps.preflightAgentPlan(detail.plan.id) };
}

export async function executeScriptAgentToReview(
    deps: {
        confirmAgentPlan: (id: string, input: { revision: number; fingerprint: string; requirementCodes: string[] }) => Promise<unknown>;
        continueAgentPlan: (id: string) => Promise<AgentPlanProgress>;
        getInvocation: (id: string) => Promise<InvocationState>;
        wait?: (milliseconds: number) => Promise<void>;
    },
    preflight: ScriptAgentPreflight,
    options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<ScriptAgentReviewResult> {
    const planId = preflight.plan.id;
    await deps.confirmAgentPlan(planId, {
        revision: preflight.plan.currentRevision,
        fingerprint: preflight.plan.confirmationFingerprint,
        requirementCodes: preflight.confirmationRequirements.map((requirement) => requirement.code),
    });
    const maxPolls = options.maxPolls ?? 180;
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const wait = deps.wait || ((milliseconds: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
    for (let index = 0; index < maxPolls; index += 1) {
        const progress = await deps.continueAgentPlan(planId);
        if (["failed", "blocked", "cancelled"].includes(progress.plan.status)) throw new Error(`剧本 Agent Plan 执行失败：${progress.plan.status}`);
        const reviewStep = progress.steps.find((step) => step.step.status === "needs_review");
        if (progress.plan.status === "needs_review" && reviewStep?.step.invocationId) {
            const invocation = await deps.getInvocation(reviewStep.step.invocationId);
            const output = invocation.outputArtifacts.find((artifact) => artifact.artifact.artifactType === "production_script");
            const productionScript = typeof output?.payload.productionScript === "string" ? output.payload.productionScript.trim() : "";
            if (invocation.run.status !== "needs_review" || !invocation.artifactSetHash || !productionScript || !output) throw new Error("剧本 Agent 没有返回可审核的 production_script Artifact");
            return {
                planId,
                invocationId: invocation.run.id,
                attempt: invocation.run.latestAttempt,
                artifactSetHash: invocation.artifactSetHash,
                artifactId: output.artifact.id,
                productionScript,
            };
        }
        if (progress.plan.status === "completed") throw new Error("剧本 Agent Plan 绕过了必需的人工审核");
        if (index + 1 < maxPolls) await wait(pollIntervalMs);
    }
    throw new Error("等待剧本 Agent 产物超时，可在 Agent 中心查看该 Plan 的执行状态");
}

export async function approveScriptAgentResult(
    deps: {
        reviewInvocation: (id: string, input: { decision: "approved"; attempt: number; artifactSetHash: string; comment: string }) => Promise<unknown>;
        continueAgentPlan: (id: string) => Promise<AgentPlanProgress>;
    },
    input: Pick<ScriptAgentReviewResult, "planId" | "invocationId" | "attempt" | "artifactSetHash">,
) {
    await deps.reviewInvocation(input.invocationId, {
        decision: "approved",
        attempt: input.attempt,
        artifactSetHash: input.artifactSetHash,
        comment: "项目分集剧本人工批准",
    });
    const progress = await deps.continueAgentPlan(input.planId);
    if (progress.plan.status !== "completed") throw new Error(`剧本 Agent Plan 审核后未完成：${progress.plan.status}`);
    return progress;
}
