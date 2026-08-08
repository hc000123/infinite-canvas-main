import { Suspense } from "react";
import { Spin } from "antd";

import { AgentWorkspace } from "./agent-workspace";

export default function AgentPage() {
    return <Suspense fallback={<main className="studio-shell grid min-h-[calc(100dvh-3.5rem)] place-items-center"><Spin description="正在打开 Agent 工作区" /></main>}><AgentWorkspace /></Suspense>;
}
