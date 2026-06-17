import { BriefcaseBusiness, FileText, ImagePlus, Images, Workflow } from "lucide-react";

export const navigationTools = [
    {
        slug: "projects",
        label: "项目中心",
        icon: BriefcaseBusiness,
    },
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
    },
    {
        slug: "original-workflow",
        label: "视频工作流",
        icon: Workflow,
    },
    {
        slug: "prompts",
        label: "提示词库",
        icon: FileText,
    },
    {
        slug: "assets",
        label: "我的素材",
        icon: Images,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
