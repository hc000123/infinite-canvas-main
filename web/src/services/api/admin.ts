import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm, apiPut, compactApiParams } from "@/services/api/request";
import type { Prompt, PromptListResponse } from "@/services/api/prompts";

export type AdminPromptCategory = {
    category: string;
    name: string;
    description: string;
    file: string;
    githubUrl: string;
    remote: boolean;
};

export type AdminUser = {
    id: string;
    username: string;
    email: string;
    displayName: string;
    avatarUrl: string;
    role: "user" | "admin" | "superadmin";
    credits: number;
    affCode: string;
    affCount: number;
    inviterId: string;
    linuxDoId: string;
    status: "active" | "ban";
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
    ipApprovalEnabled: boolean;
};

export type AdminUserListResponse = {
    items: AdminUser[];
    total: number;
};

export type AdminUserSummary = Pick<AdminUser, "id" | "username" | "displayName">;

export type AdminAccount = Omit<AdminUser, "role"> & { role: "admin" | "superadmin" };

export type AdminAccountQuery = AdminUserQuery & {
    role?: "admin" | "superadmin";
    status?: "active" | "ban";
};

export type AdminAccountUpdate = Pick<AdminAccount, "username" | "displayName" | "email" | "role" | "status">;

export async function fetchAdminAccounts(token: string, query: AdminAccountQuery = {}) {
    return apiGet<{ items: AdminAccount[]; total: number }>("/api/admin/admins", compactApiParams(query), token);
}

export async function createAdminAccount(token: string, input: AdminAccountUpdate & { password: string }) {
    return apiPost<AdminAccount>("/api/admin/admins", input, token);
}

export async function updateAdminAccount(token: string, id: string, input: AdminAccountUpdate) {
    return apiPatch<AdminAccount>(`/api/admin/admins/${encodeURIComponent(id)}`, input, token);
}

export async function resetAdminAccountPassword(token: string, id: string, password: string) {
    return apiPost<boolean>(`/api/admin/admins/${encodeURIComponent(id)}/password`, { password }, token);
}

export async function deleteAdminAccount(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/admins/${encodeURIComponent(id)}`, token);
}

export type AdminCreditLog = {
    id: string;
    userId: string;
    type: string;
    amount: number;
    balance: number;
    relatedId: string;
    remark: string;
    extra: string;
    createdAt: string;
    user?: AdminUserSummary;
};

export type AdminCreditLogListResponse = {
    items: AdminCreditLog[];
    total: number;
};

export type AdminAITask = {
    id: string;
    userId: string;
    kind: string;
    taskType: string;
    actionType: string;
    provider: string;
    protocol: string;
    model: string;
    path: string;
    status: string;
    credits: number;
    creditsRefunded: number;
    upstreamTaskId: string;
    rawStatus: string;
    videoUrl: string;
    videoUrlExpiresAt: number;
    errorCode: string;
    requestJson: string;
    responseJson: string;
    errorMessage: string;
    finishedAt: string;
    refundedAt: string;
    createdAt: string;
    updatedAt: string;
    user?: AdminUserSummary;
    frontendTrace?: AdminAITaskFrontendTrace;
    frontendArtifacts?: AdminAITaskFrontendArtifact[];
};

export type AdminAITaskFrontendTrace = {
    projectId?: string;
    canvasId?: string;
    nodeId?: string;
    assetId?: string;
    storyboardGroupId?: string;
    storyboardShotId?: string;
    shotGroupId?: string;
    shotIds?: string[];
    source?: string;
};

export type AdminAITaskFrontendArtifact = AdminAITaskFrontendTrace & {
    kind?: string;
    createdAt?: string;
};

export type AdminAITaskListResponse = {
    items: AdminAITask[];
    total: number;
};

export type AdminAITaskDetailResponse = {
    task: AdminAITask;
    user: AdminUser;
    creditLogs: AdminCreditLog[];
};

export type AdminAIUsagePeriod = "day" | "week" | "month";

export type AdminAIUsagePeriodSummary = {
    key: AdminAIUsagePeriod;
    startAt: string;
    endAt: string;
    netCredits: number;
    usageCount: number;
    userCount: number;
};

export type AdminAIUsageUser = {
    userId: string;
    user?: AdminUserSummary;
    netCredits: number;
    usageCount: number;
    ratio: number;
};

export type AdminAIUsageSummaryResponse = {
    periods: AdminAIUsagePeriodSummary[];
    selectedPeriod: AdminAIUsagePeriod;
    users: AdminAIUsageUser[];
    userTotal: number;
    page: number;
    pageSize: number;
};

export type AdminUserQuery = {
    keyword?: string;
    page?: number;
    pageSize?: number;
};

export type AdminAITaskQuery = AdminUserQuery & {
    user?: string;
    status?: string;
    kind?: string;
    actionType?: string;
    model?: string;
    provider?: string;
    upstreamTaskId?: string;
    startAt?: string;
    endAt?: string;
};

export async function fetchAdminUsers(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminUserListResponse>("/api/admin/users", compactApiParams(query), token);
}

export type AdminUserOverview = {
    user: AdminUser;
    aiTaskCount: number;
    aiCreditsConsumed: number;
    creditLogCount: number;
};

export function fetchAdminUser(token: string, id: string) {
    return apiGet<AdminUserOverview>(`/api/admin/users/${encodeURIComponent(id)}`, undefined, token);
}

export function fetchAdminUserAITasks(token: string, id: string, query: AdminAITaskQuery) {
    return apiGet<AdminAITaskListResponse>(`/api/admin/users/${encodeURIComponent(id)}/ai-tasks`, compactApiParams(query), token);
}

export function fetchAdminUserCreditLogs(token: string, id: string, query: AdminUserQuery) {
    return apiGet<AdminCreditLogListResponse>(`/api/admin/users/${encodeURIComponent(id)}/credit-logs`, compactApiParams(query), token);
}

export type AdminUserActivity = {
    id: string;
    userId: string;
    category: string;
    action: string;
    result: "success" | "failed" | "rejected";
    targetType: string;
    targetId: string;
    targetName: string;
    summary: string;
    ipAddress: string;
    ipAllowed: boolean;
    sessionId: string;
    loginApprovalId: string;
    userAgent: string;
    metadata: string;
    createdAt: string;
};
export type AdminUserActivityQuery = AdminUserQuery & { category?: string; action?: string; result?: string; ipAddress?: string; outsideIP?: boolean; startAt?: string; endAt?: string };
export function fetchAdminUserActivities(token: string, id: string, query: AdminUserActivityQuery) {
    return apiGet<{ items: AdminUserActivity[]; total: number }>(`/api/admin/users/${encodeURIComponent(id)}/activity-logs`, compactApiParams({ ...query, outsideIP: query.outsideIP ? "true" : undefined }), token);
}

export async function saveAdminUser(token: string, user: Partial<AdminUser> & { password?: string }) {
    return apiPost<AdminUser>("/api/admin/users", user, token);
}

export async function adjustAdminUserCredits(token: string, id: string, credits: number) {
    return apiPost<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/credits`, { credits }, token);
}

export async function deleteAdminUser(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/users/${encodeURIComponent(id)}`, token);
}

export type AdminAllowedIP = { id: string; userId: string; cidr: string; createdBy: string; createdAt: string };
export type AdminLoginApproval = {
    id: string;
    userId: string;
    user: AdminUserSummary;
    requestedIp: string;
    userAgent: string;
    status: "pending" | "approved" | "rejected" | "consumed" | "expired";
    scope: "once" | "whitelist" | "";
    decidedBy: string;
    decidedAt: string;
    expiresAt: string;
    createdAt: string;
};
export function fetchAdminLoginApprovals(token: string, query: AdminUserQuery & { status?: string }) {
    return apiGet<{ items: AdminLoginApproval[]; total: number }>("/api/admin/login-approvals", compactApiParams(query), token);
}
export function decideAdminLoginApproval(token: string, id: string, approve: boolean, scope?: "once" | "whitelist") {
    return apiPost<AdminLoginApproval>(`/api/admin/login-approvals/${encodeURIComponent(id)}/decision`, { approve, scope }, token);
}
export function fetchAdminUserAllowedIPs(token: string, userId: string) {
    return apiGet<AdminAllowedIP[]>(`/api/admin/users/${encodeURIComponent(userId)}/allowed-ips`, undefined, token);
}
export function addAdminUserAllowedIP(token: string, userId: string, cidr: string) {
    return apiPost<AdminAllowedIP>(`/api/admin/users/${encodeURIComponent(userId)}/allowed-ips`, { cidr }, token);
}
export function deleteAdminUserAllowedIP(token: string, userId: string, id: string) {
    return apiDelete<boolean>(`/api/admin/users/${encodeURIComponent(userId)}/allowed-ips/${encodeURIComponent(id)}`, token);
}
export function setAdminUserIPPolicy(token: string, userId: string, enabled: boolean) {
    return apiPut<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/ip-policy`, { enabled }, token);
}

export async function fetchAdminCreditLogs(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminCreditLogListResponse>("/api/admin/credit-logs", compactApiParams(query), token);
}

export async function saveAdminCreditLog(token: string, log: Partial<AdminCreditLog>) {
    return apiPost<AdminCreditLog>("/api/admin/credit-logs", log, token);
}

export async function deleteAdminCreditLog(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/credit-logs/${encodeURIComponent(id)}`, token);
}

export async function fetchAdminAITasks(token: string, query: AdminAITaskQuery = {}) {
    return apiGet<AdminAITaskListResponse>("/api/admin/ai-tasks", compactApiParams(query), token);
}

export async function fetchAdminAIUsageSummary(token: string, query: { period: AdminAIUsagePeriod; page: number; pageSize: number }) {
    return apiGet<AdminAIUsageSummaryResponse>("/api/admin/ai-usage-summary", compactApiParams(query), token);
}

export async function fetchAdminAITask(token: string, id: string) {
    return apiGet<AdminAITaskDetailResponse>(`/api/admin/ai-tasks/${encodeURIComponent(id)}`, undefined, token);
}

export async function refreshAdminAITask(token: string, id: string) {
    return apiPost<AdminAITask>(`/api/admin/ai-tasks/${encodeURIComponent(id)}/refresh`, {}, token);
}

export async function refundAdminAITask(token: string, id: string) {
    return apiPost<AdminAITask>(`/api/admin/ai-tasks/${encodeURIComponent(id)}/refund`, {}, token);
}

export async function fetchAdminPromptCategories(token: string) {
    return apiGet<AdminPromptCategory[]>("/api/admin/prompt-categories", undefined, token);
}

export async function syncAdminPromptCategory(token: string, category: string) {
    return apiPost<AdminPromptCategory[]>("/api/admin/prompt-categories/sync", { category }, token);
}

export type AdminPromptQuery = {
    keyword?: string;
    category?: string;
    tag?: string[];
    nodeGroup?: string;
    type?: string;
    scenario?: string;
    favorite?: boolean;
    page?: number;
    pageSize?: number;
};

export type AdminAsset = {
    id: string;
    title: string;
    type: "text" | "image" | "video" | "audio";
    coverUrl: string;
    tags: string[];
    category: string;
    description: string;
    content: string;
    url: string;
    volcengineAssetId?: string;
    volcengineGroupId?: string;
    volcengineProjectName?: string;
    volcengineStatus?: string;
    volcengineError?: string;
    volcenginePublicUrl?: string;
    volcengineSubmittedAt?: string;
    volcengineUpdatedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminAssetUploadResult = {
    type: AdminAsset["type"];
    url: string;
    coverUrl: string;
    mimeType: string;
    bytes: number;
    filename: string;
};

export type AdminAssetListResponse = {
    items: AdminAsset[];
    tags: string[];
    total: number;
};

export async function fetchAdminPrompts(token: string, query: AdminPromptQuery = {}) {
    return apiGet<PromptListResponse>("/api/admin/prompts", compactApiParams({ ...query, favorite: query.favorite ? "true" : undefined }), token);
}

export async function saveAdminPrompt(token: string, prompt: Partial<Prompt>) {
    return apiPost<Prompt>("/api/admin/prompts", prompt, token);
}

export async function deleteAdminPrompt(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/prompts/${encodeURIComponent(id)}`, token);
}

export async function deleteAdminPrompts(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/prompts/batch-delete", { ids }, token);
}

export type AdminAssetQuery = {
    keyword?: string;
    type?: string;
    tag?: string[];
    page?: number;
    pageSize?: number;
};

export async function fetchAdminAssets(token: string, query: AdminAssetQuery = {}) {
    return apiGet<AdminAssetListResponse>("/api/admin/assets", compactApiParams(query), token);
}

export async function saveAdminAsset(token: string, asset: Partial<AdminAsset>) {
    return apiPost<AdminAsset>("/api/admin/assets", asset, token);
}

export async function uploadAdminAssetMedia(token: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return apiPostForm<AdminAssetUploadResult>("/api/admin/assets/upload", form, token);
}

export async function submitAdminAssetVolcengineReview(token: string, id: string) {
    return apiPost<AdminAsset>(`/api/admin/assets/${encodeURIComponent(id)}/volcengine-review`, {}, token);
}

export async function refreshAdminAssetVolcengineReview(token: string, id: string) {
    return apiPost<AdminAsset>(`/api/admin/assets/${encodeURIComponent(id)}/volcengine-review/refresh`, {}, token);
}

export async function deleteAdminAsset(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/assets/${encodeURIComponent(id)}`, token);
}

export type AdminModelChannel = {
    id: string;
    protocol: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
    name: string;
    baseUrl: string;
    apiKey: string;
    cliPath: string;
    workDir: string;
    outputDir: string;
    timeoutSeconds: number;
    sessionId: number;
    concurrencyLimit: number;
    endpointId: string;
    endpointMappings: AdminModelEndpointMapping[];
    models: string[];
    capabilities: string[];
    environment: "dev" | "test" | "prod";
    weight: number;
    enabled: boolean;
    remark: string;
};

export type AdminModelEndpointMapping = {
    model: string;
    endpointId: string;
};

export type AdminPublicModelChannelSettings = {
    availableModels: string[];
    modelCosts: AdminModelCost[];
    modelTextEndpoints: AdminModelTextEndpoint[];
    modelProtocols?: AdminModelProtocol[];
    modelCapabilities?: AdminModelCapability[];
    modelSources?: AdminModelSource[];
    defaultModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    defaultTextModel: string;
    systemPrompt: string;
    allowCustomChannel: boolean;
};

export type AdminModelCost = {
    model: string;
    credits: number;
};

export type AdminModelTextEndpoint = {
    model: string;
    endpointType: "chat_completions" | "responses";
};

export type AdminModelProtocol = {
    model: string;
    protocol: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
};

export type AdminModelCapability = {
    model: string;
    capabilities: string[];
};

export type AdminModelSource = {
    model: string;
    channelId: string;
    channelName: string;
    protocol: "openai" | "volcengine-ark" | "jimeng-cli" | "xinglian-cloud";
};

export type AdminPublicVolcengineAssetSettings = { enabled: boolean };

export type AdminPrivateVolcengineAssetSettings = {
    enabled: boolean;
    accessKey: string;
    secretKey: string;
    accessKeyConfigured: boolean;
    secretKeyConfigured: boolean;
    projectName: string;
    region: string;
    assetGroupId: string;
    publicAssetBaseUrl: string;
};

export type AdminPublicSettings = {
    modelChannel: AdminPublicModelChannelSettings;
    auth: {
        allowRegister: boolean;
    };
    volcengineAsset: AdminPublicVolcengineAssetSettings;
};

export type AdminPrivateSettings = {
    channels: AdminModelChannel[];
    promptSync: {
        enabled: boolean;
        cron: string;
    };
    auth: Record<string, never>;
    volcengineAsset: AdminPrivateVolcengineAssetSettings;
};

export type AdminSettings = {
    public: AdminPublicSettings;
    private: AdminPrivateSettings;
};

export async function fetchAdminSettings(token: string) {
    return apiGet<AdminSettings>("/api/admin/settings", undefined, token);
}

export async function saveAdminSettings(token: string, settings: AdminSettings) {
    return apiPost<AdminSettings>("/api/admin/settings", settings, token);
}

export type AdminChannelActionRequest = {
    index?: number;
    channel: AdminModelChannel;
    model?: string;
};

export async function fetchChannelModels(token: string, payload: AdminChannelActionRequest) {
    return apiPost<string[]>("/api/admin/settings/channel-models", payload, token);
}

export async function testChannelModel(token: string, payload: AdminChannelActionRequest) {
    return apiPost<string>("/api/admin/settings/channel-test", payload, token);
}
