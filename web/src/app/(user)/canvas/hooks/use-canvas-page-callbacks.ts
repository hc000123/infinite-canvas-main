"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

type CanvasPageMessage = {
    error: (text: string) => void;
    success: (text: string) => void;
    warning: (text: string) => void;
};

type Props = {
    canvasId: string;
    cleanupAssetImages: (payload?: unknown) => void;
    getCleanupHistory: () => object;
    message: CanvasPageMessage;
};

export function useCanvasPageCallbacks({ canvasId, cleanupAssetImages, getCleanupHistory, message }: Props) {
    const router = useRouter();
    return {
        cleanupCanvasFiles: useCallback(
            (extra?: unknown) => {
                cleanupAssetImages({ extra, ...getCleanupHistory() });
            },
            [cleanupAssetImages, getCleanupHistory],
        ),
        clearFocusParam: useCallback(() => router.replace(`/canvas/${canvasId}`, { scroll: false }), [canvasId, router]),
        navigateCanvasPage: useCallback((href: string) => router.push(href), [router]),
        navigateToProjects: useCallback(() => router.replace("/projects"), [router]),
        openProjectsHome: useCallback(() => router.push("/projects"), [router]),
        showCanvasSuccess: useCallback((text: string) => message.success(text), [message]),
        showImageGenerationError: useCallback((text: string) => message.error(text), [message]),
        showVideoGenerationWarning: useCallback((text: string) => message.warning(text), [message]),
    };
}
