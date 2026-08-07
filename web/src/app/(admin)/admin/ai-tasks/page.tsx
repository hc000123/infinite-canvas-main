"use client";

import { Card, Tabs } from "antd";

import { AITaskLogPanel } from "./components/ai-task-log-panel";
import { CreditLogPanel } from "./components/credit-log-panel";
import { adminTaskOperationTabs } from "./admin-ai-task-page-view";

export default function AdminAITaskOperationsPage() {
    return (
        <main style={{ padding: 24 }}>
            <Card variant="borderless">
                <Tabs
                    items={[
                        { key: "tasks", label: adminTaskOperationTabs[0], children: <AITaskLogPanel /> },
                        { key: "credits", label: adminTaskOperationTabs[1], children: <CreditLogPanel /> },
                    ]}
                />
            </Card>
        </main>
    );
}
