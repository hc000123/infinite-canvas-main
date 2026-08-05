"use client";

import { FolderOpenOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Empty, Flex, Modal, Select, Tag, Typography } from "antd";
import { useMemo, useRef, useState } from "react";

import { fetchAdminSkillStageTemplates, importAdminSkillFolder, importAdminSkillFolderVersion, type SkillStageTemplate } from "@/services/api/admin-skills";
import { fetchProjectSkillStageTemplates, importProjectSkillFolder, importProjectSkillFolderVersion } from "@/services/api/project-skills";

type SkillFolderImportResult = { skill?: { id: string }; version?: { id: string } | string; id?: string };

export function SkillFolderImport({ open, token, scope = "admin", projectId, skillId, onCancel, onImported }: { open: boolean; token: string; scope?: "admin" | "project"; projectId?: string; skillId?: string; onCancel: () => void; onImported: (skillId?: string, versionId?: string) => void }) {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [stageKey, setStageKey] = useState("");
    const updating = Boolean(skillId);
    const templates = useQuery({ queryKey: [scope, "skill-stage-templates", token], queryFn: () => scope === "admin" ? fetchAdminSkillStageTemplates(token) : fetchProjectSkillStageTemplates(token), enabled: open && !updating && Boolean(token), retry: false });
    const selected = templates.data?.find((item) => item.key === stageKey);
    const folderName = useMemo(() => files[0]?.webkitRelativePath?.split("/")[0] || "", [files]);
    const hasSkill = useMemo(() => files.some((file) => {
        const path = file.webkitRelativePath || file.name;
        return path === "SKILL.md" || path === `${folderName}/SKILL.md`;
    }), [files, folderName]);
    const mutation = useMutation<SkillFolderImportResult>({
        mutationFn: (): Promise<SkillFolderImportResult> => updating
            ? scope === "admin" ? importAdminSkillFolderVersion(token, skillId!, files) : importProjectSkillFolderVersion(token, skillId!, files)
            : scope === "admin" ? importAdminSkillFolder(token, files, { ownerType: "system", stageKey }) : importProjectSkillFolder(token, files, { ownerType: "project", projectId, stageKey }),
        onSuccess: (result) => {
            message.success(updating ? "新版本已载入，请先试跑" : "Skill 文件夹已载入，请先试跑");
            setFiles([]);
            setStageKey("");
            onImported(result.skill?.id, typeof result.version === "object" ? result.version.id : result.id);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "导入失败"),
    });
    const chooseFolder = () => {
        inputRef.current?.setAttribute("webkitdirectory", "");
        inputRef.current?.click();
    };
    return <Modal width={680} title={updating ? "载入 Skill 新版本" : "载入外部 Skill 文件夹"} open={open} onCancel={onCancel} footer={<Flex justify="space-between" align="center"><Typography.Text type="secondary">系统会冻结完整文件夹，不执行其中脚本。</Typography.Text><Flex gap={8}><Button onClick={onCancel}>取消</Button><Button type="primary" loading={mutation.isPending} disabled={!files.length || !hasSkill || (!updating && !stageKey)} onClick={() => mutation.mutate()}>载入并创建草稿</Button></Flex></Flex>}>
        <Flex vertical gap={16}>
            {!updating ? <div><Typography.Text strong>选择所属阶段</Typography.Text><Typography.Paragraph type="secondary" className="mt-1">只需选阶段；Capability、Artifact 和 Schema 由系统自动配置。</Typography.Paragraph><Select className="w-full" showSearch optionFilterProp="label" placeholder="例如：剧本整理" value={stageKey || undefined} loading={templates.isLoading} options={(templates.data || []).map(stageOption)} onChange={setStageKey} />{selected ? <StageSummary item={selected} /> : null}</div> : <div className="rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Typography.Text strong>沿用当前 Skill 的所属阶段</Typography.Text><Typography.Text type="secondary" className="mt-1 block text-xs">新版本不会改变阶段契约，版本号优先读取 SKILL.md，否则自动增加补丁版。</Typography.Text></div>}
            <button type="button" onClick={chooseFolder} className="grid min-h-44 w-full place-items-center rounded-xl border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)] p-6 text-center transition hover:bg-[var(--studio-hover-bg)]"><span><InboxOutlined className="text-3xl text-[var(--studio-accent)]" /><span className="mt-3 block text-base font-semibold">{files.length ? folderName || "已选文件" : "选择完整文件夹"}</span><span className="mt-1 block text-sm text-[var(--studio-text-muted)]">{files.length ? `${files.length} 个文件 · ${hasSkill ? "已找到根目录 SKILL.md" : "缺少根目录 SKILL.md"}` : "保留 rules、references、assets 等所有子目录"}</span></span></button>
            <input ref={inputRef} hidden type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            {files.length && !hasSkill ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择根目录包含 SKILL.md 的文件夹" /> : null}
        </Flex>
    </Modal>;
}

function stageOption(item: SkillStageTemplate) { return { value: item.key, label: `${item.label} · ${item.outputType}` }; }
function StageSummary({ item }: { item: SkillStageTemplate }) { return <div className="mt-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3"><Flex align="center" gap={8}><FolderOpenOutlined /><Typography.Text strong>{item.label}</Typography.Text><Tag>{item.executorKind === "image_model" ? "图片" : "文本"}</Tag></Flex><Typography.Text type="secondary" className="mt-2 block text-xs">{item.description}</Typography.Text><Typography.Text type="secondary" className="mt-2 block text-xs">{item.inputTypes.join(" + ")} → {item.outputType} × {item.outputMin}{item.outputMax > item.outputMin ? `–${item.outputMax}` : ""}</Typography.Text></div>; }
