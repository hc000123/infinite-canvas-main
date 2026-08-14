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
	const lasKeyReady = setting.apiKeyConfigured || Boolean(setting.apiKey);

    return (
        <Collapse items={[{
            key: "video-upscale",
            forceRender: true,
            label: (
                <Flex vertical gap={4}>
                    <Flex align="center" gap={8} wrap>
                        <Typography.Text strong>LAS 视频处理</Typography.Text>
                        <Tag color={setting.enabled ? "success" : "default"}>{setting.enabled ? "已开启" : "未开启"}</Tag>
                        <Tag color={lasKeyReady ? "success" : "default"}>{lasKeyReady ? "LAS 密钥已配置" : "LAS 密钥待配置"}</Tag>
                    </Flex>
                    <Typography.Text type="secondary" className="text-xs">火山引擎 LAS 视频超分、智能插帧与字幕擦除；所有结果都生成派生节点，原视频保持不变。</Typography.Text>
                </Flex>
            ),
            children: (
                <Flex vertical gap={14}>
                    <Flex align="center" justify="space-between" gap={12} wrap>
                        <Typography.Text type="secondary">TOS 复用“火山素材审核”的北京地域 AK/SK；视频超分、智能插帧和字幕擦除共用同一 LAS API Key。连接测试只校验身份，不上传视频、不创建付费任务。</Typography.Text>
                        <Typography.Link href="https://operator.las.cn-beijing.volces.com" target="_blank" rel="noreferrer">LAS 北京服务地址 <ExportOutlined className="ml-1 text-xs" /></Typography.Link>
                    </Flex>
                    <Space size={8} wrap>
                        <Tag color={accessKeyReady ? "success" : "default"}>{accessKeyReady ? "共享 Access Key 已保存" : "共享 Access Key 未填写"}</Tag>
                        <Tag color={secretKeyReady ? "success" : "default"}>{secretKeyReady ? "共享 Secret Key 已保存" : "共享 Secret Key 未填写"}</Tag>
                        <Tag>LAS · compatible · 1080p / 2K</Tag>
                    </Space>
                    <Row gutter={16}>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "enabled"]} label="启用视频超分与插帧" valuePropName="checked"><Switch /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "subtitleEraseEnabled"]} label="启用字幕擦除" valuePropName="checked"><Switch /></Form.Item>
                        </Col>
                        <Col xs={24} md={9}>
                            <Form.Item name={["private", "videoUpscale", "apiKey"]} label="LAS API Key" extra={setting.apiKeyConfigured ? "已保存；留空不会覆盖。" : "从 LAS 算子服务获取。"}><Input.Password autoComplete="new-password" placeholder={setting.apiKeyConfigured ? "已配置，留空保持不变" : "las-..."} /></Form.Item>
                        </Col>
                        <Col xs={24} md={9}>
                            <Form.Item name={["private", "videoUpscale", "outputTosPath"]} label="TOS 输出目录" extra="北京地域，同主账号；无需手动创建文件夹。"><Input placeholder="tos://bucket/video-upscale/output/" /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "provider"]} label="服务商"><Select options={[{ label: "火山引擎 LAS", value: "volcengine-las" }]} /></Form.Item>
                        </Col>
                        <Col xs={24} md={6}>
                            <Form.Item name={["private", "videoUpscale", "outputQualityMode"]} label="输出质量"><Select options={[{ label: "兼容（H.264）", value: "compatible" }, { label: "均衡（H.265）", value: "balanced" }, { label: "母版（H.265）", value: "master" }]} /></Form.Item>
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
