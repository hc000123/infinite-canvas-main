"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAssetStore } from "@/stores/use-asset-store";
import { legacyImageDestination } from "./image-route";

export default function ImagePage() {
    const router = useRouter();
    const assets = useAssetStore((state) => state.assets);
    const [hydrated, setHydrated] = useState(() => useAssetStore.persist.hasHydrated());

    useEffect(() => {
        if (useAssetStore.persist.hasHydrated()) {
            setHydrated(true);
            return;
        }
        return useAssetStore.persist.onFinishHydration(() => setHydrated(true));
    }, []);
    useEffect(() => {
        if (!hydrated) return;
        const destination = legacyImageDestination(new URLSearchParams(window.location.search), assets);
        router.replace(destination);
    }, [assets, hydrated, router]);

    return <main className="studio-shell grid h-full place-items-center bg-[var(--studio-shell-bg)] text-sm text-[var(--studio-text-muted)]">正在转到资产生图…</main>;
}
