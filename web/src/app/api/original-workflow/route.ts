import type { NextRequest } from "next/server";

import { CLOUD_EXECUTOR_UNAVAILABLE, requireCloudExecutionMode } from "./execution-mode.ts";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
    return Response.json({ code: status >= 400 ? 1 : 0, data, msg: status >= 400 ? "操作失败" : "ok" }, { status });
}

export async function GET() {
    return json({ available: false, executionMode: "cloud-worker", message: CLOUD_EXECUTOR_UNAVAILABLE });
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as { executionMode?: string };
        requireCloudExecutionMode(body.executionMode);
        throw new Error(CLOUD_EXECUTOR_UNAVAILABLE);
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : CLOUD_EXECUTOR_UNAVAILABLE }, 400);
    }
}
