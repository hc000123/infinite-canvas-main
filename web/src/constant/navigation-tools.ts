import { BriefcaseBusiness, Database, FileText, ImagePlus, Images, PanelsTopLeft } from "lucide-react";

export const navigationTools = [
    {
        slug: "projects",
        label: "项目中心",
        shortLabel: "项目",
        icon: BriefcaseBusiness,
    },
    {
        slug: "canvas",
        label: "画布",
        shortLabel: "画布",
        icon: PanelsTopLeft,
    },
    {
        slug: "image",
        label: "生图工作台",
        shortLabel: "生图",
        icon: ImagePlus,
    },
    {
        slug: "prompts",
        label: "提示词库",
        shortLabel: "提示词",
        icon: FileText,
    },
    {
        slug: "assets",
        label: "资产",
        shortLabel: "资产",
        icon: Images,
    },
    {
        slug: "cache",
        label: "缓存管理",
        shortLabel: "缓存",
        icon: Database,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
