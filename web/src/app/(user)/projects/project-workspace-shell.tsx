"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { useCanvasStore } from "../canvas/stores/use-canvas-store";
import { contextualToolHref, workspaceProjectId } from "@/components/layout/workspace-project-context";

export function ProjectWorkspaceShell({ children }: { children: ReactNode }) {
    return (
        <div className="studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
            <ProjectWorkspaceTopBar />
            <div className="studio-shell min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
    );
}

function ProjectWorkspaceTopBar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const canvasProjects = useCanvasStore((state) => state.projects);
    const returnTarget = buildWorkspaceReturnTarget(searchParams);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const projectId = workspaceProjectId(pathname, searchParams);
    const getToolHref = (toolSlug: NavigationToolSlug) => {
        const contextualHref = contextualToolHref(toolSlug, projectId);
        if (toolSlug === "assets") return buildWorkspaceAssetsHref(pathname, searchParams, contextualHref);
        if (toolSlug === "canvas") {
            const currentCanvasId = pathname.match(/^\/canvas\/([^/]+)/)?.[1];
            const canvasProjectId = projectId || canvasProjects.find((canvas) => canvas.id === currentCanvasId)?.projectId || "";
            return canvasProjectId ? `/canvas?projectId=${encodeURIComponent(canvasProjectId)}` : "/canvas";
        }
        return contextualHref;
    };
    const barStyle = { background: "color-mix(in srgb, var(--studio-app-bg) 92%, transparent)", color: "var(--studio-text-primary)" };

    return (
        <header className="relative z-[80] h-14 shrink-0 border-b border-[var(--studio-border-subtle)] backdrop-blur-xl" style={barStyle}>
            <div className="mx-auto flex h-full w-full max-w-7xl items-stretch justify-between gap-3 px-4 sm:px-5">
                <div className="flex min-w-0 flex-1 items-center">
                    <Link href="/" className="workspace-top-button whitespace-nowrap !px-3 text-base !font-semibold tracking-tight">
                        AI · 画布
                    </Link>

                    <nav className="ml-4 flex h-10 min-w-0 flex-1 items-center gap-1 overflow-x-auto thin-scrollbar">
                        {navigationTools.map((tool) => {
                            return <ProjectWorkspaceLink key={tool.slug} label={tool.shortLabel} title={tool.label} href={getToolHref(tool.slug)} active={tool.slug === activeToolSlug} />;
                        })}
                    </nav>
                </div>

                <div className="my-auto flex h-9 min-w-0 shrink-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                    {returnTarget ? (
                        <button type="button" className="workspace-top-button hidden sm:flex" onClick={() => window.location.assign(returnTarget.href)} title={returnTarget.label}>
                            {returnTarget.label}
                        </button>
                    ) : null}
                    <UserStatusActions variant="text" />
                </div>
            </div>
        </header>
    );
}

function buildWorkspaceReturnTarget(searchParams: URLSearchParams) {
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/")) return { href: returnTo, label: searchParams.get("returnLabel") || "返回上一步" };
    const source = searchParams.get("source") || "";
    const projectId = searchParams.get("projectId") || "";
    if (source === "episode-workbench" && projectId) {
        return {
            href: `/projects/${encodeURIComponent(projectId)}`,
            label: "返回项目详情",
        };
    }
    return undefined;
}

type SearchParamReader = {
    get: (name: string) => string | null;
    toString: () => string;
};

function buildWorkspaceAssetsHref(pathname: string, searchParams: SearchParamReader, contextualHref: string) {
    if (pathname === "/assets" || pathname.startsWith("/assets/")) return contextualHref;

    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    const params = new URLSearchParams();
    params.set("returnTo", currentHref);
    params.set("returnLabel", "返回上一页");
    const projectId = new URLSearchParams(contextualHref.split("?")[1] || "").get("projectId");
    if (projectId) params.set("projectId", projectId);
    return `/assets?${params.toString()}`;
}

function ProjectWorkspaceLink({ label, title, href, active }: { label: string; title: string; href: string; active: boolean }) {
    return (
        <a href={href} className="workspace-top-button relative" title={title} aria-label={title} aria-current={active ? "page" : undefined}>
            <span className="whitespace-nowrap">{label}</span>
        </a>
    );
}
