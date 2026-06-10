"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleDot, FileText, Folder, Home, ImagePlus, LogIn, LogOut, Settings2, UserRound } from "lucide-react";

import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ProjectWorkspaceShell({ children }: { children: ReactNode }) {
    return (
        <div className="studio-workspace flex h-full min-h-0 flex-col overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
            <ProjectWorkspaceTopBar />
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--studio-shell-bg)]">{children}</div>
        </div>
    );
}

function ProjectWorkspaceTopBar() {
    const router = useRouter();
    const [accountOpen, setAccountOpen] = useState(false);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.clearSession);
    const userName = user?.displayName || user?.username || "本地创作者";
    const userInitial = userName.trim().slice(0, 1) || "创";
    const roleLabel = user?.role === "admin" ? "管理员" : user ? "已登录" : "未登录";
    const handleLogout = () => {
        setAccountOpen(false);
        logout();
        router.replace("/login");
    };
    const handleLogin = () => {
        setAccountOpen(false);
        router.push("/login");
    };
    const handleOpenConfig = () => {
        setAccountOpen(false);
        openConfigDialog(false);
    };
    const barStyle = { background: "color-mix(in srgb, var(--studio-app-bg) 94%, transparent)", color: "var(--studio-text-primary)" };

    return (
        <header className="relative z-[80] flex h-16 shrink-0 items-center gap-5 border-b border-[var(--studio-border-subtle)] px-4 shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl md:px-6" style={barStyle}>
            <div className="flex min-w-0 shrink-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.15] bg-[var(--studio-accent)] text-[var(--primary-foreground)] shadow-[0_10px_24px_rgba(111,168,255,0.24)]">
                    <CircleDot className="size-5 fill-current" />
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="whitespace-nowrap text-lg font-semibold tracking-normal" style={{ color: "var(--studio-text-primary)" }}>
                            AI · 画布
                        </div>
                        <span
                            className="shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                            style={{ borderColor: "color-mix(in srgb, var(--studio-accent) 35%, transparent)", background: "var(--studio-accent-soft)", color: "var(--studio-accent)" }}
                        >
                            本地版
                        </span>
                    </div>
                    <p className="mt-0.5 hidden text-xs font-medium sm:block" style={{ color: "var(--studio-text-muted)" }}>
                        让想法成为影像
                    </p>
                </div>
            </div>

            <nav className="thin-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <ProjectWorkspaceLink icon={<Home className="size-4.5" />} label="项目工作台" href="/projects" />
                <ProjectWorkspaceLink icon={<ImagePlus className="size-4.5" />} label="生图工作台" href="/image" />
                <ProjectWorkspaceLink icon={<FileText className="size-4.5" />} label="提示词库" href="/prompts" />
                <ProjectWorkspaceLink icon={<Folder className="size-4.5" />} label="我的素材" href="/assets" />
            </nav>

            <div className="relative flex shrink-0 items-center gap-2">
                <VersionReleaseModal
                    className="hidden h-10 shrink-0 cursor-pointer items-center rounded-lg border px-3 text-xs font-semibold transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)] sm:inline-flex"
                    style={{ borderColor: "var(--studio-border-strong)", background: "var(--studio-panel-muted-bg)", color: "var(--studio-text-muted)" }}
                />
                <button
                    type="button"
                    className="flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)]"
                    style={{ borderColor: "var(--studio-border-strong)", background: "var(--studio-panel-muted-bg)", color: "var(--studio-text-secondary)" }}
                    onClick={handleOpenConfig}
                    aria-label="设置"
                    title="设置"
                >
                    <Settings2 className="size-4" />
                    <span className="whitespace-nowrap">设置</span>
                </button>
                <button
                    type="button"
                    className="flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2 text-left transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)]"
                    style={{ borderColor: "var(--studio-border-strong)", background: "var(--studio-panel-muted-bg)" }}
                    onClick={() => setAccountOpen((value) => !value)}
                    aria-expanded={accountOpen}
                    aria-label="账号菜单"
                >
                    <div
                        className="grid size-7 shrink-0 place-items-center rounded-md border text-xs font-semibold"
                        style={{ borderColor: "color-mix(in srgb, var(--studio-accent) 30%, transparent)", background: "var(--studio-accent-soft)", color: "var(--studio-accent)" }}
                    >
                        {userInitial}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                        <div className="max-w-28 truncate text-xs font-semibold" style={{ color: "var(--studio-text-primary)" }}>
                            {userName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium" style={{ color: "var(--studio-text-muted)" }}>
                            <UserRound className="size-3" />
                            <span>{roleLabel}</span>
                        </div>
                    </div>
                </button>
                {accountOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-[var(--studio-border-strong)] bg-[var(--studio-elevated-bg)] p-2 shadow-[var(--studio-shadow)]">
                        <div className="px-2 py-2">
                            <div className="truncate text-sm font-medium text-[var(--studio-text-primary)]">{userName}</div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--studio-text-muted)]">
                                <UserRound className="size-3.5" />
                                <span>{roleLabel}</span>
                            </div>
                        </div>
                        {user ? (
                            <button
                                type="button"
                                className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--studio-text-muted)] transition hover:bg-rose-500/10 hover:text-[var(--studio-danger)]"
                                onClick={handleLogout}
                            >
                                <LogOut className="size-4" />
                                <span>退出当前账号</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--studio-text-muted)] transition hover:bg-[var(--studio-accent-soft)] hover:text-[var(--studio-accent)]"
                                onClick={handleLogin}
                            >
                                <LogIn className="size-4" />
                                <span>登录</span>
                            </button>
                        )}
                    </div>
                ) : null}
            </div>
        </header>
    );
}

function ProjectWorkspaceLink({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
    const pathname = usePathname();
    const active = href === "/projects" ? pathname === "/projects" || pathname.startsWith("/projects/") : pathname === href || pathname.startsWith(`${href}/`);
    const activeStyle = { background: "var(--studio-accent-soft)", borderColor: "color-mix(in srgb, var(--studio-accent) 36%, transparent)", color: "var(--studio-text-primary)" };
    const inactiveStyle = { background: "transparent", borderColor: "transparent", color: "var(--studio-text-secondary)" };
    const iconStyle = active ? { background: "var(--studio-accent-soft)", color: "var(--studio-accent)" } : { background: "transparent", color: "var(--studio-accent)" };

    return (
        <Link
            href={href}
            className={`group relative flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition hover:bg-[var(--studio-panel-muted-bg)] ${active ? "font-semibold shadow-[inset_0_0_0_1px_rgba(125,211,252,0.12),0_10px_28px_rgba(56,189,248,0.10)]" : "font-medium"}`}
            style={active ? activeStyle : inactiveStyle}
        >
            <span className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition ${active ? "bg-[var(--studio-accent)] opacity-100" : "bg-transparent opacity-0 group-hover:bg-[var(--studio-accent)] group-hover:opacity-100"}`} />
            <span className="grid size-6 shrink-0 place-items-center rounded-md transition group-hover:bg-[var(--studio-accent-soft)]" style={iconStyle}>
                {icon}
            </span>
            <span className="whitespace-nowrap">{label}</span>
        </Link>
    );
}
