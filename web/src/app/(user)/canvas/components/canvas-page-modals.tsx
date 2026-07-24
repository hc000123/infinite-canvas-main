"use client";

import { Button, Modal } from "antd";
import { CanvasNodeType, type CanvasNodeData } from "../types";

export function CanvasMediaPreviewModal({ node, onClose }: { node?: CanvasNodeData; onClose: () => void }) {
    const content = node?.metadata?.content;
    const title = node?.type === CanvasNodeType.Video ? "视频详情" : node?.type === CanvasNodeType.Audio ? "音频详情" : "图片详情";

    return (
        <Modal rootClassName="studio-modal" title={title} open={Boolean(content)} centered onCancel={onClose} footer={null} width="auto" styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}>
            {node?.type === CanvasNodeType.Image && content ? <img src={content} alt={node.title || "图片"} className="max-h-[80vh] max-w-full object-contain" /> : null}
            {node?.type === CanvasNodeType.Video && content ? <video src={content} className="max-h-[80vh] max-w-full" controls controlsList="nodownload" playsInline /> : null}
            {node?.type === CanvasNodeType.Audio && content ? <audio src={content} className="w-[min(640px,80vw)]" controls /> : null}
        </Modal>
    );
}

export function ClearCanvasConfirmModal({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
    return (
        <Modal
            rootClassName="studio-modal"
            title="清空画布？"
            open={open}
            centered
            onCancel={onCancel}
            footer={
                <>
                    <Button onClick={onCancel}>取消</Button>
                    <Button danger type="primary" onClick={onConfirm}>
                        清空
                    </Button>
                </>
            }
        >
            <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
        </Modal>
    );
}
