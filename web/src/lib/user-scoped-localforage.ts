import localforage from "localforage";

import { getActiveUserStorageScope, isActiveScopeLegacyDataOwner, userScopedStorageKey } from "./localforage-storage";

export function createUserScopedLocalForage(storeName: string) {
    const store = localforage.createInstance({ name: "infinite-canvas", storeName });

    return {
        async getItem<T>(key: string) {
            const scope = getActiveUserStorageScope();
            if (!scope) return null;
            const scopedKey = userScopedStorageKey(key, scope);
            const value = await store.getItem<T>(scopedKey);
            if (value !== null) return value;
            if (!(await isActiveScopeLegacyDataOwner())) return null;
            const legacyValue = await store.getItem<T>(key);
            if (legacyValue !== null) await store.setItem(scopedKey, legacyValue);
            return legacyValue;
        },
        async setItem<T>(key: string, value: T) {
            const scope = getActiveUserStorageScope();
            if (!scope) return value;
            return store.setItem(userScopedStorageKey(key, scope), value);
        },
        async removeItem(key: string) {
            const scope = getActiveUserStorageScope();
            if (!scope) return;
            await store.removeItem(userScopedStorageKey(key, scope));
            if (await isActiveScopeLegacyDataOwner()) await store.removeItem(key);
        },
        async iterate<T, U>(iterator: (value: T, key: string, iterationNumber: number) => U | void) {
            const scope = getActiveUserStorageScope();
            if (!scope) return undefined;
            const suffix = `:user:${scope}`;
            const includeLegacy = await isActiveScopeLegacyDataOwner();
            const entries = new Map<string, T>();
            await store.iterate<T, void>((value, key) => {
                if (key.endsWith(suffix)) entries.set(key.slice(0, -suffix.length), value);
                else if (includeLegacy && !key.includes(":user:")) entries.set(key, value);
            });
            let index = 1;
            for (const [key, value] of entries) {
                const result = iterator(value, key, index++);
                if (result !== undefined) return result;
            }
            return undefined;
        },
    };
}
