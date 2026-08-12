"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Modal, Segmented } from "antd";
import { CloudUpload, Sparkles } from "lucide-react";

import type { ImageUpscaleCapabilities } from "@/services/api/image-upscale";
import type { CanvasNodeData } from "../types";

export function CanvasImageUpscaleModal({ node, capabilities, loading, onClose, onSubmit }: { node: CanvasNodeData | null; capabilities: ImageUpscaleCapabilities | null; loading: boolean; onClose: () => void; onSubmit: (node: CanvasNodeData, scale: 2 | 4) => void }) {
    const [scale, setScale] = useState<2 | 4>(2);
    useEffect(() => setScale(2), [node?.id]);
    const width = Math.round(node?.metadata?.naturalWidth || node?.width || 0);
    const height = Math.round(node?.metadata?.naturalHeight || node?.height || 0);
    const enabled = capabilities?.enabled === true;

    return (
        <Modal title="图片超分" open={Boolean(node)} onCancel={onClose} footer={null} width={460} centered destroyOnHidden>
            {node ? (
                <div className="space-y-4">
                    <Alert showIcon icon={<CloudUpload className="size-4" />} type="info" title="图片将上传到云端服务处理" description="API 密钥只保存在服务端。原图片节点不会被替换，结果会作为右侧新节点加入画布并归档到资产。" />
                    <div>
                        <div className="mb-2 text-sm font-medium">放大倍率</div>
                        <Segmented block value={scale} options={[{ label: "2×", value: 2 }, { label: "4×", value: 4 }]} onChange={(value) => setScale(value as 2 | 4)} />
                    </div>
                    <div className="rounded-lg bg-[var(--studio-panel-muted-bg)] px-3 py-2 text-sm text-[var(--studio-text-secondary)]">
                        {width && height ? `${width} × ${height} → ${width * scale} × ${height * scale}` : `输出尺寸约为原图的 ${scale} 倍`}
                    </div>
                    {!enabled ? <Alert type="warning" showIcon title={capabilities ? "服务端尚未配置图片超分" : "暂时无法确认服务端图片超分配置"} description="请检查后端服务，并在后端环境变量中配置阿里云 AccessKey。" /> : null}
                    <Button type="primary" block size="large" icon={<Sparkles className="size-4" />} loading={loading} disabled={!enabled} onClick={() => onSubmit(node, scale)}>
                        开始 {scale}× 超分
                    </Button>
                </div>
            ) : null}
        </Modal>
    );
}
