"use client";

import { Button, Result } from "antd";
import { useRouter } from "next/navigation";

import { CLOUD_EXECUTOR_UNAVAILABLE } from "@/app/api/original-workflow/execution-mode";

export default function OriginalWorkflowPage() {
    const router = useRouter();

    return (
        <main className="min-h-[calc(100vh-56px)] bg-[var(--studio-page-bg)] p-4 sm:p-6">
            <section className="studio-panel mx-auto grid min-h-[520px] max-w-4xl place-items-center p-6">
                <Result
                    status="info"
                    title={CLOUD_EXECUTOR_UNAVAILABLE}
                    subTitle="正式版本已关闭本地 Codex CLI 和本机 Runner。项目、画布、素材及图片 / 视频模型渠道仍可正常使用；视频工作流将在云端 Worker 接入并完成权限、队列和审核链路后重新开放。"
                    extra={[
                        <Button key="projects" type="primary" onClick={() => router.push("/projects")}>
                            返回项目
                        </Button>,
                        <Button key="canvas" onClick={() => router.push("/canvas")}>
                            打开画布
                        </Button>,
                    ]}
                />
            </section>
        </main>
    );
}
