"use client";

import { Alert, Form, Input, Modal, Select, type FormInstance } from "antd";

export type BindFormValues = {
    mode: "none" | "existing" | "import";
    episodeId?: string;
    title?: string;
    scriptText?: string;
};

type EpisodeBindScriptModalProps = {
    open: boolean;
    form: FormInstance<BindFormValues>;
    episodeOptions: Array<{ label: string; value: string }>;
    onCancel: () => void;
    onOk: () => void;
};

export function EpisodeBindScriptModal({ open, form, episodeOptions, onCancel, onOk }: EpisodeBindScriptModalProps) {
    return (
        <Modal title="绑定或导入本集剧本" open={open} onCancel={onCancel} onOk={onOk} okText="确认" cancelText="取消" destroyOnHidden>
            <Alert
                className="mb-4"
                type="info"
                showIcon
                title="选择本集生产方式"
                description="剧本驱动生产用于拆资产和分镜；自由画布制作可以不绑定剧本继续创作；资产生产与复用可先沉淀角色图、场景图、道具图和氛围参考。确认后不会自动运行 Agent、生成分镜草案或触发生成扣费。"
            />
            <Form form={form} layout="vertical" initialValues={{ mode: "import" }}>
                <Form.Item name="mode" label="剧本来源">
                    <Select
                        options={[
                            { label: "不绑定剧本，继续自由画布制作", value: "none" },
                            { label: "从项目已有分集选择", value: "existing" },
                            { label: "粘贴 / 导入本集剧本", value: "import" },
                        ]}
                    />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, next) => prev.mode !== next.mode}>
                    {({ getFieldValue }) =>
                        getFieldValue("mode") === "existing" ? (
                            <Form.Item name="episodeId" label="已有分集" rules={[{ required: true, message: "请选择分集" }]}>
                                <Select options={episodeOptions} placeholder="选择项目分集" />
                            </Form.Item>
                        ) : getFieldValue("mode") === "import" ? (
                            <>
                                <Form.Item name="title" label="本集标题" rules={[{ required: true, message: "请填写标题" }]}>
                                    <Input placeholder="例如：第一集" />
                                </Form.Item>
                                <Form.Item name="scriptText" label="本集剧本" rules={[{ required: true, message: "请粘贴本集剧本" }]}>
                                    <Input.TextArea rows={8} />
                                </Form.Item>
                            </>
                        ) : (
                            <Alert type="success" showIcon title="自由画布制作" description="不绑定剧本也可以继续使用画布、素材、Brief 和视频生成节点。后续需要剧本驱动生产时，可随时从本集工作台重新绑定或导入。" />
                        )
                    }
                </Form.Item>
            </Form>
        </Modal>
    );
}

export function buildEpisodeSnapshot(
    episode: { title: string; summary: string; hook: string; turningPoint: string; cliffhanger: string; id: string },
    scenes: Array<{ episodeId: string; order: number; location: string; beat: string; dialogue: string; emotion: string; durationHint: string }>,
) {
    const lines = [`# ${episode.title}`, episode.summary, episode.hook ? `钩子：${episode.hook}` : "", episode.turningPoint ? `转折：${episode.turningPoint}` : "", episode.cliffhanger ? `悬念：${episode.cliffhanger}` : ""].filter(Boolean);
    const sceneText = scenes
        .filter((scene) => scene.episodeId === episode.id)
        .sort((a, b) => a.order - b.order)
        .map((scene) =>
            [`场次 ${scene.order}${scene.location ? `：${scene.location}` : ""}`, scene.beat, scene.dialogue ? `对白：${scene.dialogue}` : "", scene.emotion ? `情绪：${scene.emotion}` : "", scene.durationHint ? `时长：${scene.durationHint}` : ""]
                .filter(Boolean)
                .join("\n"),
        );
    return [...lines, ...sceneText].join("\n\n");
}
