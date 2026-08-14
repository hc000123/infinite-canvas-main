"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { contextualToolHref, workspaceProjectId } from "./workspace-project-context";

const SPINE_COLLAPSED_KEY = "workspace-spine-collapsed";

export function AppWorkspaceSpine() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const canvasProjects = useCanvasStore((state) => state.projects);
    const [collapsed, setCollapsed] = useState(false);
    const projectId = workspaceProjectId(pathname, searchParams);

    useEffect(() => {
        setCollapsed(window.localStorage.getItem(SPINE_COLLAPSED_KEY) === "1");
    }, []);

    const toggleCollapsed = () => {
        setCollapsed((current) => {
            const next = !current;
            window.localStorage.setItem(SPINE_COLLAPSED_KEY, next ? "1" : "0");
            return next;
        });
    };

    const getToolHref = (toolSlug: NavigationToolSlug) => {
        const contextualHref = contextualToolHref(toolSlug, projectId);
        if (toolSlug === "assets") return buildAssetsReturnHref(pathname, searchParams, contextualHref);
        if (toolSlug === "canvas") {
            const currentCanvasId = pathname.match(/^\/canvas\/([^/]+)/)?.[1];
            const canvasProjectId = projectId || canvasProjects.find((canvas) => canvas.id === currentCanvasId)?.projectId || "";
            return canvasProjectId ? `/canvas?projectId=${encodeURIComponent(canvasProjectId)}` : "/canvas";
        }
        return contextualHref;
    };

    return (
        <aside aria-label="全局工作区" data-collapsed={collapsed} className="studio-app-spine flex shrink-0 flex-col border-r border-[var(--studio-border-subtle)] bg-[var(--studio-spine-bg)]">
            <Link href="/projects" aria-label="眨眼之间" className="studio-spine-brand flex h-14 shrink-0 items-center gap-2 border-b border-[var(--studio-border-subtle)] px-4 text-sm font-semibold text-[var(--studio-text-primary)]">
                <span className="grid size-6 place-items-center rounded border border-[var(--studio-border-strong)] text-[11px] text-[var(--studio-accent)]">眨</span>
                <span className="studio-spine-label">眨眼之间</span>
            </Link>
            <nav className="flex flex-col items-center gap-1 px-2 py-3">
                {navigationTools.map(({ slug, label, icon: Icon }) => {
                    const active = isToolActive(pathname, slug);
                    return (
                        <Link key={slug} href={getToolHref(slug)} aria-label={label} title={label} aria-current={active ? "page" : undefined} className="studio-spine-action">
                            <Icon className="size-4" aria-hidden />
                            <span className="studio-spine-label">{label}</span>
                        </Link>
                    );
                })}
            </nav>
            <button type="button" className="studio-spine-collapse mx-2" onClick={toggleCollapsed} aria-label={collapsed ? "展开全局工作区" : "收起全局工作区"} aria-expanded={!collapsed} title={collapsed ? "展开全局工作区" : "收起全局工作区"}>
                {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
                <span className="studio-spine-label">收起侧栏</span>
            </button>
            <div className="studio-spine-footer mt-auto border-t border-[var(--studio-border-subtle)] px-2 py-3">
                <UserStatusActions hideVersion={collapsed} />
            </div>
        </aside>
    );
}

function isToolActive(pathname: string, slug: NavigationToolSlug) {
    if (slug === "resources") return pathname.startsWith("/resources") || pathname.startsWith("/prompts") || pathname.startsWith("/cache");
    return pathname === `/${slug}` || pathname.startsWith(`/${slug}/`);
}

type SearchParamReader = {
    get: (name: string) => string | null;
    toString: () => string;
};

function buildAssetsReturnHref(pathname: string, searchParams: SearchParamReader, contextualHref: string) {
    if (pathname === "/assets" || pathname.startsWith("/assets/")) return contextualHref;
    const currentQuery = searchParams.toString();
    const params = new URLSearchParams({ returnTo: currentQuery ? `${pathname}?${currentQuery}` : pathname, returnLabel: "返回上一页" });
    const projectId = new URLSearchParams(contextualHref.split("?")[1] || "").get("projectId");
    if (projectId) params.set("projectId", projectId);
    return `/assets?${params.toString()}`;
}
