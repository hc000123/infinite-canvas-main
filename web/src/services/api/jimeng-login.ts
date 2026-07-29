import { apiPost } from "@/services/api/request";
import { useUserStore } from "@/stores/use-user-store";

export type JimengLoginStartResult = {
    cliPath: string;
    verificationUri: string;
    verificationUriComplete?: string;
    userCode: string;
    deviceCode: string;
    expiresIn?: number;
    interval?: number;
    loginReady?: boolean;
    message?: string;
};

export type JimengLoginCheckResult = {
    loginReady: boolean;
    message: string;
};

export async function startUserJimengLogin(model?: string) {
    const token = useUserStore.getState().token;
    return apiPost<JimengLoginStartResult>("/api/v1/jimeng-login/start", { model }, token);
}

export async function checkUserJimengLogin(input: { model?: string; deviceCode: string }) {
    const token = useUserStore.getState().token;
    return apiPost<JimengLoginCheckResult>("/api/v1/jimeng-login/check", input, token);
}
