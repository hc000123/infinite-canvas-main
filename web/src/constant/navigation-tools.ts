import { Boxes, BriefcaseBusiness, Images, PanelsTopLeft } from "lucide-react";

export const navigationTools = [
    { slug: "projects", label: "项目中心", shortLabel: "项目中心", icon: BriefcaseBusiness },
    { slug: "canvas", label: "画布", shortLabel: "画布", icon: PanelsTopLeft },
    { slug: "assets", label: "资产", shortLabel: "资产", icon: Images },
    { slug: "resources", label: "资源库", shortLabel: "资源", icon: Boxes },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
