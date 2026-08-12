"use client";

import { Alert, Button, Card, Col, Flex, Row, Skeleton, Statistic, Tag, Typography, theme } from "antd";
import dayjs from "dayjs";

import type { AdminAIUsagePeriodSummary } from "@/services/api/admin";
import type { AIUsagePeriod } from "@/services/api/usage";
import { dataCenterPeriodLabels } from "../data-center-view";

type Props = {
    balance: number;
    periods?: AdminAIUsagePeriodSummary[];
    period: AIUsagePeriod;
    loading: boolean;
    error: string;
    onPeriodChange: (period: AIUsagePeriod) => void;
    onRetry: () => void;
};

const emptyPeriods: AdminAIUsagePeriodSummary[] = (["day", "week", "month"] as AIUsagePeriod[]).map((key) => ({ key, startAt: "", endAt: "", netCredits: 0, usageCount: 0, userCount: 0 }));

export function DataCenterOverview({ balance, periods, period, loading, error, onPeriodChange, onRetry }: Props) {
    const { token } = theme.useToken();
    return (
        <section aria-labelledby="data-center-overview-title">
            <Flex justify="space-between" align="center" gap={12} wrap="wrap" className="mb-3">
                <div>
                    <Typography.Title id="data-center-overview-title" level={4} style={{ margin: 0 }}>
                        使用概览
                    </Typography.Title>
                    <Typography.Text type="secondary">快速了解余额与近期实际消耗</Typography.Text>
                </div>
            </Flex>
            {error ? (
                <Alert
                    className="mb-3"
                    type="error"
                    showIcon
                    message="使用概览暂时无法读取"
                    description={error}
                    action={
                        <Button type="link" onClick={onRetry}>
                            重试
                        </Button>
                    }
                />
            ) : null}
            <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} xl={6}>
                    <Card variant="borderless" style={{ height: "100%", background: token.colorPrimaryBg, outline: `1px solid ${token.colorPrimaryBorder}` }}>
                        <Statistic title="当前算力余额" value={balance} suffix="点" styles={{ content: { color: token.colorPrimary } }} />
                        <Typography.Text type="secondary" className="mt-3 block">账户当前可用额度</Typography.Text>
                    </Card>
                </Col>
                {(periods || emptyPeriods).map((item) => {
                    const selected = item.key === period;
                    return (
                        <Col xs={24} sm={12} xl={6} key={item.key}>
                            <Card
                                hoverable
                                variant="borderless"
                                onClick={() => onPeriodChange(item.key)}
                                style={{ height: "100%", cursor: "pointer", background: selected ? token.colorPrimaryBg : token.colorBgContainer, outline: selected ? `1px solid ${token.colorPrimaryBorder}` : "none" }}
                            >
                                {loading && !periods ? (
                                    <Skeleton active paragraph={{ rows: 1 }} />
                                ) : (
                                    <>
                                        <Flex justify="space-between" align="start">
                                            <Statistic title={`${dataCenterPeriodLabels[item.key]}实际消耗`} value={item.netCredits} suffix="点" />
                                            {selected ? <Tag color="processing">当前</Tag> : null}
                                        </Flex>
                                        <Flex gap={14} wrap="wrap" className="mt-3">
                                            <Typography.Text type="secondary">{formatRange(item)}</Typography.Text>
                                            <Typography.Text type="secondary">{item.usageCount} 次消费</Typography.Text>
                                            {item.userCount > 0 ? <Typography.Text type="secondary">{item.userCount} 人使用</Typography.Text> : null}
                                        </Flex>
                                    </>
                                )}
                            </Card>
                        </Col>
                    );
                })}
            </Row>
        </section>
    );
}

function formatRange(item: AdminAIUsagePeriodSummary) {
    if (!item.startAt || !item.endAt) return "-";
    const start = dayjs(item.startAt);
    const end = dayjs(item.endAt).subtract(1, "day");
    return start.isSame(end, "day") ? start.format("MM.DD") : `${start.format("MM.DD")} - ${end.format("MM.DD")}`;
}
