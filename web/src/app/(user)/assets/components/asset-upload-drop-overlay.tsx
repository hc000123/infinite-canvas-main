"use client";

import { Upload } from "lucide-react";

type Props = {
    activeFolderName: string;
};

export function AssetUploadDropOverlay({ activeFolderName }: Props) {
    return (
        <div className="pointer-events-none fixed inset-0 z-[1000] grid place-items-center bg-[rgba(15,17,23,.72)] backdrop-blur-sm">
            <div className="studio-panel grid min-h-40 w-[min(420px,calc(100vw-48px))] place-items-center border-2 border-dashed border-[var(--studio-accent)] p-8 text-center">
                <div>
                    <Upload className="mx-auto size-8 text-[var(--studio-accent)]" />
                    <div className="mt-3 text-sm font-medium text-[var(--studio-text-primary)]">松开上传{activeFolderName ? `到「${activeFolderName}」` : ""}</div>
                </div>
            </div>
        </div>
    );
}
