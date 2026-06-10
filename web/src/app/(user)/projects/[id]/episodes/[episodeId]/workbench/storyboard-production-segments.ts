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
    episode: _episode,
    episodeTableShots,
    sceneOptions,
    scriptSnapshot: _scriptSnapshot,
}: {
    episode: ScriptEpisode;
    episodeTableShots: StoryboardTableShot[];
    sceneOptions: Array<{ sceneKey: string; sceneLabel: string }>;
    scriptSnapshot: string;
}): StoryboardStorySegment[] {
    if (!episodeTableShots.length) return [];
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
            scriptText: group.shots
                .map((shot) => shot.scriptText)
                .filter(Boolean)
                .join("\n\n"),
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
    const summary = listSafeText(
        shots
            .map((shot) => shot.visualDescription || shot.action || shot.scriptText)
            .filter(Boolean)
            .join("；"),
        "待补充生产包内容。",
    );
    const status = storyboardPackageStatusFromShots({ assetLabels, duration, shots });
    return {
        assetLabels,
        duration,
        id: `package-${segmentId}-${packageOrder}`,
        order: packageOrder,
        promptSummary: `${shots[0]?.sceneName || "本段"}，${summary}，镜头保持电影级写实、低对比深色影像质感，动作与视线方向连续。`,
        scriptText: shots
            .map((shot) => shot.scriptText)
            .filter(Boolean)
            .join("\n\n"),
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
    return uniqueTextList(shots.flatMap((shot) => [...shot.characters, ...(shot.assetNeeds || []), ...(shot.assetRefs || []).map((ref) => ref.sourceLabel || ref.role), ...(shot.productionBibleRefs || []).map((ref) => ref.kind)]))
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
