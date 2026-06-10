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
                    <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">{review.summary}</p>
                    <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                        {review.issues.map((issue, index) => (
                            <div key={`${issue.type}-${index}`} className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-700">
                                <div className="font-medium">{issue.title}</div>
                                <div className="mt-1 leading-6 text-stone-600 dark:text-stone-300">{issue.description}</div>
                                {issue.suggestion ? <div className="mt-1 leading-6 text-stone-500">建议：{issue.suggestion}</div> : null}
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
