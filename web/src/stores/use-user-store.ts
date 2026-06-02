"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_KEY, fetchCurrentUser, login as requestLogin, register, type AuthPayload, type AuthUser } from "@/services/api/auth";

type UserStore = {
    token: string;
    user: AuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    setSession: (token: string, user: AuthUser) => void;
    clearSession: () => void;
    hydrateUser: () => Promise<void>;
    login: (payload: AuthPayload) => Promise<AuthUser>;
    register: (payload: AuthPayload) => Promise<AuthUser>;
};

function devAuthPayload(): AuthPayload | null {
    if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === "false") return null;
    const username = process.env.NEXT_PUBLIC_DEV_AUTH_USERNAME || "admin";
    const password = process.env.NEXT_PUBLIC_DEV_AUTH_PASSWORD || "infinite-canvas";
    return username && password ? { username, password } : null;
}

export const useUserStore = create<UserStore>()(
    persist(
        (set, get) => ({
            token: "",
            user: null,
            isReady: false,
            isLoading: false,
            setSession: (token, user) => set({ token, user, isReady: true }),
            clearSession: () => set({ token: "", user: null, isReady: true }),
            hydrateUser: async () => {
                const tryDevLogin = async () => {
                    const payload = devAuthPayload();
                    if (!payload) return false;
                    set({ isLoading: true });
                    try {
                        const session = await requestLogin(payload);
                        set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                        return true;
                    } catch {
                        set({ isLoading: false });
                        return false;
                    }
                };
                const token = get().token;
                if (!token) {
                    if (await tryDevLogin()) return;
                    set({ user: null, isReady: true });
                    return;
                }
                set({ isLoading: true });
                try {
                    const user = await fetchCurrentUser(token);
                    if (user.role === "guest") {
                        if (await tryDevLogin()) return;
                        set({ token: "", user: null, isReady: true, isLoading: false });
                        return;
                    }
                    set({ user, isReady: true, isLoading: false });
                } catch {
                    if (await tryDevLogin()) return;
                    set({ token: "", user: null, isReady: true, isLoading: false });
                }
            },
            login: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await requestLogin(payload);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
            register: async (payload) => {
                set({ isLoading: true });
                try {
                    const session = await register(payload);
                    set({ token: session.token, user: session.user, isReady: true, isLoading: false });
                    return session.user;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
        }),
        {
            name: AUTH_TOKEN_KEY,
            partialize: (state) => ({ token: state.token }),
            onRehydrateStorage: () => (state) => {
                if (state) state.isReady = false;
            },
        },
    ),
);
