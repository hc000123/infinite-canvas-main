"use client";

import type { App } from "antd";
import type { PromptReviewResult } from "./canvas-prompt-review";

type AppModal = ReturnType<typeof App.useApp>["modal"];

export function confirmVideoPromptReview(review: PromptReviewResult, modal: AppModal) {
    return new Promise<boolean>((resolve) => {
        modal.confirm({
            title: review.level === "risk" ? "提示词自审发现高风险" : "提示词自审提醒",
            centered: true,
            okText: "仍然生成",
            cancelText: "返回修改",
            width: 620,
            content: (
                <div className="space-y-3">
                    <p className="text-sm leading-6 text-[var(--studio-text-secondary)]">{review.summary}</p>
                    <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                        {review.issues.map((issue, index) => (
                            <div key={`${issue.type}-${index}`} className="rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-3 text-sm">
                                <div className="font-medium">{issue.title}</div>
                                <div className="mt-1 leading-6 text-[var(--studio-text-secondary)]">{issue.description}</div>
                                {issue.suggestion ? <div className="mt-1 leading-6 text-[var(--studio-text-muted)]">建议：{issue.suggestion}</div> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}
