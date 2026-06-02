"use client";

import { CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Card, Col, Flex, Form, Image, Input, Modal, Row, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import { useCopyText } from "@/hooks/use-copy-text";
import { fetchAdminSettings, refreshAdminAssetVolcengineReview, saveAdminSettings, submitAdminAssetVolcengineReview, type AdminAsset, type AdminPrivateVolcengineAssetSettings, type AdminSettings, uploadAdminAssetMedia } from "@/services/api/admin";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useAdminAssets } from "./use-admin-assets";

type AssetFormValues = Partial<AdminAsset> & { tagText?: string };

const typeOptions = [
    { label: "全部类型", value: "" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

const editTypeOptions = typeOptions.slice(1);

const defaultVolcengineAssetSettings: AdminPrivateVolcengineAssetSettings = {
    enabled: false,
    accessKey: "",
    secretKey: "",
    projectName: "default",
    region: "cn-beijing",
    assetGroupId: "",
    publicAssetBaseUrl: "",
};

export default function AdminAssetsPage() {
    const { message } = App.useApp();
    const { assets, tags, keyword, kind, tag, page, pageSize, total, isLoading, searchAssets, changeKind, changeTag, changePage, changePageSize, resetFilters, refreshAssets, saveAsset: saveAdminAsset, deleteAsset } = useAdminAssets();
    const copyText = useCopyText();
    const token = useUserStore((state) => state.token);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const [form] = Form.useForm<AssetFormValues>();
    const [settingsForm] = Form.useForm<AdminPrivateVolcengineAssetSettings>();
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingAsset, setEditingAsset] = useState<Partial<AdminAsset> | null>(null);
    const [detailAsset, setDetailAsset] = useState<AdminAsset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<AdminAsset | null>(null);
    const [reviewSettings, setReviewSettings] = useState<AdminSettings | null>(null);
    const [isReviewSettingsOpen, setIsReviewSettingsOpen] = useState(false);
    const [isReviewSettingsLoading, setIsReviewSettingsLoading] = useState(false);
    const [isReviewSettingsSaving, setIsReviewSettingsSaving] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [reviewingAssetId, setReviewingAssetId] = useState<string | null>(null);
    const formType = Form.useWatch("type", form) || editingAsset?.type || "text";
    const tagOptions = tags.map((item) => ({ label: item, value: item }));
    const reviewEnabled = reviewSettings?.private.volcengineAsset.enabled === true;
    const reviewStatusText = !reviewSettings ? "未读取" : reviewEnabled ? "已开启" : "未开启";
    const reviewStatusColor = !reviewSettings ? "processing" : reviewEnabled ? "success" : "default";

    useEffect(() => {
        if (editingAsset) form.setFieldsValue({ ...editingAsset, tagText: editingAsset.tags?.join(", ") || "" });
    }, [editingAsset, form]);

    useEffect(() => setKeywordText(keyword), [keyword]);

    const loadReviewSettings = async () => {
        if (!token) return;
        setIsReviewSettingsLoading(true);
        try {
            const settings = await fetchAdminSettings(token);
            const volcengineAsset = normalizeVolcengineAssetSettings(settings.private.volcengineAsset);
            setReviewSettings(settings);
            settingsForm.setFieldsValue(volcengineAsset);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取素材审核配置失败");
        } finally {
            setIsReviewSettingsLoading(false);
        }
    };

    useEffect(() => {
        void loadReviewSettings();
    }, [token]);

    const openReviewSettings = () => {
        setIsReviewSettingsOpen(true);
        if (!reviewSettings) void loadReviewSettings();
    };

    const saveReviewSettings = async () => {
        if (!token || !reviewSettings) {
            message.error("请先读取素材审核配置");
            return;
        }
        const values = normalizeVolcengineAssetSettings(await settingsForm.validateFields());
        setIsReviewSettingsSaving(true);
        try {
            const saved = await saveAdminSettings(token, {
                ...reviewSettings,
                private: {
                    ...reviewSettings.private,
                    volcengineAsset: values,
                },
            });
            const savedVolcengineAsset = normalizeVolcengineAssetSettings(saved.private.volcengineAsset);
            setReviewSettings(saved);
            settingsForm.setFieldsValue(savedVolcengineAsset);
            let publicSettingsRefreshFailed = false;
            try {
                await loadPublicSettings();
            } catch {
                publicSettingsRefreshFailed = true;
            }
            if (publicSettingsRefreshFailed) message.warning("素材审核配置已保存，公开配置刷新失败，请刷新页面");
            else message.success("素材审核配置已保存");
            setIsReviewSettingsOpen(false);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存素材审核配置失败");
        } finally {
            setIsReviewSettingsSaving(false);
        }
    };

    const saveAsset = async () => {
        const value = await form.validateFields();
        const nextType = value.type || "text";
        if (nextType !== "text" && !value.url?.trim()) {
            message.error("请上传文件或填写素材 URL");
            return;
        }
        await saveAdminAsset({
            ...editingAsset,
            ...value,
            type: nextType,
            coverUrl: value.coverUrl || (nextType === "image" ? value.url : ""),
            content: nextType === "text" ? value.content : "",
            url: nextType === "text" ? "" : value.url,
            tags: (value.tagText || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        });
        setEditingAsset(null);
    };

    const uploadMedia = async (file?: File) => {
        if (!file || !token) return;
        setIsUploadingMedia(true);
        try {
            const result = await uploadAdminAssetMedia(token, file);
            form.setFieldsValue({
                type: result.type,
                title: form.getFieldValue("title") || file.name.replace(/\.[^.]+$/, ""),
                coverUrl: form.getFieldValue("coverUrl") || result.coverUrl,
                url: result.url,
            });
            message.success("素材文件已上传");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setIsUploadingMedia(false);
            if (mediaInputRef.current) mediaInputRef.current.value = "";
        }
    };

    const submitVolcengineReview = async (asset: AdminAsset) => {
        if (!token) return;
        if (!reviewEnabled) {
            message.warning("请先在审核配置中开启素材审核");
            return;
        }
        setReviewingAssetId(asset.id);
        try {
            await submitAdminAssetVolcengineReview(token, asset.id);
            message.success("已提交火山加白");
            await refreshAssets();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交加白失败");
        } finally {
            setReviewingAssetId(null);
        }
    };

    const refreshVolcengineReview = async (asset: AdminAsset) => {
        if (!token) return;
        setReviewingAssetId(asset.id);
        try {
            const updated = await refreshAdminAssetVolcengineReview(token, asset.id);
            const statusText = `当前状态：${volcengineStatusLabel(updated.volcengineStatus)}${updated.volcengineError ? `：${updated.volcengineError}` : ""}`;
            if (updated.volcengineStatus === "Failed") message.error(statusText);
            else message.success(statusText);
            await refreshAssets();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "刷新审核状态失败");
        } finally {
            setReviewingAssetId(null);
        }
    };

    const columns: ProColumns<AdminAsset>[] = [
        {
            title: "封面",
            dataIndex: "coverUrl",
            width: 88,
            render: (_, item) => <Image src={adminAssetCover(item)} alt={item.title} width={56} height={42} style={{ objectFit: "cover", borderRadius: 6 }} preview={{ mask: "放大" }} fallback="/logo.svg" />,
        },
        {
            title: "标题",
            dataIndex: "title",
            width: 260,
            render: (_, item) => (
                <Typography.Link strong ellipsis style={{ maxWidth: 260, display: "block" }} onClick={() => setDetailAsset(item)}>
                    {item.title}
                </Typography.Link>
            ),
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 112,
            render: (_, item) => (
                <Space size={4} wrap>
                    <Tag>{assetTypeLabel(item.type)}</Tag>
                    {item.type === "image" && item.volcengineStatus ? <Tag color={volcengineStatusColor(item.volcengineStatus)}>{volcengineStatusLabel(item.volcengineStatus)}</Tag> : null}
                </Space>
            ),
        },
        {
            title: "标签",
            dataIndex: "tags",
            width: 180,
            render: (_, item) => (
                <Space size={[4, 4]} wrap>
                    {(item.tags || []).slice(0, 3).map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "分类",
            dataIndex: "category",
            width: 120,
            render: (_, item) => <Typography.Text type="secondary">{item.category || "未标注"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 152,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    {item.type === "image" ? (
                        item.volcengineAssetId ? (
                            <Tooltip title="刷新审核状态">
                                <Button type="text" size="small" loading={reviewingAssetId === item.id} icon={<ReloadOutlined />} onClick={() => void refreshVolcengineReview(item)} />
                            </Tooltip>
                        ) : (
                            <Tooltip title={reviewEnabled ? "提交加白" : "请先开启素材审核"}>
                                <Button type="text" size="small" disabled={!reviewEnabled} loading={reviewingAssetId === item.id} icon={<SafetyCertificateOutlined />} onClick={() => void submitVolcengineReview(item)} />
                            </Tooltip>
                        )
                    ) : null}
                    <Tooltip title="详情">
                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailAsset(item)} />
                    </Tooltip>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingAsset(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingAsset(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Flex justify="space-between" align="center" gap={16} wrap>
                        <Flex vertical gap={4} style={{ minWidth: 280 }}>
                            <Typography.Text strong>火山素材审核</Typography.Text>
                            <Typography.Text type="secondary">在素材管理中调整图片加白提交所需的 AK/SK、ProjectName 和公网素材访问地址。</Typography.Text>
                        </Flex>
                        <Space wrap>
                            <Tag color={reviewStatusColor}>{reviewStatusText}</Tag>
                            <Button icon={<SettingOutlined />} loading={isReviewSettingsLoading} onClick={openReviewSettings}>
                                审核配置
                            </Button>
                        </Space>
                    </Flex>
                </Card>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索标题、内容或标签" allowClear enterButton={<SearchOutlined />} onSearch={() => searchAssets(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="180px">
                                <Form.Item label="类型">
                                    <Select value={kind} onChange={changeKind} options={typeOptions} />
                                </Form.Item>
                            </Col>
                            <Col flex="220px">
                                <Form.Item label="标签">
                                    <Select mode="multiple" allowClear maxTagCount="responsive" value={tag} onChange={changeTag} options={tagOptions} placeholder="全部标签" />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button
                                            onClick={() => {
                                                setKeywordText("");
                                                resetFilters();
                                            }}
                                        >
                                            重置
                                        </Button>
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchAssets(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminAsset>
                    rowKey="id"
                    columns={columns}
                    dataSource={assets}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>素材列表</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshAssets() }}
                    toolBarRender={() => [
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingAsset({ type: "text", tags: [] })}>
                            新增
                        </Button>,
                    ]}
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
            </Flex>

            <Modal title={editingAsset?.id ? "编辑素材" : "新增素材"} open={Boolean(editingAsset)} width={760} onCancel={() => setEditingAsset(null)} onOk={() => void saveAsset()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="type" label="类型" rules={[{ required: true, message: "请选择类型" }]}>
                        <Select options={editTypeOptions} />
                    </Form.Item>
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="coverUrl" label="封面 URL">
                        <Input />
                    </Form.Item>
                    <Form.Item name="tagText" label="标签，用逗号分隔">
                        <Input />
                    </Form.Item>
                    <Form.Item name="category" label="分类">
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    {formType === "text" ? (
                        <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                            <Input.TextArea rows={6} />
                        </Form.Item>
                    ) : (
                        <>
                            <Form.Item label="上传文件">
                                <Space.Compact style={{ width: "100%" }}>
                                    <Button loading={isUploadingMedia} onClick={() => mediaInputRef.current?.click()}>
                                        选择图片/视频/音频
                                    </Button>
                                    <Input value={form.getFieldValue("url") || ""} readOnly placeholder="上传后自动生成素材 URL" />
                                </Space.Compact>
                            </Form.Item>
                            <Form.Item name="url" label={`${assetTypeLabel(formType)} URL`} rules={[{ required: true, message: "请上传文件或填写素材 URL" }]}>
                                <Input />
                            </Form.Item>
                        </>
                    )}
                </Form>
                <input ref={mediaInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => void uploadMedia(event.target.files?.[0])} />
            </Modal>

            <Modal title="素材详情" open={Boolean(detailAsset)} width={760} onCancel={() => setDetailAsset(null)} footer={<Button onClick={() => setDetailAsset(null)}>关闭</Button>}>
                {detailAsset ? (
                    <Flex vertical gap={14}>
                        <Flex gap={14} align="start">
                            <Image src={adminAssetCover(detailAsset)} alt={detailAsset.title} width={116} height={84} style={{ objectFit: "cover", borderRadius: 8 }} preview={{ mask: "放大" }} fallback="/logo.svg" />
                            <Flex vertical gap={8} style={{ minWidth: 0 }}>
                                <Typography.Title level={5} style={{ margin: 0 }}>
                                    {detailAsset.title}
                                </Typography.Title>
                                <Space wrap>
                                    <Tag>{assetTypeLabel(detailAsset.type)}</Tag>
                                    {detailAsset.category ? <Tag>{detailAsset.category}</Tag> : null}
                                    {detailAsset.type === "image" && detailAsset.volcengineStatus ? <Tag color={volcengineStatusColor(detailAsset.volcengineStatus)}>{volcengineStatusLabel(detailAsset.volcengineStatus)}</Tag> : null}
                                    {(detailAsset.tags || []).map((tag) => (
                                        <Tag key={tag}>{tag}</Tag>
                                    ))}
                                </Space>
                            </Flex>
                        </Flex>
                        {detailAsset.description ? (
                            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                                {detailAsset.description}
                            </Typography.Paragraph>
                        ) : null}
                        {detailAsset.type === "video" && detailAsset.url ? <video src={detailAsset.url} controls style={{ width: "100%", borderRadius: 8, background: "#000" }} /> : null}
                        {detailAsset.type === "audio" && detailAsset.url ? <audio src={detailAsset.url} controls style={{ width: "100%" }} /> : null}
                        {detailAsset.type === "image" && detailAsset.volcengineAssetId ? (
                            <Card size="small">
                                <Flex vertical gap={4}>
                                    <Typography.Text copyable>Asset ID：{detailAsset.volcengineAssetId}</Typography.Text>
                                    <Typography.Text type="secondary">
                                        素材组：{detailAsset.volcengineGroupId || "-"} · 项目：{detailAsset.volcengineProjectName || "-"}
                                    </Typography.Text>
                                    {detailAsset.volcengineError ? <Typography.Text type="danger">失败原因：{detailAsset.volcengineError}</Typography.Text> : null}
                                </Flex>
                            </Card>
                        ) : null}
                        <Input.TextArea value={detailAsset.type === "text" ? detailAsset.content : detailAsset.url || detailAsset.coverUrl} rows={7} readOnly />
                        <Button icon={<CopyOutlined />} onClick={() => copyText(detailAsset.type === "text" ? detailAsset.content : detailAsset.url || detailAsset.coverUrl)}>
                            复制内容
                        </Button>
                    </Flex>
                ) : null}
            </Modal>

            <Modal
                title="火山素材审核配置"
                open={isReviewSettingsOpen}
                width={760}
                onCancel={() => setIsReviewSettingsOpen(false)}
                onOk={() => void saveReviewSettings()}
                confirmLoading={isReviewSettingsSaving}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={settingsForm} layout="vertical" requiredMark={false} initialValues={defaultVolcengineAssetSettings}>
                    <Flex vertical gap={12}>
                        <Typography.Text type="secondary">按 Upload_Asset_Get_Info.go 配置素材组 ID 后，图片素材会直接传入该 Asset Group；留空时才自动创建素材组。完整公网 URL 会直接提交，本地上传路径才会按公网素材访问地址转换。</Typography.Text>
                        <Row gutter={16}>
                            <Col xs={24} md={6}>
                                <Form.Item name="enabled" label="开启素材审核" valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={9}>
                                <Form.Item name="accessKey" label="Access Key">
                                    <Input.Password placeholder="留空则沿用已保存的 Access Key" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={9}>
                                <Form.Item name="secretKey" label="Secret Key">
                                    <Input.Password placeholder="留空则沿用已保存的 Secret Key" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="projectName" label="项目名称">
                                    <Input placeholder="default" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="region" label="地域">
                                    <Input placeholder="cn-beijing" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="assetGroupId" label="素材组 ID">
                                    <Input placeholder="group-20260318033332-xxxxx" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="publicAssetBaseUrl" label="公网素材访问地址" extra="TOS 地址会在提交前自动上传到对应桶路径。">
                                    <Input placeholder="https://jiabaitong.tos-cn-beijing.volces.com/volcengine-assets" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Flex>
                </Form>
            </Modal>

            <Modal
                title="删除素材"
                open={Boolean(deletingAsset)}
                onCancel={() => setDeletingAsset(null)}
                onOk={async () => {
                    if (!deletingAsset) return;
                    await deleteAsset(deletingAsset.id);
                    setDeletingAsset(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingAsset?.title}」吗？删除后会从服务器素材库中移除。
            </Modal>
        </main>
    );
}

function normalizeVolcengineAssetSettings(setting: Partial<AdminPrivateVolcengineAssetSettings> = {}): AdminPrivateVolcengineAssetSettings {
    return {
        enabled: setting.enabled === true,
        accessKey: setting.accessKey || "",
        secretKey: setting.secretKey || "",
        projectName: setting.projectName || "default",
        region: setting.region || "cn-beijing",
        assetGroupId: setting.assetGroupId || "",
        publicAssetBaseUrl: setting.publicAssetBaseUrl || "",
    };
}

function assetTypeLabel(type: string) {
    if (type === "image") return "图片";
    if (type === "video") return "视频";
    if (type === "audio") return "音频";
    return "文本";
}

function volcengineStatusLabel(status?: string) {
    if (status === "Active") return "已加白";
    if (status === "Failed") return "审核失败";
    if (status === "Processing") return "审核中";
    return status || "未知";
}

function volcengineStatusColor(status?: string) {
    if (status === "Active") return "success";
    if (status === "Failed") return "error";
    if (status === "Processing") return "processing";
    return "default";
}

function adminAssetCover(asset: AdminAsset) {
    if (asset.type === "image") return asset.coverUrl || asset.url || "/logo.svg";
    return asset.coverUrl || "/logo.svg";
}
