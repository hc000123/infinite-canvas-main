"use client";

import { Alert, Card, Col, Empty, Flex, Progress, Row, Space, Statistic, Table, Tag, Typography, theme } from "antd";
import dayjs from "dayjs";

import type { AdminAIUsagePeriod, AdminAIUsagePeriodSummary, AdminAIUsageUser } from "@/services/api/admin";
import { adminUsageUserDisplay } from "../../users/admin-user-display";
import { useAdminAIUsageSummary } from "../use-admin-ai-usage-summary";

const periodLabels: Record<AdminAIUsagePeriod, string> = { day: "今日", week: "本周", month: "本月" };

export function AIUsageSummary() {
    const { token } = theme.useToken();
    const { data, period, page, pageSize, isLoading, isError, errorMessage, changePeriod, changePage, changePageSize, refreshSummary } = useAdminAIUsageSummary();

    if (isError) {
        return <Alert type="error" showIcon message="使用统计暂时无法读取" description={errorMessage} action={<Typography.Link onClick={() => void refreshSummary()}>重试</Typography.Link>} />;
    }

    return (
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={[16, 16]}>
                {(data?.periods || defaultPeriods).map((item) => {
                    const selected = item.key === period;
                    return (
                        <Col xs={24} md={8} key={item.key}>
                            <Card
                                hoverable
                                variant="borderless"
                                onClick={() => changePeriod(item.key)}
                                style={{ background: selected ? token.colorPrimaryBg : token.colorBgContainer, outline: selected ? `1px solid ${token.colorPrimaryBorder}` : "none" }}
                            >
                                <Flex justify="space-between" align="start">
                                    <Statistic title={`${periodLabels[item.key]}实际消耗`} value={item.netCredits} suffix="点" loading={isLoading} />
                                    {selected ? <Tag color="processing">当前</Tag> : null}
                                </Flex>
                                <Flex gap={16} wrap style={{ marginTop: 12 }}>
                                    <Typography.Text type="secondary">{formatRange(item)}</Typography.Text>
                                    <Typography.Text type="secondary">{item.usageCount} 次消费</Typography.Text>
                                    <Typography.Text type="secondary">{item.userCount} 人使用</Typography.Text>
                                </Flex>
                            </Card>
                        </Col>
                    );
                })}
            </Row>

            <Card variant="borderless" title={`${periodLabels[period]}用户占比`} extra={<Tag>{data?.userTotal || 0} 人</Tag>}>
                {!isLoading && !data?.users.length ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该周期暂无实际 AI 消耗" />
                ) : (
                    <Table<AdminAIUsageUser>
                        rowKey="userId"
                        loading={isLoading}
                        dataSource={data?.users || []}
                        columns={[
                            {
                                title: "用户",
                                dataIndex: "userId",
                                render: (_, item) => {
                                    const display = adminUsageUserDisplay(item);
                                    return (
                                        <Flex vertical style={{ minWidth: 0 }}>
                                            <Typography.Text strong={!display.deleted} type={display.deleted ? "secondary" : undefined} ellipsis>
                                                {display.primary}
                                            </Typography.Text>
                                            <Typography.Text type="secondary" copyable={{ text: item.userId }} ellipsis>
                                                {display.secondary}
                                            </Typography.Text>
                                        </Flex>
                                    );
                                },
                            },
                            { title: "实际消耗", dataIndex: "netCredits", width: 130, render: (value: number) => `${value} 点` },
                            { title: "消费次数", dataIndex: "usageCount", width: 110, render: (value: number) => `${value} 次` },
                            { title: "占比", dataIndex: "ratio", width: 240, render: (value: number) => <Progress percent={Number((value * 100).toFixed(1))} size="small" /> },
                        ]}
                        pagination={{
                            current: page,
                            pageSize,
                            total: data?.userTotal || 0,
                            showSizeChanger: true,
                            pageSizeOptions: [10, 20, 50, 100],
                            showTotal: (value) => `共 ${value} 人`,
                            onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                        }}
                    />
                )}
            </Card>
        </Space>
    );
}

const defaultPeriods: AdminAIUsagePeriodSummary[] = (["day", "week", "month"] as AdminAIUsagePeriod[]).map((key) => ({ key, startAt: "", endAt: "", netCredits: 0, usageCount: 0, userCount: 0 }));

function formatRange(item: AdminAIUsagePeriodSummary) {
    if (!item.startAt || !item.endAt) return "-";
    const start = dayjs(item.startAt);
    const end = dayjs(item.endAt).subtract(1, "day");
    return start.isSame(end, "day") ? start.format("MM.DD") : `${start.format("MM.DD")} - ${end.format("MM.DD")}`;
}
