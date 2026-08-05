"use client";

import { CheckCircleFilled, CloseCircleFilled, ExperimentOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { App, Checkbox, Collapse, Empty, Flex, Input, Modal, Tabs, Tag, Typography } from "antd";
import { useState } from "react";

import { trialAdminSkillVersion, type SkillTrialInput, type SkillTrialResult } from "@/services/api/admin-skills";
import { trialProjectSkillVersion } from "@/services/api/project-skills";

export function SkillTrialPanel({ open, token, versionId, scope = "admin", onCancel, onCompleted }: { open: boolean; token: string; versionId: string; scope?: "admin" | "project"; onCancel: () => void; onCompleted: (result: SkillTrialResult) => void }) {
    const { message } = App.useApp();
    const [inputText, setInputText] = useState("");
    const [artifactText, setArtifactText] = useState("[]");
    const [confirmAPICost, setConfirmAPICost] = useState(false);
    const [result, setResult] = useState<SkillTrialResult>();
    const mutation = useMutation({
        mutationFn: () => scope === "admin" ? trialAdminSkillVersion(token, versionId, trialInput(inputText, artifactText, confirmAPICost)) : trialProjectSkillVersion(token, versionId, trialInput(inputText, artifactText, confirmAPICost)),
        onSuccess: (value) => { setResult(value); onCompleted(value); value.evaluation.status === "passed" ? message.success("试跑通过，已可发布为可用版本") : message.warning("试跑未通过，请查看问题后更新文件夹"); },
        onError: (error) => message.error(error instanceof Error ? error.message : "试跑失败"),
    });
    return <Modal width={980} title={<Flex align="center" gap={8}><ExperimentOutlined /><span>独立试跑</span><Tag>不需要 Workflow Run</Tag></Flex>} open={open} onCancel={onCancel} okText="运行内容 Skill + 固定转换" cancelText="关闭" confirmLoading={mutation.isPending} okButtonProps={{ disabled: (!inputText.trim() && artifactText.trim() === "[]") || !confirmAPICost }} onOk={() => mutation.mutate()}>
        <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]"><Flex vertical gap={12}><div><Typography.Text strong>测试输入</Typography.Text><Typography.Paragraph type="secondary" className="mt-1">粘贴一段真实项目内容。系统会保留模型原始输出，再运行锁定的结构转换。</Typography.Paragraph><Input.TextArea rows={14} value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder="粘贴剧本、资产信息或上一阶段内容…" /></div><Collapse ghost items={[{ key: "artifact", label: "高级：使用已有 Artifact 引用", children: <Input.TextArea rows={5} value={artifactText} onChange={(event) => setArtifactText(event.target.value)} placeholder='[{"bindingName":"source_text","artifactId":"...","contentHash":"..."}]' /> }]} /><Checkbox checked={confirmAPICost} onChange={(event) => setConfirmAPICost(event.target.checked)}>我了解本次试跑可能产生模型调用费用</Checkbox></Flex><TrialResult result={result} /></div>
    </Modal>;
}

function trialInput(inputText: string, artifactText: string, confirmApiCost: boolean): SkillTrialInput {
    let inputArtifacts: SkillTrialInput["inputArtifacts"] = [];
    try { inputArtifacts = JSON.parse(artifactText || "[]") as SkillTrialInput["inputArtifacts"]; } catch { throw new Error("Artifact 引用 JSON 格式不正确"); }
    return { inputText, inputArtifacts, confirmApiCost };
}
function TrialResult({ result }: { result?: SkillTrialResult }) {
    if (!result) return <div className="grid min-h-[460px] place-items-center rounded-xl border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-panel-muted-bg)]"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="运行后在这里对比原始输出与标准产物" /></div>;
    const passed = result.evaluation.status === "passed";
    const json = (value: unknown) => <pre className="max-h-[430px] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--studio-panel-muted-bg)] p-4 text-xs leading-6">{JSON.stringify(value, null, 2)}</pre>;
    return <div className="min-w-0 rounded-xl border border-[var(--studio-border-subtle)] p-3"><Flex align="center" justify="space-between"><Flex align="center" gap={8}>{passed ? <CheckCircleFilled className="text-[var(--studio-success)]" /> : <CloseCircleFilled className="text-[var(--studio-danger)]" />}<Typography.Text strong>{passed ? "试跑通过" : "试跑未通过"}</Typography.Text></Flex><Tag color={passed ? "success" : "error"}>{result.stageKey}</Tag></Flex><Tabs className="mt-2" items={[{ key: "standard", label: "标准产物", children: json(result.standard) }, { key: "raw", label: "模型原始输出", children: json(result.raw) }, { key: "diff", label: "转换差异", children: json(result.diff) }, { key: "gates", label: `问题 ${result.gates.length}`, children: result.gates.length ? <Flex vertical gap={8}>{result.gates.map((gate, index) => <div key={`${gate.code}-${index}`} className="rounded-lg border border-[var(--studio-border-subtle)] p-3"><Typography.Text strong>{gate.message}</Typography.Text><Typography.Text type="secondary" className="mt-1 block text-xs">{gate.code}{gate.itemId ? ` · ${gate.itemId}` : ""}</Typography.Text></div>)}</Flex> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有阻断问题" /> }]} /></div>;
}
