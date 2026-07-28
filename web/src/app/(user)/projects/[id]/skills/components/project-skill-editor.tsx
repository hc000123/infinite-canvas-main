"use client";

import { DeleteOutlined, FileAddOutlined, FileTextOutlined } from "@ant-design/icons";
import { Button, Card, Divider, Flex, Input, InputNumber, Select, Switch, Tabs, Typography } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { SkillInputContract, SkillManifest, SkillOutputContract, SkillPackage } from "@/services/api/admin-skills";

export function ProjectSkillEditor({ value, readOnly, onChange }: { value: SkillPackage; readOnly: boolean; onChange: (value: SkillPackage) => void }) {
    const updateManifest = <K extends keyof SkillManifest>(key: K, next: SkillManifest[K]) => onChange({ ...value, manifest: { ...value.manifest, [key]: next } });
    const updateInput = <K extends keyof SkillInputContract>(key: K, next: SkillInputContract[K]) => onChange({ ...value, inputContract: { ...value.inputContract, [key]: next } });
    const updateOutput = <K extends keyof SkillOutputContract>(key: K, next: SkillOutputContract[K]) => onChange({ ...value, outputContract: { ...value.outputContract, [key]: next } });
    const updateImages = <K extends keyof SkillInputContract["imagePolicy"]>(key: K, next: SkillInputContract["imagePolicy"][K]) => updateInput("imagePolicy", { ...value.inputContract.imagePolicy, [key]: next });

    return (
        <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 0 } }}>
            <Tabs tabBarStyle={{ padding: "0 16px", margin: 0 }} items={[
                { key: "files", label: "Skill 指令", children: <SkillFiles value={value} readOnly={readOnly} onChange={onChange} /> },
                { key: "manifest", label: "能力与 Artifact", children: <EditorGrid>
                    <Field label="Capabilities" hint="画布 Agent、Workflow 与 API 都按这些能力发现当前版本"><Select mode="tags" disabled={readOnly} value={value.manifest.capabilities} onChange={(next) => updateManifest("capabilities", next)} /></Field>
                    <Field label="项目标签"><Select mode="tags" disabled={readOnly} value={value.manifest.projectTags} onChange={(next) => updateManifest("projectTags", next)} /></Field>
                    <Field label="输入 Artifact"><Select mode="tags" disabled={readOnly} value={value.manifest.inputArtifactTypes} onChange={(next) => updateManifest("inputArtifactTypes", next)} /></Field>
                    <Field label="输出 Artifact"><Select mode="tags" disabled={readOnly} value={value.manifest.outputArtifactTypes} onChange={(next) => updateManifest("outputArtifactTypes", next)} /></Field>
                    <Field label="副作用"><Select mode="tags" disabled={readOnly} value={value.manifest.sideEffects} onChange={(next) => updateManifest("sideEffects", next)} options={["none", "business_write", "external_api"].map(option)} /></Field>
                    <Field label="成本级别"><Select disabled={readOnly} value={value.manifest.estimatedCostClass} onChange={(next) => updateManifest("estimatedCostClass", next)} options={["none", "text_low", "text_high", "image", "video"].map(option)} /></Field>
                    <Field label="Schema 兼容范围" wide><JsonEditor readOnly={readOnly} value={value.manifest.schemaCompatibility} onChange={(next) => updateManifest("schemaCompatibility", next as Record<string, string>)} /></Field>
                </EditorGrid> },
                { key: "input", label: "运行输入", children: <EditorGrid>
                    <Field label="必需运行输入"><Select mode="tags" disabled={readOnly} value={value.inputContract.requiredInputs} onChange={(next) => updateInput("requiredInputs", next)} options={["workflow", "script", "upstreamArtifact", "shotContext", "referenceImages"].map(option)} /></Field>
                    <Field label="允许图片格式"><Select mode="tags" disabled={readOnly} value={value.inputContract.imagePolicy.allowedTypes} onChange={(next) => updateImages("allowedTypes", next)} options={["image/png", "image/jpeg", "image/webp"].map(option)} /></Field>
                    <Field label="图片数量"><Flex gap={8}><InputNumber min={0} max={9} disabled={readOnly} value={value.inputContract.imagePolicy.min} onChange={(next) => updateImages("min", next ?? 0)} addonBefore="最少" /><InputNumber min={0} max={9} disabled={readOnly} value={value.inputContract.imagePolicy.max} onChange={(next) => updateImages("max", next ?? 0)} addonBefore="最多" /></Flex></Field>
                    <Field label="图片策略"><Flex vertical gap={10}><Flex justify="space-between"><Typography.Text>必须提供图片</Typography.Text><Switch disabled={readOnly} checked={value.inputContract.imagePolicy.required} onChange={(next) => updateImages("required", next)} /></Flex><Flex justify="space-between"><Typography.Text>允许无图降级</Typography.Text><Switch disabled={readOnly} checked={value.inputContract.imagePolicy.allowTextFallback} onChange={(next) => updateImages("allowTextFallback", next)} /></Flex></Flex></Field>
                </EditorGrid> },
                { key: "output", label: "输出契约", children: <EditorGrid>
                    <Field label="Schema 版本"><Input disabled={readOnly} value={value.outputContract.schemaVersion} onChange={(event) => updateOutput("schemaVersion", event.target.value)} /></Field>
                    <Field label="质量门 Profile"><Select mode="tags" disabled={readOnly} value={value.qualityGateProfile} onChange={(next) => onChange({ ...value, qualityGateProfile: next })} options={["schema", "script", "asset", "storyboard", "media", "delivery"].map(option)} /></Field>
                    <Field label="结构化输出 JSON Schema" wide><JsonEditor readOnly={readOnly} value={value.outputContract.schema} onChange={(next) => updateOutput("schema", next)} rows={18} /></Field>
                </EditorGrid> },
            ]} />
        </Card>
    );
}

function SkillFiles({ value, readOnly, onChange }: { value: SkillPackage; readOnly: boolean; onChange: (value: SkillPackage) => void }) {
    const names = useMemo(() => Object.keys(value.files).sort((left, right) => left === "SKILL.md" ? -1 : right === "SKILL.md" ? 1 : left.localeCompare(right)), [value.files]);
    const [active, setActive] = useState("SKILL.md");
    const [newName, setNewName] = useState("");
    useEffect(() => { if (!(active in value.files)) setActive(names[0] || "SKILL.md"); }, [active, names, value.files]);
    const add = () => {
        const name = newName.trim().replaceAll("\\", "/");
        if (!name || value.files[name]) return;
        onChange({ ...value, files: { ...value.files, [name]: "" } });
        setActive(name);
        setNewName("");
    };
    return <div className="grid min-h-[480px] grid-cols-[190px_minmax(0,1fr)] max-lg:grid-cols-1">
        <div className="border-r border-[var(--studio-border-subtle)] p-3 max-lg:border-b max-lg:border-r-0">
            <Flex vertical gap={5}>{names.map((name) => <Button key={name} type={active === name ? "primary" : "text"} icon={<FileTextOutlined />} style={{ justifyContent: "flex-start" }} onClick={() => setActive(name)}><span className="truncate">{name}</span></Button>)}</Flex>
            {readOnly ? null : <><Divider style={{ margin: "12px 0" }} /><Flex vertical gap={8}><Input size="small" value={newName} placeholder="rules/domain.md" onChange={(event) => setNewName(event.target.value)} onPressEnter={add} /><Button size="small" icon={<FileAddOutlined />} onClick={add}>新增文件</Button></Flex></>}
        </div>
        <div className="p-4"><Flex justify="space-between" align="center" style={{ marginBottom: 10 }}><div><Typography.Text strong>{active}</Typography.Text><Typography.Text type="secondary" className="block text-xs">{readOnly ? "系统 Skill 与已发布版本只读" : "保存草稿后会生成新的内容哈希"}</Typography.Text></div>{!readOnly && active !== "SKILL.md" ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => { const files = { ...value.files }; delete files[active]; onChange({ ...value, files }); setActive("SKILL.md"); }}>删除</Button> : null}</Flex><Input.TextArea readOnly={readOnly} value={value.files[active] || ""} autoSize={{ minRows: 20, maxRows: 30 }} onChange={(event) => onChange({ ...value, files: { ...value.files, [active]: event.target.value } })} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.7 }} /></div>
    </div>;
}

function EditorGrid({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-4 p-4 max-lg:grid-cols-1">{children}</div>; }
function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) { return <Flex vertical gap={6} style={wide ? { gridColumn: "1 / -1" } : undefined}><Typography.Text strong>{label}</Typography.Text>{hint ? <Typography.Text type="secondary" className="text-xs">{hint}</Typography.Text> : null}{children}</Flex>; }
function option(value: string) { return { value, label: value }; }

function JsonEditor({ value, readOnly, onChange, rows = 8 }: { value: Record<string, unknown>; readOnly: boolean; onChange: (value: Record<string, unknown>) => void; rows?: number }) {
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));
    const [error, setError] = useState("");
    useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
    const commit = () => { try { onChange(JSON.parse(text) as Record<string, unknown>); setError(""); } catch { setError("JSON 格式不正确，修改尚未应用"); } };
    return <><Input.TextArea readOnly={readOnly} value={text} rows={rows} status={error ? "error" : undefined} onChange={(event) => setText(event.target.value)} onBlur={commit} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />{error ? <Typography.Text type="danger" className="text-xs">{error}</Typography.Text> : null}</>;
}
