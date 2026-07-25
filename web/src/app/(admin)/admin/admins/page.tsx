"use client";

import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminAccount, AdminAccountUpdate } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { adminAccountProtection, adminCreditDelta, adminCreditView, adminRoleLabels, adminStatusLabels } from "./admin-account-view";
import { useAdminAccounts } from "./use-admin-accounts";

type AccountForm = AdminAccountUpdate & { password?: string };
const roleOptions = Object.entries(adminRoleLabels).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(adminStatusLabels).map(([value, label]) => ({ value, label }));

export default function AdminAccountsPage() {
    const actorId = useUserStore((state) => state.user?.id || "");
    const { accounts, total, filters, isLoading, updateFilters, refresh, createAccount, updateAccount, resetPassword, adjustCredits, deleteAccount } = useAdminAccounts();
    const [keyword, setKeyword] = useState(filters.keyword || "");
    const [editing, setEditing] = useState<AdminAccount | "create" | null>(null);
    const [passwordTarget, setPasswordTarget] = useState<AdminAccount | null>(null);
    const [deleting, setDeleting] = useState<AdminAccount | null>(null);
    const [creditTarget, setCreditTarget] = useState<AdminAccount | null>(null);
    const [creditValue, setCreditValue] = useState(0);
    const [form] = Form.useForm<AccountForm>();
    const [passwordForm] = Form.useForm<{ password: string }>();
    const activeSuperAdminCount = accounts.filter((item) => item.role === "superadmin" && item.status === "active").length;

    useEffect(() => {
        if (!editing) return;
        form.setFieldsValue(editing === "create" ? { username: "", displayName: "", email: "", role: "admin", status: "active", password: "" } : { ...editing, password: "" });
    }, [editing, form]);

    const save = async () => {
        const value = await form.validateFields();
        const input: AdminAccountUpdate = { username: value.username, displayName: value.displayName, email: value.email, role: value.role, status: value.status };
        if (editing === "create") await createAccount({ ...input, password: value.password || "" });
        else if (editing) await updateAccount(editing.id, input);
        setEditing(null);
    };

    const columns: ProColumns<AdminAccount>[] = [
        {
            title: "管理员",
            dataIndex: "username",
            width: 260,
            render: (_, item) => (
                <Flex align="center" gap={10} style={{ minWidth: 0 }}>
                    <Avatar>{(item.displayName || item.username || "A").slice(0, 1).toUpperCase()}</Avatar>
                    <Flex vertical style={{ minWidth: 0 }}>
                        <Typography.Text strong ellipsis>
                            {item.displayName || item.username}
                        </Typography.Text>
                        <Typography.Text type="secondary" ellipsis>
                            {item.username}
                        </Typography.Text>
                    </Flex>
                </Flex>
            ),
        },
        { title: "角色", dataIndex: "role", width: 130, render: (_, item) => <Tag color={item.role === "superadmin" ? "gold" : "blue"}>{adminRoleLabels[item.role]}</Tag> },
        { title: "状态", dataIndex: "status", width: 90, render: (_, item) => <Tag color={item.status === "active" ? "green" : "red"}>{adminStatusLabels[item.status]}</Tag> },
        {
            title: "算力余额",
            dataIndex: "credits",
            width: 120,
            render: (_, item) => {
                const view = adminCreditView(item);
                return item.role === "superadmin" ? <Tag color="gold">{view.label}</Tag> : <Typography.Text>{view.label}</Typography.Text>;
            },
        },
        { title: "最近登录", dataIndex: "lastLoginAt", width: 180, render: (_, item) => <Typography.Text type="secondary">{item.lastLoginAt ? dayjs(item.lastLoginAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text> },
        { title: "创建时间", dataIndex: "createdAt", width: 180, render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text> },
        {
            title: "操作",
            key: "actions",
            width: 166,
            align: "right",
            render: (_, item) => {
                const protection = adminAccountProtection(item, actorId, activeSuperAdminCount);
                return (
                    <Space size={2}>
                        {adminCreditView(item).adjustable ? (
                            <Tooltip title="调整算力">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ThunderboltOutlined />}
                                    onClick={() => {
                                        setCreditTarget(item);
                                        setCreditValue(item.credits);
                                    }}
                                />
                            </Tooltip>
                        ) : null}
                        <Tooltip title={protection.mutable ? "编辑" : protection.reason}>
                            <span>
                                <Button type="text" size="small" disabled={!protection.mutable} icon={<EditOutlined />} onClick={() => setEditing(item)} />
                            </span>
                        </Tooltip>
                        <Tooltip title={protection.mutable ? "重置密码" : protection.reason}>
                            <span>
                                <Button type="text" size="small" disabled={!protection.mutable} icon={<KeyOutlined />} onClick={() => setPasswordTarget(item)} />
                            </span>
                        </Tooltip>
                        <Tooltip title={protection.mutable ? "删除" : protection.reason}>
                            <span>
                                <Button danger type="text" size="small" disabled={!protection.mutable} icon={<DeleteOutlined />} onClick={() => setDeleting(item)} />
                            </span>
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="320px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keyword} placeholder="搜索用户名、昵称或邮箱" allowClear enterButton={<SearchOutlined />} onChange={(event) => setKeyword(event.target.value)} onSearch={() => updateFilters({ keyword })} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="角色">
                                    <Select allowClear value={filters.role} options={roleOptions} onChange={(role) => updateFilters({ role })} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="状态">
                                    <Select allowClear value={filters.status} options={statusOptions} onChange={(status) => updateFilters({ status })} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Button type="primary" icon={<ReloadOutlined />} onClick={() => updateFilters({ keyword })}>
                                        查询
                                    </Button>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminAccount>
                    rowKey="id"
                    columns={columns}
                    dataSource={accounts}
                    loading={isLoading}
                    search={false}
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>管理员列表</Typography.Text>
                            <Tag>{total} 人</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refresh() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditing("create")}>
                            新增管理员
                        </Button>,
                    ]}
                    pagination={{ current: filters.page, pageSize: filters.pageSize, total, showSizeChanger: true, onChange: (page, nextPageSize) => updateFilters({ page, pageSize: nextPageSize }) }}
                />
            </Flex>

            <Modal rootClassName="studio-modal" title={editing === "create" ? "新增管理员" : "编辑管理员"} open={Boolean(editing)} width={680} onCancel={() => setEditing(null)} onOk={() => void save()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        {editing === "create" ? (
                            <Col span={12}>
                                <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 8, message: "请输入至少 8 位密码" }]}>
                                    <Input.Password autoComplete="new-password" />
                                </Form.Item>
                            </Col>
                        ) : null}
                        <Col span={12}>
                            <Form.Item name="displayName" label="昵称">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="email" label="邮箱">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                                <Select options={roleOptions} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                                <Select options={statusOptions} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                rootClassName="studio-modal"
                title="调整管理员算力"
                open={Boolean(creditTarget)}
                onCancel={() => setCreditTarget(null)}
                onOk={async () => {
                    if (!creditTarget) return;
                    await adjustCredits(creditTarget.id, creditValue);
                    setCreditTarget(null);
                }}
                okText="确认调整"
                cancelText="取消"
            >
                <Flex vertical gap={14}>
                    <Typography.Text type="secondary">当前余额：{creditTarget?.credits ?? 0}</Typography.Text>
                    <InputNumber min={0} precision={0} value={creditValue} onChange={(value) => setCreditValue(value ?? 0)} style={{ width: "100%" }} />
                    {creditTarget ? (
                        <Typography.Text>
                            本次{adminCreditDelta(creditTarget.credits, creditValue).direction} {adminCreditDelta(creditTarget.credits, creditValue).amount} 算力点
                        </Typography.Text>
                    ) : null}
                </Flex>
            </Modal>

            <Modal
                rootClassName="studio-modal"
                title="重置管理员密码"
                open={Boolean(passwordTarget)}
                onCancel={() => {
                    setPasswordTarget(null);
                    passwordForm.resetFields();
                }}
                onOk={async () => {
                    const value = await passwordForm.validateFields();
                    if (passwordTarget) await resetPassword(passwordTarget.id, value.password);
                    setPasswordTarget(null);
                    passwordForm.resetFields();
                }}
                okText="确认重置"
                cancelText="取消"
            >
                <Form form={passwordForm} layout="vertical">
                    <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "请输入至少 8 位密码" }]}>
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                rootClassName="studio-modal"
                title="删除管理员"
                open={Boolean(deleting)}
                onCancel={() => setDeleting(null)}
                onOk={async () => {
                    if (deleting) await deleteAccount(deleting.id);
                    setDeleting(null);
                }}
                okButtonProps={{ danger: true }}
                okText="删除"
                cancelText="取消"
            >
                确定删除「{deleting?.displayName || deleting?.username}」吗？该操作不可恢复。
            </Modal>
        </main>
    );
}
