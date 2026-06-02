import { apiGet, compactApiParams } from "@/services/api/request";

export type AssetLibraryItem = {
    id: string;
    title: string;
    type: "text" | "image" | "video" | "audio";
    coverUrl: string;
    tags: string[];
    category: string;
    description: string;
    content: string;
    url: string;
    volcengineAssetId?: string;
    volcengineGroupId?: string;
    volcengineProjectName?: string;
    volcengineStatus?: string;
    volcengineError?: string;
    volcenginePublicUrl?: string;
    volcengineSubmittedAt?: string;
    volcengineUpdatedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type AssetLibraryResponse = {
    items: AssetLibraryItem[];
    tags: string[];
    total: number;
};

export type AssetLibraryQuery = {
    keyword?: string;
    type?: string;
    tag?: string[];
    page?: number;
    pageSize?: number;
};

export async function fetchAssetLibrary(query: AssetLibraryQuery = {}) {
    return apiGet<AssetLibraryResponse>("/api/assets", compactApiParams(query));
}
