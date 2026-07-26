export type AgentRunSession = {
    planId: string;
    sourceText: string;
    episodeId: string;
    goal: string;
};

type AgentRunSessionStorage = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
};

export function agentRunSessionKey(projectId: string, agentId: string) {
    return `project:${projectId}:agent:${agentId}:recent-plan`;
}

export function loadAgentRunSession(storage: AgentRunSessionStorage, projectId: string, agentId: string) {
    return storage.getItem<AgentRunSession>(agentRunSessionKey(projectId, agentId));
}

export function saveAgentRunSession(storage: AgentRunSessionStorage, projectId: string, agentId: string, session: AgentRunSession) {
    return storage.setItem(agentRunSessionKey(projectId, agentId), session);
}
