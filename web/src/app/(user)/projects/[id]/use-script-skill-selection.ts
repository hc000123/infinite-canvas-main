"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSkillOptions } from "@/services/api/admin-skills";
import { useUserStore } from "@/stores/use-user-store";
import { compatibleScriptSkillOptions, resolveScriptSkillVersionId } from "../script-skill-selection";
import { loadScriptSkillSelection, saveScriptSkillSelection } from "./script-skill-selection-session";
import { scriptSkillSelectionStorage } from "./script-skill-selection-session-storage";

export function useScriptSkillSelection(projectId: string, episodeIds: string[]) {
    const token = useUserStore((state) => state.token);
    const [episodeVersionIds, setEpisodeVersionIds] = useState<Record<string, string>>({});
    const [importVersionId, setImportVersionId] = useState("");
    const [loadedSignature, setLoadedSignature] = useState("");
    const [selectionNotice, setSelectionNotice] = useState("");
    const skillsQuery = useQuery({ queryKey: ["script-skill-options", projectId], queryFn: () => fetchSkillOptions(token, { projectId, inputArtifactType: "source_text", outputArtifactType: "production_script" }), enabled: Boolean(token && projectId), retry: false });
    const options = useMemo(() => compatibleScriptSkillOptions(skillsQuery.data || []), [skillsQuery.data]);
    const defaultVersionId = resolveScriptSkillVersionId(options);
    const episodeSignature = [...episodeIds].sort().join(",");
    const optionSignature = options.map((option) => option.skillVersionId).join(",");
    const signature = `${projectId}|${episodeSignature}|${optionSignature}`;

    useEffect(() => {
        if (!options.length || loadedSignature === signature) return;
        let active = true;
        void Promise.all(episodeIds.map(async (episodeId) => {
            const saved = await loadScriptSkillSelection(scriptSkillSelectionStorage, projectId, episodeId);
            return { episodeId, saved, resolved: resolveScriptSkillVersionId(options, saved || "") };
        })).then((entries) => {
            if (!active) return;
            const next: Record<string, string> = {};
            let fellBack = false;
            for (const entry of entries) {
                next[entry.episodeId] = entry.resolved;
                fellBack ||= Boolean(entry.saved && entry.saved !== entry.resolved);
            }
            setEpisodeVersionIds(next);
            setSelectionNotice(fellBack ? "部分分集原先选择的 Skill 已失效，已回退到推荐版本。" : "");
            setLoadedSignature(signature);
        });
        return () => { active = false; };
    }, [episodeIds, loadedSignature, options, projectId, signature]);

    useEffect(() => {
        if (!options.some((option) => option.skillVersionId === importVersionId)) setImportVersionId(defaultVersionId);
    }, [defaultVersionId, importVersionId, options]);

    const setEpisodeVersionId = useCallback((episodeId: string, skillVersionId: string) => {
        if (!options.some((option) => option.skillVersionId === skillVersionId)) return;
        setEpisodeVersionIds((value) => ({ ...value, [episodeId]: skillVersionId }));
        void saveScriptSkillSelection(scriptSkillSelectionStorage, projectId, episodeId, skillVersionId);
    }, [options, projectId]);

    const error = skillsQuery.error instanceof Error ? skillsQuery.error : !skillsQuery.isLoading && skillsQuery.data && !options.length ? new Error("没有已发布且兼容的剧本 Skill") : undefined;

    return { options, importVersionId, setImportVersionId, episodeVersionIds, setEpisodeVersionId, loading: skillsQuery.isLoading, error, selectionNotice, clearSelectionNotice: () => setSelectionNotice("") };
}
