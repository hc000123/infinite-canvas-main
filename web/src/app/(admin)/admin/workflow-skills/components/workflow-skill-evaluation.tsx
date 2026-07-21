"use client";

import { CheckCircleFilled, CloseCircleFilled, DiffOutlined, PictureOutlined } from "@ant-design/icons";
import { Card, Descriptions, Empty, Flex, Tag, Typography } from "antd";

import type { WorkflowSkillEvaluation, WorkflowSkillEvaluationResult } from "@/services/api/admin-workflow-skills";
import { shortWorkflowHash } from "../workflow-skill-view";

export function WorkflowSkillEvaluationPanel({ result, stored }: { result?: WorkflowSkillEvaluationResult; stored?: WorkflowSkillEvaluation }) {
    const evaluation = result?.evaluation || stored;
    if (!evaluation) {
        return (
            <Card size="small" title="发布前评测" className="studio-panel" variant="borderless">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有当前内容哈希的评测记录" />
            </Card>
        );
    }
    const passed = evaluation.status === "passed";
    const diff = result?.diff || parseObject(evaluation.diffJson);
    const addedFields = stringList(diff.addedFields);
    const removedFields = stringList(diff.removedFields);

    return (
        <Card
            size="small"
            className="studio-panel"
            variant="borderless"
            title={
                <Flex align="center" gap={8}>
                    {passed ? <CheckCircleFilled style={{ color: "var(--studio-success)" }} /> : <CloseCircleFilled style={{ color: "var(--studio-danger)" }} />}
                    <span>发布前评测</span>
                </Flex>
            }
            extra={<Tag color={passed ? "success" : "error"}>{passed ? "通过" : "未通过"}</Tag>}
        >
            <Descriptions size="small" column={1} styles={{ label: { width: 90 } }}>
                <Descriptions.Item label="测试项目">{evaluation.projectId || "契约自检"}</Descriptions.Item>
                <Descriptions.Item label="输入快照">
                    <Typography.Text code>{shortWorkflowHash(evaluation.inputHash)}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="图片理解">
                    <Flex align="center" gap={6}>
                        <PictureOutlined /> {result ? `${result.imageCount} 张` : "已冻结"}
                    </Flex>
                </Descriptions.Item>
                <Descriptions.Item label="耗时">{evaluation.durationMs ? `${(evaluation.durationMs / 1000).toFixed(1)} 秒` : "确定性检查"}</Descriptions.Item>
            </Descriptions>
            <div className="mt-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
                    <DiffOutlined />
                    <Typography.Text strong>相对当前版本</Typography.Text>
                </Flex>
                <Flex gap={6} wrap>
                    <Tag color={diff.candidateStatus === "passed" ? "success" : "error"}>候选 {String(diff.candidateStatus || evaluation.status)}</Tag>
                    {diff.baselineStatus ? <Tag color={diff.baselineStatus === "passed" ? "success" : "error"}>基线 {String(diff.baselineStatus)}</Tag> : null}
                    {typeof diff.candidateItems === "number" ? <Tag>候选条目 {diff.candidateItems}</Tag> : null}
                    {typeof diff.baselineItems === "number" ? <Tag>基线条目 {diff.baselineItems}</Tag> : null}
                </Flex>
                {addedFields.length || removedFields.length ? (
                    <Flex vertical gap={6} style={{ marginTop: 10 }}>
                        {addedFields.length ? <Typography.Text type="success">新增字段：{addedFields.join("、")}</Typography.Text> : null}
                        {removedFields.length ? <Typography.Text type="danger">移除字段：{removedFields.join("、")}</Typography.Text> : null}
                    </Flex>
                ) : null}
            </div>
            {evaluation.errorMessage ? (
                <Typography.Paragraph type="danger" style={{ margin: "12px 0 0" }}>
                    {evaluation.errorMessage}
                </Typography.Paragraph>
            ) : null}
        </Card>
    );
}

function parseObject(value: string) {
    try {
        return JSON.parse(value || "{}") as Record<string, unknown>;
    } catch {
        return {};
    }
}

function stringList(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
