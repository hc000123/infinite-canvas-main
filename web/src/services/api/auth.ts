import { apiGet, apiPost } from "@/services/api/request";

export const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

export type UserRole = "guest" | "user" | "admin" | "superadmin";

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
    credits: number;
    createdAt: string;
    updatedAt: string;
};

export type AuthSession = {
    token: string;
    user: AuthUser;
};

export type LoginApprovalClient = { id: string; token?: string; status: "pending" | "approved" | "rejected" | "expired" | "consumed"; expiresAt: string; ipAddress: string };
export type LoginResult = { status: "authenticated" | "pending"; session?: AuthSession; approval?: LoginApprovalClient };

export type AuthPayload = {
    username: string;
    password: string;
};

export async function login(payload: AuthPayload) {
    return apiPost<LoginResult>("/api/auth/login", payload);
}

export function fetchLoginApprovalStatus(id: string, token: string) {
    return apiGet<LoginApprovalClient>("/api/auth/login-approval/status", { id, token });
}
export function exchangeLoginApproval(id: string, token: string) {
    return apiPost<LoginResult>("/api/auth/login-approval/exchange", { id, token });
}

export async function register(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/register", payload);
}

export function logout(token: string) {
    return apiPost<boolean>("/api/auth/logout", undefined, token);
}

export async function fetchCurrentUser(token?: string) {
    return apiGet<AuthUser>("/api/auth/me", undefined, token);
}
