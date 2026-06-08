import { createAiConfigPackageTemplate } from "@/services/ai-config-package";

export const runtime = "nodejs";

export function GET() {
    return new Response(createAiConfigPackageTemplate(), {
        headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": 'attachment; filename="ai-config-template.json"',
        },
    });
}
