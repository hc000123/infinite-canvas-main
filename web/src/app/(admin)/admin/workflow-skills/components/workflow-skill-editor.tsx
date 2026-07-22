"use client";

import { DeleteOutlined, FileAddOutlined, FileTextOutlined } from "@ant-design/icons";
import { Button, Card, Divider, Flex, Input, InputNumber, Select, Switch, Tabs, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { WorkflowSkillContract, WorkflowSkillPackage, WorkflowSkillStageKey } from "@/services/api/admin-workflow-skills";

type Props = {
    value: WorkflowSkillPackage;
    readOnly: boolean;
    onChange: (value: WorkflowSkillPackage) => void;
};

const stageOptions: { value: WorkflowSkillStageKey; label: string }[] = [
    { value: "script", label: "剧本确认" },
    { value: "art", label: "资产提取" },
    { value: "assets", label: "资产生图提示词" },
    { value: "storyboard", label: "分镜拆解" },
    { value: "video", label: "镜头提示词" },
    { value: "delivery", label: "审核交付" },
];

export function WorkflowSkillEditor({ value, readOnly, onChange }: Props) {
    const fileNames = useMemo(() => Object.keys(value.files).sort((left, right) => (left === "SKILL.md" ? -1 : right === "SKILL.md" ? 1 : left.localeCompare(right))), [value.files]);
    const [activeFile, setActiveFile] = useState("SKILL.md");
    const [newFileName, setNewFileName] = useState("");

    useEffect(() => {
        if (!value.files[activeFile]) setActiveFile("SKILL.md");
    }, [activeFile, value.files]);

    const updateContract = <Key extends keyof WorkflowSkillContract>(key: Key, next: WorkflowSkillContract[Key]) => onChange({ ...value, contract: { ...value.contract, [key]: next } });
    const updateImagePolicy = <Key extends keyof WorkflowSkillContract["imagePolicy"]>(key: Key, next: WorkflowSkillContract["imagePolicy"][Key]) => updateContract("imagePolicy", { ...value.contract.imagePolicy, [key]: next });

    const addFile = () => {
        const name = newFileName.trim().replaceAll("\\", "/");
        if (!name || value.files[name]) return;
        onChange({ ...value, files: { ...value.files, [name]: "" } });
        setActiveFile(name);
        setNewFileName("");
    };

    return (
        <Card className="studio-panel" variant="borderless" styles={{ body: { padding: 0 } }}>
            <Tabs
                defaultActiveKey="instructions"
                items={[
                    {
                        key: "instructions",
                        label: "Skill 文件",
                        children: (
                            <div className="grid min-h-[520px] grid-cols-[190px_minmax(0,1fr)] max-lg:grid-cols-1">
                                <div className="border-r border-[var(--studio-border-subtle)] p-3 max-lg:border-b max-lg:border-r-0">
                                    <Flex vertical gap={6}>
                                        {fileNames.map((name) => (
                                            <Button key={name} type={activeFile === name ? "primary" : "text"} icon={<FileTextOutlined />} style={{ justifyContent: "flex-start" }} onClick={() => setActiveFile(name)}>
                                                <span className="truncate">{name}</span>
                                            </Button>
                                        ))}
                                    </Flex>
                                    {!readOnly ? (
                                        <>
                                            <Divider style={{ margin: "12px 0" }} />
                                            <Flex vertical gap={8}>
                                                <Input size="small" value={newFileName} placeholder="例如 examples.md" onChange={(event) => setNewFileName(event.target.value)} onPressEnter={addFile} />
                                                <Button size="small" icon={<FileAddOutlined />} onClick={addFile}>
                                                    新增文本文件
                                                </Button>
                                            </Flex>
                                        </>
                                    ) : null}
                                </div>
                                <div className="p-4">
                                    <Flex align="center" justify="space-between" gap={12} style={{ marginBottom: 12 }}>
                                        <div>
                                            <Typography.Text strong>{activeFile}</Typography.Text>
                                            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                                                {activeFile === "SKILL.md" ? "阶段执行的主说明，运行时会被冻结到任务。" : "附属规则、示例或输出说明。"}
                                            </Typography.Text>
                                        </div>
                                        {!readOnly && activeFile !== "SKILL.md" ? (
                                            <Button
                                                danger
                                                type="text"
                                                icon={<DeleteOutlined />}
                                                onClick={() => {
                                                    const files = { ...value.files };
                                                    delete files[activeFile];
                                                    onChange({ ...value, files });
                                                    setActiveFile("SKILL.md");
                                                }}
                                            >
                                                删除
                                            </Button>
                                        ) : null}
                                    </Flex>
                                    <Input.TextArea
                                        value={value.files[activeFile] || ""}
                                        readOnly={readOnly}
                                        autoSize={{ minRows: 20, maxRows: 30 }}
                                        placeholder="写清楚阶段目标、判断顺序、输出要求和禁止事项。"
                                        onChange={(event) => onChange({ ...value, files: { ...value.files, [activeFile]: event.target.value } })}
                                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.7 }}
                                    />
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "contract",
                        label: "输入输出契约",
                        children: (
                            <div className="grid grid-cols-2 gap-4 p-4 max-lg:grid-cols-1">
                                <ContractCard title="输入要求" description="正式运行和 dry-run 都按此检查输入。">
                                    <Field label="必需输入">
                                        <Select
                                            mode="tags"
                                            disabled={readOnly}
                                            value={value.contract.requiredInputs}
                                            onChange={(next) => updateContract("requiredInputs", next)}
                                            options={["workflow", "script", "upstreamArtifact"].map((item) => ({ value: item, label: item }))}
                                        />
                                    </Field>
                                    <Field label="允许的图片格式">
                                        <Select
                                            mode="multiple"
                                            disabled={readOnly}
                                            value={value.contract.imagePolicy.allowedTypes}
                                            onChange={(next) => updateImagePolicy("allowedTypes", next)}
                                            options={["image/png", "image/jpeg", "image/webp"].map((item) => ({ value: item, label: item }))}
                                        />
                                    </Field>
                                    <Flex gap={16} wrap>
                                        <Field label="最少图片">
                                            <InputNumber min={0} max={9} disabled={readOnly} value={value.contract.imagePolicy.min} onChange={(next) => updateImagePolicy("min", next || 0)} />
                                        </Field>
                                        <Field label="最多图片">
                                            <InputNumber min={0} max={9} disabled={readOnly} value={value.contract.imagePolicy.max} onChange={(next) => updateImagePolicy("max", next || 0)} />
                                        </Field>
                                    </Flex>
                                    <Flex align="center" justify="space-between">
                                        <Typography.Text>必须上传图片</Typography.Text>
                                        <Switch disabled={readOnly} checked={value.contract.imagePolicy.required} onChange={(next) => updateImagePolicy("required", next)} />
                                    </Flex>
                                    <Flex align="center" justify="space-between">
                                        <Typography.Text>允许无图降级</Typography.Text>
                                        <Switch disabled={readOnly} checked={value.contract.imagePolicy.allowTextFallback} onChange={(next) => updateImagePolicy("allowTextFallback", next)} />
                                    </Flex>
                                </ContractCard>
                                <ContractCard title="输出与门禁" description="Skill 不能关闭服务端硬质量门。">
                                    <Field label="输出契约版本">
                                        <Input disabled={readOnly} value={value.contract.outputSchemaVersion} onChange={(event) => updateContract("outputSchemaVersion", event.target.value)} />
                                    </Field>
                                    <Field label="质量门">
                                        <Select
                                            mode="tags"
                                            disabled={readOnly}
                                            value={value.contract.qualityGateProfile}
                                            onChange={(next) => updateContract("qualityGateProfile", next)}
                                            options={["schema", "script", "art", "storyboard", "media", "delivery"].map((item) => ({ value: item, label: item }))}
                                        />
                                    </Field>
                                    <Field label="允许写入阶段">
                                        <Select mode="multiple" disabled={readOnly} value={value.contract.applyTargets} onChange={(next) => updateContract("applyTargets", next)} options={stageOptions} />
                                    </Field>
                                    <Field label="输出结构（JSON Schema）">
                                        <JsonSchemaEditor readOnly={readOnly} value={value.contract.outputSchema} onChange={(next) => updateContract("outputSchema", next)} />
                                    </Field>
                                </ContractCard>
                                <Flex gap={8} wrap style={{ gridColumn: "1 / -1" }}>
                                    <Tag color={value.contract.imagePolicy.max <= 9 ? "success" : "error"}>图片上限 {value.contract.imagePolicy.max}/9</Tag>
                                    <Tag color={value.contract.outputSchemaVersion.startsWith("1.") ? "success" : "error"}>Schema {value.contract.outputSchemaVersion || "未设置"}</Tag>
                                    <Tag>{value.contract.qualityGateProfile.length} 个质量门</Tag>
                                    <Tag>{value.contract.applyTargets.length} 个写入目标</Tag>
                                </Flex>
                            </div>
                        ),
                    },
                ]}
                tabBarStyle={{ padding: "0 16px", margin: 0 }}
            />
        </Card>
    );
}

function ContractCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return (
        <Card
            size="small"
            title={title}
            extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {description}
                </Typography.Text>
            }
        >
            <Flex vertical gap={14}>
                {children}
            </Flex>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Flex vertical gap={6} style={{ minWidth: 120, flex: 1 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {label}
            </Typography.Text>
            {children}
        </Flex>
    );
}

function JsonSchemaEditor({ value, readOnly, onChange }: { value: Record<string, unknown>; readOnly: boolean; onChange: (value: Record<string, unknown>) => void }) {
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));
    const [error, setError] = useState("");

    useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);

    const commit = () => {
        try {
            onChange(JSON.parse(text) as Record<string, unknown>);
            setError("");
        } catch {
            setError("JSON 格式不正确，尚未应用本次修改");
        }
    };

    return (
        <>
            <Input.TextArea
                readOnly={readOnly}
                autoSize={{ minRows: 8, maxRows: 14 }}
                value={text}
                status={error ? "error" : undefined}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
            {error ? (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {error}
                </Typography.Text>
            ) : null}
        </>
    );
}
