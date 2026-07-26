export type InvocationApiParams = Record<string, string | string[] | number | number[] | undefined>;
export type InvocationApiGet = <T>(path: string, params?: InvocationApiParams, token?: string) => Promise<T>;
export type InvocationApiPost = <T>(path: string, body?: unknown, token?: string) => Promise<T>;
export type InvocationApiPostEmpty = <T>(path: string, token?: string) => Promise<T>;

export type ArtifactRefInput = {
    bindingName: string;
    artifactId: string;
    contentHash: string;
};

export type CreateArtifactInput = {
    artifactType: string;
    schemaVersion: string;
    projectId?: string;
    episodeId?: string;
    parentArtifactRefs?: ArtifactRefInput[];
    payload: Record<string, unknown>;
    extensions?: Record<string, unknown>;
};

export type Artifact = {
    id: string;
    userId: string;
    artifactType: string;
    schemaId: string;
    schemaVersion: string;
    schemaContentHash: string;
    projectId: string;
    episodeId: string;
    producerInvocationId?: string;
    producerAttempt?: number;
    contentHash: string;
    createdAt: string;
};

export type ArtifactEnvelope = {
    artifact: Artifact;
    parentArtifactIds: string[];
    payload: Record<string, unknown>;
    extensions: Record<string, unknown>;
};

export type ArtifactApprovalState = "approved" | "unapproved" | "pending" | "rejected";

export type ArtifactQuery = {
    project?: string;
    episode?: string;
    type?: string;
    producerInvocation?: string;
    approvalState?: ArtifactApprovalState;
    page?: number;
    pageSize?: number;
};

export type ArtifactList = {
    items: ArtifactEnvelope[];
    total: number;
    page: number;
    pageSize: number;
};

export type InvocationExecutionPolicyOverride = {
    model?: string;
    channelId?: string;
    timeoutSeconds?: number;
    maxAttempts?: number;
};

export type ClientInvocationSource =
    | "direct"
    | "image"
    | "canvas_chat";

export type InvocationRequest = {
    source: ClientInvocationSource;
    projectId: string;
    episodeId?: string;
    skillId?: string;
    skillVersionId?: string;
    skillVersionConstraint?: string;
    capability?: string;
    expectedOutputArtifactType?: string;
    inputArtifactRefs?: ArtifactRefInput[];
    projectTags?: string[];
    parameters?: unknown;
    executionPolicyOverride?: InvocationExecutionPolicyOverride;
    idempotencyKey?: string;
};

export type InvocationStatus =
    | "planned"
    | "preflight"
    | "awaiting_confirmation"
    | "queued"
    | "running"
    | "cancel_requested"
    | "needs_review"
    | "approved"
    | "applied"
    | "blocked"
    | "failed"
    | "partial"
    | "rejected"
    | "cancelled";

export type InvocationRunSummary = {
    id: string;
    source: string;
    projectId: string;
    episodeId: string;
    status: InvocationStatus;
    latestRevision: number;
    latestAttempt: number;
    reviewedAttempt: number;
    reviewedArtifactSetHash: string;
    createdAt: string;
    updatedAt: string;
};

export type InvocationRevisionSummary = {
    id: string;
    revision: number;
    skillId: string;
    skillVersionId: string;
    skillVersion: string;
    skillContentHash: string;
    createdAt: string;
};

export type InvocationExecutionPolicySummary = {
    executorKind: string;
    model: string;
    fallbackAllowed: boolean;
    requiresConfirmation: boolean;
    estimatedCredits: number;
    timeoutSeconds: number;
    maxAttempts: number;
    writePolicy: string;
    requiresConfirm: boolean;
};

export type InvocationRouteCandidate = {
    skillId: string;
    skillVersionId: string;
    accepted: boolean;
    reasons: string[];
};

export type InvocationRouteTrace = {
    capability: string;
    candidates: InvocationRouteCandidate[];
    finalSkillVersionId: string;
    selectedModel: string;
};

export type InvocationBlockReason = {
    code: string;
    message: string;
};

export type InvocationRevisionDetail = InvocationRevisionSummary & {
    executionPolicy: InvocationExecutionPolicySummary;
    routeTrace: InvocationRouteTrace;
    confirmationRequirements: string[];
    blockReasons: InvocationBlockReason[];
};

export type InvocationArtifactRef = {
    id: string;
    userId: string;
    invocationId: string;
    direction: string;
    bindingName: string;
    artifactId: string;
    artifactHash: string;
    artifactType: string;
    schemaVersion: string;
    schemaContentHash: string;
    revision: number;
    attempt: number;
    ordinal: number;
    createdAt: string;
};

export type InvocationGate = {
    id: string;
    userId: string;
    invocationId: string;
    artifactId: string;
    artifactHash: string;
    layer: string;
    validatorId: string;
    bindingName: string;
    outputOrdinal: number;
    validatorVersion: string;
    attempt: number;
    executionOrdinal: number;
    passed: boolean;
    createdAt: string;
};

export type InvocationAttemptSummary = {
    id: string;
    status: string;
    revision: number;
    attempt: number;
    errorClass: string;
    model: string;
    creditsReserved: number;
    creditsRefunded: number;
    durationMs: number;
    startedAt: string;
    finishedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type InvocationAttemptDetail = InvocationAttemptSummary & {
    gates: InvocationGate[];
};

export type InvocationReview = {
    id: string;
    userId: string;
    invocationId: string;
    decision: string;
    artifactSetHash: string;
    comment: string;
    actorId: string;
    attempt: number;
    createdAt: string;
};

export type InvocationApplySummary = {
    id: string;
    artifactSetHash: string;
    target: string;
    targetId: string;
    status: string;
    attempt: number;
    createdAt: string;
    updatedAt: string;
};

export type InvocationEvent = {
    id: number;
    userId: string;
    invocationId: string;
    type: string;
    level: string;
    revision: number;
    attempt: number;
    createdAt: string;
};

export type InvocationEventsPage = {
    events: InvocationEvent[];
    eventsHasMore: boolean;
    eventsNextAfter: number;
    eventsLimit: number;
};

export type InvocationPreflightResponse = {
    run: InvocationRunSummary;
    revision: InvocationRevisionSummary;
    inputArtifactRefs: InvocationArtifactRef[];
    executionPolicy: InvocationExecutionPolicySummary;
    routeTrace: InvocationRouteTrace;
    confirmationRequirements: string[];
    blockReasons: InvocationBlockReason[];
};

export type InvocationLifecycleResponse = {
    run: InvocationRunSummary;
    revision: number;
    attempt?: InvocationAttemptSummary;
};

export type InvocationDetail = InvocationEventsPage & {
    run: InvocationRunSummary;
    revisions: InvocationRevisionDetail[];
    attempts: InvocationAttemptDetail[];
    artifactRefs: InvocationArtifactRef[];
    authoritativeArtifactRefs: InvocationArtifactRef[];
    outputArtifacts: ArtifactEnvelope[];
    reviews: InvocationReview[];
    applyAttempts: InvocationApplySummary[];
    artifactSetHash: string;
};

export type InvocationConfirmation = {
    requirementCodes: string[];
};

export type InvocationCorrectionInput = {
    attempt: number;
    expectedRawOutputHash: string;
    output: unknown;
};

export type InvocationReviewInput = {
    decision: "approved" | "rejected";
    attempt: number;
    artifactSetHash: string;
    comment?: string;
};

export type InvocationApplyInput = {
    idempotencyKey: string;
    attempt: number;
    artifactSetHash: string;
    target: string;
    targetId: string;
    payload?: Record<string, unknown>;
};

export type InvocationQuery = {
    project?: string;
    episode?: string;
    source?: string;
    status?: InvocationStatus;
    skillId?: string;
    page?: number;
    pageSize?: number;
};

export type InvocationList = {
    items: InvocationRunSummary[];
    total: number;
    page: number;
    pageSize: number;
};

const encode = encodeURIComponent;
const invocationPath = (id: string) => `/api/v1/invocations/${encode(id)}`;
const compactApiParams = (params: InvocationApiParams) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && (!Array.isArray(value) || value.length > 0))) as InvocationApiParams;

export const invocationRequest = {
    artifacts: () => ({ method: "GET", path: "/api/v1/artifacts" } as const),
    createArtifact: () => ({ method: "POST", path: "/api/v1/artifacts" } as const),
    artifactDetail: (id: string) => ({ method: "GET", path: `/api/v1/artifacts/${encode(id)}` } as const),
    invocations: () => ({ method: "GET", path: "/api/v1/invocations" } as const),
    create: () => ({ method: "POST", path: "/api/v1/invocations" } as const),
    detail: (id: string) => ({ method: "GET", path: invocationPath(id) } as const),
    repreflight: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/repreflight` } as const),
    confirm: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/confirm` } as const),
    cancel: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/cancel` } as const),
    retry: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/retry` } as const),
    revalidate: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/revalidate` } as const),
    review: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/review` } as const),
    apply: (id: string) => ({ method: "POST", path: `${invocationPath(id)}/apply` } as const),
    events: (id: string) => ({ method: "GET", path: `${invocationPath(id)}/events` } as const),
};

export function createInvocationClient({ apiGet, apiPost, apiPostEmpty, token }: { apiGet: InvocationApiGet; apiPost: InvocationApiPost; apiPostEmpty: InvocationApiPostEmpty; token: () => string }) {
    return {
        createArtifact: (input: CreateArtifactInput) => apiPost<ArtifactEnvelope>(invocationRequest.createArtifact().path, input, token()),
        listArtifacts: (query: ArtifactQuery = {}) => apiGet<ArtifactList>(invocationRequest.artifacts().path, compactApiParams({ ...query }), token()),
        getArtifact: (id: string) => apiGet<ArtifactEnvelope>(invocationRequest.artifactDetail(id).path, undefined, token()),
        createInvocation: (input: InvocationRequest) => apiPost<InvocationPreflightResponse>(invocationRequest.create().path, input, token()),
        listInvocations: (query: InvocationQuery = {}) => apiGet<InvocationList>(invocationRequest.invocations().path, compactApiParams({ ...query }), token()),
        getInvocation: (id: string) => apiGet<InvocationDetail>(invocationRequest.detail(id).path, undefined, token()),
        repreflightInvocation: (id: string, input: InvocationRequest) => apiPost<InvocationPreflightResponse>(invocationRequest.repreflight(id).path, input, token()),
        confirmInvocation: (id: string, input: InvocationConfirmation) => apiPost<InvocationLifecycleResponse>(invocationRequest.confirm(id).path, input, token()),
        cancelInvocation: (id: string) => apiPostEmpty<InvocationLifecycleResponse>(invocationRequest.cancel(id).path, token()),
        retryInvocation: (id: string) => apiPostEmpty<InvocationLifecycleResponse>(invocationRequest.retry(id).path, token()),
        revalidateInvocation: (id: string, input: InvocationCorrectionInput) => apiPost<InvocationLifecycleResponse>(invocationRequest.revalidate(id).path, input, token()),
        reviewInvocation: (id: string, input: InvocationReviewInput) => apiPost<InvocationLifecycleResponse>(invocationRequest.review(id).path, input, token()),
        applyInvocation: (id: string, input: InvocationApplyInput) => apiPost<InvocationApplySummary>(invocationRequest.apply(id).path, input, token()),
        listInvocationEvents: (id: string, after = 0, limit = 100) => apiGet<InvocationEvent[]>(invocationRequest.events(id).path, compactApiParams({ after, limit }), token()),
    };
}
