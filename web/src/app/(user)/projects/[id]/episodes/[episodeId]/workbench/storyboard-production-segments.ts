import type { ScriptEpisode } from "../../../../../canvas/utils/script-management";
import type { StoryboardTableShot } from "../../../../../canvas/utils/storyboard-management";
import type { EpisodeStatusTone } from "./components/episode-module-panel";

type StoryboardPackageStatus = "已确认" | "待编辑" | "待审核" | "缺资产" | "超时" | "待承接";

type StoryboardPackageShot = {
    action: string;
    camera: string;
    duration: number;
    id: string;
    order: number;
    prompt: string;
    title: string;
};

export type StoryboardProductionPackage = {
    assetLabels: string[];
    duration: number;
    id: string;
    order: number;
    promptSummary: string;
    scriptText: string;
    segmentId: string;
    shots: StoryboardPackageShot[];
    status: StoryboardPackageStatus;
    summary: string;
    title: string;
    tone: EpisodeStatusTone;
};

export type StoryboardStorySegment = {
    duration: number;
    id: string;
    order: number;
    packages: StoryboardProductionPackage[];
    scriptRange: string;
    scriptText: string;
    status: string;
    title: string;
    tone: EpisodeStatusTone;
};

export function buildStoryboardProductionSegments({
    episode,
    episodeTableShots,
    sceneOptions,
    scriptSnapshot,
}: {
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    sceneOptions: Array<{ sceneKey: string; sceneLabel: string }>;
    scriptSnapshot: string;
}): StoryboardStorySegment[] {
    if (!episodeTableShots.length) return fallbackStoryboardProductionSegments(episode, scriptSnapshot);
    const sortedShots = [...episodeTableShots].sort((a, b) => a.order - b.order);
    const groups: Array<{ key: string; name: string; shots: StoryboardTableShot[] }> = [];
    sortedShots.forEach((shot) => {
        const key = shot.sceneId || shot.sceneName || `scene-${shot.order}`;
        const group = groups.find((item) => item.key === key);
        if (group) group.shots.push(shot);
        else groups.push({ key, name: shot.sceneName || sceneOptions.find((scene) => scene.sceneKey === key)?.sceneLabel || `剧情段落 ${groups.length + 1}`, shots: [shot] });
    });

    let packageOrder = 1;
    return groups.map((group, index) => {
        const segmentId = `segment-${group.key || index + 1}`;
        const shotGroups = splitShotsIntoProductionPackages(group.shots);
        const packages = shotGroups.map((shots) => {
            const pkg = buildStoryboardPackageFromShots({ packageOrder, segmentId, shots });
            packageOrder += 1;
            return pkg;
        });
        const duration = packages.reduce((total, pkg) => total + pkg.duration, 0);
        const firstShot = group.shots[0];
        const lastShot = group.shots[group.shots.length - 1];
        const status = segmentStatusFromPackages(packages);
        return {
            duration,
            id: segmentId,
            order: index + 1,
            packages,
            scriptRange: `原剧本 P${padEpisodeOrder(firstShot.order)} - P${padEpisodeOrder(lastShot.order)}`,
            scriptText: group.shots.map((shot) => shot.scriptText).filter(Boolean).join("\n\n"),
            status,
            title: group.name,
            tone: segmentToneFromStatus(status),
        };
    });
}

function splitShotsIntoProductionPackages(shots: StoryboardTableShot[]) {
    const groups: StoryboardTableShot[][] = [];
    let current: StoryboardTableShot[] = [];
    let currentDuration = 0;
    shots.forEach((shot) => {
        const duration = shot.estimatedDuration || 3;
        if (current.length && currentDuration + duration > 15) {
            groups.push(current);
            current = [];
            currentDuration = 0;
        }
        current.push(shot);
        currentDuration += duration;
    });
    if (current.length) groups.push(current);
    return groups;
}

function buildStoryboardPackageFromShots({ packageOrder, segmentId, shots }: { packageOrder: number; segmentId: string; shots: StoryboardTableShot[] }): StoryboardProductionPackage {
    const duration = shots.reduce((total, shot) => total + (shot.estimatedDuration || 3), 0);
    const assetLabels = storyboardPackageAssetLabels(shots);
    const title = shots[0]?.title || `生产包 ${packageOrder}`;
    const summary = listSafeText(shots.map((shot) => shot.visualDescription || shot.action || shot.scriptText).filter(Boolean).join("；"), "待补充生产包内容。");
    const status = storyboardPackageStatusFromShots({ assetLabels, duration, shots });
    return {
        assetLabels,
        duration,
        id: `package-${segmentId}-${packageOrder}`,
        order: packageOrder,
        promptSummary: `${shots[0]?.sceneName || "本段"}，${summary}，镜头保持电影级写实、低对比深色影像质感，动作与视线方向连续。`,
        scriptText: shots.map((shot) => shot.scriptText).filter(Boolean).join("\n\n"),
        segmentId,
        shots: shots.map((shot, index) => ({
            action: shot.visualDescription || shot.action || shot.scriptText || "待补充镜头内容。",
            camera: `${shot.shotSize || "景别待定"} / ${shot.cameraMovement || "运动待定"}`,
            duration: shot.estimatedDuration || 3,
            id: shot.id,
            order: index + 1,
            prompt: shot.workflowSource?.createdFromText || `${shot.visualDescription || shot.action || shot.scriptText}，${shot.shotSize || "中景"}，${shot.cameraMovement || "稳定推进"}，${shot.emotion || "保持当前情绪"}。`,
            title: shot.title || `镜头 ${shot.order}`,
        })),
        status,
        summary,
        title,
        tone: storyboardPackageTone(status),
    };
}

function storyboardPackageAssetLabels(shots: StoryboardTableShot[]) {
    return uniqueTextList(
        shots.flatMap((shot) => [
            ...shot.characters,
            ...(shot.assetNeeds || []),
            ...(shot.assetRefs || []).map((ref) => ref.sourceLabel || ref.role),
            ...(shot.productionBibleRefs || []).map((ref) => ref.kind),
        ]),
    )
        .filter(Boolean)
        .slice(0, 8);
}

function storyboardPackageStatusFromShots({ assetLabels, duration, shots }: { assetLabels: string[]; duration: number; shots: StoryboardTableShot[] }): StoryboardPackageStatus {
    if (duration > 15) return "超时";
    if (!assetLabels.length) return "缺资产";
    if (shots.some((shot) => !shot.visualDescription && !shot.action)) return "待编辑";
    if (shots.some((shot) => !shot.workflowSource)) return "待审核";
    return "待承接";
}

function segmentStatusFromPackages(packages: StoryboardProductionPackage[]) {
    if (packages.some((pkg) => pkg.status === "超时")) return "含超时";
    if (packages.some((pkg) => pkg.status === "缺资产")) return "缺资产";
    if (packages.some((pkg) => pkg.status === "待编辑" || pkg.status === "待审核")) return "待处理";
    if (packages.every((pkg) => pkg.status === "已确认")) return "已确认";
    return "已拆解";
}

function segmentToneFromStatus(status: string): EpisodeStatusTone {
    if (status === "含超时") return "red";
    if (status === "缺资产" || status === "待处理") return "amber";
    if (status === "已确认" || status === "已拆解") return "green";
    return "slate";
}

function storyboardPackageTone(status: StoryboardPackageStatus): EpisodeStatusTone {
    if (status === "已确认") return "green";
    if (status === "待编辑" || status === "待承接") return "cyan";
    if (status === "超时") return "red";
    if (status === "缺资产" || status === "待审核") return "amber";
    return "slate";
}

function fallbackStoryboardProductionSegments(episode: ScriptEpisode, scriptSnapshot: string): StoryboardStorySegment[] {
    const scriptBody = scriptSnapshot || episode.summary || "女主刚走到旧楼后门，身后忽然传来急刹车声。她停住脚步，手机屏幕亮了一下。路灯闪烁，巷口车灯把她的影子拉得很长。";
    const packages: Array<Omit<StoryboardProductionPackage, "id" | "segmentId" | "tone"> & { segmentOrder: number }> = [
        fallbackStoryboardPackage(1, 1, "建立环境与女主入场", "雨夜街口、旧楼后门，女主停步。", 12, "已确认", ["暗巷街景", "女主雨衣", "车灯背光", "旧楼后门", "潮湿地面"], scriptBody, [
            ["女主停在旧楼后门", "全景 / 缓慢推进", 4],
            ["雨水从门牌滴落", "特写 / 静止", 3],
            ["车灯从巷口扫过", "中景 / 横移", 5],
        ]),
        fallbackStoryboardPackage(1, 2, "女主察觉危险", "急刹车声、回头、路灯闪烁。", 10, "待编辑", ["林澈", "暗巷街景", "车灯背光", "手机屏幕"], scriptBody, [
            ["女主停下脚步，听见车声", "中近景 / 跟拍", 5],
            ["她缓慢回头，表情紧张", "近景 / 稳定推进", 5],
        ]),
        fallbackStoryboardPackage(2, 3, "暗巷追击", "跟拍、转弯、车辆逼近。", 14, "缺资产", ["林澈", "暗巷街景"], scriptBody, [
            ["女主沿暗巷奔跑", "全景 / 手持跟拍", 5],
            ["脚步踩过积水", "特写 / 低机位", 3],
            ["车辆灯光逼近", "中景 / 快速推近", 4],
            ["她贴墙躲避", "近景 / 急停", 2],
        ]),
        fallbackStoryboardPackage(2, 4, "车灯扫出证据", "墙面、袖扣、女主拍照。", 11, "待审核", ["墙面反光", "带血袖扣", "手机屏幕"], scriptBody, [
            ["车灯扫过墙面", "全景 / 横移", 4],
            ["袖扣在水边反光", "特写 / 微距", 3],
            ["女主迅速拍照留证", "近景 / 下压", 4],
        ]),
        fallbackStoryboardPackage(2, 5, "反派声音逼近", "脚步声、阴影、台词压迫。", 9, "已确认", ["反派阴影", "暗巷街景"], scriptBody, [["阴影越过墙面", "中景 / 缓慢推近", 9]]),
        fallbackStoryboardPackage(3, 6, "仓库火把对峙", "女主进入柴油仓库，火把照亮油桶和刀光。", 18, "超时", ["海边柴油仓库", "旧油桶", "弹簧刀", "女主雨衣"], scriptBody, [
            ["女主推开仓库铁门", "全景 / 前推", 5],
            ["火把映亮旧油桶", "中景 / 环绕", 5],
            ["反派亮出弹簧刀", "特写 / 急推", 4],
            ["女主握紧手机后退", "近景 / 手持跟拍", 4],
        ]),
    ];
    return [
        fallbackStoryboardSegment(1, "雨夜追到旧楼后门", "原剧本 1-7 段", packages, scriptBody),
        fallbackStoryboardSegment(2, "暗巷追击与证物发现", "原剧本 8-18 段", packages, scriptBody),
        fallbackStoryboardSegment(3, "仓库对峙前的危险升级", "原剧本 19-26 段", packages, scriptBody),
    ];
}

function fallbackStoryboardSegment(order: number, title: string, scriptRange: string, packages: Array<Omit<StoryboardProductionPackage, "id" | "segmentId" | "tone"> & { segmentOrder: number }>, scriptText: string): StoryboardStorySegment {
    const segmentId = `fallback-segment-${order}`;
    const segmentPackages = packages
        .filter((pkg) => pkg.segmentOrder === order)
        .map((pkg) => ({
            ...pkg,
            id: `fallback-package-${pkg.order}`,
            segmentId,
            tone: storyboardPackageTone(pkg.status),
        }));
    const status = segmentStatusFromPackages(segmentPackages);
    return {
        duration: segmentPackages.reduce((total, pkg) => total + pkg.duration, 0),
        id: segmentId,
        order,
        packages: segmentPackages,
        scriptRange,
        scriptText,
        status,
        title,
        tone: segmentToneFromStatus(status),
    };
}

function fallbackStoryboardPackage(segmentOrder: number, order: number, title: string, summary: string, duration: number, status: StoryboardPackageStatus, assetLabels: string[], scriptText: string, shots: Array<[string, string, number]>) {
    return {
        assetLabels,
        duration,
        order,
        promptSummary: `${summary} 电影级写实，低对比雨夜光影，镜头从半身逐渐推进到近景，保持动作连续和情绪压迫。`,
        scriptText,
        segmentOrder,
        shots: shots.map(([shotTitle, camera, shotDuration], index) => ({
            action: shotTitle,
            camera,
            duration: shotDuration,
            id: `fallback-shot-${order}-${index}`,
            order: index + 1,
            prompt: `${shotTitle}，${camera}，${shotDuration} 秒，雨夜暗青色调，写实短剧影像质感。`,
            title: shotTitle,
        })),
        status,
        summary,
        title,
    };
}

function listSafeText(text: string, fallback: string) {
    const value = text.trim();
    if (!value) return fallback;
    return value.length > 68 ? `${value.slice(0, 68)}...` : value;
}

function padEpisodeOrder(order: number) {
    return String(order).padStart(2, "0");
}

function uniqueTextList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
