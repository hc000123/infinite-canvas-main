"use client";

import { useMutation } from "@tanstack/react-query";
import { App, Button, Empty, Input, Select, Space, Tag } from "antd";
import { FileSearch, Route, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { SkillOption } from "@/services/api/admin-skills";
import { createArtifact, type ArtifactEnvelope } from "@/services/api/invocations";
import { previewWorkflowVersion, type WorkflowPackage, type WorkflowPreviewInput, type WorkflowRoutePreview } from "@/services/api/workflow-registry";
import { workflowRouteIssueLabel, workflowSourceInputNames } from "../workflow-editor-model";
import { compatibleWorkflowSkillOptions, defaultWorkflowSkillVersionId } from "../workflow-skill-options";

export type WorkflowPreparedRun = {
    artifact: ArtifactEnvelope;
    input: WorkflowPreviewInput;
    preview: WorkflowRoutePreview;
    sourceText: string;
    episodeId: string;
};

const errorText = (error: unknown) => error instanceof Error ? error.message : "预览失败";

export function WorkflowRoutePreviewPanel({ versionId, packageValue, projectId, skillOptions, onPrepared }: { versionId: string; packageValue?: WorkflowPackage; projectId: string; skillOptions: SkillOption[]; onPrepared: (prepared?: WorkflowPreparedRun) => void }) {
    const { message } = App.useApp();
    const [sourceText, setSourceText] = useState("");
    const [episodeId, setEpisodeId] = useState("");
    const [projectTags, setProjectTags] = useState<string[]>([]);
    const [parametersText, setParametersText] = useState('{"format":"9:16"}');
    const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<WorkflowRoutePreview>();
    const packageFingerprint = useMemo(() => JSON.stringify(packageValue || null), [packageValue]);

    useEffect(() => {
        setPreview(undefined);
        onPrepared(undefined);
    }, [onPrepared, packageFingerprint, versionId]);

    const manualNodes = useMemo(() => packageValue?.nodes.filter((node) => node.executorType === "skill" && node.skillBinding?.mode === "manual_before_run") || [], [packageValue]);
    useEffect(() => {
        setManualSelections((current) => {
            const next = { ...current };
            let changed = false;
            for (const node of manualNodes) {
                const value = defaultWorkflowSkillVersionId(node, skillOptions, current);
                if (value && value !== current[node.nodeKey]) {
                    next[node.nodeKey] = value;
                    changed = true;
                }
            }
            return changed ? next : current;
        });
    }, [manualNodes, skillOptions]);
    const mutation = useMutation({
        mutationFn: async () => {
            if (!versionId || !packageValue) throw new Error("请先选择 Workflow 版本");
            if (!sourceText.trim()) throw new Error("请填写内容文本");
            const parameters = parseObject(parametersText, "运行参数");
            const artifact = await createArtifact({ artifactType: "source_text", schemaVersion: "1.0.0", projectId, episodeId: episodeId || undefined, payload: { text: sourceText.trim() } });
            const input: WorkflowPreviewInput = {
                projectId,
                episodeId: episodeId || undefined,
                inputArtifactRefs: workflowSourceInputNames(packageValue).map((bindingName) => ({ bindingName, artifactId: artifact.artifact.id, contentHash: artifact.artifact.contentHash })),
                manualSelections,
                projectTags,
                parameters,
            };
            return { artifact, input, preview: await previewWorkflowVersion(versionId, input) };
        },
        onSuccess: (result) => {
            setPreview(result.preview);
            onPrepared({ ...result, sourceText, episodeId });
            if (result.preview.executable) message.success("路由预览可执行，精确版本与额度已解析");
            else message.warning("路由预览发现阻断项，请根据稳定错误码调整");
        },
        onError: (error) => message.error(errorText(error)),
    });

    const invalidate = () => {
        if (!preview) return;
        setPreview(undefined);
        onPrepared(undefined);
    };

    if (!versionId || !packageValue) return <section className="studio-panel grid min-h-72 place-items-center p-6"><Empty description="选择 Workflow 版本后预览路由" /></section>;

    return (
        <section className="studio-panel min-w-0 overflow-hidden">
            <header className="border-b border-[var(--studio-border-subtle)] p-5">
                <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">ROUTE PREVIEW</p>
                <h2 className="mt-2 text-xl font-semibold">输入与能力匹配</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--studio-text-secondary)]">内容先登记为不可变 source_text Artifact，再解析 fixed、tag_route 与 manual 节点。</p>
            </header>
            <div className="space-y-4 p-5">
                <label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">内容文本</span><Input.TextArea value={sourceText} rows={7} placeholder="粘贴剧本、场景说明或其他来源文本" onChange={(event) => { setSourceText(event.target.value); invalidate(); }} /></label>
                <div className="grid gap-3 md:grid-cols-2"><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">分集 ID（可选）</span><Input value={episodeId} onChange={(event) => { setEpisodeId(event.target.value); invalidate(); }} /></label><label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">项目路由标签</span><Select mode="tags" className="w-full" value={projectTags} tokenSeparators={[",", "，"]} placeholder="如 short_drama、vertical" onChange={(value) => { setProjectTags(value); invalidate(); }} /></label></div>
                <label><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">运行参数 JSON</span><Input.TextArea value={parametersText} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(event) => { setParametersText(event.target.value); invalidate(); }} /></label>
                {manualNodes.length ? <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><div className="mb-3 text-sm font-semibold">运行前手动选择</div><div className="space-y-3">{manualNodes.map((node) => <label key={node.nodeKey} className="block"><span className="mb-1 block text-xs text-[var(--studio-text-muted)]">{node.name} · {node.outputArtifactType}</span><Select showSearch optionFilterProp="label" allowClear className="w-full" value={manualSelections[node.nodeKey]} options={compatibleWorkflowSkillOptions(node, skillOptions).map((option) => ({ value: option.skillVersionId, label: `${option.skillName} v${option.version}${option.isRecommended ? "（推荐）" : ""} · ${option.summary || "无摘要"} · ${option.contentHash.slice(0, 14)}…` }))} onChange={(skillVersionId) => { setManualSelections((current) => ({ ...current, [node.nodeKey]: skillVersionId || "" })); invalidate(); }} /></label>)}</div></div> : null}
                <Button type="primary" icon={<FileSearch className="size-4" />} loading={mutation.isPending} disabled={!sourceText.trim()} onClick={() => mutation.mutate()}>创建 Artifact 并预览路由</Button>
                {preview ? <PreviewResult preview={preview} /> : null}
            </div>
        </section>
    );
}

function PreviewResult({ preview }: { preview: WorkflowRoutePreview }) {
    return <div className="space-y-3 border-t border-[var(--studio-border-subtle)] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><Route className="size-4 text-[var(--studio-accent)]" />解析结果</div><Space wrap><Tag color={preview.executable ? "success" : "error"}>{preview.executable ? "可执行" : "已阻断"}</Tag><Tag>{preview.estimatedCredits} Credits</Tag><Tag>{preview.contentHash.slice(0, 14)}…</Tag></Space></div>{preview.nodes.map((node) => <article key={node.nodeKey} className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">{node.name}</div><div className="mt-1 text-xs text-[var(--studio-text-muted)]">{node.executorType} · {node.skillVersionId || node.agentVersionId || (node.adapterId ? `${node.adapterId}@${node.adapterVersion}` : "") || "未解析版本"}</div></div><Tag>{node.estimatedCredits} Credits</Tag></div>{node.routeTrace.candidates.length ? <div className="mt-3 space-y-2">{node.routeTrace.candidates.map((candidate) => <div key={candidate.skillVersionId} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-bg)] p-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{candidate.skillVersionId}</span><Tag color={candidate.accepted ? "success" : "default"}>score {candidate.score}</Tag></div><div className="mt-1 text-[var(--studio-text-muted)]">{candidate.reasons.join("；") || "无补充原因"}</div></div>)}</div> : null}{node.blockCode ? <div className="mt-3 flex gap-2 rounded-md border border-red-300/40 bg-red-500/5 p-2 text-xs text-red-500"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div><div>{workflowRouteIssueLabel(node.blockCode)}</div>{node.blockMessage ? <div className="mt-1 opacity-80">{node.blockMessage}</div> : null}</div></div> : null}</article>)}</div>;
}

function parseObject(value: string, label: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(value || "{}");
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
        return parsed as Record<string, unknown>;
    } catch {
        throw new Error(`${label}必须是合法 JSON 对象`);
    }
}
