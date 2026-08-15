import { Button, Flex, Form, Input, Segmented, Switch, Tag, Typography } from "antd";

import type { AdminSettings, AdminTencentMPSTemplate } from "@/services/api/admin";

type Props = {
    templates: AdminTencentMPSTemplate[];
    syncing: boolean;
    onSync: () => void;
};

const sceneOptions = [
    { label: "漫剧", value: "comic" },
    { label: "真人", value: "live" },
    { label: "修复", value: "restore" },
    { label: "自定义", value: "custom" },
];

export function TencentMPSTemplateSettings({ templates, syncing, onSync }: Props) {
    const form = Form.useFormInstance<AdminSettings>();
    const update = (index: number, patch: Partial<AdminTencentMPSTemplate>) => {
        form.setFieldValue(["private", "tencentMpsVideo", "templates"], templates.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    };

    return (
        <div className="rounded-md border border-[var(--ant-color-border-secondary)]">
            <Flex align="center" justify="space-between" gap={12} wrap className="border-b border-[var(--ant-color-border-secondary)] px-3 py-2.5">
                <div>
                    <Typography.Text strong>增强模板</Typography.Text>
                    <div><Typography.Text type="secondary" className="text-xs">只读取模板，不创建任务；同步后仍需保存设置。</Typography.Text></div>
                </div>
                <Button size="small" loading={syncing} onClick={onSync}>同步腾讯模板</Button>
            </Flex>
            {templates.length ? <Flex vertical>
                {templates.map((template, index) => (
                    <Flex key={template.definition} align="center" gap={10} wrap className="border-b border-[var(--ant-color-border-secondary)] px-3 py-2.5 last:border-b-0">
                        <Switch size="small" aria-label={`启用 ${template.displayName}`} disabled={!template.supported} checked={template.enabled} onChange={(enabled) => update(index, { enabled })} />
                        <Input size="small" className="min-w-40 flex-1" value={template.displayName} onChange={(event) => update(index, { displayName: event.target.value })} />
                        <Segmented size="small" value={template.scene} options={sceneOptions} onChange={(scene) => update(index, { scene: scene as AdminTencentMPSTemplate["scene"] })} />
                        <Flex align="center" gap={6} wrap>
                            <Tag className="m-0">{template.sourceType === "Preset" ? "官方" : "自定义"}</Tag>
                            <Tag className="m-0" color={template.supported ? "blue" : "default"}>{template.supported ? template.target === "2k" ? "2K" : "1080p" : "暂不支持"}</Tag>
                            <Typography.Text type="secondary" className="text-xs">ID {template.definition}</Typography.Text>
                        </Flex>
                    </Flex>
                ))}
            </Flex> : <Typography.Text type="secondary" className="block px-3 py-4 text-center text-xs">尚未同步模板</Typography.Text>}
        </div>
    );
}
