"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleDot, FileText, Folder, Home, ImagePlus, LogIn, LogOut, PanelLeftClose, PanelLeftOpen, Settings2, UserRound } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function ProjectWorkspaceShell({ children }: { children: ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <div className="dark studio-workspace h-full overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
            <div className="relative h-full min-h-0">
                <ProjectWorkspaceSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(false)} />
                {!sidebarOpen ? (
                    <button
                        type="button"
                        className="fixed left-3 top-1/2 z-[80] grid size-11 -translate-y-1/2 place-items-center rounded-xl border border-[var(--studio-accent)] bg-[var(--studio-accent)] text-[var(--primary-foreground)] shadow-[var(--studio-shadow)] backdrop-blur transition hover:scale-105 hover:bg-[var(--studio-accent-strong)]"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="展开左侧栏"
                        title="展开左侧栏"
                    >
                        <PanelLeftOpen className="size-5" />
                    </button>
                ) : null}
                <div className="h-full min-h-0 overflow-hidden bg-[var(--studio-shell-bg)]">{children}</div>
            </div>
        </div>
    );
}

function ProjectWorkspaceSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const router = useRouter();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.clearSession);
    const userName = user?.displayName || user?.username || "本地创作者";
    const userInitial = userName.trim().slice(0, 1) || "创";
    const roleLabel = user?.role === "admin" ? "管理员" : user ? "已登录" : "未登录";
    const handleLogout = () => {
        logout();
        router.replace("/login");
    };
    const handleLogin = () => {
        router.push("/login");
    };

    return (
        <aside className={`fixed inset-y-0 left-0 z-[80] flex w-[232px] min-h-0 flex-col border-r border-[var(--studio-border-subtle)] bg-[#101721]/96 px-4 py-5 shadow-[10px_0_28px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="relative">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-[var(--studio-accent)] text-[var(--primary-foreground)] shadow-[0_10px_24px_rgba(111,168,255,0.18)]">
                        <CircleDot className="size-5 fill-current" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <div className="whitespace-nowrap text-lg font-semibold tracking-normal text-[var(--studio-text-primary)]">AI · 画布</div>
                            <span className="shrink-0 whitespace-nowrap rounded-md border border-[var(--studio-border-strong)] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--studio-accent)]">本地版</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--studio-text-muted)]">让想法成为影像</p>
                    </div>
                </div>
                <button type="button" className="absolute -right-2 top-[50vh] z-10 grid size-11 -translate-y-1/2 place-items-center rounded-xl border border-[var(--studio-border-strong)] bg-[#101721]/90 text-[var(--studio-accent)] shadow-[var(--studio-shadow)] backdrop-blur transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)]" onClick={onToggle} aria-label="收起左侧栏" title="收起左侧栏">
                    <PanelLeftClose className="size-4" />
                </button>
            </div>

            <nav className="mt-8 border-t border-white/[0.07] pt-5">
                <ProjectWorkspaceLink icon={<Home className="size-5" />} label="项目工作台" href="/projects" />
                <ProjectWorkspaceLink icon={<ImagePlus className="size-5" />} label="生图工作台" href="/image" />
                <ProjectWorkspaceLink icon={<FileText className="size-5" />} label="提示词库" href="/prompts" />
                <ProjectWorkspaceLink icon={<Folder className="size-5" />} label="我的素材" href="/assets" />
            </nav>

            <div className="mt-auto">
                <section className="border-t border-white/[0.07] pt-4">
                    <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-accent-soft)] text-sm font-semibold text-[var(--studio-accent)]">
                            {userInitial}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-medium text-[var(--studio-text-primary)]">{userName}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--studio-text-muted)]">
                                <UserRound className="size-3.5" />
                                <span>{roleLabel}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm font-medium text-[var(--studio-text-secondary)] transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)] hover:text-[var(--studio-accent)]"
                        onClick={() => openConfigDialog(false)}
                    >
                        <Settings2 className="size-4" />
                        <span>AI 配置</span>
                    </button>
                    {user ? (
                        <button type="button" className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent text-sm font-medium text-[var(--studio-text-muted)] transition hover:border-[var(--studio-danger)] hover:bg-rose-500/10 hover:text-[var(--studio-danger)]" onClick={handleLogout}>
                            <LogOut className="size-4" />
                            <span>退出当前账号</span>
                        </button>
                    ) : (
                        <button type="button" className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent text-sm font-medium text-[var(--studio-text-muted)] transition hover:border-[var(--studio-accent)] hover:bg-[var(--studio-accent-soft)] hover:text-[var(--studio-accent)]" onClick={handleLogin}>
                            <LogIn className="size-4" />
                            <span>登录</span>
                        </button>
                    )}
                </section>
            </div>
        </aside>
    );
}

function ProjectWorkspaceLink({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
    const pathname = usePathname();
    const active = href === "/projects" ? pathname === "/projects" || pathname.startsWith("/projects/") : pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link href={href} className={`group relative mb-2 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-white/[0.06] text-[var(--studio-accent)] ring-1 ring-[var(--studio-border-strong)]" : "text-[var(--studio-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--studio-text-primary)]"}`}>
            <span className={`absolute left-0 top-2 h-7 w-0.5 rounded-full transition ${active ? "bg-[var(--studio-accent)] opacity-100" : "bg-transparent opacity-0 group-hover:bg-[var(--studio-border-strong)] group-hover:opacity-100"}`} />
            <span className={`grid size-7 shrink-0 place-items-center rounded-md transition ${active ? "bg-[var(--studio-accent-soft)]" : "bg-transparent group-hover:bg-white/[0.04]"}`}>{icon}</span>
            <span>{label}</span>
        </Link>
    );
}
