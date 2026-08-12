import { BookOpenText, BriefcaseBusiness, Clapperboard, Database, Images, PanelsTopLeft, Route } from "lucide-react";

export const navigationTools = [
    {
        slug: "projects",
        label: "项目中心",
        shortLabel: "项目",
        icon: BriefcaseBusiness,
    },
    {
        slug: "agent",
        label: "生产总控",
        shortLabel: "总控",
        icon: Route,
    },
    {
        slug: "canvas",
        label: "画布",
        shortLabel: "画布",
        icon: PanelsTopLeft,
    },
    {
        slug: "storyboard",
        label: "分镜制作台",
        shortLabel: "分镜",
        icon: Clapperboard,
    },
    {
        slug: "assets",
        label: "资产",
        shortLabel: "资产",
        icon: Images,
    },
    {
        slug: "prompts",
        label: "提示词库",
        shortLabel: "提示词",
        icon: BookOpenText,
    },
    {
        slug: "cache",
        label: "缓存管理",
        shortLabel: "缓存",
        icon: Database,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
