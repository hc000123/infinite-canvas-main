"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";

import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";

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
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const returnTarget = buildWorkspaceReturnTarget(searchParams);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const getToolHref = (toolSlug: NavigationToolSlug) => {
        if (toolSlug === "assets") return buildWorkspaceAssetsHref(pathname, searchParams);
        return `/${toolSlug}`;
    };
    const barStyle = { background: "color-mix(in srgb, var(--studio-app-bg) 92%, transparent)", color: "var(--studio-text-primary)" };

    return (
        <header className="relative z-[80] h-14 shrink-0 border-b border-[var(--studio-border-subtle)] shadow-[var(--studio-shadow)] backdrop-blur-xl" style={barStyle}>
            <div className="mx-auto flex h-full w-full max-w-7xl items-stretch justify-between gap-3 px-4 sm:px-5">
                <div className="flex min-w-0 items-center">
                    <Link href="/" className="group flex h-full shrink-0 items-center gap-3 text-sm font-semibold leading-none tracking-tight transition hover:text-[var(--studio-accent)]">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-subtle)] bg-[var(--studio-active-bg)] text-[var(--studio-accent)] transition group-hover:border-[var(--studio-border-strong)] group-hover:bg-[var(--studio-hover-bg)]">
                            <span
                                className="size-5 bg-current"
                                style={{
                                    mask: "url(/logo.svg) center / contain no-repeat",
                                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                }}
                            />
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
                        className="ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-accent)] md:hidden"
                        style={{ color: "var(--studio-text-secondary)" }}
                        onClick={() => setMobileNavOpen(true)}
                        aria-label="打开导航菜单"
                        title="导航菜单"
                    >
                        <Menu className="size-5" />
                    </button>

                    <nav className="ml-4 hidden h-10 min-w-0 items-center gap-0.5 overflow-hidden rounded-md border border-[var(--studio-border-subtle)] bg-[var(--studio-panel-rail-bg)] p-1 md:flex">
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
                            className="hidden h-8 shrink-0 items-center gap-2 rounded-md border border-transparent px-2 text-sm font-medium transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-accent)] sm:flex"
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

function buildWorkspaceAssetsHref(pathname: string, searchParams: SearchParamReader) {
    if (pathname === "/assets" || pathname.startsWith("/assets/")) return "/assets";

    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    const params = new URLSearchParams();
    params.set("returnTo", currentHref);
    params.set("returnLabel", "返回上一页");
    return `/assets?${params.toString()}`;
}

function ProjectWorkspaceLink({ icon, label, href, active }: { icon: ReactNode; label: string; href: string; active: boolean }) {
    const activeStyle = { background: "var(--studio-active-bg)", borderColor: "var(--studio-border-strong)", color: "var(--studio-text-primary)" };
    const inactiveStyle = { background: "transparent", borderColor: "transparent", color: "var(--studio-text-secondary)" };
    const iconStyle = { color: active ? "var(--studio-accent)" : "currentColor" };

    return (
        <a
            href={href}
            className={`group relative flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-sm leading-6 transition hover:border-[var(--studio-border-subtle)] hover:bg-[var(--studio-hover-bg)] hover:text-[var(--studio-text-primary)] xl:justify-start ${active ? "font-semibold shadow-[inset_0_-2px_0_var(--studio-accent)]" : "font-medium"}`}
            style={active ? activeStyle : inactiveStyle}
            title={label}
            aria-label={label}
        >
            <span className="shrink-0 transition" style={iconStyle}>
                {icon}
            </span>
            <span className="hidden whitespace-nowrap xl:inline">{label}</span>
        </a>
    );
}
