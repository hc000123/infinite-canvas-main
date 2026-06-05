import { apiDelete, apiGet, apiPost, apiPostForm, compactApiParams } from "@/services/api/request";
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
    role: "user" | "admin";
    credits: number;
    affCode: string;
    affCount: number;
    inviterId: string;
    linuxDoId: string;
    status: "active" | "ban";
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminUserListResponse = {
    items: AdminUser[];
    total: number;
};

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

export async function saveAdminUser(token: string, user: Partial<AdminUser> & { password?: string }) {
    return apiPost<AdminUser>("/api/admin/users", user, token);
}

export async function adjustAdminUserCredits(token: string, id: string, credits: number) {
    return apiPost<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/credits`, { credits }, token);
}

export async function deleteAdminUser(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/users/${encodeURIComponent(id)}`, token);
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
    protocol: "openai" | "volcengine-ark";
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
    weight: number;
    enabled: boolean;
    remark: string;
};

export type AdminPublicModelChannelSettings = {
    availableModels: string[];
    modelCosts: AdminModelCost[];
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

export type AdminPublicVolcengineAssetSettings = { enabled: boolean };

export type AdminPrivateVolcengineAssetSettings = {
    enabled: boolean;
    accessKey: string;
    secretKey: string;
    projectName: string;
    region: string;
    assetGroupId: string;
    publicAssetBaseUrl: string;
};

export type AdminPublicSettings = {
    modelChannel: AdminPublicModelChannelSettings;
    auth: {
        allowRegister: boolean;
        linuxDo: {
            enabled: boolean;
        };
    };
    volcengineAsset: AdminPublicVolcengineAssetSettings;
};

export type AdminPrivateSettings = {
    channels: AdminModelChannel[];
    promptSync: {
        enabled: boolean;
        cron: string;
    };
    auth: {
        linuxDo: {
            clientId: string;
            clientSecret: string;
        };
    };
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
