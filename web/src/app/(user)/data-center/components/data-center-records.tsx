"use client";

import { useState } from "react";
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Empty, Flex, Input, Select, Table, Tag, Typography, type TableProps } from "antd";
import dayjs from "dayjs";

import type { AIUsageRecord, AIUsageRecordList, AIUsageScope } from "@/services/api/usage";
import { dataCenterKindLabels, dataCenterStatusLabels } from "../data-center-view";
import type { DataCenterRecordFilters } from "../use-data-center";

type Props = {
    scope: AIUsageScope;
    filters: DataCenterRecordFilters;
    data?: AIUsageRecordList;
    loading: boolean;
    error: string;
    onFiltersChange: (filters: Partial<DataCenterRecordFilters>) => void;
    onRetry: () => void;
};

const kindOptions = ["image", "video", "text", "agent", "other"].map((value) => ({ value, label: dataCenterKindLabels[value] }));
const statusOptions = ["succeeded", "applied", "running", "queued", "failed", "cancelled", "unknown"].map((value) => ({ value, label: dataCenterStatusLabels[value] }));

export function DataCenterRecords({ scope, filters, data, loading, error, onFiltersChange, onRetry }: Props) {
    const [selected, setSelected] = useState<AIUsageRecord | null>(null);
    const columns: TableProps<AIUsageRecord>["columns"] = [
        { title: "时间", dataIndex: "createdAt", width: 168, render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
        ...(scope === "all" ? [{ title: "成员", key: "user", width: 160, render: (_: unknown, item: AIUsageRecord) => item.user?.displayName || item.user?.username || item.userId }] : []),
        { title: "生成类型", dataIndex: "kind", width: 120, render: (value: string) => dataCenterKindLabels[value] || value },
        { title: "模型", dataIndex: "model", ellipsis: true, render: (value: string) => value || "-" },
        { title: "实际消耗", dataIndex: "netCredits", width: 110, render: (value: number) => <Typography.Text strong>{value} 点</Typography.Text> },
        { title: "已返还", dataIndex: "creditsRefunded", width: 100, render: (value: number) => (value ? `${value} 点` : "-") },
        { title: "状态", dataIndex: "status", width: 110, render: (value: string) => <Tag color={statusColor(value)}>{dataCenterStatusLabels[value] || value}</Tag> },
    ];

    return (
        <section aria-labelledby="data-center-records-title">
            <div className="mb-3">
                <Typography.Title id="data-center-records-title" level={4} style={{ margin: 0 }}>
                    消费明细
                </Typography.Title>
                <Typography.Text type="secondary">点击任意记录可查看技术详情，数据中心内不提供修改操作</Typography.Text>
            </div>
            <Card variant="borderless">
                <Flex gap={10} wrap="wrap" className="mb-4">
                    {scope === "all" ? <Input allowClear value={filters.user} onChange={(event) => onFiltersChange({ user: event.target.value })} placeholder="搜索成员" style={{ width: 180 }} /> : null}
                    <Select allowClear value={filters.kind || undefined} onChange={(value) => onFiltersChange({ kind: value || "" })} placeholder="生成类型" options={kindOptions} style={{ width: 140 }} />
                    <Input allowClear value={filters.model} onChange={(event) => onFiltersChange({ model: event.target.value })} placeholder="搜索模型" style={{ width: 180 }} />
                    <Select allowClear value={filters.status || undefined} onChange={(value) => onFiltersChange({ status: value || "" })} placeholder="状态" options={statusOptions} style={{ width: 130 }} />
                    <DatePicker.RangePicker
                        value={filters.startAt && filters.endAt ? [dayjs(filters.startAt), dayjs(filters.endAt)] : null}
                        onChange={(values) => onFiltersChange({ startAt: values?.[0]?.startOf("day").toISOString() || "", endAt: values?.[1]?.add(1, "day").startOf("day").toISOString() || "" })}
                    />
                </Flex>
                {error ? (
                    <Alert
                        className="mb-4"
                        type="error"
                        showIcon
                        message="消费明细暂时无法读取"
                        description={error}
                        action={
                            <Button type="link" onClick={onRetry}>
                                重试
                            </Button>
                        }
                    />
                ) : null}
                {!loading && !error && !data?.items.length ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选条件下暂无消费记录" />
                ) : (
                    <Table<AIUsageRecord>
                        rowKey="id"
                        loading={loading}
                        dataSource={data?.items || []}
                        columns={columns}
                        scroll={{ x: 920 }}
                        onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: "pointer" } })}
                        pagination={{
                            current: filters.page,
                            pageSize: filters.pageSize,
                            total: data?.total || 0,
                            showSizeChanger: true,
                            pageSizeOptions: [10, 20, 50, 100],
                            showTotal: (total) => `共 ${total} 条`,
                            onChange: (page, pageSize) => onFiltersChange({ page, pageSize }),
                        }}
                    />
                )}
            </Card>
            <UsageRecordDrawer record={selected} onClose={() => setSelected(null)} />
        </section>
    );
}

function UsageRecordDrawer({ record, onClose }: { record: AIUsageRecord | null; onClose: () => void }) {
    const trace = record?.frontendTrace;
    return (
        <Drawer title="消费详情" open={Boolean(record)} onClose={onClose} width={520}>
            {record ? (
                <Descriptions
                    column={1}
                    bordered
                    size="small"
                    items={[
                        { key: "related", label: "关联 ID", children: <Typography.Text copyable>{record.relatedId || "-"}</Typography.Text> },
                        { key: "source", label: "记录来源", children: record.sourceType },
                        { key: "provider", label: "渠道", children: record.provider || "-" },
                        { key: "upstream", label: "上游任务 ID", children: record.upstreamTaskId ? <Typography.Text copyable>{record.upstreamTaskId}</Typography.Text> : "-" },
                        { key: "credits", label: "扣除 / 返还", children: `${record.credits} / ${record.creditsRefunded} 点` },
                        { key: "error", label: "错误信息", children: record.errorMessage || "-" },
                        { key: "trace", label: "前端定位", children: trace && Object.values(trace).some(Boolean) ? <Typography.Text code>{JSON.stringify(trace, null, 2)}</Typography.Text> : "-" },
                    ]}
                />
            ) : null}
        </Drawer>
    );
}

function statusColor(status: string) {
    if (["succeeded", "applied", "approved"].includes(status)) return "success";
    if (["failed", "rejected"].includes(status)) return "error";
    if (["running", "queued", "needs_review"].includes(status)) return "processing";
    return "default";
}
