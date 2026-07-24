"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Card, Col, Descriptions, Flex, Result, Row, Space, Statistic, Tabs, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";

import type { AdminAITask, AdminCreditLog } from "@/services/api/admin";
import { adminUserDetailStats, adminUserDetailTabs } from "./admin-user-detail-view";
import { useAdminUserDetail } from "./use-admin-user-detail";

export default function AdminUserDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const userId = decodeURIComponent(params.id);
    const detail = useAdminUserDetail(userId);
    if (detail.error) return <Result status="404" title="用户不存在" extra={<Button onClick={() => router.push("/admin/users")}>返回用户列表</Button>} />;
    if (!detail.overview)
        return (
            <main style={{ padding: 24 }}>
                <Card loading />
            </main>
        );
    const overview = detail.overview;
    const stats = adminUserDetailStats(overview);
    const tabLabels = adminUserDetailTabs(overview);
    const taskColumns: ProColumns<AdminAITask>[] = [
        { title: "时间", dataIndex: "createdAt", render: (_, item) => formatTime(item.createdAt) },
        { title: "类型", dataIndex: "kind" },
        { title: "模型", dataIndex: "model" },
        { title: "状态", dataIndex: "status", render: (_, item) => <Tag>{item.status}</Tag> },
        { title: "消耗", dataIndex: "credits" },
    ];
    const creditColumns: ProColumns<AdminCreditLog>[] = [
        { title: "时间", dataIndex: "createdAt", render: (_, item) => formatTime(item.createdAt) },
        { title: "类型", dataIndex: "type" },
        { title: "变动", dataIndex: "amount" },
        { title: "余额", dataIndex: "balance" },
        { title: "备注", dataIndex: "remark" },
    ];
    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Button icon={<ArrowLeftOutlined />} style={{ alignSelf: "flex-start" }} onClick={() => router.push("/admin/users")}>
                    返回用户列表
                </Button>
                <Card variant="borderless">
                    <Flex align="center" gap={16} wrap>
                        <Avatar size={56} src={overview.user.avatarUrl || undefined}>
                            {(overview.user.displayName || overview.user.username).slice(0, 1)}
                        </Avatar>
                        <div>
                            <Typography.Title level={4} style={{ margin: 0 }}>
                                {overview.user.displayName || overview.user.username}
                            </Typography.Title>
                            <Typography.Text type="secondary">{overview.user.username}</Typography.Text>
                        </div>
                        <Tag color={overview.user.status === "active" ? "green" : "red"}>{overview.user.status === "active" ? "正常" : "禁用"}</Tag>
                    </Flex>
                    <Descriptions
                        style={{ marginTop: 16 }}
                        items={[
                            { key: "id", label: "用户 ID", children: <Typography.Text copyable>{overview.user.id}</Typography.Text> },
                            { key: "email", label: "邮箱", children: overview.user.email || "-" },
                            { key: "created", label: "注册时间", children: formatTime(overview.user.createdAt) },
                        ]}
                    />
                </Card>
                <Row gutter={[16, 16]}>
                    {stats.map((item) => (
                        <Col xs={12} lg={6} key={item.key}>
                            <Card variant="borderless">
                                <Statistic title={item.label} value={item.key === "lastLogin" ? formatTime(String(item.value)) : item.value || 0} />
                            </Card>
                        </Col>
                    ))}
                </Row>
                <Card variant="borderless">
                    <Tabs
                        items={[
                            { key: "activity", label: tabLabels[0], children: <Result status="info" title="操作审计将在下一阶段接入" /> },
                            {
                                key: "tasks",
                                label: tabLabels[1],
                                children: (
                                    <ProTable
                                        rowKey="id"
                                        search={false}
                                        options={false}
                                        columns={taskColumns}
                                        dataSource={detail.tasks}
                                        loading={detail.isLoading}
                                        pagination={{ current: detail.aiTaskQuery.page, pageSize: detail.aiTaskQuery.pageSize, total: detail.taskTotal, onChange: (page, pageSize) => detail.setAITaskQuery({ ...detail.aiTaskQuery, page, pageSize }) }}
                                    />
                                ),
                            },
                            {
                                key: "credits",
                                label: tabLabels[2],
                                children: (
                                    <ProTable
                                        rowKey="id"
                                        search={false}
                                        options={false}
                                        columns={creditColumns}
                                        dataSource={detail.creditLogs}
                                        loading={detail.isLoading}
                                        pagination={{ current: detail.creditQuery.page, pageSize: detail.creditQuery.pageSize, total: detail.creditTotal, onChange: (page, pageSize) => detail.setCreditQuery({ ...detail.creditQuery, page, pageSize }) }}
                                    />
                                ),
                            },
                        ]}
                    />
                </Card>
            </Flex>
        </main>
    );
}

function formatTime(value?: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}
