"use client";

import { useState } from "react";
import { Input, Modal } from "antd";

import type { CanvasNodeData } from "../types";

export function CanvasTextEditorModal({ node, onClose, onSave }: { node: CanvasNodeData | null; onClose: () => void; onSave: (nodeId: string, content: string) => void }) {
    return node ? <CanvasTextEditorForm key={node.id} node={node} onClose={onClose} onSave={onSave} /> : null;
}

function CanvasTextEditorForm({ node, onClose, onSave }: { node: CanvasNodeData; onClose: () => void; onSave: (nodeId: string, content: string) => void }) {
    const [draft, setDraft] = useState(node.metadata?.content || "");
    return (
        <Modal
            rootClassName="studio-modal"
            title="放大编辑文本"
            open
            width="min(920px, calc(100vw - 32px))"
            okText="保存"
            cancelText="取消"
            destroyOnHidden
            onCancel={onClose}
            onOk={() => {
                onSave(node.id, draft);
                onClose();
            }}
        >
            <Input.TextArea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="thin-scrollbar !min-h-[56dvh] !resize-y !font-mono !leading-7"
                placeholder="输入节点文本"
                data-canvas-no-zoom
                data-canvas-shortcut-scope="ignore"
            />
        </Modal>
    );
}
