const labels: Record<string, string> = {
    "login.succeeded": "登录成功",
    "login.failed": "登录失败",
    "account.logout": "退出登录",
    "project.created": "创建项目",
    "project.renamed": "重命名项目",
    "project.deleted": "删除项目",
    "canvas.created": "创建画布",
    "canvas.renamed": "重命名画布",
    "canvas.deleted": "删除画布",
    "asset.uploaded": "上传素材",
    "asset.created": "创建素材",
    "asset.renamed": "重命名素材",
    "asset.deleted": "删除素材",
    "ai.submitted": "提交 AI 任务",
    "ai.succeeded": "AI 任务成功",
    "ai.failed": "AI 任务失败",
    "ai.cancelled": "取消 AI 任务",
    "credit.consumed": "消耗算力点",
    "credit.refunded": "返还算力点",
    "credit.adjusted": "调整算力点",
    "transfer.import_completed": "导入完成",
    "transfer.export_completed": "导出完成",
    "transfer.download_completed": "下载完成",
    "security.login_approval_created": "发起异地登录审批",
    "security.login_approval_approved": "批准异地登录",
    "security.login_approval_rejected": "拒绝异地登录",
    "security.admin_role_changed": "管理员角色变更",
    "security.session_replaced": "新登录替换旧设备",
    "security.session_force_logout": "管理员强制下线",
    "security.session_idle_expired": "长时间未使用下线",
    "security.session_absolute_expired": "登录达到最长时限",
    "security.session_account_changed": "账号安全变更下线",
};
export function activityActionLabel(action: string) {
    return labels[action] || action || "未知操作";
}
export function activityRiskLabel(item: { ipAddress?: string; ipAllowed: boolean }) {
    return item.ipAddress && !item.ipAllowed ? { text: "非白名单 IP", color: "error" } : null;
}
