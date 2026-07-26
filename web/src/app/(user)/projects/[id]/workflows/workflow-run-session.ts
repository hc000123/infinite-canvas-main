export type WorkflowRunSession = {
    executionId: string;
    sourceText: string;
    episodeId: string;
};

type WorkflowRunSessionStorage = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
};

export function workflowRunSessionKey(projectId: string, workflowId: string) {
    return `project:${projectId}:workflow:${workflowId}:recent-execution`;
}

export function loadWorkflowRunSession(storage: WorkflowRunSessionStorage, projectId: string, workflowId: string) {
    return storage.getItem<WorkflowRunSession>(workflowRunSessionKey(projectId, workflowId));
}

export function saveWorkflowRunSession(storage: WorkflowRunSessionStorage, projectId: string, workflowId: string, session: WorkflowRunSession) {
    return storage.setItem(workflowRunSessionKey(projectId, workflowId), session);
}
