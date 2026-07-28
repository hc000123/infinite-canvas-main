"use client";

import { Card, Space, Tabs } from "antd";

import { AITaskLogPanel } from "./components/ai-task-log-panel";
import { AIUsageSummary } from "./components/ai-usage-summary";
import { CreditLogPanel } from "./components/credit-log-panel";

export default function AdminAIUsagePage() {
    return (
        <main style={{ padding: 24 }}>
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <AIUsageSummary />
                <Card variant="borderless">
                    <Tabs
                        items={[
                            { key: "tasks", label: "任务明细", children: <AITaskLogPanel /> },
                            { key: "credits", label: "算力流水", children: <CreditLogPanel /> },
                        ]}
                    />
                </Card>
            </Space>
        </main>
    );
}
