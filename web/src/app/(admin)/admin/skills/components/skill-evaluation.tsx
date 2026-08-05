"use client";

import { CheckCircleFilled, CloseCircleFilled, DiffOutlined, PictureOutlined } from "@ant-design/icons";
import { Card, Descriptions, Empty, Flex, Tag, Typography } from "antd";

import type { SkillEvaluation, SkillEvaluationResult } from "@/services/api/admin-skills";
import { shortSkillHash } from "../skill-view";

export function SkillEvaluationPanel({ result, stored }: { result?: SkillEvaluationResult; stored?: SkillEvaluation }) {
    const evaluation = result?.evaluation || stored;
    if (!evaluation) return <Card size="small" title="最近试跑" className="studio-panel" variant="borderless"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前内容哈希尚无通过的试跑" /></Card>;
    const passed = evaluation.status === "passed";
    const diff = result?.diff || parseObject(evaluation.diffJson);
    return (
        <Card size="small" className="studio-panel" variant="borderless" title={<Flex align="center" gap={8}>{passed ? <CheckCircleFilled style={{ color: "var(--studio-success)" }} /> : <CloseCircleFilled style={{ color: "var(--studio-danger)" }} />}<span>最近试跑</span></Flex>} extra={<Tag color={passed ? "success" : "error"}>{passed ? "通过" : "未通过"}</Tag>}>
            <Descriptions size="small" column={1} styles={{ label: { width: 90 } }}>
                <Descriptions.Item label="运行方式">{evaluation.projectId ? `项目 ${evaluation.projectId}` : "独立试跑"}</Descriptions.Item>
                <Descriptions.Item label="输入快照"><Typography.Text code>{shortSkillHash(evaluation.inputHash)}</Typography.Text></Descriptions.Item>
                <Descriptions.Item label="图片理解"><PictureOutlined /> {result ? `${result.imageCount} 张` : "已冻结"}</Descriptions.Item>
                <Descriptions.Item label="耗时">{evaluation.durationMs ? `${(evaluation.durationMs / 1000).toFixed(1)} 秒` : "确定性检查"}</Descriptions.Item>
            </Descriptions>
            <div className="mt-3 rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3">
                <Flex align="center" gap={8} style={{ marginBottom: 8 }}><DiffOutlined /><Typography.Text strong>候选 / 基线</Typography.Text></Flex>
                <Flex gap={6} wrap><Tag color={diff.candidateStatus === "passed" ? "success" : "default"}>候选 {String(diff.candidateStatus || evaluation.status)}</Tag>{diff.baselineStatus ? <Tag>基线 {String(diff.baselineStatus)}</Tag> : null}{typeof diff.candidateItems === "number" ? <Tag>候选条目 {diff.candidateItems}</Tag> : null}</Flex>
            </div>
            {evaluation.errorMessage ? <Typography.Paragraph type="danger" style={{ margin: "12px 0 0" }}>{evaluation.errorMessage}</Typography.Paragraph> : null}
        </Card>
    );
}

function parseObject(value: string) { try { return JSON.parse(value || "{}") as Record<string, unknown>; } catch { return {}; } }
