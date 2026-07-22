"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData } from "../types";
import { hasDirtyCanvasPromptDraft, switchCanvasMediaVersion } from "../utils/canvas-media-versions";

type ConfirmModal = {
    confirm: (options: { title: string; content: string; okText: string; cancelText: string; onOk: () => void }) => unknown;
};

export function useCanvasMediaVersionActions({ modal, setNodes }: { modal: ConfirmModal; setNodes: Dispatch<SetStateAction<CanvasNodeData[]>> }) {
    const switchMediaVersion = useCallback(
        (node: CanvasNodeData, versionId: string) => {
            const apply = () => setNodes((items) => items.map((item) => (item.id === node.id ? switchCanvasMediaVersion(item, versionId) : item)));
            if (!hasDirtyCanvasPromptDraft(node)) {
                apply();
                return;
            }
            modal.confirm({
                title: "提示词修改尚未生成",
                content: "切换版本会放弃当前修改，是否继续？",
                okText: "放弃并切换",
                cancelText: "继续编辑",
                onOk: apply,
            });
        },
        [modal, setNodes],
    );

    return { switchMediaVersion };
}
