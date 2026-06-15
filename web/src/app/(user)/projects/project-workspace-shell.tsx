"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleDot, Menu } from "lucide-react";

import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";

export function ProjectWorkspaceShell({ children }: { children: ReactNode }) {
    return (
        <div className="studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
            <ProjectWorkspaceTopBar />
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--studio-shell-bg)]">{children}</div>
        </div>
    );
}

function ProjectWorkspaceTopBar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const returnTarget = buildWorkspaceReturnTarget(searchParams);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const getToolHref = (toolSlug: NavigationToolSlug) => {
        if (toolSlug === "assets") return buildWorkspaceAssetsHref(pathname, searchParams);
        if (toolSlug === "original-workflow") return buildWorkspaceOriginalWorkflowHref(pathname, searchParams);
        return `/${toolSlug}`;
    };
    const barStyle = { background: "color-mix(in srgb, var(--studio-app-bg) 94%, transparent)", color: "var(--studio-text-primary)" };

    return (
        <header className="relative z-[80] h-16 shrink-0 border-b border-[var(--studio-border-subtle)] shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl" style={barStyle}>
            <div className="mx-auto flex h-full w-full max-w-7xl items-stretch justify-between gap-5 px-5 sm:px-6">
                <div className="flex min-w-0 items-center">
                    <Link href="/" className="flex h-full shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight transition hover:text-[var(--studio-accent)]">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.15] bg-[var(--studio-accent)] text-[var(--primary-foreground)] shadow-[0_10px_24px_rgba(111,168,255,0.24)]">
                            <CircleDot className="size-5 fill-current" />
                        </span>
                        <span className="grid gap-1">
                            <span className="flex items-center gap-2 text-base font-semibold" style={{ color: "var(--studio-text-primary)" }}>
                                AI · 画布
                                <span
                                    className="shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                                    style={{ borderColor: "color-mix(in srgb, var(--studio-accent) 35%, transparent)", background: "var(--studio-accent-soft)", color: "var(--studio-accent)" }}
                                >
                                    本地版
                                </span>
                            </span>
                            <span className="hidden text-[10px] font-medium leading-none sm:block" style={{ color: "var(--studio-text-muted)" }}>
                                让想法成为影像
                            </span>
                        </span>
                    </Link>

                    <button
                        type="button"
                        className="ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md transition hover:bg-[var(--studio-accent-soft)] hover:text-[var(--studio-accent)] md:hidden"
                        style={{ color: "var(--studio-text-secondary)" }}
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="打开导航菜单"
                        title="导航菜单"
                    >
                        <Menu className="size-5" />
                    </button>

                    <nav className="thin-scrollbar ml-7 hidden h-16 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-muted-bg)] p-1 md:flex">
                        {navigationTools.map((tool) => {
                            const Icon = tool.icon;
                            return <ProjectWorkspaceLink key={tool.slug} icon={<Icon className="size-4" />} label={tool.label} href={getToolHref(tool.slug)} active={tool.slug === activeToolSlug} />;
                        })}
                    </nav>
                </div>

                <div className="my-auto flex h-9 min-w-0 shrink-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                    {returnTarget ? (
                        <button
                            type="button"
                            className="hidden h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium transition hover:bg-[var(--studio-accent-soft)] hover:text-[var(--studio-accent)] sm:flex"
                            style={{ color: "var(--studio-text-secondary)" }}
                            onClick={() => window.location.assign(returnTarget.href)}
                            title={returnTarget.label}
                        >
                            <ArrowLeft className="size-4" />
                            <span className="hidden whitespace-nowrap lg:inline">{returnTarget.label}</span>
                        </button>
                    ) : null}
                    <UserStatusActions />
                </div>
            </div>
            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} getHref={getToolHref} onClose={() => setMobileNavOpen(false)} />
        </header>
    );
}

function buildWorkspaceReturnTarget(searchParams: URLSearchParams) {
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/")) return { href: returnTo, label: searchParams.get("returnLabel") || "返回上一步" };
    const source = searchParams.get("source") || "";
    const projectId = searchParams.get("projectId") || "";
    const episodeId = searchParams.get("episodeId") || "";
    if (source === "episode-workbench" && projectId && episodeId) {
        return {
            href: `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/workbench?module=assets`,
            label: "返回资产与生图",
        };
    }
    return undefined;
}

type SearchParamReader = {
    get: (name: string) => string | null;
    toString: () => string;
};

function buildWorkspaceAssetsHref(pathname: string, searchParams: SearchParamReader) {
    if (pathname === "/assets" || pathname.startsWith("/assets/")) return "/assets";

    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    const params = new URLSearchParams();
    params.set("returnTo", currentHref);
    params.set("returnLabel", "返回上一页");
    return `/assets?${params.toString()}`;
}

function buildWorkspaceOriginalWorkflowHref(pathname: string, searchParams: SearchParamReader) {
    if (pathname === "/original-workflow" || pathname.startsWith("/original-workflow/")) return withWorkspaceQuery("/original-workflow", searchParams);
    const returnTo = searchParams.get("returnTo") || "";
    if (returnTo.startsWith("/original-workflow")) return returnTo;
    const params = workflowScopedParams(searchParams);
    const query = params.toString();
    return query ? `/original-workflow?${query}` : "/original-workflow";
}

function withWorkspaceQuery(pathname: string, searchParams: SearchParamReader) {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

function workflowScopedParams(searchParams: SearchParamReader) {
    const params = new URLSearchParams();
    for (const key of ["episode", "projectSlug", "sourceProjectId", "sourceEpisodeId"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
    }
    return params;
}

function ProjectWorkspaceLink({ icon, label, href, active }: { icon: ReactNode; label: string; href: string; active: boolean }) {
    const activeStyle = { background: "var(--studio-accent-soft)", borderColor: "color-mix(in srgb, var(--studio-accent) 36%, transparent)", color: "var(--studio-text-primary)" };
    const inactiveStyle = { background: "transparent", borderColor: "transparent", color: "var(--studio-text-secondary)" };
    const iconStyle = { color: active ? "var(--studio-accent)" : "currentColor" };

    return (
        <a
            href={href}
            className={`group relative flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm leading-6 transition hover:bg-[var(--studio-panel-muted-bg)] ${active ? "font-semibold shadow-[inset_0_0_0_1px_rgba(125,211,252,0.12),0_10px_28px_rgba(56,189,248,0.10)]" : "font-medium"}`}
            style={active ? activeStyle : inactiveStyle}
        >
            <span className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition ${active ? "bg-[var(--studio-accent)] opacity-100" : "bg-transparent opacity-0 group-hover:bg-[var(--studio-accent)] group-hover:opacity-100"}`} />
            <span className="shrink-0 transition" style={iconStyle}>
                {icon}
            </span>
            <span className="whitespace-nowrap">{label}</span>
        </a>
    );
}
