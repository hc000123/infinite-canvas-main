export type AgentCenterSession = {
    selectedAgentId: string;
    activeTab: "definition" | "run";
};

type AgentCenterSessionStorage = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
};

export function agentCenterSessionKey(projectId: string) {
    return `project:${projectId}:agent-center`;
}

export function loadAgentCenterSession(storage: AgentCenterSessionStorage, projectId: string) {
    return storage.getItem<AgentCenterSession>(agentCenterSessionKey(projectId));
}

export function saveAgentCenterSession(storage: AgentCenterSessionStorage, projectId: string, session: AgentCenterSession) {
    return storage.setItem(agentCenterSessionKey(projectId), session);
}
