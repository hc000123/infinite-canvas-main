export type ReferenceImageRole = "reference_image" | "first_frame" | "last_frame";

export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    assetUri?: string;
    seedanceRole?: ReferenceImageRole;
};
