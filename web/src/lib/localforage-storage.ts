import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

const ACTIVE_USER_SCOPE_KEY = "infinite-canvas:active_user_scope";
const LEGACY_DATA_OWNER_KEY = "infinite-canvas:legacy_data_owner";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

let activeUserScope = typeof window === "undefined" ? "" : window.sessionStorage.getItem(ACTIVE_USER_SCOPE_KEY) || "";

export function userScopedStorageKey(name: string, userId: string) {
    return `${name}:user:${userId}`;
}

export function getActiveUserStorageScope() {
    return activeUserScope;
}

export async function isActiveScopeLegacyDataOwner() {
    const scope = getActiveUserStorageScope();
    return Boolean(scope) && (await rawGetItem(LEGACY_DATA_OWNER_KEY)) === scope;
}

export async function activateUserStorageScope(userId: string) {
    const nextScope = userId.trim();
    if (!nextScope || typeof window === "undefined") return false;
    const changed = activeUserScope !== nextScope;
    if (!(await rawGetItem(LEGACY_DATA_OWNER_KEY))) await rawSetItem(LEGACY_DATA_OWNER_KEY, nextScope);
    activeUserScope = nextScope;
    window.sessionStorage.setItem(ACTIVE_USER_SCOPE_KEY, nextScope);
    return changed;
}

export function clearActiveUserStorageScope() {
    activeUserScope = "";
    if (typeof window !== "undefined") window.sessionStorage.removeItem(ACTIVE_USER_SCOPE_KEY);
}

async function rawGetItem(name: string) {
    if (typeof window === "undefined") return null;
    try {
        return (await localforage.getItem<string>(name)) || window.localStorage.getItem(name);
    } catch {
        return window.localStorage.getItem(name);
    }
}

async function rawSetItem(name: string, value: string) {
    if (typeof window === "undefined") return;
    try {
        await localforage.setItem(name, value);
    } catch {
        window.localStorage.setItem(name, value);
    }
}

async function rawRemoveItem(name: string) {
    if (typeof window === "undefined") return;
    try {
        await localforage.removeItem(name);
    } catch {
        // localStorage remains the fallback when IndexedDB is unavailable.
    } finally {
        window.localStorage.removeItem(name);
    }
}

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        const scope = getActiveUserStorageScope();
        if (!scope) return null;
        const scopedName = userScopedStorageKey(name, scope);
        const scopedValue = await rawGetItem(scopedName);
        if (scopedValue) return scopedValue;
        if ((await rawGetItem(LEGACY_DATA_OWNER_KEY)) !== scope) return null;
        const legacyValue = await rawGetItem(name);
        if (!legacyValue) return null;
        await rawSetItem(scopedName, legacyValue);
        return legacyValue;
    },
    setItem: async (name, value) => {
        const scope = getActiveUserStorageScope();
        if (scope) await rawSetItem(userScopedStorageKey(name, scope), value);
    },
    removeItem: async (name) => {
        const scope = getActiveUserStorageScope();
        if (scope) await rawRemoveItem(userScopedStorageKey(name, scope));
    },
};
