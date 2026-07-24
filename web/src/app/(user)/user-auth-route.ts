export type ProtectedUserRouteState = "public" | "loading" | "redirect" | "authenticated";

export function protectedUserRouteState(pathname: string, isReady: boolean, token: string, hasUser: boolean): ProtectedUserRouteState {
    if (pathname === "/login") return "public";
    if (!isReady) return "loading";
    return token && hasUser ? "authenticated" : "redirect";
}

export function userLoginHref(pathname: string) {
    return `/login?redirect=${encodeURIComponent(pathname.startsWith("/") ? pathname : "/projects")}`;
}

export function postLoginHref(redirect: string, role: "guest" | "user" | "admin" | "superadmin") {
    if (!redirect.startsWith("/") || redirect.startsWith("//")) return "/projects";
    if (redirect.startsWith("/admin") && role !== "admin" && role !== "superadmin") return "/projects";
    return redirect;
}
