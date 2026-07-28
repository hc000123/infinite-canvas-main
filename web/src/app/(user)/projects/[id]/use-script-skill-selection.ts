"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSkillOptions } from "@/services/api/admin-skills";
import { fetchAgents } from "@/services/api/agent-registry";
import { useUserStore } from "@/stores/use-user-store";
import { compatibleScriptSkillOptions, resolveScriptSkillVersionId } from "../script-skill-selection";
import type { ScriptAgentRef } from "../script-agent-runtime";
import { loadScriptSkillSelection, saveScriptSkillSelection } from "./script-skill-selection-session";
import { scriptSkillSelectionStorage } from "./script-skill-selection-session-storage";

export function useScriptSkillSelection(projectId: string, episodeIds: string[]) {
    const token = useUserStore((state) => state.token);
    const [episodeVersionIds, setEpisodeVersionIds] = useState<Record<string, string>>({});
    const [importVersionId, setImportVersionId] = useState("");
    const [loadedSignature, setLoadedSignature] = useState("");
    const [selectionNotice, setSelectionNotice] = useState("");
    const agentsQuery = useQuery({ queryKey: ["script-agent", projectId], queryFn: () => fetchAgents(projectId), enabled: Boolean(token && projectId), retry: false });
    const skillsQuery = useQuery({ queryKey: ["script-skill-options", projectId], queryFn: () => fetchSkillOptions(token, { projectId, inputArtifactType: "source_text", outputArtifactType: "production_script" }), enabled: Boolean(token && projectId), retry: false });
    const item = useMemo(() => (agentsQuery.data || []).find((candidate) => candidate.agent.id === "agent-system-script" && candidate.agent.recommendedVersionId && candidate.recommendedPackage), [agentsQuery.data]);
    const agentPackage = item?.recommendedPackage;
    const options = useMemo(() => agentPackage ? compatibleScriptSkillOptions(agentPackage, skillsQuery.data || []) : [], [agentPackage, skillsQuery.data]);
    const defaultVersionId = agentPackage ? resolveScriptSkillVersionId(agentPackage, options) : "";
    const episodeSignature = [...episodeIds].sort().join(",");
    const optionSignature = options.map((option) => option.skillVersionId).join(",");
    const signature = `${projectId}|${item?.agent.recommendedVersionId || ""}|${episodeSignature}|${optionSignature}`;

    useEffect(() => {
        if (!agentPackage || !options.length || loadedSignature === signature) return;
        let active = true;
        void Promise.all(episodeIds.map(async (episodeId) => {
            const saved = await loadScriptSkillSelection(scriptSkillSelectionStorage, projectId, episodeId);
            return { episodeId, saved, resolved: resolveScriptSkillVersionId(agentPackage, options, saved || "") };
        })).then((entries) => {
            if (!active) return;
            const next: Record<string, string> = {};
            let fellBack = false;
            for (const entry of entries) {
                next[entry.episodeId] = entry.resolved;
                fellBack ||= Boolean(entry.saved && entry.saved !== entry.resolved);
            }
            setEpisodeVersionIds(next);
            setSelectionNotice(fellBack ? "部分分集原先选择的 Skill 已失效，已回退到系统 Agent 默认版本。" : "");
            setLoadedSignature(signature);
        });
        return () => { active = false; };
    }, [agentPackage, episodeIds, loadedSignature, options, projectId, signature]);

    useEffect(() => {
        if (!options.some((option) => option.skillVersionId === importVersionId)) setImportVersionId(defaultVersionId);
    }, [defaultVersionId, importVersionId, options]);

    const setEpisodeVersionId = useCallback((episodeId: string, skillVersionId: string) => {
        if (!options.some((option) => option.skillVersionId === skillVersionId)) return;
        setEpisodeVersionIds((value) => ({ ...value, [episodeId]: skillVersionId }));
        void saveScriptSkillSelection(scriptSkillSelectionStorage, projectId, episodeId, skillVersionId);
    }, [options, projectId]);

    const agent: ScriptAgentRef | undefined = item ? { agentId: item.agent.id, agentVersionId: item.agent.recommendedVersionId } : undefined;
    const registryError = agentsQuery.error || skillsQuery.error;
    const error = registryError instanceof Error ? registryError : !agentsQuery.isLoading && agentsQuery.data && !item ? new Error("系统剧本制作 Agent 没有可用的推荐版本") : !skillsQuery.isLoading && agentPackage && skillsQuery.data && !options.length ? new Error("系统剧本制作 Agent 没有已授权且兼容的剧本 Skill") : undefined;

    return { agent, agentPackage, options, importVersionId, setImportVersionId, episodeVersionIds, setEpisodeVersionId, loading: agentsQuery.isLoading || skillsQuery.isLoading, error, selectionNotice, clearSelectionNotice: () => setSelectionNotice("") };
}
