import { spawn } from "node:child_process";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type ScriptOptimizerBody = {
    agent?: {
        apiBaseUrl?: string;
        apiKey?: string;
        model?: string;
    };
    executionMode?: "cloud-worker" | "local-runner";
    messages?: Array<{ content: string; role: string }>;
    rootPath?: string;
    timeoutMs?: number;
};

const defaultRootPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";

function json(data: unknown, status = 200) {
    return Response.json({ code: status >= 400 ? 1 : 0, data, msg: status >= 400 ? "操作失败" : "ok" }, { status });
}

function normalizeExecutionMode(value?: string) {
    return value === "cloud-worker" ? "cloud-worker" : "local-runner";
}

function normalizeRootPath(value?: string) {
    return path.resolve((value || defaultRootPath).trim());
}

function normalizeAgent(input?: ScriptOptimizerBody["agent"]) {
    return {
        apiBaseUrl: (input?.apiBaseUrl || "").trim(),
        apiKey: (input?.apiKey || "").trim(),
        model: (input?.model || "").trim(),
    };
}

function buildCodexEnv(agent: ReturnType<typeof normalizeAgent>) {
    const env = { ...process.env };
    env.PATH = `/usr/bin:${env.PATH || ""}`;
    if (agent.apiKey) env.OPENAI_API_KEY = agent.apiKey;
    if (agent.apiBaseUrl) env.OPENAI_BASE_URL = agent.apiBaseUrl;
    return env;
}

function buildCodexPrompt(messages: NonNullable<ScriptOptimizerBody["messages"]>) {
    return [
        "你正在执行视频工作流的剧本优化阶段。",
        "执行方式：本地 Codex CLI。",
        "要求：不要 spawn_agent、不要 fork、不要等待人工回复；直接根据以下消息生成最终结果。",
        "最终回复必须保持原消息要求的 JSON 对象，不要输出 Markdown 解释。",
        "",
        ...messages.map((message) => [`## ${message.role}`, message.content].join("\n")),
    ].join("\n\n");
}

function runCodexExec(input: { agent: ReturnType<typeof normalizeAgent>; prompt: string; rootPath: string; timeoutMs: number }) {
    return new Promise<string>((resolve, reject) => {
        const args = ["exec"];
        if (input.agent.model) args.push("--model", input.agent.model);
        args.push("--cd", input.rootPath, "--add-dir", input.rootPath, "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "-");
        const child = spawn("codex", args, { cwd: input.rootPath, env: buildCodexEnv(input.agent), stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error("本地 Codex CLI 剧本优化超时，请缩短剧本或提高 Agent 超时时间。"));
        }, input.timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timeout);
            if (code === 0 && stdout.trim()) return resolve(stdout);
            reject(new Error((stderr || stdout || `本地 Codex CLI 退出码 ${code}`).trim()));
        });
        child.stdin.end(input.prompt);
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as ScriptOptimizerBody;
        const executionMode = normalizeExecutionMode(body.executionMode);
        if (executionMode === "cloud-worker") throw new Error("云端 Worker 剧本优化尚未接入，已按视频工作流执行方式阻断，未回退到本地或前端文本模型。");
        const messages = body.messages || [];
        if (!messages.length) throw new Error("缺少剧本优化 prompt。");
        const rootPath = normalizeRootPath(body.rootPath);
        const agent = normalizeAgent(body.agent);
        const timeoutMs = Math.min(Math.max(body.timeoutMs || 180000, 30000), 300000);
        const rawText = await runCodexExec({ agent, prompt: buildCodexPrompt(messages), rootPath, timeoutMs });
        return json({ rawText });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "剧本优化失败" }, 400);
    }
}
