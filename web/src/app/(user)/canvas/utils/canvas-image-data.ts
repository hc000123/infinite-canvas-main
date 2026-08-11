"use client";

export type ImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ImageAngleTransform = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};

const MIN_REFERENCE_EDGE = 300;
const MIN_REFERENCE_RATIO = 0.4;
const MAX_REFERENCE_RATIO = 2.5;
const PORTRAIT_CROP_SIZE = { width: 576, height: 1024 };
const LANDSCAPE_CROP_SIZE = { width: 1024, height: 576 };

export async function cropDataUrl(dataUrl: string, crop?: ImageCropRect) {
    const image = await loadImage(dataUrl);
    const size = Math.min(image.width, image.height);
    const sx = crop ? Math.floor(crop.x * image.width) : Math.max(0, Math.floor((image.width - size) / 2));
    const sy = crop ? Math.floor(crop.y * image.height) : Math.max(0, Math.floor((image.height - size) / 2));
    const sw = crop ? Math.ceil(crop.width * image.width) : size;
    const sh = crop ? Math.ceil(crop.height * image.height) : size;
    const target = blurredCropTarget(sw, sh);
    return target ? drawCropWithBlurredBackground(image, sx, sy, sw, sh, target.width, target.height) : drawCrop(image, sx, sy, sw, sh);
}

export async function cropImageToResolution(dataUrl: string, width: number, height: number) {
    const image = await loadImage(dataUrl);
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));
    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = image.width / image.height;
    const sw = sourceRatio > targetRatio ? Math.round(image.height * targetRatio) : image.width;
    const sh = sourceRatio > targetRatio ? image.height : Math.round(image.width / targetRatio);
    const sx = Math.max(0, Math.floor((image.width - sw) / 2));
    const sy = Math.max(0, Math.floor((image.height - sh) / 2));
    return drawCrop(image, sx, sy, sw, sh, targetWidth, targetHeight);
}

export async function transformAngleDataUrl(dataUrl: string, params: ImageAngleTransform) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const padding = Math.round(Math.max(image.width, image.height) * 0.18);
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + padding * 2;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const horizontal = params.horizontalAngle / 60;
    const pitch = params.pitchAngle / 45;
    const distanceScale = 1.12 - params.cameraDistance * 0.035;
    const wideScale = params.wideAngle ? 0.88 : 1;
    const scale = Math.max(0.64, Math.min(1.1, distanceScale * wideScale));
    const width = image.width * scale * (1 - Math.abs(horizontal) * 0.28);
    const height = image.height * scale * (1 - Math.abs(pitch) * 0.18);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const skewX = horizontal * image.width * 0.18;
    const skewY = pitch * image.height * 0.12;
    const x = cx - width / 2 + horizontal * padding * 0.5;
    const y = cy - height / 2 + pitch * padding * 0.45;

    context.save();
    context.setTransform(1, pitch * 0.08, horizontal * -0.1, 1, 0, 0);
    context.drawImage(image, x + skewX, y + skewY, width, height);
    context.restore();

    if (params.wideAngle) {
        const gradient = context.createRadialGradient(cx, cy, Math.min(canvas.width, canvas.height) * 0.2, cx, cy, Math.max(canvas.width, canvas.height) * 0.62);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.18)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL("image/png");
}

function drawCrop(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, width = sw, height = sh) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext("2d");
    if (!context) return image.src;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

function blurredCropTarget(width: number, height: number) {
    const ratio = width / height;
    if (width >= MIN_REFERENCE_EDGE && height >= MIN_REFERENCE_EDGE && ratio > MIN_REFERENCE_RATIO && ratio < MAX_REFERENCE_RATIO) return null;
    return width > height ? LANDSCAPE_CROP_SIZE : PORTRAIT_CROP_SIZE;
}

function drawCropWithBlurredBackground(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return drawCrop(image, sx, sy, sw, sh);

    const coverScale = Math.max(width / sw, height / sh) * 1.08;
    const backgroundWidth = sw * coverScale;
    const backgroundHeight = sh * coverScale;
    context.filter = "blur(32px) brightness(0.72)";
    context.drawImage(image, sx, sy, sw, sh, (width - backgroundWidth) / 2, (height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);

    const containScale = Math.min(width / sw, height / sh);
    const foregroundWidth = sw * containScale;
    const foregroundHeight = sh * containScale;
    context.filter = "none";
    context.drawImage(image, sx, sy, sw, sh, (width - foregroundWidth) / 2, (height - foregroundHeight) / 2, foregroundWidth, foregroundHeight);
    return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.src = dataUrl;
    });
}
