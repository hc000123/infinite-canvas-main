"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Card, Col, Descriptions, Flex, Input, Modal, Result, Row, Select, Space, Statistic, Switch, Tabs, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminAITask, AdminCreditLog, AdminUserActivity } from "@/services/api/admin";
import { activityActionLabel, activityRiskLabel } from "./admin-user-activity-view";
import { adminUserDetailStats, adminUserDetailTabs } from "./admin-user-detail-view";
import { useAdminUserDetail } from "./use-admin-user-detail";

export default function AdminUserDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const userId = decodeURIComponent(params.id);
    const [newCIDR, setNewCIDR] = useState("");
    const [forceLogoutOpen, setForceLogoutOpen] = useState(false);
    const [forceLogoutReason, setForceLogoutReason] = useState("");
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
    const activityColumns: ProColumns<AdminUserActivity>[] = [
        { title: "时间", dataIndex: "createdAt", width: 170, render: (_, item) => formatTime(item.createdAt) },
        { title: "操作", dataIndex: "action", width: 160, render: (_, item) => activityActionLabel(item.action) },
        { title: "对象", dataIndex: "targetName", render: (_, item) => item.targetName || item.targetId || "-" },
        { title: "结果", dataIndex: "result", width: 90, render: (_, item) => <Tag color={item.result === "success" ? "success" : "error"}>{item.result === "success" ? "成功" : item.result === "rejected" ? "已拒绝" : "失败"}</Tag> },
        { title: "登录 IP", dataIndex: "ipAddress", width: 150, render: (_, item) => item.ipAddress || "-" },
        {
            title: "风险",
            key: "risk",
            width: 120,
            render: (_, item) => {
                const risk = activityRiskLabel(item);
                return risk ? <Tag color={risk.color}>{risk.text}</Tag> : "-";
            },
        },
        { title: "摘要", dataIndex: "summary", ellipsis: true },
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
                <Card
                    variant="borderless"
                    title="当前登录"
                    extra={
                        detail.session?.online ? (
                            <Button danger onClick={() => setForceLogoutOpen(true)}>
                                强制下线
                            </Button>
                        ) : null
                    }
                >
                    <Descriptions
                        items={[
                            { key: "status", label: "状态", children: <Tag color={detail.session?.online ? "success" : "default"}>{detail.session?.online ? "在线" : "离线"}</Tag> },
                            { key: "login", label: "登录时间", children: formatTime(detail.session?.createdAt) },
                            { key: "active", label: "最后活跃", children: formatTime(detail.session?.lastActiveAt) },
                            { key: "expires", label: "最长有效期", children: formatTime(detail.session?.absoluteExpiresAt) },
                            { key: "ip", label: "登录 IP", children: detail.session?.ipAddress || "-" },
                            { key: "device", label: "设备", children: detail.session?.deviceName || "-", span: 2 },
                        ]}
                    />
                </Card>
                <Card
                    variant="borderless"
                    title="登录 IP 限制"
                    extra={
                        <Space>
                            <Typography.Text type="secondary">白名单外登录需管理员审批</Typography.Text>
                            <Switch checked={overview.user.ipApprovalEnabled} onChange={(enabled) => void detail.setIPPolicy(enabled)} />
                        </Space>
                    }
                >
                    <Flex vertical gap={12}>
                        <Space.Compact style={{ maxWidth: 480, width: "100%" }}>
                            <Input value={newCIDR} placeholder="输入 IP 或 CIDR，例如 10.20.0.0/16" onChange={(event) => setNewCIDR(event.target.value)} />
                            <Button
                                type="primary"
                                onClick={async () => {
                                    if (!newCIDR.trim()) return;
                                    await detail.addAllowedIP(newCIDR);
                                    setNewCIDR("");
                                }}
                            >
                                添加白名单
                            </Button>
                        </Space.Compact>
                        <Space wrap>
                            {detail.allowedIPs.length ? (
                                detail.allowedIPs.map((item) => (
                                    <Tag
                                        key={item.id}
                                        closable
                                        onClose={(event) => {
                                            event.preventDefault();
                                            void detail.deleteAllowedIP(item.id);
                                        }}
                                    >
                                        {item.cidr}
                                    </Tag>
                                ))
                            ) : (
                                <Typography.Text type="secondary">尚未设置工作 IP。开启限制前建议先添加白名单。</Typography.Text>
                            )}
                        </Space>
                    </Flex>
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
                            {
                                key: "activity",
                                label: tabLabels[0],
                                children: (
                                    <Flex vertical gap={12}>
                                        <Space wrap>
                                            <Input.Search placeholder="搜索操作、对象或摘要" allowClear onSearch={(keyword) => detail.setActivityQuery({ ...detail.activityQuery, keyword, page: 1 })} />
                                            <Select
                                                allowClear
                                                placeholder="操作分类"
                                                style={{ width: 150 }}
                                                options={[
                                                    { value: "account", label: "账号" },
                                                    { value: "security", label: "安全" },
                                                    { value: "project", label: "项目" },
                                                    { value: "canvas", label: "画布" },
                                                    { value: "asset", label: "素材" },
                                                    { value: "ai", label: "AI" },
                                                    { value: "credit", label: "算力点" },
                                                ]}
                                                onChange={(category) => detail.setActivityQuery({ ...detail.activityQuery, category, page: 1 })}
                                            />
                                            <Space>
                                                <Switch checked={detail.activityQuery.outsideIP} onChange={(outsideIP) => detail.setActivityQuery({ ...detail.activityQuery, outsideIP, page: 1 })} />
                                                仅非白名单 IP
                                            </Space>
                                        </Space>
                                        <ProTable
                                            rowKey="id"
                                            search={false}
                                            options={false}
                                            columns={activityColumns}
                                            dataSource={detail.activities}
                                            loading={detail.isLoading}
                                            pagination={{
                                                current: detail.activityQuery.page,
                                                pageSize: detail.activityQuery.pageSize,
                                                total: detail.activityTotal,
                                                onChange: (page, pageSize) => detail.setActivityQuery({ ...detail.activityQuery, page, pageSize }),
                                            }}
                                        />
                                    </Flex>
                                ),
                            },
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
            <Modal
                rootClassName="studio-modal"
                title="强制账号下线"
                open={forceLogoutOpen}
                confirmLoading={detail.isLoading}
                okButtonProps={{ danger: true, disabled: forceLogoutReason.trim().length < 2 || forceLogoutReason.trim().length > 200 }}
                onCancel={() => {
                    setForceLogoutOpen(false);
                    setForceLogoutReason("");
                }}
                onOk={async () => {
                    await detail.forceLogout(forceLogoutReason);
                    setForceLogoutOpen(false);
                    setForceLogoutReason("");
                }}
                okText="确认下线"
                cancelText="取消"
            >
                <Flex vertical gap={8}>
                    <Typography.Text type="secondary">用户会立即退出当前设备，重新登录后才能继续使用。</Typography.Text>
                    <Input.TextArea value={forceLogoutReason} maxLength={200} showCount rows={4} placeholder="请输入下线原因（2–200 个字符）" onChange={(event) => setForceLogoutReason(event.target.value)} />
                </Flex>
            </Modal>
        </main>
    );
}

function formatTime(value?: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}
