type ScriptSkillSelectionStorage = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
};

export function scriptSkillSelectionKey(projectId: string, episodeId: string) {
    return `project:${projectId}:episode:${episodeId}:script-skill`;
}

export function loadScriptSkillSelection(storage: ScriptSkillSelectionStorage, projectId: string, episodeId: string) {
    return storage.getItem<string>(scriptSkillSelectionKey(projectId, episodeId));
}

export function saveScriptSkillSelection(storage: ScriptSkillSelectionStorage, projectId: string, episodeId: string, skillVersionId: string) {
    return storage.setItem(scriptSkillSelectionKey(projectId, episodeId), skillVersionId);
}
