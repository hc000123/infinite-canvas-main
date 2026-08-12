export type AuthSessionInvalidPayload = { code: number; message: string; reason?: string };

type Listener = (payload: AuthSessionInvalidPayload) => void;

const listeners = new Set<Listener>();
let pending: AuthSessionInvalidPayload | null = null;
let delivered = false;

export function emitAuthSessionInvalid(payload: AuthSessionInvalidPayload) {
    if (pending) return;
    pending = payload;
    listeners.forEach((listener) => listener(payload));
    delivered = listeners.size > 0;
}

export function subscribeAuthSessionInvalid(listener: Listener) {
    listeners.add(listener);
    if (pending && !delivered) {
        delivered = true;
        queueMicrotask(() => listener(pending as AuthSessionInvalidPayload));
    }
    return () => {
        listeners.delete(listener);
    };
}

export function resetAuthSessionInvalid() {
    pending = null;
    delivered = false;
}
