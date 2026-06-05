import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/video";

const sensitiveErrorPatterns = ["InputImageSensitiveContentDetected", "PrivacyInformation", "隐私信息", "真人"];

export function seedanceImageReviewBlockingError(images: ReferenceImage[]) {
    return seedanceMediaReviewBlockingError(images, []);
}

export function seedanceMediaReviewBlockingError(images: ReferenceImage[], videos: ReferenceVideo[]) {
    const pending = reviewableReferences(images, videos)
        .map(reviewIssue)
        .filter((issue): issue is ReviewIssue => Boolean(issue && issue.blocking));
    if (!pending.length) return "";
    return `参考素材还没有完成火山加白：${pending.map((issue) => issue.text).join("、")}。请刷新到“已加白/Active”后再生成。`;
}

export function appendSeedanceImageReviewDiagnostic(errorMessage: string, images: ReferenceImage[]) {
    return appendSeedanceMediaReviewDiagnostic(errorMessage, images, [], "图", "图片");
}

export function appendSeedanceMediaReviewDiagnostic(errorMessage: string, images: ReferenceImage[], videos: ReferenceVideo[], label = "素材", noun = "图片/视频") {
    const references = reviewableReferences(images, videos);
    if (!references.length || !isSensitiveImageError(errorMessage)) return errorMessage;
    const issues = references.map(reviewIssue).filter((issue): issue is ReviewIssue => Boolean(issue));
    if (!issues.length) return errorMessage;
    return `${errorMessage}\n\n本次参考${label}加白诊断：${issues.map((issue) => issue.text).join("、")}。只有状态为 Active 且提交为 asset:// 的${noun}，才算真正完成加白。`;
}

type ReviewIssue = {
    text: string;
    blocking: boolean;
};

type ReviewableReference = {
    name?: string;
    fallbackLabel: string;
    assetUri?: string;
    volcengineAssetId?: string;
    volcengineAssetStatus?: string;
};

function reviewableReferences(images: ReferenceImage[], videos: ReferenceVideo[]): ReviewableReference[] {
    return [...images.map((image, index) => ({ ...image, fallbackLabel: `图片 ${index + 1}` })), ...videos.map((video, index) => ({ ...video, fallbackLabel: `视频 ${index + 1}` }))];
}

function reviewIssue(reference: ReviewableReference): ReviewIssue | null {
    if (reference.assetUri?.startsWith("asset://")) return null;
    const label = reference.name || reference.fallbackLabel;
    const assetId = reference.volcengineAssetId?.trim();
    const status = reference.volcengineAssetStatus?.trim();
    if (assetId && status !== "Active") return { text: `${label}（加白状态：${status || "未知"}）`, blocking: true };
    return { text: `${label}（未以 asset:// 加白素材提交）`, blocking: false };
}

function isSensitiveImageError(message: string) {
    return sensitiveErrorPatterns.some((pattern) => message.includes(pattern));
}
