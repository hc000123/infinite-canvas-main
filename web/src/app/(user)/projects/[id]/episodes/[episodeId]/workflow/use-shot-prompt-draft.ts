"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useVideoPackageStore, type ProductionPackage } from "@/app/(user)/video/use-video-package-store";
import { promptInputHash } from "./workflow-production-state";
import { promptDraftTransition } from "./shot-prompt-draft-transition";

export type ShotDraftStatus = "clean" | "dirty" | "saving" | "saved" | "failed";

export function useShotPromptDraft(item: ProductionPackage | null) {
    const updatePackage = useVideoPackageStore((state) => state.updateImportedPackage);
    const [prompt, setPromptValue] = useState(item?.prompt || "");
    const [status, setStatus] = useState<ShotDraftStatus>("clean");
    const itemRef = useRef(item);
    itemRef.current = item;

    useEffect(() => {
        setPromptValue(item?.prompt || "");
        setStatus("clean");
    }, [item?.episodeId, item?.id, item?.projectId, item?.prompt]);

    const setPrompt = (value: string) => {
        setPromptValue(value);
        setStatus(value === itemRef.current?.prompt ? "clean" : "dirty");
    };
    const save = useCallback(async () => {
        const current = itemRef.current;
        if (!current || status === "clean" || status === "saved") return true;
        setStatus("saving");
        try {
            updatePackage(current, { prompt, promptStatus: "待审核" });
            setStatus("saved");
            return true;
        } catch {
            setStatus("failed");
            return false;
        }
    }, [prompt, status, updatePackage]);

    useEffect(() => {
        if (status !== "dirty") return;
        const timer = window.setTimeout(() => void save(), 900);
        return () => window.clearTimeout(timer);
    }, [save, status]);

    const confirm = async () => {
        const transition = promptDraftTransition(status, "confirm");
        if (transition[0] === "save" && !(await save())) return false;
        const current = itemRef.current;
        if (!current) return false;
        updatePackage(current, { prompt, promptInputHash: promptInputHash(current), promptStatus: "已确认" });
        setStatus("saved");
        return true;
    };

    return { confirm, prompt, save, setPrompt, status };
}
