"use client";

import { Check, Plus, Search } from "lucide-react";
import { type ReactNode, type UIEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FormInstance } from "antd";
import { App, Button, Checkbox, Col, Empty, Form, Input, Modal, Row, Select, Spin, Tag } from "antd";

import { saveAdminPrompt } from "@/services/api/admin";
import { ALL_PROMPTS_OPTION, type Prompt, type PromptNodeGroup } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";
import { PromptCard } from "./prompt-card";
import { PromptDetailDialog } from "./prompt-detail-dialog";
import { defaultPromptTypeForNodeGroup, formatPromptVariablesText, parsePromptVariablesText, promptNodeGroupLabel, promptNodeGroupOptions, promptTypeLabel, promptTypeOptions, promptTypesForNodeGroup } from "./prompt-template";
import { usePromptList } from "./use-prompt-list";

export type PromptCreateFormValues = Partial<Prompt> & { tagText?: string; variableText?: string };

const promptVariablePlaceholder = formatPromptVariablesText([
    { name: "角色", description: "主角设定", defaultValue: "魏梁" },
    { name: "场景", description: "发生地点" },
]);

export function PromptSelectDialog({
    open,
    projectId,
    nodeGroup,
    allowedTypes,
    onOpenChange,
    onSelect,
}: {
    open: boolean;
    projectId?: string;
    nodeGroup?: PromptNodeGroup;
    allowedTypes?: string[];
    onOpenChange: (open: boolean) => void;
    onSelect: (prompt: string) => void;
}) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const [createForm] = Form.useForm<PromptCreateFormValues>();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedNodeGroup, setSelectedNodeGroup] = useState<string>(nodeGroup || ALL_PROMPTS_OPTION);
    const [selectedType, setSelectedType] = useState(ALL_PROMPTS_OPTION);
    const [selectedScenario, setSelectedScenario] = useState(ALL_PROMPTS_OPTION);
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [isSavingPrompt, setIsSavingPrompt] = useState(false);
    const {
        query,
        items,
        tags: promptTags,
        categories: promptCategories,
        nodeGroups,
        types: promptTypes,
        scenarios,
    } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, nodeGroup: selectedNodeGroup, type: selectedType, scenario: selectedScenario, favorite: favoriteOnly, enabled: open });
    const activeNodeGroup = selectedNodeGroup === ALL_PROMPTS_OPTION ? "" : selectedNodeGroup;
    const allowedPurposeTypes = promptTypesForNodeGroup(activeNodeGroup);
    const nodeGroupOptions = [ALL_PROMPTS_OPTION, ...promptNodeGroupOptions.map((item) => item.value), ...nodeGroups.filter((value) => value !== ALL_PROMPTS_OPTION && !promptNodeGroupOptions.some((item) => item.value === value))];
    const typeOptions = [
        ALL_PROMPTS_OPTION,
        ...promptTypeOptions.map((item) => item.value).filter((value) => (!activeNodeGroup || allowedPurposeTypes.includes(value)) && (!allowedTypes?.length || allowedTypes.includes(value))),
        ...promptTypes.filter((value) => value !== ALL_PROMPTS_OPTION && (!activeNodeGroup || allowedPurposeTypes.includes(value)) && (!allowedTypes?.length || allowedTypes.includes(value)) && !promptTypeOptions.some((item) => item.value === value)),
    ];
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const selectPrompt = (promptText: string) => {
        onSelect(promptText);
        setSelectedPrompt(null);
        onOpenChange(false);
    };

    const defaultCreateNodeGroup = () => {
        if (selectedNodeGroup !== ALL_PROMPTS_OPTION) return selectedNodeGroup;
        return nodeGroup || "image";
    };

    const defaultCreateCategory = () => (selectedCategory !== ALL_PROMPTS_OPTION ? selectedCategory : promptCategories.find((category) => category !== ALL_PROMPTS_OPTION) || "system");

    const openCreatePrompt = () => {
        if (!token) {
            message.warning("请先登录管理员账号后再新建提示词");
            return;
        }
        const nextNodeGroup = defaultCreateNodeGroup();
        createForm.setFieldsValue({
            title: "",
            category: defaultCreateCategory(),
            coverUrl: "",
            prompt: "",
            tagText: "",
            variableText: "",
            metadata: {
                nodeGroup: nextNodeGroup,
                type: defaultPromptTypeForNodeGroup(nextNodeGroup),
                scenario: "",
                favorite: false,
            },
        });
        setCreateOpen(true);
    };

    const saveCreatedPrompt = async () => {
        if (!token) {
            message.warning("请先登录管理员账号后再新建提示词");
            return;
        }
        const value = await createForm.validateFields();
        const { tagText = "", variableText = "", metadata, ...promptValue } = value;
        const nextNodeGroup = metadata?.nodeGroup || defaultCreateNodeGroup();
        setIsSavingPrompt(true);
        try {
            const saved = await saveAdminPrompt(token, {
                ...promptValue,
                category: promptValue.category || defaultCreateCategory(),
                coverUrl: promptValue.coverUrl || "/logo.svg",
                tags: tagText
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                metadata: {
                    ...(metadata || {}),
                    nodeGroup: nextNodeGroup,
                    variables: parsePromptVariablesText(variableText),
                    favorite: metadata?.favorite === true,
                },
            });
            setCreateOpen(false);
            setSelectedNodeGroup(nextNodeGroup);
            setSelectedType(ALL_PROMPTS_OPTION);
            setSelectedScenario(ALL_PROMPTS_OPTION);
            setSelectedPrompt(saved);
            await queryClient.invalidateQueries({ queryKey: ["prompts"] });
            message.success("提示词已新建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "新建提示词失败");
        } finally {
            setIsSavingPrompt(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        setSelectedNodeGroup(nodeGroup || ALL_PROMPTS_OPTION);
        setSelectedType(ALL_PROMPTS_OPTION);
        setSelectedScenario(ALL_PROMPTS_OPTION);
    }, [nodeGroup, open]);

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
    }, [message, query.error, query.isError]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <Modal className="studio-modal" title="提示词库" open={open} onCancel={() => onOpenChange(false)} footer={null} width={1040} centered>
            <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <div className="mx-auto flex max-w-2xl gap-2">
                    <Input className="studio-command-input min-w-0 flex-1" size="large" prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按标题查询" />
                    <Button size="large" type="primary" icon={<Plus className="size-4" />} onClick={openCreatePrompt}>
                        新建
                    </Button>
                </div>
                <div className="mt-5 grid gap-3">
                    <PromptFilterRow label="节点">
                        {nodeGroupOptions.map((group) => (
                            <PromptFilterTag
                                key={group}
                                checked={selectedNodeGroup === group}
                                onChange={() => {
                                    setSelectedNodeGroup(group);
                                    setSelectedType(ALL_PROMPTS_OPTION);
                                    setSelectedScenario(ALL_PROMPTS_OPTION);
                                }}
                            >
                                {group === ALL_PROMPTS_OPTION ? "全部" : promptNodeGroupLabel(group)}
                            </PromptFilterTag>
                        ))}
                    </PromptFilterRow>
                    <PromptFilterRow label="用途">
                        {typeOptions.map((type) => (
                            <PromptFilterTag
                                key={type}
                                checked={selectedType === type}
                                onChange={() => {
                                    setSelectedType(type);
                                    setSelectedScenario(ALL_PROMPTS_OPTION);
                                }}
                            >
                                {type === ALL_PROMPTS_OPTION ? "全部" : promptTypeLabel(type)}
                            </PromptFilterTag>
                        ))}
                        <PromptFilterTag checked={favoriteOnly} onChange={() => setFavoriteOnly((value) => !value)}>
                            常用
                        </PromptFilterTag>
                    </PromptFilterRow>
                    <PromptFilterRow label="场景">
                        {scenarios.map((scenario) => (
                            <PromptFilterTag key={scenario} checked={selectedScenario === scenario} onChange={() => setSelectedScenario(scenario)}>
                                {scenario}
                            </PromptFilterTag>
                        ))}
                    </PromptFilterRow>
                    <PromptFilterRow label="来源">
                        {promptCategories.map((category) => (
                            <PromptFilterTag key={category} checked={selectedCategory === category} onChange={() => setSelectedCategory(category)}>
                                {category}
                            </PromptFilterTag>
                        ))}
                    </PromptFilterRow>
                    <PromptFilterRow label="标签">
                        {promptTags.map((tag) => {
                            const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                            return (
                                <PromptFilterTag key={tag} checked={active} onChange={() => toggleTag(tag)}>
                                    {tag}
                                </PromptFilterTag>
                            );
                        })}
                    </PromptFilterRow>
                </div>
                <div className="thin-scrollbar mt-6 max-h-[520px] overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                    {query.isLoading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <PromptCard key={item.id} item={item} onOpen={() => setSelectedPrompt(item)} onCopy={() => setSelectedPrompt(item)} actionLabel="使用此提示词" actionIcon={<Check className="size-3.5" />} actionType="primary" />
                        ))}
                    </div>
                    {!query.isLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-8" /> : null}
                    {query.isFetchingNextPage ? (
                        <div className="py-4 text-center">
                            <Spin size="small" />
                        </div>
                    ) : null}
                </div>
            </div>
            <PromptDetailDialog prompt={selectedPrompt} projectId={projectId} onClose={() => setSelectedPrompt(null)} onCopy={(text) => selectPrompt(text)} onUse={selectPrompt} />
            <PromptCreateDialog form={createForm} open={createOpen} categories={promptCategories} saving={isSavingPrompt} onCancel={() => setCreateOpen(false)} onSave={saveCreatedPrompt} />
        </Modal>
    );
}

function PromptFilterRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
            <div className="pt-2 text-sm font-medium text-[var(--studio-text-secondary)]">{label}</div>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
}

function PromptFilterTag({ checked, children, onChange }: { checked: boolean; children: ReactNode; onChange: () => void }) {
    return (
        <Tag.CheckableTag checked={checked} className={cn("prompt-filter-tag", checked && "is-active")} onChange={onChange}>
            {children}
        </Tag.CheckableTag>
    );
}

export function PromptCreateDialog({ open, form, categories, saving, onCancel, onSave }: { open: boolean; form: FormInstance<PromptCreateFormValues>; categories: string[]; saving: boolean; onCancel: () => void; onSave: () => void | Promise<void> }) {
    const categoryOptions = categories.filter((category) => category !== ALL_PROMPTS_OPTION).map((category) => ({ label: category, value: category }));

    return (
        <Modal className="studio-modal" title="新建提示词" open={open} width={720} onCancel={onCancel} onOk={() => void onSave()} okText="保存" cancelText="取消" confirmLoading={saving} destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                    <Input />
                </Form.Item>
                <Row gutter={12}>
                    <Col span={8}>
                        <Form.Item name={["metadata", "nodeGroup"]} label="节点分组" rules={[{ required: true, message: "请选择节点分组" }]}>
                            <Select options={promptNodeGroupOptions} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name={["metadata", "type"]} label="用途">
                            <Select allowClear options={promptTypeOptions} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name={["metadata", "favorite"]} label="常用" valuePropName="checked">
                            <Checkbox>加入常用</Checkbox>
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={12}>
                    <Col span={8}>
                        <Form.Item name="category" label="来源分类">
                            <Select options={categoryOptions} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name={["metadata", "scenario"]} label="场景">
                            <Input placeholder="例如：短剧 / 分镜 / 人物设定" />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Input placeholder="/logo.svg" />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item name="tagText" label="标签，用逗号分隔">
                    <Input />
                </Form.Item>
                <Form.Item name="variableText" label="变量说明">
                    <Input.TextArea rows={3} placeholder={promptVariablePlaceholder} />
                </Form.Item>
                <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: "请输入提示词" }]}>
                    <Input.TextArea rows={6} placeholder="可以使用 {角色}、{场景} 这样的变量" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
