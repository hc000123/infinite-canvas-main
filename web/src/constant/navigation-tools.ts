import { Boxes, BriefcaseBusiness, Images, PanelsTopLeft, RadioTower } from "lucide-react";

export const navigationTools = [
    { slug: "projects", label: "工作台", shortLabel: "工作台", icon: BriefcaseBusiness },
    { slug: "agent", label: "生产总控", shortLabel: "总控", icon: RadioTower },
    { slug: "canvas", label: "画布", shortLabel: "画布", icon: PanelsTopLeft },
    { slug: "assets", label: "素材", shortLabel: "素材", icon: Images },
    { slug: "resources", label: "资源库", shortLabel: "资源", icon: Boxes },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
