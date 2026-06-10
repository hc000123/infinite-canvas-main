"use client";

import { useMemo } from "react";

import type { AgentWorkflowStageOutput } from "../../../../../agent-runner-types";
import { buildStageOutputDigest } from "./stage-output-digest-utils";

export { buildStageOutputDigest, findDigestSection, findOutputKeywordLine } from "./stage-output-digest-utils";

export function StageOutputDigest({ stageId, output }: { stageId: string; output: AgentWorkflowStageOutput }) {
    const digest = useMemo(() => buildStageOutputDigest(stageId, output), [output, stageId]);
    return (
        <div className="grid gap-3">
            <div className="studio-panel-muted p-3">
                <div className="mb-1 text-xs font-medium text-stone-500">核心摘要</div>
                <div className="text-sm leading-6 whitespace-pre-line text-stone-800 dark:text-stone-100">{digest.summary}</div>
            </div>
            {digest.sections.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                    {digest.sections.map((section) => (
                        <div key={section.label} className="studio-panel-muted p-3">
                            <div className="mb-1 text-xs font-medium text-stone-500">{section.label}</div>
                            <div className="text-sm leading-6 whitespace-pre-line text-stone-700 dark:text-stone-200">{section.value}</div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
