export const CLOUD_EXECUTOR_UNAVAILABLE = "云端执行器尚未启用";

export function requireCloudExecutionMode(value?: string) {
    if (value === "local-runner") throw new Error("生产环境已禁用本地 Codex CLI");
    return "cloud-worker" as const;
}
