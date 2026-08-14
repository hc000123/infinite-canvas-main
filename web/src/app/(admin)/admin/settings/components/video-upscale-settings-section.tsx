import { CloudUploadOutlined, ExportOutlined } from "@ant-design/icons";
import { Button, Col, Collapse, Divider, Flex, Form, Input, Row, Segmented, Select, Space, Switch, Tag, Typography } from "antd";

import type { AdminSettings } from "@/services/api/admin";

type Props = {
    setting: AdminSettings["private"]["videoUpscale"];
    tencentSetting: AdminSettings["private"]["tencentMpsVideo"];
    credentials: Pick<AdminSettings["private"]["volcengineAsset"], "accessKey" | "secretKey" | "accessKeyConfigured" | "secretKeyConfigured">;
    testing: boolean;
    testingTencent: boolean;
    onTest: () => void;
    onTestTencent: () => void;
};

export function VideoUpscaleSettingsSection({ setting, tencentSetting, credentials, testing, testingTencent, onTest, onTestTencent }: Props) {
    const accessKeyReady = credentials.accessKeyConfigured || Boolean(credentials.accessKey);
    const secretKeyReady = credentials.secretKeyConfigured || Boolean(credentials.secretKey);
    const lasKeyReady = setting.apiKeyConfigured || Boolean(setting.apiKey);
    const tencentKeyReady = (tencentSetting.secretIdConfigured || Boolean(tencentSetting.secretId)) && (tencentSetting.secretKeyConfigured || Boolean(tencentSetting.secretKey));

    return (
        <Collapse items={[{
            key: "video-upscale",
            forceRender: true,
            label: (
                <Flex vertical gap={4}>
                    <Flex align="center" gap={8} wrap>
                        <Typography.Text strong>视频增强与处理</Typography.Text>
                        <Tag color={setting.enabled ? "success" : "default"}>火山 {setting.enabled ? "已开启" : "未开启"}</Tag>
                        <Tag color={tencentSetting.enabled ? "success" : "default"}>腾讯 {tencentSetting.enabled ? "已开启" : "未开启"}</Tag>
                    </Flex>
                    <Typography.Text type="secondary" className="text-xs">火山引擎 LAS 视频超分、智能插帧与字幕擦除；所有结果都生成派生节点，原视频保持不变。</Typography.Text>
                </Flex>
            ),
            children: (
                <Flex vertical gap={14}>
                    <Typography.Text strong>LAS 视频处理</Typography.Text>
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
                    <Divider className="my-1" />
                    <Flex align="center" justify="space-between" gap={12} wrap>
                        <div>
                            <Typography.Text strong>腾讯 MPS 视频增强</Typography.Text>
                            <div><Typography.Text type="secondary" className="text-xs">使用预设模板完成漫剧、真人或老片增强；保持源帧率，增强与转码分别计费。</Typography.Text></div>
                        </div>
                        <Typography.Link href="https://console.cloud.tencent.com/mps/templates/enhs" target="_blank" rel="noreferrer">MPS 增强模板 <ExportOutlined className="ml-1 text-xs" /></Typography.Link>
                    </Flex>
                    <Space size={8} wrap>
                        <Tag color={tencentKeyReady ? "success" : "default"}>{tencentKeyReady ? "腾讯密钥已保存" : "腾讯密钥未填写"}</Tag>
                        <Tag>COS · 1080p / 2K · 帧率随源</Tag>
                    </Space>
                    <Row gutter={16}>
                        <Col xs={24} md={6}><Form.Item name={["private", "tencentMpsVideo", "enabled"]} label="启用腾讯增强" valuePropName="checked"><Switch /></Form.Item></Col>
                        <Col xs={24} md={9}><Form.Item name={["private", "tencentMpsVideo", "secretId"]} label="SecretId" extra={tencentSetting.secretIdConfigured ? "已保存；留空不会覆盖。" : "腾讯云 API 访问密钥。"}><Input.Password autoComplete="new-password" placeholder={tencentSetting.secretIdConfigured ? "已配置，留空保持不变" : "AKID..."} /></Form.Item></Col>
                        <Col xs={24} md={9}><Form.Item name={["private", "tencentMpsVideo", "secretKey"]} label="SecretKey" extra={tencentSetting.secretKeyConfigured ? "已保存；留空不会覆盖。" : "不会在刷新后回显。"}><Input.Password autoComplete="new-password" placeholder={tencentSetting.secretKeyConfigured ? "已配置，留空保持不变" : "SecretKey"} /></Form.Item></Col>
                        <Col xs={24} md={8}><Form.Item name={["private", "tencentMpsVideo", "cosBucket"]} label="COS Bucket"><Input placeholder="media-1300000000" /></Form.Item></Col>
                        <Col xs={24} md={8}><Form.Item name={["private", "tencentMpsVideo", "cosRegion"]} label="COS 地域"><Input placeholder="ap-beijing" /></Form.Item></Col>
                        <Col xs={24} md={8}><Form.Item name={["private", "tencentMpsVideo", "defaultScene"]} label="默认增强场景"><Segmented block options={[{ label: "漫剧", value: "comic" }, { label: "真人", value: "live" }, { label: "老片", value: "restore" }]} /></Form.Item></Col>
                        <Col xs={24} md={12}><Form.Item name={["private", "tencentMpsVideo", "inputPrefix"]} label="COS 输入目录"><Input placeholder="video-upscale/input/" /></Form.Item></Col>
                        <Col xs={24} md={12}><Form.Item name={["private", "tencentMpsVideo", "outputPrefix"]} label="COS 输出目录"><Input placeholder="video-upscale/output/" /></Form.Item></Col>
                    </Row>
                    <Flex justify="flex-end"><Button icon={<CloudUploadOutlined />} loading={testingTencent} onClick={onTestTencent}>测试腾讯连接</Button></Flex>
                </Flex>
            ),
        }]} />
    );
}
