"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { ProjectWorkspaceShell } from "./projects/project-workspace-shell";

const workspaceShellPaths = ["/image", "/video", "/prompts", "/assets"];

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const useWorkspaceShell = workspaceShellPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="min-h-0 flex-1 overflow-hidden">{useWorkspaceShell ? <ProjectWorkspaceShell>{children}</ProjectWorkspaceShell> : children}</div>
        </div>
    );
}
