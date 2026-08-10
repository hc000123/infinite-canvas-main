import type { AiModelKind } from "../../../../lib/ai-model-kind.ts";
import type { AdminModelChannel, AdminModelTextEndpoint, AdminPublicModelChannelSettings, AdminSettings } from "../../../../services/api/admin.ts";
import { isRoutableModelChannel, modelChannelHasCapability, sanitizeModelChannelPublication } from "./model-channel-publication.ts";

export type WizardPublicSelection = {
    publishedModels: string[];
    defaultTextModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    modelTextEndpoints: Partial<AdminModelTextEndpoint>[];
};

export type WizardChannelDraft = Partial<AdminModelChannel> & {
    discoveredModels?: string[];
    manualModels?: string[];
};

const emptyChannel: AdminModelChannel = {
    id: "",
    protocol: "openai",
    name: "",
    baseUrl: "",
    apiKey: "",
    cliPath: "",
    workDir: "",
    outputDir: "",
    timeoutSeconds: 0,
    sessionId: 0,
    concurrencyLimit: 1,
    endpointId: "",
    endpointMappings: [],
    models: [],
    capabilities: [],
    environment: "dev",
    weight: 1,
    enabled: true,
    remark: "",
};

export function normalizeWizardModels(values: readonly string[] = []) {
    const seen = new Set<string>();
    return values.map((value) => value.trim()).filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

export function dedicatedVideoProtocol(protocol: AdminModelChannel["protocol"]) {
    return protocol === "jimeng-cli" || protocol === "xinglian-cloud" || protocol === "minimax";
}

export function protocolScopedWizardCapabilities(protocol: AdminModelChannel["protocol"], capabilities: readonly string[] = []) {
    return dedicatedVideoProtocol(protocol) ? ["video"] : normalizeWizardModels(capabilities);
}

export type WizardProtocolCapabilityDrafts = Partial<Record<AdminModelChannel["protocol"], string[]>>;

export function switchWizardProtocolCapabilities(
    drafts: WizardProtocolCapabilityDrafts,
    currentProtocol: AdminModelChannel["protocol"],
    nextProtocol: AdminModelChannel["protocol"],
    currentCapabilities: readonly string[] = [],
) {
    const nextDrafts = { ...drafts };
    if (!dedicatedVideoProtocol(currentProtocol)) nextDrafts[currentProtocol] = normalizeWizardModels(currentCapabilities);
    return {
        drafts: nextDrafts,
        capabilities: protocolScopedWizardCapabilities(nextProtocol, nextDrafts[nextProtocol] ?? currentCapabilities),
    };
}

export function buildWizardChannel(existing: AdminModelChannel | undefined, draft: WizardChannelDraft): AdminModelChannel {
    const protocol = draft.protocol ?? existing?.protocol ?? emptyChannel.protocol;
    const requestedModels = normalizeWizardModels([...(draft.models ?? existing?.models ?? []), ...(draft.discoveredModels || []), ...(draft.manualModels || [])]);
    const endpointMappings = protocol === "volcengine-ark" ? buildArkMappings(draft.endpointMappings ?? existing?.endpointMappings ?? []) : [];
    const apiKey = protocol === "jimeng-cli" ? "" : keepSecret(existing?.apiKey, draft.apiKey);

    const result: AdminModelChannel = {
        id: draft.id?.trim() || existing?.id?.trim() || emptyChannel.id,
        protocol,
        name: (draft.name ?? existing?.name ?? emptyChannel.name).trim(),
        baseUrl: protocol === "jimeng-cli" ? "" : (draft.baseUrl ?? existing?.baseUrl ?? emptyChannel.baseUrl).trim(),
        apiKey,
        cliPath: (draft.cliPath ?? existing?.cliPath ?? emptyChannel.cliPath).trim(),
        workDir: (draft.workDir ?? existing?.workDir ?? emptyChannel.workDir).trim(),
        outputDir: (draft.outputDir ?? existing?.outputDir ?? emptyChannel.outputDir).trim(),
        timeoutSeconds: Math.max(0, Number(draft.timeoutSeconds ?? existing?.timeoutSeconds ?? emptyChannel.timeoutSeconds) || 0),
        sessionId: Math.max(0, Number(draft.sessionId ?? existing?.sessionId ?? emptyChannel.sessionId) || 0),
        concurrencyLimit: Math.max(1, Number(draft.concurrencyLimit ?? existing?.concurrencyLimit ?? emptyChannel.concurrencyLimit) || 1),
        endpointId: protocol === "volcengine-ark" ? endpointMappings[0]?.endpointId || "" : "",
        endpointMappings,
        models: protocol === "volcengine-ark" ? endpointMappings.map((item) => item.model) : requestedModels,
        capabilities: protocolScopedWizardCapabilities(protocol, draft.capabilities ?? existing?.capabilities ?? emptyChannel.capabilities),
        environment: normalizeEnvironment(draft.environment ?? existing?.environment),
        weight: Math.max(1, Number(draft.weight ?? existing?.weight ?? emptyChannel.weight) || 1),
        enabled: draft.enabled ?? existing?.enabled ?? emptyChannel.enabled,
        remark: draft.remark ?? existing?.remark ?? emptyChannel.remark,
    };
    if (!result.models.length) throw new Error("请配置至少一个模型");
    return result;
}

export function buildWizardProspectiveChannel(
    base: AdminModelChannel,
    draft: Pick<WizardChannelDraft, "protocol" | "baseUrl" | "apiKey" | "models" | "capabilities" | "enabled">,
): AdminModelChannel {
    const protocol = draft.protocol ?? base.protocol;
    return {
        ...base,
        protocol,
        baseUrl: protocol === "jimeng-cli" ? "" : (draft.baseUrl ?? base.baseUrl).trim(),
        apiKey: protocol === "jimeng-cli" ? "" : keepSecret(base.apiKey, draft.apiKey),
        models: normalizeWizardModels(draft.models ?? base.models),
        capabilities: protocolScopedWizardCapabilities(protocol, draft.capabilities ?? base.capabilities),
        enabled: draft.enabled ?? base.enabled,
    };
}

function normalizeEnvironment(value: AdminModelChannel["environment"] | undefined) {
    return value === "test" || value === "prod" ? value : "dev";
}

export function applyWizardPublication(
    current: AdminPublicModelChannelSettings,
    previousChannel: AdminModelChannel | undefined,
    nextChannel: AdminModelChannel,
    siblingChannels: AdminModelChannel[],
    selection: WizardPublicSelection,
): AdminPublicModelChannelSettings {
    const previousModels = normalizeWizardModels(previousChannel?.models || []);
    const nextModels = nextChannel.enabled ? normalizeWizardModels(nextChannel.models) : [];
    const selectedModels = new Set(normalizeWizardModels(selection.publishedModels).filter((model) => nextModels.includes(model)));
    const siblings = siblingChannels.filter(isRoutableModelChannel);
    const availableModels = normalizeWizardModels(current.availableModels).filter((model) => {
        if (!previousModels.includes(model)) return true;
        return selectedModels.has(model) || siblings.some((channel) => normalizeWizardModels(channel.models).includes(model));
    });
    selectedModels.forEach((model) => {
        if (!availableModels.includes(model)) availableModels.push(model);
    });
    const hasCapability = (model: string, capability: AiModelKind) => [...siblings, nextChannel]
        .filter((channel) => isRoutableModelChannel(channel) && normalizeWizardModels(channel.models).includes(model))
        .some((channel) => modelChannelHasCapability(channel, capability));
    const textModels = availableModels.filter((model) => hasCapability(model, "text"));
    const requestedEndpoints = new Map(normalizeTextEndpoints(selection.modelTextEndpoints));
    const currentEndpoints = new Map((current.modelTextEndpoints || [])
        .map((item) => ({ model: item.model.trim(), endpointType: item.endpointType }))
        .filter((item, index, items) => item.model && textModels.includes(item.model) && items.findIndex((candidate) => candidate.model === item.model) === index)
        .map((item) => [item.model, item.endpointType] as const));
    const modelTextEndpoints = textModels.map((model) => ({
        model,
        endpointType: selectedModels.has(model) ? requestedEndpoints.get(model) || "chat_completions" : requestedEndpoints.get(model) || currentEndpoints.get(model) || "chat_completions",
    }));
    const defaultTextModel = resolveDefault(selection.defaultTextModel, current.defaultTextModel, availableModels, hasCapability, "text");

    return sanitizeModelChannelPublication({
        ...current,
        availableModels,
        modelTextEndpoints,
        defaultTextModel,
        defaultImageModel: resolveDefault(selection.defaultImageModel, current.defaultImageModel, availableModels, hasCapability, "image"),
        defaultVideoModel: resolveDefault(selection.defaultVideoModel, current.defaultVideoModel, availableModels, hasCapability, "video"),
    }, [...siblingChannels, nextChannel]);
}

export function channelVerificationMode(channel: AdminModelChannel) {
    if (channel.protocol === "volcengine-ark" || channel.protocol === "jimeng-cli" || channel.protocol === "xinglian-cloud") return "preflight" as const;
    return channel.capabilities.some((capability) => capability.trim().toLowerCase() === "video") ? "connectivity" as const : "model-test" as const;
}

export function channelVerificationCopy(channel: AdminModelChannel) {
    const mode = channelVerificationMode(channel);
    if (mode === "connectivity") {
        return {
            tableLabel: "连接检测",
            modalLabel: "连接检测",
            actionLabel: "检测",
            batchLabel: "批量检测",
            description: "连接检测只读模型列表，不创建视频任务、不扣视频额度。",
        };
    }
    if (mode === "model-test") {
        return {
            tableLabel: "模型测试",
            modalLabel: "模型测试",
            actionLabel: "测试",
            batchLabel: "批量测试",
            description: "测试会向选中模型发送一条 hi，用于确认渠道是否有响应。",
        };
    }
    const description = channel.protocol === "volcengine-ark"
        ? "企业 Ark / Seedance 只验证 API Key、Base URL 和模型到火山 Endpoint / EP 的映射，不创建视频任务或扣除额度。"
        : channel.protocol === "jimeng-cli"
          ? "即梦 CLI 只检查 CLI 安装、登录态、输出目录和模型版本，不创建视频任务或扣除额度。"
          : "星链云只查询 API Key 对应账户余额，不创建视频任务或扣除额度。";
    return {
        tableLabel: "视频预检",
        modalLabel: "视频预检",
        actionLabel: "预检",
        batchLabel: "批量预检",
        description,
    };
}

export type ChannelVerificationRunResult = {
    model: string;
    status: "success" | "error";
    message?: string;
    error?: unknown;
    durationMs: number;
};

export async function runChannelVerification(
    channel: AdminModelChannel,
    models: string[],
    actions: { connect: () => Promise<string>; testModel: (model: string) => Promise<string> },
): Promise<ChannelVerificationRunResult[]> {
    const selectedModels = normalizeWizardModels(models);
    if (!selectedModels.length) return [];
    if (channelVerificationMode(channel) === "connectivity") {
        const startedAt = performance.now();
        try {
            const message = await actions.connect();
            const durationMs = performance.now() - startedAt;
            return selectedModels.map((model) => ({ model, status: "success", message, durationMs }));
        } catch (error) {
            const durationMs = performance.now() - startedAt;
            return selectedModels.map((model) => ({ model, status: "error", error, durationMs }));
        }
    }
    const results: ChannelVerificationRunResult[] = [];
    for (const model of selectedModels) {
        const startedAt = performance.now();
        try {
            results.push({ model, status: "success", message: await actions.testModel(model), durationMs: performance.now() - startedAt });
        } catch (error) {
            results.push({ model, status: "error", error, durationMs: performance.now() - startedAt });
        }
    }
    return results;
}

export type ChannelVerificationRequest = {
    session: number;
    requestId: number;
    channelIndex: number;
    channelId: string;
    lockKeys: string[];
};

export type ModelDiscoveryRequest = {
    session: number;
    requestId: number;
};

export function createModelDiscoveryCoordinator() {
    let session = 0;
    let nextRequestId = 0;
    let latestRequestId = 0;
    let connectionKey = "";
    const sync = (channel: AdminModelChannel) => {
        const nextKey = modelDiscoveryConnectionKey(channel);
        if (nextKey === connectionKey) return false;
        session += 1;
        latestRequestId = 0;
        connectionKey = nextKey;
        return true;
    };
    return {
        reset() {
            session += 1;
            latestRequestId = 0;
            connectionKey = "";
        },
        sync,
        begin(channel: AdminModelChannel): ModelDiscoveryRequest {
            sync(channel);
            latestRequestId = ++nextRequestId;
            return { session, requestId: latestRequestId };
        },
        isCurrent(request: ModelDiscoveryRequest, channel: AdminModelChannel) {
            return request.session === session
                && request.requestId === latestRequestId
                && connectionKey === modelDiscoveryConnectionKey(channel);
        },
    };
}

export function modelDiscoveryCandidates(configuredModels: string[], discoveredModels: string[]) {
    return normalizeWizardModels([...configuredModels, ...discoveredModels]);
}

export function configuredModelsFromSettings(settings: AdminSettings) {
    return normalizeWizardModels([
        ...(settings.public.modelChannel.availableModels || []),
        ...settings.private.channels.flatMap((channel) => channel.models || []),
    ]);
}

type AuthoritativeSettingsRequest = { generation: number; session: number };
type AuthoritativeSettingsOperationKind = "queue" | "read" | "snapshot" | "delete";
const settingsBusyMessage = "设置正在读取或保存，请稍后再试";
let authoritativeExecutionTail = Promise.resolve();
let queuedDeletes = 0;

async function runAuthoritativeSettingsExclusive<T>(operation: () => Promise<T>, isValid: () => boolean, kind: AuthoritativeSettingsOperationKind) {
    const previous = authoritativeExecutionTail;
    let release!: () => void;
    authoritativeExecutionTail = new Promise<void>((resolve) => { release = resolve; });
    if (kind === "delete") queuedDeletes += 1;
    await previous;
    try {
        if (!isValid()) return { executed: false as const };
        return { executed: true as const, value: await operation() };
    } finally {
        if (kind === "delete") queuedDeletes -= 1;
        release();
    }
}

export function createAuthoritativeSettingsCoordinator() {
    let generation = 0;
    let session = 0;
    let active: { request: AuthoritativeSettingsRequest; setPending?: (pending: boolean) => void } | undefined;
    return {
        assertCanBegin(kind: AuthoritativeSettingsOperationKind) {
            if (kind === "snapshot" && queuedDeletes > 0) throw new Error(settingsBusyMessage);
        },
        begin(setPending?: (pending: boolean) => void) {
            active?.setPending?.(false);
            const request = { generation: ++generation, session };
            active = { request, setPending };
            setPending?.(true);
            return request;
        },
        isCurrent: (request: AuthoritativeSettingsRequest) => request.generation === generation && request.session === session,
        runExclusive<T>(request: AuthoritativeSettingsRequest, operation: () => Promise<T>, kind: AuthoritativeSettingsOperationKind) {
            return runAuthoritativeSettingsExclusive(operation, () => request.session === session, kind);
        },
        finish(request: AuthoritativeSettingsRequest) {
            if (request.generation !== generation || request.session !== session || active?.request !== request) return;
            active.setPending?.(false);
            active = undefined;
        },
        reset() {
            generation += 1;
            session += 1;
            active = undefined;
        },
    };
}

export async function syncConfiguredModelsFromAuthoritativeSettings(
    coordinator: ReturnType<typeof createAuthoritativeSettingsCoordinator>,
    loadSettings: () => Promise<AdminSettings>,
    applySettings: (models: string[], settings: AdminSettings) => void,
    setPending?: (pending: boolean) => void,
    options: { kind?: AuthoritativeSettingsOperationKind } = {},
) {
    const kind = options.kind || "queue";
    coordinator.assertCanBegin(kind);
    const request = coordinator.begin(setPending);
    try {
        const result = await coordinator.runExclusive(request, loadSettings, kind);
        if (!result.executed) return false;
        const settings = result.value;
        if (!coordinator.isCurrent(request)) return false;
        applySettings(configuredModelsFromSettings(settings), settings);
        return true;
    } catch (error) {
        if (!coordinator.isCurrent(request)) return false;
        throw error;
    } finally {
        coordinator.finish(request);
    }
}

export async function persistAuthoritativeSettingsMutation(
    loadSettings: () => Promise<AdminSettings>,
    saveSettings: (settings: AdminSettings) => Promise<AdminSettings>,
    mutate: (settings: AdminSettings) => AdminSettings,
) {
    return saveSettings(mutate(await loadSettings()));
}

export async function finishAuthoritativeSettingsOperation(
    operation: () => Promise<boolean>,
    onCurrent: () => void,
) {
    const current = await operation();
    if (current) onCurrent();
    return current;
}

export async function runModelDiscoveryRequest(
    coordinator: ReturnType<typeof createModelDiscoveryCoordinator>,
    draft: AdminModelChannel,
    actions: {
        discover: (draft: AdminModelChannel) => Promise<string[]>;
        getCurrentDraft: () => AdminModelChannel;
        setDiscoveredModels: (models: string[]) => void;
        setLoading: (loading: boolean) => void;
        onSuccess?: (models: string[]) => void;
        onError?: (error: unknown) => void;
    },
) {
    const request = coordinator.begin(draft);
    actions.setLoading(true);
    try {
        const result = normalizeWizardModels(await actions.discover(draft));
        if (!coordinator.isCurrent(request, actions.getCurrentDraft())) return;
        actions.setDiscoveredModels(result);
        actions.onSuccess?.(result);
    } catch (error) {
        if (coordinator.isCurrent(request, actions.getCurrentDraft())) actions.onError?.(error);
    } finally {
        if (coordinator.isCurrent(request, actions.getCurrentDraft())) actions.setLoading(false);
    }
}

export function createChannelVerificationCoordinator() {
    let session = 0;
    let nextRequestId = 0;
    const locks = new Map<string, number>();
    const ownsLocks = (request: ChannelVerificationRequest) => request.lockKeys.every((key) => locks.get(key) === request.requestId);
    return {
        reset() {
            session += 1;
            locks.clear();
        },
        begin(channelIndex: number, channel: AdminModelChannel, models: string[]): ChannelVerificationRequest | null {
            const selectedModels = normalizeWizardModels(models);
            const lockNames = channelVerificationMode(channel) === "connectivity" ? ["connectivity"] : selectedModels.map((model) => `model:${model}`);
            if (!lockNames.length) return null;
            const lockKeys = lockNames.map((name) => `${channelIndex}:${channel.id}:${name}`);
            if (lockKeys.some((key) => locks.has(key))) return null;
            const request = { session, requestId: ++nextRequestId, channelIndex, channelId: channel.id, lockKeys };
            lockKeys.forEach((key) => locks.set(key, request.requestId));
            return request;
        },
        isCurrent(request: ChannelVerificationRequest, channelIndex: number, channelId: string) {
            return request.session === session && request.channelIndex === channelIndex && request.channelId === channelId && ownsLocks(request);
        },
        finish(request: ChannelVerificationRequest) {
            if (request.session !== session || !ownsLocks(request)) return false;
            request.lockKeys.forEach((key) => {
                if (locks.get(key) === request.requestId) locks.delete(key);
            });
            return true;
        },
    };
}

function modelDiscoveryConnectionKey(channel: AdminModelChannel) {
    return JSON.stringify({
        protocol: channel.protocol,
        baseUrl: channel.baseUrl.trim(),
        apiKey: channel.apiKey.trim(),
        cliPath: channel.cliPath.trim(),
        workDir: channel.workDir.trim(),
        outputDir: channel.outputDir.trim(),
        timeoutSeconds: channel.timeoutSeconds,
        sessionId: channel.sessionId,
        concurrencyLimit: channel.concurrencyLimit,
    });
}

export function filterWizardPublicationSnapshot(current: AdminPublicModelChannelSettings, channels: AdminModelChannel[]): AdminPublicModelChannelSettings {
    return sanitizeModelChannelPublication(current, channels);
}

function buildArkMappings(mappings: Partial<AdminModelChannel["endpointMappings"][number]>[]) {
    const result: AdminModelChannel["endpointMappings"] = [];
    const seen = new Set<string>();
    mappings.forEach((item) => {
        const model = item.model?.trim() || "";
        if (!model || seen.has(model)) return;
        seen.add(model);
        const endpointId = item.endpointId?.trim() || "";
        if (!endpointId) throw new Error(`${model} 缺少 Endpoint / EP`);
        result.push({ model, endpointId });
    });
    return result;
}

function keepSecret(existing: string | undefined, draft: string | undefined) {
    const value = (draft || "").trim();
    return !value || /^\*+$/.test(value) ? existing || "" : value;
}

function normalizeTextEndpoints(values: Partial<AdminModelTextEndpoint>[]) {
    const result = new Map<string, AdminModelTextEndpoint["endpointType"]>();
    values.forEach((item) => {
        const model = item.model?.trim() || "";
        if (model && !result.has(model)) result.set(model, item.endpointType === "responses" ? "responses" : "chat_completions");
    });
    return result;
}

function resolveDefault(
    requested: string,
    current: string,
    availableModels: string[],
    hasCapability: (model: string, capability: AiModelKind) => boolean,
    capability: AiModelKind,
) {
    const candidates = [requested, current].map((model) => model.trim());
    return candidates.find((model) => model && availableModels.includes(model) && hasCapability(model, capability)) || "";
}
