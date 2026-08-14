"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { AppWorkspaceSpine } from "@/components/layout/app-workspace-spine";
import { useProjectCacheQueueRunner } from "@/hooks/use-project-cache-queue-runner";
import { activateUserStorageScope } from "@/lib/localforage-storage";
import { subscribeAuthSessionInvalid } from "@/services/auth-session-events";
import { useUserStore } from "@/stores/use-user-store";
import { protectedUserRouteState, userLoginHref } from "./user-auth-route";

export function UserLayoutClient({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const clearSession = useUserStore((state) => state.clearSession);
    const authState = protectedUserRouteState(pathname, isReady, token, Boolean(user));
    const immersiveCanvas = /^\/canvas\/[^/]+/.test(pathname) || pathname.startsWith("/login");
    const [storageReady, setStorageReady] = useState(false);
    useProjectCacheQueueRunner(storageReady ? token : undefined);

    useEffect(() => {
        if (authState === "redirect") router.replace(userLoginHref(pathname));
    }, [authState, pathname, router]);

    useEffect(
        () =>
            subscribeAuthSessionInvalid((payload) => {
                clearSession();
                const params = new URLSearchParams({ redirect: pathname });
                params.set("reason", String(payload.code));
                if (payload.reason) params.set("detail", payload.reason);
                router.replace(`/login?${params.toString()}`);
            }),
        [clearSession, pathname, router],
    );

    useEffect(() => {
        if (authState !== "authenticated" || !user) {
            setStorageReady(false);
            return;
        }
        let cancelled = false;
        void activateUserStorageScope(user.id).then((changed) => {
            if (cancelled) return;
            if (changed) {
                window.location.reload();
                return;
            }
            setStorageReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [authState, user]);

    if (authState !== "public" && (authState !== "authenticated" || !storageReady)) {
        return (
            <main className="studio-workspace studio-shell grid h-dvh place-items-center bg-background p-6 text-foreground">
                <div className="studio-panel flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center">
                    <LoaderCircle className="size-6 animate-spin text-[var(--studio-accent)]" aria-hidden />
                    <p className="text-sm text-[var(--studio-text-secondary)]">{authState === "loading" ? "正在确认登录状态…" : authState === "redirect" ? "正在前往登录页…" : "正在准备你的本地工作区…"}</p>
                </div>
            </main>
        );
    }

    return (
        <>
            <div className="flex h-dvh overflow-hidden bg-[var(--studio-app-bg)] text-[var(--studio-text-primary)]">
                {immersiveCanvas ? null : <AppWorkspaceSpine />}
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <AppConfigModal />
        </>
    );
}
