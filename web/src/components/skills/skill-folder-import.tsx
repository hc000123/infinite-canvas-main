"use client";

import { FolderOpenOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Empty, Flex, Input, Modal, Select, Spin, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAdminSkillSourceFiles, fetchAdminSkillStageTemplates, importAdminSkillFolder, importAdminSkillFolderVersion, type SkillStageTemplate } from "@/services/api/admin-skills";
import { fetchProjectSkillSourceFiles, fetchProjectSkillStageTemplates, importProjectSkillFolder, importProjectSkillFolderVersion } from "@/services/api/project-skills";
import { skillFolderLayout } from "@/services/api/skill-folder-form";
import { canSubmitSkillFolderImport, createLatestRequestGuard, diffSkillFolderFiles, readDroppedSkillFolder, readSkillFolderMetadata, type SkillFolderDiff, type SkillFolderMetadata } from "./skill-folder-import-utils";

type SkillFolderImportResult = { skill?: { id: string }; version?: { id: string } | string; id?: string };
type SkillFolderImportProps = { open: boolean; token: string; scope?: "admin" | "project"; projectId?: string; skillId?: string; previousVersionId?: string; onCancel: () => void; onImported: (skillId?: string, versionId?: string) => void };
const emptyFields: SkillFolderMetadata = { name: "", summary: "", version: "" };

export function SkillFolderImport({ open, token, scope = "admin", projectId, skillId, previousVersionId, onCancel, onImported }: SkillFolderImportProps) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const requestGuard = useRef(createLatestRequestGuard());
    const [files, setFiles] = useState<File[]>([]);
    const [fields, setFields] = useState(emptyFields);
    const [stageKey, setStageKey] = useState("");
    const [dragging, setDragging] = useState(false);
    const [reading, setReading] = useState(false);
    const [diff, setDiff] = useState<SkillFolderDiff>();
    const [diffing, setDiffing] = useState(false);
    const [diffError, setDiffError] = useState("");
    const updating = Boolean(skillId);
    const templates = useQuery({ queryKey: [scope, "skill-stage-templates", token], queryFn: () => scope === "admin" ? fetchAdminSkillStageTemplates(token) : fetchProjectSkillStageTemplates(token), enabled: open && !updating && Boolean(token), retry: false });
    const previousFiles = useQuery({ queryKey: [scope, "skill-source-files", previousVersionId, token], queryFn: () => scope === "admin" ? fetchAdminSkillSourceFiles(token, previousVersionId!) : fetchProjectSkillSourceFiles(token, previousVersionId!), enabled: open && updating && Boolean(token && previousVersionId), retry: false });
    const selected = templates.data?.find((item) => item.key === stageKey);
    const layout = useMemo(() => skillFolderLayout(files), [files]);
    const hasSkill = layout.relativePaths.includes("SKILL.md");

    useEffect(() => {
        if (open) return;
        requestGuard.current.invalidate();
        setFiles([]);
        setFields(emptyFields);
        setStageKey("");
        setDiff(undefined);
        setDiffError("");
        setDragging(false);
        setReading(false);
        setDiffing(false);
        if (inputRef.current) inputRef.current.value = "";
    }, [open]);

    useEffect(() => {
        let active = true;
        setDiff(undefined);
        setDiffError("");
        if (!updating || !files.length || !previousFiles.data) return;
        setDiffing(true);
        diffSkillFolderFiles(files, previousFiles.data)
            .then((value) => { if (active) setDiff(value); })
            .catch(() => { if (active) setDiffError("计算文件差异失败，请重新选择文件夹"); })
            .finally(() => { if (active) setDiffing(false); });
        return () => { active = false; };
    }, [files, previousFiles.data, updating]);

    const mutation = useMutation<SkillFolderImportResult>({
        mutationFn: (): Promise<SkillFolderImportResult> => updating
            ? scope === "admin" ? importAdminSkillFolderVersion(token, skillId!, files, fields.version.trim()) : importProjectSkillFolderVersion(token, skillId!, files, fields.version.trim())
            : scope === "admin" ? importAdminSkillFolder(token, files, { ownerType: "system", stageKey, name: fields.name.trim(), summary: fields.summary.trim(), version: fields.version.trim() }) : importProjectSkillFolder(token, files, { ownerType: "project", projectId, stageKey, name: fields.name.trim(), summary: fields.summary.trim(), version: fields.version.trim() }),
        onSuccess: (result) => {
            requestGuard.current.invalidate();
            message.success(updating ? "新版本已载入，请先试跑" : "Skill 文件夹已载入，请先试跑");
            setFiles([]);
            setFields(emptyFields);
            setStageKey("");
            setReading(false);
            setDiffing(false);
            onImported(result.skill?.id, typeof result.version === "object" ? result.version.id : result.id);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "导入失败"),
    });

    const acceptFiles = async (nextFiles: File[], request: ReturnType<typeof requestGuard.current.begin>) => {
        if (!request.isCurrent()) return;
        setFiles(nextFiles);
        setDiff(undefined);
        if (!nextFiles.length) return;
        try {
            const metadata = await readSkillFolderMetadata(nextFiles, updating ? "" : "1.0.0");
            if (request.isCurrent()) setFields(metadata);
        } catch (error) {
            if (!request.isCurrent()) return;
            setFields(emptyFields);
            message.warning(error instanceof Error ? error.message : "无法读取 Skill 文件夹");
        }
    };
    const chooseFolder = () => {
        inputRef.current?.setAttribute("webkitdirectory", "");
        inputRef.current?.click();
    };
    const handleDrop = async (event: React.DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setDragging(false);
        const request = requestGuard.current.begin();
        setReading(true);
        try {
            const dropped = await readDroppedSkillFolder(Array.from(event.dataTransfer.items));
            if (request.isCurrent()) await acceptFiles(dropped, request);
        } catch (error) {
            if (request.isCurrent()) message.warning(error instanceof Error ? error.message : "无法读取拖入的文件夹");
        } finally {
            if (request.isCurrent()) setReading(false);
        }
    };
    const disabled = !canSubmitSkillFolderImport({ fileCount: files.length, hasSkill, updating, stageKey, name: fields.name, baselineUnavailable: Boolean(diffError || previousFiles.error) });

    return <Modal width={720} title={updating ? "载入 Skill 新版本" : "载入外部 Skill 文件夹"} open={open} onCancel={onCancel} footer={<Flex justify="space-between" align="center" gap={16}><Typography.Text type="secondary" className="text-xs">系统会冻结完整文件夹，不执行其中脚本。</Typography.Text><Flex gap={8}><Button onClick={onCancel}>取消</Button><Button type="primary" loading={mutation.isPending} disabled={disabled} onClick={() => mutation.mutate()}>载入并创建草稿</Button></Flex></Flex>}>
        <Flex vertical gap={16}>
            {!updating ? <div><Typography.Text strong>选择所属阶段</Typography.Text><Typography.Paragraph type="secondary" className="mt-1">只需选阶段；Capability、Artifact 和 Schema 由系统自动配置。</Typography.Paragraph><Select className="w-full" showSearch optionFilterProp="label" placeholder="例如：剧本整理" value={stageKey || undefined} loading={templates.isLoading} options={(templates.data || []).map(stageOption)} onChange={setStageKey} />{selected ? <StageSummary item={selected} /> : null}</div> : <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Typography.Text strong>沿用当前 Skill 的 Definition 与所属阶段</Typography.Text><Typography.Text type="secondary" className="mt-1 block text-xs">新版本不修改 Definition 名称、说明或阶段；版本号留空时由服务端自动增加补丁版。</Typography.Text></div>}
            <button type="button" onClick={chooseFolder} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`grid min-h-40 w-full place-items-center rounded-xl border border-dashed p-6 text-center transition ${dragging ? "border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] hover:bg-[var(--studio-hover-bg)]"}`}><span>{reading ? <Spin /> : <InboxOutlined className="text-3xl text-[var(--studio-accent)]" />}<span className="mt-3 block text-base font-semibold">{files.length ? layout.folderName || "已选文件" : "点击选择或拖入完整文件夹"}</span><span className="mt-1 block text-sm text-[var(--studio-text-muted)]">{files.length ? `${files.length} 个文件 · ${hasSkill ? "已找到根目录 SKILL.md" : "缺少根目录 SKILL.md"}` : "保留 rules、references、assets 等所有子目录"}</span></span></button>
            <input ref={inputRef} hidden type="file" multiple onChange={(event) => { const request = requestGuard.current.begin(); setReading(false); void acceptFiles(Array.from(event.target.files || []), request); event.target.value = ""; }} />
            {files.length && !hasSkill ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择根目录包含 SKILL.md 的文件夹" /> : null}
            {hasSkill ? updating ? <Field label="版本号"><Input value={fields.version} placeholder="留空则自动增加补丁版" onChange={(event) => setFields({ ...fields, version: event.target.value })} /></Field> : <div className="grid gap-3 sm:grid-cols-2"><Field label="Skill 名称"><Input value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} /></Field><Field label="版本号"><Input value={fields.version} onChange={(event) => setFields({ ...fields, version: event.target.value })} /></Field><div className="sm:col-span-2"><Field label="用途与说明"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={fields.summary} onChange={(event) => setFields({ ...fields, summary: event.target.value })} /></Field></div></div> : null}
            {updating && files.length ? <FileDiff diff={diff} loading={previousFiles.isLoading || diffing} error={diffError ? "无法生成差异，仍可导入" : previousFiles.error || !previousVersionId ? "上一版本没有可比对的文件快照，仍可导入" : ""} /> : null}
        </Flex>
    </Modal>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><Typography.Text strong className="mb-1.5 block text-xs">{label}</Typography.Text>{children}</label>; }
function FileDiff({ diff, loading, error }: { diff?: SkillFolderDiff; loading: boolean; error: string }) {
    if (loading) return <div className="rounded-lg border border-[var(--studio-border-subtle)] p-4 text-center"><Spin size="small" /><Typography.Text type="secondary" className="ml-2">正在对比当前选中版本…</Typography.Text></div>;
    if (error) return <Alert type="warning" showIcon message={error} />;
    if (!diff) return null;
    if (!diff.added.length && !diff.modified.length && !diff.deleted.length) return <Alert type="info" showIcon message="文件内容无变化" description="仍可提交，服务端会权威校验并拒绝重复内容。" />;
    return <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Typography.Text strong>相对当前选中版本的文件差异</Typography.Text><div className="mt-3 grid gap-3 sm:grid-cols-3"><DiffGroup label="新增" color="success" paths={diff.added} /><DiffGroup label="修改" color="warning" paths={diff.modified} /><DiffGroup label="删除" color="error" paths={diff.deleted} /></div>{diff.unchanged.length ? <Typography.Text type="secondary" className="mt-3 block text-xs">{diff.unchanged.length} 个文件未变化</Typography.Text> : null}</div>;
}
function DiffGroup({ label, color, paths }: { label: string; color: "success" | "warning" | "error"; paths: string[] }) { return <div><Tag color={color}>{label} {paths.length}</Tag><div className="mt-1 max-h-28 space-y-1 overflow-auto">{paths.length ? paths.map((path) => <Typography.Text key={path} title={path} className="block truncate text-xs">{path}</Typography.Text>) : <Typography.Text type="secondary" className="text-xs">无</Typography.Text>}</div></div>; }
function stageOption(item: SkillStageTemplate) { return { value: item.key, label: `${item.label} · ${item.outputType}` }; }
function StageSummary({ item }: { item: SkillStageTemplate }) { return <div className="mt-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Flex align="center" gap={8}><FolderOpenOutlined /><Typography.Text strong>{item.label}</Typography.Text><Tag>{item.executorKind === "image_model" ? "图片" : "文本"}</Tag></Flex><Typography.Text type="secondary" className="mt-2 block text-xs">{item.description}</Typography.Text><Typography.Text type="secondary" className="mt-2 block text-xs">{item.inputTypes.join(" + ")} → {item.outputType} × {item.outputMin}{item.outputMax > item.outputMin ? `–${item.outputMax}` : ""}</Typography.Text></div>; }
