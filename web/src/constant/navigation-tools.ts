import { BriefcaseBusiness, Clapperboard, Database, FileText, Images, PanelsTopLeft, Route } from "lucide-react";

export const navigationTools = [
    {
        slug: "projects",
        label: "项目中心",
        shortLabel: "项目",
        icon: BriefcaseBusiness,
    },
    {
        slug: "agent",
        label: "Agent 制作总控",
        shortLabel: "Agent",
        icon: Route,
    },
    {
        slug: "canvas",
        label: "画布",
        shortLabel: "画布",
        icon: PanelsTopLeft,
    },
    {
        slug: "image",
        label: "分镜制作台",
        shortLabel: "分镜",
        icon: Clapperboard,
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
