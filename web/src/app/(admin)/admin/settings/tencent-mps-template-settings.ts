import type { AdminTencentMPSTemplate } from "@/services/api/admin";

export function mergeTencentTemplateSettings(current: AdminTencentMPSTemplate[], remote: AdminTencentMPSTemplate[]) {
    const saved = new Map(current.map((item) => [item.definition, item]));
    return remote.map((item) => {
        const previous = saved.get(item.definition);
        return {
            ...item,
            enabled: previous ? previous.enabled && item.supported : false,
            displayName: previous?.displayName || item.displayName || item.upstreamName || `模板 ${item.definition}`,
            scene: previous?.scene || item.scene || "custom",
        };
    });
}
