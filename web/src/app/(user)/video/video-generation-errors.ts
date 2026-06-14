export function formatVideoGenerationError(error: unknown) {
    return normalizeVideoGenerationErrorMessage(error instanceof Error ? error.message : "视频生成失败");
}

export function normalizeVideoGenerationErrorMessage(message: string) {
    const cleanMessage = sanitizeVideoGenerationErrorMessage(message);
    if (/^视频生成失败：后端视频通道认证失败/.test(cleanMessage)) return cleanMessage;
    if (/^视频生成失败：视频上游拒绝创建(?:视频)?任务/.test(cleanMessage)) return cleanMessage;
    if (isVideoChannelAuthError(cleanMessage)) return "视频生成失败：后端视频通道认证失败，请检查系统设置里的 Seedance / Ark API Key 和模型 EP 绑定。上游返回：" + cleanMessage;
    if (isVideoChannelUpstreamError(cleanMessage)) return "视频生成失败：视频上游拒绝创建任务，请确认企业 API Key、模型 EP 绑定和账号视频模型权限。上游返回：" + cleanMessage;
    return cleanMessage;
}

export function sanitizeVideoGenerationErrorMessage(message: string) {
    return message.replace(/中转上游/g, "视频上游").replace(/真实中转/g, "真实视频通道");
}

export function isVideoChannelAuthError(message?: string) {
    if (!message) return false;
    return /api key|authentication|unauthorized|401|认证失败|密钥/i.test(message);
}

export function isVideoChannelUpstreamError(message?: string) {
    if (!message) return false;
    return /upstream_error|fail_submit_task|上游/i.test(message);
}
