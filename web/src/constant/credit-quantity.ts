import { isSeedance25Model } from "../services/api/video-normalizers.ts";

type VideoCreditQuantityOptions = {
    count?: string | number;
    videoProtocol?: string;
    videoModel?: string;
    videoTaskMode?: string;
};

export function isArkSeedance25EditCredit(options: VideoCreditQuantityOptions) {
    return options.videoProtocol === "volcengine-ark" && options.videoTaskMode === "edit" && isSeedance25Model(options.videoModel);
}

export function requestCreditQuantity(options: VideoCreditQuantityOptions) {
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    return isArkSeedance25EditCredit(options) ? 30 : count;
}
