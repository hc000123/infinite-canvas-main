"use client";

import { FileTextOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Flex, Skeleton, Typography } from "antd";
import { useEffect, useState } from "react";

import { fetchAdminSkillSourceFiles, fetchAdminSkillSourceText } from "@/services/api/admin-skills";
import { fetchProjectSkillSourceFiles, fetchProjectSkillSourceText } from "@/services/api/project-skills";

export function SkillSourceBrowser({ token, versionId, scope = "admin" }: { token: string; versionId: string; scope?: "admin" | "project" }) {
    const [path, setPath] = useState("");
    const files = useQuery({ queryKey: [scope, "skill-source", versionId, token], queryFn: () => scope === "admin" ? fetchAdminSkillSourceFiles(token, versionId) : fetchProjectSkillSourceFiles(token, versionId), enabled: Boolean(token && versionId), retry: false });
    useEffect(() => { if (!path || !files.data?.some((item) => item.path === path)) setPath(files.data?.find((item) => item.path === "SKILL.md")?.path || files.data?.find((item) => item.text)?.path || ""); }, [files.data, path]);
    const content = useQuery({ queryKey: [scope, "skill-source-text", versionId, path, token], queryFn: () => scope === "admin" ? fetchAdminSkillSourceText(token, versionId, path) : fetchProjectSkillSourceText(token, versionId, path), enabled: Boolean(token && versionId && path), retry: false });
    if (files.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (files.error) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前版本没有可浏览的外部文件夹" />;
    return <div className="grid min-h-96 grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-lg border border-[var(--studio-border-subtle)] max-lg:grid-cols-1"><div className="border-r border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-2 max-lg:border-b max-lg:border-r-0"><Flex align="center" gap={7} className="px-2 py-2"><FolderOpenOutlined /><Typography.Text strong>文件快照</Typography.Text></Flex><Flex vertical gap={2}>{(files.data || []).map((file) => <Button key={file.path} type={path === file.path ? "primary" : "text"} disabled={!file.text} icon={<FileTextOutlined />} style={{ justifyContent: "flex-start" }} onClick={() => setPath(file.path)}><span className="truncate">{file.path}</span></Button>)}</Flex></div><div className="min-w-0 p-4"><Flex justify="space-between" align="center"><Typography.Text strong>{path || "请选择文件"}</Typography.Text>{path ? <Typography.Text type="secondary" className="text-xs">只读快照</Typography.Text> : null}</Flex>{content.isLoading ? <Skeleton active paragraph={{ rows: 12 }} /> : <pre className="mt-3 max-h-[540px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--studio-panel-muted-bg)] p-4 text-xs leading-6 text-[var(--studio-text-secondary)]">{content.data?.content || ""}</pre>}</div></div>;
}
