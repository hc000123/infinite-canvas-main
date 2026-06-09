"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, FolderPlus } from "lucide-react";
import { Button, Divider, Input, Modal, Select, Space, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { useProductionBibleStore } from "@/app/(user)/canvas/stores/use-production-bible-store";
import { itemsForProductionBibleProject, productionBibleKindLabel } from "@/app/(user)/canvas/utils/production-bible";
import { inputOutputKindLabel, productionBibleValueForVariable, promptNodeGroupLabel, promptTypeLabel, promptVariablesFromTemplate, renderPromptTemplate } from "./prompt-template";

export function PromptDetailDialog({
    prompt,
    projectId,
    onClose,
    onCopy,
    onSaveAsset,
    onUse,
}: {
    prompt: Prompt | null;
    projectId?: string;
    onClose: () => void;
    onCopy: (prompt: string) => void;
    onSaveAsset?: (prompt: Prompt) => void;
    onUse?: (prompt: string) => void;
}) {
    const productionBibleItems = useProductionBibleStore((state) => state.items);
    const projectBibleItems = useMemo(() => (projectId ? itemsForProductionBibleProject(productionBibleItems, projectId) : []), [productionBibleItems, projectId]);
    const variables = useMemo(() => (prompt ? promptVariablesFromTemplate(prompt.prompt, prompt.metadata) : []), [prompt]);
    const [values, setValues] = useState<Record<string, string>>({});
    const finalPrompt = prompt ? renderPromptTemplate(prompt.prompt, values) : "";

    useEffect(() => {
        setValues(Object.fromEntries(variables.map((variable) => [variable.name, variable.defaultValue || ""])));
    }, [variables]);

    const fillFromBible = (variable: string, itemId: string) => {
        const item = projectBibleItems.find((entry) => entry.id === itemId);
        if (!item) return;
        setValues((current) => ({ ...current, [variable]: productionBibleValueForVariable(variable, item) }));
    };

    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={860} className="studio-modal">
                {prompt ? (
                    <>
                        <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
                            <div className="space-y-3">
                                <img src={prompt.coverUrl} alt={prompt.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
                                {prompt.preview ? <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-xs leading-5 text-[var(--studio-text-secondary)]">{prompt.preview}</pre> : null}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {prompt.metadata?.nodeGroup ? (
                                        <Tag className="studio-tag">
                                            {promptNodeGroupLabel(prompt.metadata.nodeGroup)}
                                        </Tag>
                                    ) : null}
                                    {prompt.metadata?.type ? (
                                        <Tag className="studio-tag">
                                            {promptTypeLabel(prompt.metadata.type)}
                                        </Tag>
                                    ) : null}
                                    {prompt.metadata?.scenario ? <Tag className="studio-tag">场景：{prompt.metadata.scenario}</Tag> : null}
                                    {prompt.metadata?.provider ? <Tag className="studio-tag">供应商：{prompt.metadata.provider}</Tag> : null}
                                    {prompt.metadata?.model ? <Tag className="studio-tag">模型：{prompt.metadata.model}</Tag> : null}
                                    {prompt.metadata?.inputKind ? <Tag className="studio-tag">输入：{inputOutputKindLabel(prompt.metadata.inputKind)}</Tag> : null}
                                    {prompt.metadata?.outputKind ? <Tag className="studio-tag">输出：{inputOutputKindLabel(prompt.metadata.outputKind)}</Tag> : null}
                                    {prompt.metadata?.favorite ? (
                                        <Tag className="studio-tag">
                                            常用
                                        </Tag>
                                    ) : null}
                                    {prompt.tags.map((tag) => (
                                        <Tag key={tag} className="studio-tag">
                                            {tag}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--studio-text-secondary)]">{prompt.prompt}</p>
                                {variables.length ? (
                                    <>
                                        <Divider className="!my-4" />
                                        <div className="space-y-3">
                                            <div className="text-sm font-semibold text-[var(--studio-text-primary)]">变量填写</div>
                                            {variables.map((variable) => (
                                                <div key={variable.name} className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
                                                    <div className="pt-1 text-sm font-medium text-[var(--studio-text-secondary)]">
                                                        {variable.name}
                                                        {variable.description ? <div className="mt-1 text-xs font-normal text-[var(--studio-text-muted)]">{variable.description}</div> : null}
                                                    </div>
                                                    <div className="flex min-w-0 gap-2">
                                                        <Input value={values[variable.name] || ""} placeholder={`填写 ${variable.name}`} onChange={(event) => setValues((current) => ({ ...current, [variable.name]: event.target.value }))} />
                                                        {projectBibleItems.length ? (
                                                            <Select
                                                                className="w-36 shrink-0"
                                                                placeholder="设定库"
                                                                options={projectBibleItems.map((item) => ({ label: `${productionBibleKindLabel(item.kind)} · ${item.name}`, value: item.id }))}
                                                                onChange={(value) => fillFromBible(variable.name, value)}
                                                            />
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-xs leading-6 text-[var(--studio-text-secondary)]">
                                            <div className="mb-1 font-medium text-[var(--studio-text-primary)]">最终提示词</div>
                                            <div className="whitespace-pre-wrap">{finalPrompt}</div>
                                        </div>
                                    </>
                                ) : null}
                                <div className="mt-4 text-xs text-[var(--studio-text-muted)]">
                                    创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                                </div>
                                <Space wrap className="mt-5">
                                    <Button type={onUse ? "default" : "primary"} icon={<Copy className="size-4" />} onClick={() => onCopy(finalPrompt)}>
                                        复制提示词
                                    </Button>
                                    {onUse ? (
                                        <Button type="primary" onClick={() => onUse(finalPrompt)}>
                                            插入提示词
                                        </Button>
                                    ) : null}
                                    {onSaveAsset ? (
                                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                            加入我的素材
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>
        </>
    );
}
