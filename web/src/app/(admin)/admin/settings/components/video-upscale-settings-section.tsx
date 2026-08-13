import { CloudUploadOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Col, Collapse, Flex, Form, Input, Row, Select, Space, Switch, Tag, Typography } from "antd";

import type { AdminSettings } from "@/services/api/admin";

type Props = {
    setting: AdminSettings["private"]["videoUpscale"];
    credentials: Pick<AdminSettings["private"]["volcengineAsset"], "accessKey" | "secretKey" | "accessKeyConfigured" | "secretKeyConfigured">;
    testing: boolean;
    onTest: () => void;
};

export function VideoUpscaleSettingsSection({ setting, credentials, testing, onTest }: Props) {
    const accessKeyReady = credentials.accessKeyConfigured || Boolean(credentials.accessKey);
    const secretKeyReady = credentials.secretKeyConfigured || Boolean(credentials.secretKey);
    const credentialsReady = accessKeyReady && secretKeyReady;

    return (
        <Collapse items={[{
            key: "video-upscale",
            forceRender: true,
            label: (
                <Flex vertical gap={4}>
                    <Flex align="center" gap={8} wrap>
                        <Typography.Text strong>视频超分</Typography.Text>
                        <Tag color={setting.enabled ? "success" : "default"}>{setting.enabled ? "已开启" : "未开启"}</Tag>
                        <Tag color={credentialsReady ? "success" : "default"}>{credentialsReady ? "共享密钥已配置" : "共享密钥待配置"}</Tag>
                    </Flex>
                    <Typography.Text type="secondary" className="text-xs">火山引擎 VOD 场景式画质增强；操作方式与图片超分一致，原视频节点保持不变。</Typography.Text>
                </Flex>
            ),
            children: (
                <Flex vertical gap={14}>
                    <Flex align="center" justify="space-between" gap={12} wrap>
                        <Typography.Text type="secondary">复用下方“火山素材审核”的 AK/SK，不重复保存密钥。连接测试只读取 VOD 空间，不上传视频、不创建增强任务，也不会产生处理费用。</Typography.Text>
                        <Typography.Link href="https://console.volcengine.com/vod" target="_blank" rel="noreferrer">前往火山 VOD 控制台 <ExportOutlined className="ml-1 text-xs" /></Typography.Link>
                    </Flex>
                    <Space size={8} wrap>
                        <Tag color={accessKeyReady ? "success" : "default"}>{accessKeyReady ? "共享 Access Key 已保存" : "共享 Access Key 未填写"}</Tag>
                        <Tag color={secretKeyReady ? "success" : "default"}>{secretKeyReady ? "共享 Secret Key 已保存" : "共享 Secret Key 未填写"}</Tag>
                        <Tag>AIGC · Standard · 1080p / 2K</Tag>
                    </Space>
                    <Row gutter={16}>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "enabled"]} label="启用视频超分" valuePropName="checked"><Switch /></Form.Item>
                        </Col>
                        <Col xs={24} md={18}>
                            <Form.Item name={["private", "videoUpscale", "spaceName"]} label="VOD 空间名称" extra="填写火山视频点播控制台中的空间名称。"><Input placeholder="请输入 VOD 空间名称" /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "provider"]} label="服务商"><Select options={[{ label: "火山引擎 VOD", value: "volcengine" }]} /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "scenario"]} label="增强场景"><Select options={[{ label: "AIGC", value: "aigc" }]} /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "enhanceLevel"]} label="增强档位"><Select options={[{ label: "Standard", value: "Standard" }]} /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "maxTarget"]} label="最高目标"><Select options={[{ label: "2K（含 1080p）", value: "2k" }]} /></Form.Item>
                        </Col>
                    </Row>
                    <Flex justify="flex-end"><Button icon={<CloudUploadOutlined />} loading={testing} onClick={onTest}>测试连接</Button></Flex>
                </Flex>
            ),
        }]} />
    );
}
