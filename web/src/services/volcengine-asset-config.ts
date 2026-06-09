export type VolcengineAssetConfigSummaryInput = {
    enabled?: boolean;
    projectName?: string;
    region?: string;
    assetGroupId?: string;
};

export const VOLCENGINE_ASSET_CONFIG_NOTICE = "加白配置不同于 Seedance 视频生成渠道，填一次即可；视频生成渠道不影响素材加白配置。";

export function summarizeVolcengineAssetConfig(setting?: VolcengineAssetConfigSummaryInput, options: { showDetails?: boolean } = {}) {
    const showDetails = options.showDetails !== false && Boolean(setting);
    const hidden = "请到后台系统设置查看";
    return {
        statusText: setting?.enabled ? "已开启" : "未开启",
        statusColor: setting?.enabled ? "success" : "default",
        projectName: showDetails ? setting?.projectName || "default" : hidden,
        region: showDetails ? setting?.region || "cn-beijing" : hidden,
        assetGroupId: showDetails ? setting?.assetGroupId || "未配置" : hidden,
    };
}
