"use client";

import { Button, Modal } from "antd";
import type { CanvasNodeData } from "../types";

export function CanvasImagePreviewModal({ node, onClose }: { node?: CanvasNodeData; onClose: () => void }) {
    return (
        <Modal title="图片详情" open={Boolean(node?.metadata?.content)} centered onCancel={onClose} footer={null} width="auto" styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}>
            {node?.metadata?.content ? <img src={node.metadata.content} alt={node.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
        </Modal>
    );
}

export function ClearCanvasConfirmModal({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
    return (
        <Modal
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
