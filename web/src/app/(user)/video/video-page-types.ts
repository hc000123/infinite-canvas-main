import type { AiTaskLedger } from "@/services/api/ai-task-trace";
import type { UploadedFile } from "@/services/file-storage";

import type { ProductionPackage, ProductionPackageConfig } from "./use-video-package-store";

export type FilterKey = "all" | "review" | "missing" | "ready" | "imported" | "generated";
export type PackageUploadedVideo = UploadedFile & { aiTask?: AiTaskLedger };
export type VideoPreflightState = { checkedAt: string; message: string; status: "failed" | "passed"; targetId: string };
export type PackageConfigPatch = Partial<ProductionPackageConfig>;
export type PackageAssetSlot = ProductionPackage["assets"][number];
