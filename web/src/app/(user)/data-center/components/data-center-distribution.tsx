"use client";

import { Card, Empty, Flex, Progress, Space, Table, Tag, Typography } from "antd";

import type { AdminAIUsageSummaryResponse, AdminAIUsageUser } from "@/services/api/admin";
import type { AIUsageScope, UserAIUsageSummary } from "@/services/api/usage";
import { dataCenterKindLabels, dataCenterPeriodLabels } from "../data-center-view";
import type { DataCenterSummary } from "../use-data-center";

type Props = { scope: AIUsageScope; summary?: DataCenterSummary; loading: boolean };

export function DataCenterDistribution({ scope, summary, loading }: Props) {
    const period = summary?.selectedPeriod || "month";
    return (
        <section aria-labelledby="data-center-distribution-title">
            <Flex justify="space-between" align="center" className="mb-3">
                <div>
                    <Typography.Title id="data-center-distribution-title" level={4} style={{ margin: 0 }}>
                        使用分布
                    </Typography.Title>
                    <Typography.Text type="secondary">{scope === "mine" ? "按生成类型查看消耗构成" : "按成员查看团队消耗占比"}</Typography.Text>
                </div>
                <Tag>{dataCenterPeriodLabels[period]}</Tag>
            </Flex>
            <Card variant="borderless">
                {scope === "mine" ? <KindDistribution summary={summary as UserAIUsageSummary | undefined} loading={loading} /> : <UserDistribution summary={summary as AdminAIUsageSummaryResponse | undefined} loading={loading} />}
            </Card>
        </section>
    );
}

function KindDistribution({ summary, loading }: { summary?: UserAIUsageSummary; loading: boolean }) {
    if (!loading && !summary?.kinds.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该周期暂无实际消耗" />;
    return (
        <Space orientation="vertical" size={18} style={{ width: "100%" }}>
            {(summary?.kinds || []).map((item) => (
                <div key={item.kind}>
                    <Flex justify="space-between" gap={12}>
                        <Typography.Text strong>{dataCenterKindLabels[item.kind] || item.kind}</Typography.Text>
                        <Typography.Text type="secondary">
                            {item.netCredits} 点 · {item.usageCount} 次
                        </Typography.Text>
                    </Flex>
                    <Progress percent={Number((item.ratio * 100).toFixed(1))} showInfo size="small" />
                </div>
            ))}
            {loading && !summary ? <Typography.Text type="secondary">正在读取使用分布...</Typography.Text> : null}
        </Space>
    );
}

function UserDistribution({ summary, loading }: { summary?: AdminAIUsageSummaryResponse; loading: boolean }) {
    if (!loading && !summary?.users.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该周期暂无团队消耗" />;
    return (
        <Table<AdminAIUsageUser>
            rowKey="userId"
            loading={loading}
            dataSource={summary?.users || []}
            pagination={false}
            scroll={{ x: 680 }}
            columns={[
                {
                    title: "成员",
                    render: (_, item) => (
                        <Flex vertical>
                            <Typography.Text strong>{item.user?.displayName || item.user?.username || "已删除用户"}</Typography.Text>
                            <Typography.Text type="secondary" copyable={{ text: item.userId }}>
                                {item.user?.username || item.userId}
                            </Typography.Text>
                        </Flex>
                    ),
                },
                { title: "实际消耗", dataIndex: "netCredits", width: 130, render: (value: number) => `${value} 点` },
                { title: "消费次数", dataIndex: "usageCount", width: 110, render: (value: number) => `${value} 次` },
                { title: "占比", dataIndex: "ratio", width: 220, render: (value: number) => <Progress percent={Number((value * 100).toFixed(1))} size="small" /> },
            ]}
        />
    );
}
