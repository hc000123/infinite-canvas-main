import { CloudUploadOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Col, Collapse, Flex, Form, Input, Row, Select, Space, Switch, Tag, Typography, type FormInstance } from "antd";

import type { AdminSettings } from "@/services/api/admin";

type Props = {
    form: FormInstance<AdminSettings>;
    setting: AdminSettings["private"]["imageUpscale"];
    testing: boolean;
    onTest: () => void;
};

const savedSecretExtra = "已保存的密钥不会回显；留空继续使用已保存值，输入新值只替换当前字段。";

export function ImageUpscaleSettingsSection({ form, setting, testing, onTest }: Props) {
    const accessKeyReady = setting.accessKeyIdConfigured || Boolean(setting.accessKeyId);
    const secretReady = setting.accessKeySecretConfigured || Boolean(setting.accessKeySecret);
    const credentialsReady = accessKeyReady && secretReady;

    return (
        <Collapse
            items={[{
                key: "image-upscale",
                forceRender: true,
                label: (
                    <Flex vertical gap={4}>
                        <Flex align="center" gap={8} wrap>
                            <Typography.Text strong>图片超分</Typography.Text>
                            <Tag color={setting.enabled ? "success" : "default"}>{setting.enabled ? "已开启" : "未开启"}</Tag>
                            <Tag color={credentialsReady ? "success" : "default"}>{credentialsReady ? "密钥已配置" : "密钥待配置"}</Tag>
                        </Flex>
                        <Typography.Text type="secondary" className="text-xs">统一配置画布图片节点的 2× / 4× 云端超分；不会改变现有节点和资产归档流程。</Typography.Text>
                    </Flex>
                ),
                children: (
                    <Flex vertical gap={14}>
                        <Flex align="center" justify="space-between" gap={12} wrap>
                            <Typography.Text type="secondary">
                                当前服务商为阿里云视觉智能开放平台。连接测试只验证云端身份，不上传图片、不创建超分任务，也不会产生图片处理费用。
                            </Typography.Text>
                            <Typography.Link href="https://ram.console.aliyun.com/manage/ak" target="_blank" rel="noreferrer">
                                前往 AccessKey 管理 <ExportOutlined className="ml-1 text-xs" />
                            </Typography.Link>
                        </Flex>
                        <Space size={8} wrap>
                            <Tag color={accessKeyReady ? "success" : "default"}>{accessKeyReady ? "AccessKey ID 已保存" : "AccessKey ID 未填写"}</Tag>
                            <Tag color={secretReady ? "success" : "default"}>{secretReady ? "AccessKey Secret 已保存" : "AccessKey Secret 未填写"}</Tag>
                            {setting.securityTokenConfigured || setting.securityToken ? <Tag color="processing">STS Token 已配置</Tag> : <Tag>长期密钥模式</Tag>}
                        </Space>
                        <Form.Item name={["private", "imageUpscale", "managed"]} valuePropName="checked" hidden><Switch /></Form.Item>
                        <Form.Item name={["private", "imageUpscale", "accessKeyIdConfigured"]} valuePropName="checked" hidden><Switch /></Form.Item>
                        <Form.Item name={["private", "imageUpscale", "accessKeySecretConfigured"]} valuePropName="checked" hidden><Switch /></Form.Item>
                        <Form.Item name={["private", "imageUpscale", "securityTokenConfigured"]} valuePropName="checked" hidden><Switch /></Form.Item>
                        <Row gutter={16}>
                            <Col xs={24} md={8}>
                                <Form.Item name={["private", "imageUpscale", "enabled"]} label="启用图片超分" valuePropName="checked">
                                    <Switch onChange={() => form.setFieldValue(["private", "imageUpscale", "managed"], true)} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={16}>
                                <Form.Item name={["private", "imageUpscale", "provider"]} label="服务商">
                                    <Select options={[{ label: "阿里云视觉智能开放平台", value: "aliyun" }]} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name={["private", "imageUpscale", "accessKeyId"]} label="AccessKey ID" extra={accessKeyReady ? savedSecretExtra : "请填写阿里云 AccessKey ID。"}>
                                    <Input.Password autoComplete="new-password" placeholder={accessKeyReady ? "已保存，留空不修改" : "请输入 AccessKey ID"} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name={["private", "imageUpscale", "accessKeySecret"]} label="AccessKey Secret" extra={secretReady ? savedSecretExtra : "请填写阿里云 AccessKey Secret。"}>
                                    <Input.Password autoComplete="new-password" placeholder={secretReady ? "已保存，留空不修改" : "请输入 AccessKey Secret"} />
                                </Form.Item>
                            </Col>
                            <Col span={24}>
                                <Form.Item name={["private", "imageUpscale", "securityToken"]} label="STS Security Token（可选）" extra="仅使用临时 STS 凭据时填写；使用长期 AccessKey 时留空。">
                                    <Input.Password autoComplete="new-password" placeholder={setting.securityTokenConfigured ? "已保存，留空不修改" : "可选"} />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Flex justify="flex-end">
                            <Button icon={<CloudUploadOutlined />} loading={testing} onClick={onTest}>测试连接</Button>
                        </Flex>
                    </Flex>
                ),
            }]}
        />
    );
}
