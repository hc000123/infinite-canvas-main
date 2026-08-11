"use client";

import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Empty, Flex, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";

import type { AdminLoginApproval } from "@/services/api/admin";
import { useLoginApprovals } from "./use-login-approvals";

export default function LoginApprovalsPage() {
    const { items, total, status, setStatus, isLoading, decide } = useLoginApprovals();
    const columns: ProColumns<AdminLoginApproval>[] = [
        {
            title: "用户",
            dataIndex: "userId",
            render: (_, item) => (
                <Flex vertical>
                    <Typography.Text strong>{item.user?.displayName || item.user?.username || "用户已删除"}</Typography.Text>
                    <Typography.Text type="secondary" copyable={{ text: item.userId }}>
                        {item.user?.username || item.userId}
                    </Typography.Text>
                </Flex>
            ),
        },
        { title: "登录 IP", dataIndex: "requestedIp", width: 160, render: (_, item) => <Typography.Text copyable>{item.requestedIp}</Typography.Text> },
        { title: "设备", dataIndex: "userAgent", ellipsis: true },
        { title: "申请时间", dataIndex: "createdAt", width: 180, render: (_, item) => dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") },
        { title: "状态", dataIndex: "status", width: 110, render: (_, item) => <Tag color={item.status === "pending" ? "processing" : item.status === "rejected" ? "error" : "success"}>{item.status}</Tag> },
        {
            title: "操作",
            key: "actions",
            width: 290,
            render: (_, item) =>
                item.status === "pending" ? (
                    <Space>
                        <Button type="primary" size="small" onClick={() => void decide({ id: item.id, approve: true, scope: "once" })}>
                            单次放行
                        </Button>
                        <Button size="small" onClick={() => void decide({ id: item.id, approve: true, scope: "whitelist" })}>
                            放行并加入白名单
                        </Button>
                        <Button danger size="small" onClick={() => void decide({ id: item.id, approve: false })}>
                            拒绝
                        </Button>
                    </Space>
                ) : (
                    "-"
                ),
        },
    ];
    return (
        <main style={{ padding: 24 }}>
            <Card variant="borderless">
                <ProTable
                    rowKey="id"
                    columns={columns}
                    dataSource={items}
                    loading={isLoading}
                    search={false}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>异地登录审批</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    toolBarRender={() => [
                        <Select
                            key="status"
                            value={status}
                            style={{ width: 140 }}
                            onChange={setStatus}
                            options={[
                                { value: "pending", label: "待审批" },
                                { value: "approved", label: "已批准" },
                                { value: "rejected", label: "已拒绝" },
                                { value: "consumed", label: "已登录" },
                            ]}
                        />,
                    ]}
                    pagination={false}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有需要处理的登录申请" className="py-5" /> }}
                />
            </Card>
        </main>
    );
}
