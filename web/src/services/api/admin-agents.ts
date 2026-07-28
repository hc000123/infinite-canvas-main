import { apiGet, apiPatch, apiPost, apiPut } from "@/services/api/request";

import type { AgentDraftInput, AgentRegistryItem, AgentValidationResult, AgentVersion, AgentVersionDetail } from "./agent-registry";

const base = "/api/v1/admin";

export function fetchAdminAgents(token: string) {
    return apiGet<AgentRegistryItem[]>(`${base}/agents`, undefined, token);
}

export function fetchAdminAgentVersion(token: string, id: string) {
    return apiGet<AgentVersionDetail>(`${base}/agent-versions/${encodeURIComponent(id)}`, undefined, token);
}

export function createAdminAgentVersion(token: string, agentId: string, input: AgentDraftInput) {
    return apiPost<AgentVersion>(`${base}/agents/${encodeURIComponent(agentId)}/versions`, input, token);
}

export function updateAdminAgentVersion(token: string, id: string, input: AgentDraftInput) {
    return apiPatch<AgentVersion>(`${base}/agent-versions/${encodeURIComponent(id)}`, input, token);
}

export function validateAdminAgentVersion(token: string, id: string) {
    return apiPost<AgentValidationResult>(`${base}/agent-versions/${encodeURIComponent(id)}/validate`, {}, token);
}

export function publishAdminAgentVersion(token: string, id: string) {
    return apiPost<AgentVersionDetail>(`${base}/agent-versions/${encodeURIComponent(id)}/publish`, {}, token);
}

export function recommendAdminAgentVersion(token: string, agentId: string, agentVersionId: string) {
    return apiPut<AgentVersionDetail>(`${base}/agents/${encodeURIComponent(agentId)}/recommended-version`, { agentVersionId }, token);
}
