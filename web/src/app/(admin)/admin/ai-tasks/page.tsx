"use client";

import { EyeOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, Modal, Row, Select, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminAITask, AdminAITaskQuery, AdminCreditLog } from "@/services/api/admin";
import { useAdminAITasks } from "./use-admin-ai-tasks";

const statusLabels: Record<string, string> = {
    created: "已创建",
    queued: "排队中",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    cancelled: "已取消",
};

const kindLabels: Record<string, string> = {
    image: "图片",
    chat: "聊天",
    video: "视频",
};

const actionLabels: Record<string, string> = {
    generate: "生成",
    edit: "编辑",
    extend: "延长",
    chat: "聊天",
};

export default function AdminAITasksPage() {
    const { modal } = App.useApp();
    const { tasks, total, filters, page, pageSize, detail, detailId, isLoading, isDetailLoading, searchTasks, changePage, changePageSize, resetFilters, refreshTasks, openDetail, closeDetail, refreshTask, refundTask } = useAdminAITasks();
    const [draft, setDraft] = useState<AdminAITaskQuery>(filters);

    useEffect(() => setDraft(filters), [filters]);

    const columns: ProColumns<AdminAITask>[] = [
        {
            title: "时间",
            dataIndex: "createdAt",
            width: 170,
            render: (_, item) => <Typography.Text type="secondary">{formatTime(item.createdAt)}</Typography.Text>,
        },
        {
            title: "用户",
            dataIndex: "userId",
            width: 180,
            render: (_, item) => <Typography.Text copyable>{item.userId || "-"}</Typography.Text>,
        },
        {
            title: "类型",
            dataIndex: "kind",
            width: 88,
            render: (_, item) => <Tag>{kindLabels[item.kind] || item.kind || item.taskType || "-"}</Tag>,
        },
        {
            title: "动作",
            dataIndex: "actionType",
            width: 88,
            render: (_, item) => <Tag>{actionLabels[item.actionType] || item.actionType || "-"}</Tag>,
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 180,
            ellipsis: true,
        },
        {
            title: "渠道",
            dataIndex: "provider",
            width: 140,
            ellipsis: true,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (_, item) => <Tag color={statusColor(item.status)}>{statusLabels[item.status] || item.status || "-"}</Tag>,
        },
        {
            title: "消耗",
            dataIndex: "credits",
            width: 78,
        },
        {
            title: "返还",
            dataIndex: "creditsRefunded",
            width: 78,
            render: (_, item) => <Typography.Text type={item.creditsRefunded > 0 ? "success" : "secondary"}>{item.creditsRefunded || 0}</Typography.Text>,
        },
        {
            title: "上游 taskId",
            dataIndex: "upstreamTaskId",
            width: 190,
            ellipsis: true,
            render: (_, item) => (item.upstreamTaskId ? <Typography.Text copyable>{item.upstreamTaskId}</Typography.Text> : "-"),
        },
        {
            title: "错误摘要",
            dataIndex: "errorMessage",
            ellipsis: true,
            render: (_, item) => <Typography.Text type="danger">{item.errorCode || item.errorMessage ? `${item.errorCode ? `${item.errorCode}：` : ""}${item.errorMessage || ""}` : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 128,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(item.id)} />
                    <Button type="text" size="small" icon={<ReloadOutlined />} disabled={!canRefresh(item)} onClick={() => void refreshTask(item.id)} />
                    <Button type="text" size="small" danger icon={<RollbackOutlined />} disabled={!canRefund(item)} onClick={() => confirmRefund(item)} />
                </Space>
            ),
        },
    ];

    const creditColumns = [
        { title: "类型", dataIndex: "type", width: 120 },
        { title: "变动", dataIndex: "amount", width: 90 },
        { title: "余额", dataIndex: "balance", width: 90 },
        { title: "备注", dataIndex: "remark", ellipsis: true },
        { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => formatTime(value) },
    ];

    function confirmRefund(task: AdminAITask) {
        modal.confirm({
            title: "手动返还任务点数",
            content: `确认给任务 ${task.id} 返还 ${task.credits} 点？`,
            okText: "返还",
            cancelText: "取消",
            onOk: () => refundTask(task.id),
        });
    }

    return (
        <main style={{ padding: 24 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="260px">
                                <Form.Item label="关键词">
                                    <Input value={draft.keyword || ""} placeholder="任务 ID、模型、错误、上游 taskId" onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="用户">
                                    <Input value={draft.user || ""} placeholder="用户 ID" onChange={(event) => setDraft({ ...draft, user: event.target.value })} />
                                </Form.Item>
                            </Col>
                            <Col flex="150px">
                                <Form.Item label="状态">
                                    <Select allowClear value={draft.status || undefined} onChange={(value) => setDraft({ ...draft, status: value })} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="130px">
                                <Form.Item label="类型">
                                    <Select allowClear value={draft.kind || undefined} onChange={(value) => setDraft({ ...draft, kind: value })} options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="130px">
                                <Form.Item label="动作">
                                    <Select allowClear value={draft.actionType || undefined} onChange={(value) => setDraft({ ...draft, actionType: value })} options={Object.entries(actionLabels).map(([value, label]) => ({ value, label }))} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="模型">
                                    <Input value={draft.model || ""} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
                                </Form.Item>
                            </Col>
                            <Col flex="160px">
                                <Form.Item label="渠道">
                                    <Input value={draft.provider || ""} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} />
                                </Form.Item>
                            </Col>
                            <Col flex="220px">
                                <Form.Item label="上游 taskId">
                                    <Input value={draft.upstreamTaskId || ""} onChange={(event) => setDraft({ ...draft, upstreamTaskId: event.target.value })} />
                                </Form.Item>
                            </Col>
                            <Col flex="280px">
                                <Form.Item label="时间范围">
                                    <DatePicker.RangePicker
                                        style={{ width: "100%" }}
                                        value={draft.startAt && draft.endAt ? [dayjs(draft.startAt), dayjs(draft.endAt)] : null}
                                        showTime
                                        onChange={(_, values) => setDraft({ ...draft, startAt: values[0] || undefined, endAt: values[1] || undefined })}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button
                                            onClick={() => {
                                                setDraft({});
                                                resetFilters();
                                            }}
                                        >
                                            重置
                                        </Button>
                                        <Button type="primary" icon={<SearchOutlined />} onClick={() => searchTasks(draft)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminAITask>
                    rowKey="id"
                    columns={columns}
                    dataSource={tasks}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>AI 任务日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshTasks() }}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Space>

            <Drawer title="AI 任务详情" open={Boolean(detailId)} size={820} onClose={closeDetail} loading={isDetailLoading}>
                {detail ? (
                    <Space direction="vertical" size={16} style={{ width: "100%" }}>
                        <Descriptions bordered size="small" column={2}>
                            <Descriptions.Item label="任务 ID" span={2}>
                                <Typography.Text copyable>{detail.task.id}</Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="用户">{detail.user?.username || detail.task.userId}</Descriptions.Item>
                            <Descriptions.Item label="状态">
                                <Tag color={statusColor(detail.task.status)}>{statusLabels[detail.task.status] || detail.task.status}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="类型">{kindLabels[detail.task.kind] || detail.task.kind || detail.task.taskType}</Descriptions.Item>
                            <Descriptions.Item label="动作">{actionLabels[detail.task.actionType] || detail.task.actionType || "-"}</Descriptions.Item>
                            <Descriptions.Item label="模型">{detail.task.model}</Descriptions.Item>
                            <Descriptions.Item label="渠道">{detail.task.provider || "-"}</Descriptions.Item>
                            <Descriptions.Item label="消耗点数">{detail.task.credits}</Descriptions.Item>
                            <Descriptions.Item label="返还点数">{detail.task.creditsRefunded || 0}</Descriptions.Item>
                            <Descriptions.Item label="上游 taskId" span={2}>
                                {detail.task.upstreamTaskId ? <Typography.Text copyable>{detail.task.upstreamTaskId}</Typography.Text> : "-"}
                            </Descriptions.Item>
                            <Descriptions.Item label="视频地址过期">{detail.task.videoUrlExpiresAt ? String(detail.task.videoUrlExpiresAt) : "-"}</Descriptions.Item>
                            <Descriptions.Item label="返还时间">{formatTime(detail.task.refundedAt)}</Descriptions.Item>
                            <Descriptions.Item label="完成时间">{formatTime(detail.task.finishedAt)}</Descriptions.Item>
                            <Descriptions.Item label="更新时间">{formatTime(detail.task.updatedAt)}</Descriptions.Item>
                            <Descriptions.Item label="错误" span={2}>
                                {detail.task.errorCode || detail.task.errorMessage ? `${detail.task.errorCode ? `${detail.task.errorCode}：` : ""}${detail.task.errorMessage || ""}` : "-"}
                            </Descriptions.Item>
                        </Descriptions>
                        <Space>
                            <Button icon={<ReloadOutlined />} disabled={!canRefresh(detail.task)} onClick={() => void refreshTask(detail.task.id)}>
                                刷新状态
                            </Button>
                            <Button danger icon={<RollbackOutlined />} disabled={!canRefund(detail.task)} onClick={() => confirmRefund(detail.task)}>
                                手动返还
                            </Button>
                        </Space>
                        <Typography.Title level={5} style={{ margin: 0 }}>
                            额度流水
                        </Typography.Title>
                        <Table<AdminCreditLog> size="small" rowKey="id" columns={creditColumns} dataSource={detail.creditLogs || []} pagination={false} />
                        <Typography.Title level={5} style={{ margin: 0 }}>
                            请求 JSON
                        </Typography.Title>
                        <pre style={jsonBlockStyle}>{safePayloadText(detail.task.requestJson)}</pre>
                        <Typography.Title level={5} style={{ margin: 0 }}>
                            响应 JSON
                        </Typography.Title>
                        <pre style={jsonBlockStyle}>{safePayloadText(detail.task.responseJson)}</pre>
                    </Space>
                ) : null}
            </Drawer>
        </main>
    );
}

const jsonBlockStyle = {
    maxHeight: 260,
    overflow: "auto",
    padding: 12,
    borderRadius: 6,
    background: "rgba(127,127,127,0.08)",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
};

function canRefresh(task: AdminAITask) {
    return task.kind === "video" && Boolean(task.upstreamTaskId);
}

function canRefund(task: AdminAITask) {
    return (task.status === "failed" || task.status === "cancelled") && !task.refundedAt && !task.creditsRefunded;
}

function statusColor(status: string) {
    if (status === "succeeded") return "green";
    if (status === "failed" || status === "cancelled") return "red";
    if (status === "running") return "blue";
    if (status === "queued") return "gold";
    return "default";
}

function formatTime(value?: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

function safePayloadText(value: string) {
    return (value || "-")
        .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
        .replace(/data:[^"'\\\s]+/gi, "[media redacted]")
        .replace(/blob:[^"'\\\s]+/gi, "[media redacted]")
        .replace(/[A-Za-z0-9+/]{512,}={0,2}/g, "[base64 redacted]");
}
