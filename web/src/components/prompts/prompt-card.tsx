"use client";

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { promptNodeGroupLabel, promptTypeLabel } from "./prompt-template";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel = "复制",
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
}) {
    return (
        <Card
            hoverable
            className="studio-card overflow-hidden"
            styles={{ body: { padding: 0 } }}
            cover={
                <button type="button" className="block w-full text-left" onClick={onOpen}>
                    <img src={item.coverUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
                </button>
            }
        >
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="line-clamp-1 text-sm font-semibold text-[var(--studio-text-primary)]">{item.title}</h2>
                        <span className="shrink-0 text-xs text-[var(--studio-text-muted)]">{formatPromptDate(item.updatedAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--studio-text-secondary)]">{item.prompt}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.metadata?.nodeGroup ? (
                            <Tag className="studio-tag text-[11px]">
                                {promptNodeGroupLabel(item.metadata.nodeGroup)}
                            </Tag>
                        ) : null}
                        {item.metadata?.type ? (
                            <Tag className="studio-tag text-[11px]">
                                {promptTypeLabel(item.metadata.type)}
                            </Tag>
                        ) : null}
                        {item.metadata?.favorite ? (
                            <Tag className="studio-tag text-[11px]">
                                常用
                            </Tag>
                        ) : null}
                        {item.tags.map((tag) => (
                            <Tag key={tag} className="studio-tag text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                </div>
            </button>
            <div className="flex items-center gap-2 px-4 pb-4">
                <Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                    {actionLabel}
                </Button>
                {extraAction}
            </div>
        </Card>
    );
}
