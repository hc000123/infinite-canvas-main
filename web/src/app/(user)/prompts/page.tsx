"use client";

import { BookOpenText, Building2, Copy, FilePlus2, Folder, FolderOpen, FolderPlus, Map, MoreHorizontal, Package, Pencil, Plus, Search, Trash2, Type, UserRound, Video } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Dropdown, Empty, Form, Input, Modal, Segmented, Select, Spin, Tag } from "antd";

import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { promptCategoryOptions, type PromptBusinessCategory } from "@/components/prompts/prompt-category";
import { promptNodeGroupLabel, promptTypeLabel, promptTypeOptions, promptTypesForNodeGroup } from "@/components/prompts/prompt-template";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { useCopyText } from "@/hooks/use-copy-text";
import { ALL_PROMPTS_OPTION, type Prompt, type PromptNodeGroup, type PromptTemplateType } from "@/services/api/prompts";
import { matchesPromptLibraryFilter, type PersonalPrompt, type PersonalPromptWriteInput } from "@/stores/prompt-library";
import { usePersonalPromptStore } from "@/stores/use-personal-prompt-store";

type LibraryScope = "all" | "backend" | "personal" | `category:${PromptBusinessCategory}` | `folder:${string}`;
type PromptEditorValues = { title: string; prompt: string; tagsText?: string; folderId?: string; nodeGroup: PromptNodeGroup; type: PromptTemplateType };

export default function PromptsPage() {
    const { message, modal } = App.useApp();
    const copyText = useCopyText();
    const [editorForm] = Form.useForm<PromptEditorValues>();
    const [folderForm] = Form.useForm<{ name: string }>();
    const folders = usePersonalPromptStore((state) => state.folders);
    const personalPrompts = usePersonalPromptStore((state) => state.prompts);
    const hydrated = usePersonalPromptStore((state) => state.hydrated);
    const addFolder = usePersonalPromptStore((state) => state.addFolder);
    const renameFolder = usePersonalPromptStore((state) => state.renameFolder);
    const removeFolder = usePersonalPromptStore((state) => state.removeFolder);
    const addPrompt = usePersonalPromptStore((state) => state.addPrompt);
    const updatePrompt = usePersonalPromptStore((state) => state.updatePrompt);
    const removePrompt = usePersonalPromptStore((state) => state.removePrompt);
    const duplicatePrompt = usePersonalPromptStore((state) => state.duplicatePrompt);
    const [scope, setScope] = useState<LibraryScope>("all");
    const [keyword, setKeyword] = useState("");
    const [nodeGroup, setNodeGroup] = useState<PromptNodeGroup | "all">("all");
    const [sortMode, setSortMode] = useState<"updated" | "title">("updated");
    const [detailPrompt, setDetailPrompt] = useState<Prompt | null>(null);
    const [editingPrompt, setEditingPrompt] = useState<PersonalPrompt | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [folderOpen, setFolderOpen] = useState(false);
    const [editingFolderId, setEditingFolderId] = useState<string>();
    const selectedBackendCategory = scope.startsWith("category:") ? (scope.slice(9) as PromptBusinessCategory) : "";
    const showBackend = scope === "all" || scope === "backend" || Boolean(selectedBackendCategory);
    const company = usePromptList({
        keyword,
        tags: [],
        category: selectedBackendCategory || ALL_PROMPTS_OPTION,
        nodeGroup: nodeGroup === "all" ? ALL_PROMPTS_OPTION : nodeGroup,
        enabled: showBackend,
    });
    const selectedFolderId = scope.startsWith("folder:") ? scope.slice(7) : undefined;
    const visiblePersonalPrompts = useMemo(() => {
        if (scope === "backend" || selectedBackendCategory) return [];
        const items = personalPrompts.filter((item) => matchesPromptLibraryFilter(item, { folderId: selectedFolderId, keyword, nodeGroup }));
        return items.sort((left, right) => (sortMode === "title" ? left.title.localeCompare(right.title, "zh-CN") : right.updatedAt.localeCompare(left.updatedAt)));
    }, [keyword, nodeGroup, personalPrompts, scope, selectedBackendCategory, selectedFolderId, sortMode]);
    const companyItems = scope === "personal" || selectedFolderId ? [] : company.items;
    const resultCount = companyItems.length + visiblePersonalPrompts.length;

    useEffect(() => {
        if (company.query.isError && showBackend) message.error(company.query.error instanceof Error ? company.query.error.message : "后台提示词读取失败");
    }, [company.query.error, company.query.isError, message, showBackend]);

    const openNewPrompt = (folderId = selectedFolderId) => {
        setEditingPrompt(null);
        editorForm.setFieldsValue({ title: "", prompt: "", tagsText: "", folderId, nodeGroup: "image", type: "image" });
        setEditorOpen(true);
    };

    const openEditPrompt = (item: PersonalPrompt) => {
        setEditingPrompt(item);
        editorForm.setFieldsValue({ ...item, tagsText: item.tags.join(", ") });
        setEditorOpen(true);
    };

    const saveEditor = async () => {
        const values = await editorForm.validateFields();
        const input: PersonalPromptWriteInput = {
            title: values.title,
            prompt: values.prompt,
            tags: (values.tagsText || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
            folderId: values.folderId || undefined,
            nodeGroup: values.nodeGroup,
            type: values.type,
        };
        if (editingPrompt) updatePrompt(editingPrompt.id, input);
        else addPrompt(input);
        setEditorOpen(false);
        message.success(editingPrompt ? "提示词已更新" : "提示词已保存到我的提示词");
    };

    const saveCompanyPrompt = (item: Prompt) => {
        addPrompt({
            title: item.title,
            prompt: item.prompt,
            tags: item.tags,
            nodeGroup: normalizeNodeGroup(item.metadata?.nodeGroup),
            type: normalizePromptType(item.metadata?.type),
        });
        message.success("已复制到我的提示词");
    };

    const openNewFolder = () => {
        setEditingFolderId(undefined);
        folderForm.setFieldsValue({ name: "" });
        setFolderOpen(true);
    };

    const openRenameFolder = (id: string) => {
        const folder = folders.find((item) => item.id === id);
        if (!folder) return;
        setEditingFolderId(id);
        folderForm.setFieldsValue({ name: folder.name });
        setFolderOpen(true);
    };

    const saveFolder = async () => {
        const { name } = await folderForm.validateFields();
        try {
            if (editingFolderId) renameFolder(editingFolderId, name);
            else {
                const id = addFolder(name);
                setScope(`folder:${id}`);
            }
            setFolderOpen(false);
            message.success(editingFolderId ? "文件夹已重命名" : "文件夹已新建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "文件夹保存失败");
        }
    };

    const confirmRemoveFolder = (id: string) => {
        const folder = folders.find((item) => item.id === id);
        if (!folder) return;
        modal.confirm({
            title: `删除文件夹“${folder.name}”？`,
            content: "文件夹内的提示词会移到“未分类”，不会被删除。",
            okText: "删除文件夹",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                removeFolder(id);
                if (scope === `folder:${id}`) setScope("personal");
            },
        });
    };

    const confirmRemovePrompt = (item: PersonalPrompt) => {
        modal.confirm({
            title: `删除“${item.title}”？`,
            content: "删除后无法恢复。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => removePrompt(item.id),
        });
    };

    const handleScroll = (event: UIEvent<HTMLElement>) => {
        const target = event.currentTarget;
        if (showBackend && company.query.hasNextPage && !company.query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void company.query.fetchNextPage();
    };

    return (
        <main className="studio-shell min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 xl:px-7" onScroll={handleScroll}>
            <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
                <aside className="studio-rail h-fit p-3 lg:sticky lg:top-5">
                    <div className="px-2 py-2">
                        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">PROMPT LIBRARY</p>
                        <h1 className="mt-1 text-xl font-semibold text-[var(--studio-text-primary)]">提示词库</h1>
                        <p className="mt-1 text-xs leading-5 text-[var(--studio-text-secondary)]">后台统一模板与个人提示词在这里汇总。</p>
                    </div>
                    <nav className="mt-3 space-y-1" aria-label="提示词资料夹">
                        <LibraryNavButton active={scope === "all"} icon={<BookOpenText className="size-4" />} label="全部提示词" onClick={() => setScope("all")} />
                        <LibraryNavButton active={scope === "backend"} icon={<Building2 className="size-4" />} label="后台提示词" onClick={() => setScope("backend")} />
                        <LibraryNavButton active={scope === "personal"} icon={<UserRound className="size-4" />} label="我的提示词" count={personalPrompts.length} onClick={() => setScope("personal")} />
                        <div className="px-2 pb-1 pt-4 text-xs font-medium text-[var(--studio-text-muted)]">后台分类</div>
                        {promptCategoryOptions.map((category) => (
                            <LibraryNavButton
                                key={category.value}
                                active={scope === `category:${category.value}`}
                                icon={promptCategoryIcon(category.value)}
                                label={category.label}
                                onClick={() => setScope(`category:${category.value}`)}
                            />
                        ))}
                        <div className="flex items-center justify-between px-2 pb-1 pt-4">
                            <span className="text-xs font-medium text-[var(--studio-text-muted)]">我的文件夹</span>
                            <Button type="text" size="small" className="!h-7 !w-7 !p-0" icon={<FolderPlus className="size-3.5" />} aria-label="新建文件夹" onClick={openNewFolder} />
                        </div>
                        {folders.map((folder) => {
                            const active = scope === `folder:${folder.id}`;
                            const count = personalPrompts.filter((item) => item.folderId === folder.id).length;
                            return (
                                <div key={folder.id} className="group flex items-center gap-1">
                                    <button
                                        type="button"
                                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${active ? "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-panel-muted-bg)] hover:text-[var(--studio-text-primary)]"}`}
                                        onClick={() => setScope(`folder:${folder.id}`)}
                                    >
                                        {active ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
                                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                                        <span className="text-xs text-[var(--studio-text-muted)]">{count}</span>
                                    </button>
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{
                                            items: [
                                                { key: "rename", label: "重命名", icon: <Pencil className="size-3.5" /> },
                                                { key: "delete", label: "删除文件夹", danger: true, icon: <Trash2 className="size-3.5" /> },
                                            ],
                                            onClick: ({ key }) => (key === "rename" ? openRenameFolder(folder.id) : confirmRemoveFolder(folder.id)),
                                        }}
                                    >
                                        <Button type="text" size="small" className="!h-8 !w-8 !p-0 opacity-0 group-hover:opacity-100" icon={<MoreHorizontal className="size-4" />} aria-label={`${folder.name}操作`} />
                                    </Dropdown>
                                </div>
                            );
                        })}
                        {hydrated && folders.length === 0 ? <button type="button" className="w-full rounded-md px-3 py-2 text-left text-xs text-[var(--studio-text-muted)] hover:bg-[var(--studio-panel-muted-bg)]" onClick={openNewFolder}>还没有文件夹，点击新建</button> : null}
                    </nav>
                </aside>

                <section className="min-w-0">
                    <header className="studio-page-header px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.16em] text-[var(--studio-accent)]">{scopeTitle(scope, folders)}</p>
                                <h2 className="mt-1 text-2xl font-semibold text-[var(--studio-text-primary)]">整理与复用每一条提示词</h2>
                                <p className="mt-1 text-sm text-[var(--studio-text-secondary)]">后台提示词由管理员统一维护；自己的提示词可编辑并移动到任意文件夹。</p>
                            </div>
                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openNewPrompt()}>
                                新建提示词
                            </Button>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                            <Input className="min-w-0 md:max-w-lg" size="large" prefix={<Search className="size-4 text-[var(--studio-text-muted)]" />} placeholder="搜索标题、正文或标签" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                            <Segmented
                                value={nodeGroup}
                                options={[{ label: "全部类型", value: "all" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "文本", value: "text" }]}
                                onChange={(value) => setNodeGroup(value as PromptNodeGroup | "all")}
                            />
                            <Select
                                className="w-28 shrink-0"
                                value={sortMode}
                                options={[{ label: "最近更新", value: "updated" }, { label: "名称升序", value: "title" }]}
                                onChange={setSortMode}
                            />
                        </div>
                    </header>

                    {showBackend && company.query.isLoading ? <div className="mt-4 flex h-40 items-center justify-center"><Spin /></div> : null}
                    {showBackend && company.query.isError ? <Alert className="mt-4" type="warning" showIcon title="后台提示词暂时无法读取" description="个人提示词仍可正常管理。" action={<Button size="small" onClick={() => void company.query.refetch()}>重试</Button>} /> : null}
                    {!company.query.isLoading && hydrated ? (
                        <div className="mt-4 space-y-5">
                            {companyItems.length ? (
                                <PromptSection title="后台提示词" icon={<Building2 className="size-4" />} count={companyItems.length} description="由后台统一维护，外侧直接读取同一内容。">
                                    {companyItems.map((item) => (
                                        <PromptRow
                                            key={`company:${item.id}`}
                                            title={item.title}
                                            content={item.prompt}
                                            tags={promptDisplayTags(item)}
                                            source="后台内置"
                                            onOpen={() => setDetailPrompt(item)}
                                            actions={
                                                <>
                                                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => copyText(item.prompt, "提示词已复制")}>复制</Button>
                                                    <Button size="small" icon={<FilePlus2 className="size-3.5" />} onClick={() => saveCompanyPrompt(item)}>保存到我的</Button>
                                                </>
                                            }
                                        />
                                    ))}
                                </PromptSection>
                            ) : null}
                            {visiblePersonalPrompts.length ? (
                                <PromptSection title="我的提示词" icon={<UserRound className="size-4" />} count={visiblePersonalPrompts.length} description={selectedFolderId ? `文件夹：${folders.find((folder) => folder.id === selectedFolderId)?.name || "未命名"}` : "保存在当前浏览器，可编辑与分类。"}>
                                    {visiblePersonalPrompts.map((item) => (
                                        <PromptRow
                                            key={`personal:${item.id}`}
                                            title={item.title}
                                            content={item.prompt}
                                            tags={[promptNodeGroupLabel(item.nodeGroup), promptTypeLabel(item.type), ...item.tags]}
                                            source={folders.find((folder) => folder.id === item.folderId)?.name || "未分类"}
                                            onOpen={() => setDetailPrompt(personalPromptForDetail(item))}
                                            actions={
                                                <Dropdown
                                                    trigger={["click"]}
                                                    menu={{
                                                        items: [
                                                            { key: "edit", label: "编辑与移动", icon: <Pencil className="size-3.5" /> },
                                                            { key: "duplicate", label: "创建副本", icon: <Copy className="size-3.5" /> },
                                                            { key: "delete", label: "删除", danger: true, icon: <Trash2 className="size-3.5" /> },
                                                        ],
                                                        onClick: ({ key }) => {
                                                            if (key === "edit") openEditPrompt(item);
                                                            else if (key === "duplicate") {
                                                                duplicatePrompt(item.id);
                                                                message.success("已创建副本");
                                                            } else confirmRemovePrompt(item);
                                                        },
                                                    }}
                                                >
                                                    <Button size="small" icon={<MoreHorizontal className="size-3.5" />}>管理</Button>
                                                </Dropdown>
                                            }
                                        />
                                    ))}
                                </PromptSection>
                            ) : null}
                            {resultCount === 0 && !company.query.isError ? (
                                <div className="studio-section flex min-h-80 items-center justify-center p-6">
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? "没有找到匹配的提示词" : scope === "backend" || selectedBackendCategory ? "该后台分类暂无提示词" : "这里还没有提示词"}>
                                        {scope !== "backend" && !selectedBackendCategory ? <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openNewPrompt()}>新建提示词</Button> : null}
                                    </Empty>
                                </div>
                            ) : null}
                            {company.query.isFetchingNextPage ? <div className="py-3 text-center text-xs text-[var(--studio-text-muted)]">正在加载更多后台提示词...</div> : null}
                        </div>
                    ) : null}
                </section>
            </div>

            <PromptDetailDialog prompt={detailPrompt} onClose={() => setDetailPrompt(null)} onCopy={(text) => copyText(text, "提示词已复制")} />
            <Modal rootClassName="studio-modal" title={editingPrompt ? "编辑提示词" : "新建提示词"} open={editorOpen} onCancel={() => setEditorOpen(false)} onOk={() => void saveEditor()} okText="保存" cancelText="取消" width={680} destroyOnHidden>
                <Form form={editorForm} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="title" label="名称" rules={[{ required: true, whitespace: true, message: "请输入提示词名称" }]}><Input placeholder="例如：角色三视图母版" /></Form.Item>
                    <Form.Item name="prompt" label="提示词正文" rules={[{ required: true, whitespace: true, message: "请输入提示词正文" }]}><Input.TextArea autoSize={{ minRows: 7, maxRows: 14 }} placeholder="输入可直接复用的提示词内容" /></Form.Item>
                    <div className="grid gap-x-3 md:grid-cols-3">
                        <Form.Item name="nodeGroup" label="适用类型" rules={[{ required: true }]}>
                            <Select options={[{ label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "文本", value: "text" }]} onChange={(value) => editorForm.setFieldValue("type", promptTypesForNodeGroup(value)[0] || "workflow")} />
                        </Form.Item>
                        <Form.Item name="type" label="用途" rules={[{ required: true }]}>
                            <Select options={promptTypeOptions.map((item) => ({ label: item.label, value: item.value }))} />
                        </Form.Item>
                        <Form.Item name="folderId" label="文件夹"><Select allowClear placeholder="未分类" options={folders.map((folder) => ({ label: folder.name, value: folder.id }))} /></Form.Item>
                    </div>
                    <Form.Item name="tagsText" label="标签"><Input placeholder="用逗号分隔，例如：人物，写实，母版" /></Form.Item>
                </Form>
            </Modal>
            <Modal rootClassName="studio-modal" title={editingFolderId ? "重命名文件夹" : "新建文件夹"} open={folderOpen} onCancel={() => setFolderOpen(false)} onOk={() => void saveFolder()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={folderForm} layout="vertical" requiredMark={false} className="pt-2">
                    <Form.Item name="name" label="文件夹名称" rules={[{ required: true, whitespace: true, message: "请输入文件夹名称" }]}><Input autoFocus placeholder="例如：角色、镜头、风格参考" onPressEnter={() => void saveFolder()} /></Form.Item>
                </Form>
            </Modal>
        </main>
    );
}

function LibraryNavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
    return <button type="button" className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${active ? "bg-[var(--studio-accent-soft)] text-[var(--studio-accent)]" : "text-[var(--studio-text-secondary)] hover:bg-[var(--studio-panel-muted-bg)] hover:text-[var(--studio-text-primary)]"}`} onClick={onClick}>{icon}<span className="flex-1">{label}</span>{count === undefined ? null : <span className="text-xs text-[var(--studio-text-muted)]">{count}</span>}</button>;
}

function PromptSection({ title, icon, count, description, children }: { title: string; icon: React.ReactNode; count: number; description: string; children: React.ReactNode }) {
    return <section className="studio-section overflow-hidden"><header className="flex items-center gap-2 border-b border-[var(--studio-border-subtle)] px-4 py-3"><span className="text-[var(--studio-accent)]">{icon}</span><h3 className="font-semibold text-[var(--studio-text-primary)]">{title}</h3><Tag className="studio-tag">{count}</Tag><span className="ml-auto hidden text-xs text-[var(--studio-text-muted)] sm:block">{description}</span></header><div className="divide-y divide-[var(--studio-border-subtle)]">{children}</div></section>;
}

function PromptRow({ title, content, tags, source, onOpen, actions }: { title: string; content: string; tags: string[]; source: string; onOpen: () => void; actions: React.ReactNode }) {
    return <article className="group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-[var(--studio-panel-muted-bg)] sm:flex-row sm:items-center"><button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium text-[var(--studio-text-primary)]">{title}</h4><span className="text-xs text-[var(--studio-text-muted)]">{source}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--studio-text-secondary)]">{content}</p><div className="mt-2 flex flex-wrap gap-1.5">{tags.slice(0, 5).map((tag) => <Tag key={tag} className="studio-tag !text-[11px]">{tag}</Tag>)}</div></button><div className="flex shrink-0 items-center gap-1 self-end sm:self-center">{actions}</div></article>;
}

function scopeTitle(scope: LibraryScope, folders: { id: string; name: string }[]) {
    if (scope === "backend") return "后台提示词";
    if (scope === "personal") return "我的提示词";
    if (scope.startsWith("category:")) return promptCategoryOptions.find((category) => category.value === scope.slice(9))?.label || "后台分类";
    if (scope.startsWith("folder:")) return folders.find((folder) => folder.id === scope.slice(7))?.name || "我的文件夹";
    return "全部提示词";
}

function promptCategoryIcon(category: PromptBusinessCategory) {
    if (category === "scene") return <Map className="size-4" />;
    if (category === "prop") return <Package className="size-4" />;
    if (category === "character") return <UserRound className="size-4" />;
    if (category === "video") return <Video className="size-4" />;
    return <Type className="size-4" />;
}

function normalizeNodeGroup(value?: string): PromptNodeGroup {
    return value === "video" || value === "text" ? value : "image";
}

function normalizePromptType(value?: string): PromptTemplateType {
    return promptTypeOptions.some((item) => item.value === value) ? (value as PromptTemplateType) : "workflow";
}

function promptDisplayTags(item: Prompt) {
    return [item.metadata?.nodeGroup ? promptNodeGroupLabel(item.metadata.nodeGroup) : "", item.metadata?.type ? promptTypeLabel(item.metadata.type) : "", ...item.tags].filter(Boolean);
}

function personalPromptForDetail(item: PersonalPrompt): Prompt {
    return { id: item.id, title: item.title, prompt: item.prompt, tags: item.tags, category: "我的提示词", coverUrl: "", githubUrl: "", preview: "", createdAt: item.createdAt, updatedAt: item.updatedAt, metadata: { nodeGroup: item.nodeGroup, type: item.type } };
}
