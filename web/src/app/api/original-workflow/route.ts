import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";

import { buildStage1PartPromptTexts, buildStage2Instruction, buildStage2PartPromptTexts, buildStage3PartPromptTexts, episodeAssetPrefix } from "./stage-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const defaultRootPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/hc工作流-新版/seedance-original-workflow-plus-director-method-v5";
const pythonBin = process.env.ORIGINAL_WORKFLOW_PYTHON || "/usr/bin/python3";
const stalledLogIdleSeconds = 300;

type FileGroup = {
    key: string;
    label: string;
    paths: (episode: string, projectSlug: string) => string[];
};
type SnapshotFile = Awaited<ReturnType<typeof readFirstExisting>> & {
    key: string;
};

const fileGroups: FileGroup[] = [
    { key: "script", label: "剧本", paths: (episode: string, projectSlug: string) => [`projects/${projectSlug}/script/${episode}.md`, `script/${episode}.md`] },
    { key: "stage1A", label: "01A 导演分析", paths: (episode: string) => [`outputs/${episode}/01A-director-analysis.md`] },
    { key: "stage1B", label: "01B Beat Board", paths: (episode: string) => [`outputs/${episode}/01B-beat-board.md`] },
    { key: "stage1C", label: "01C 导演分镜脚本", paths: (episode: string) => [`outputs/${episode}/01C-director-shot-script.md`] },
    { key: "stage1D", label: "01D 用户修改轨", paths: (episode: string) => [`outputs/${episode}/01D-shot-edit-track.md`] },
    { key: "characters", label: "角色资产提示词", paths: (_episode: string, projectSlug: string) => projectWorkflowPaths(projectSlug, "assets/character-prompts.md") },
    { key: "scenes", label: "场景资产提示词", paths: (_episode: string, projectSlug: string) => projectWorkflowPaths(projectSlug, "assets/scene-prompts.md") },
    { key: "props", label: "道具资产提示词", paths: (_episode: string, projectSlug: string) => projectWorkflowPaths(projectSlug, "assets/prop-prompts.md") },
    { key: "stage3", label: "Copy-only 过程缓存", paths: (episode: string) => [`outputs/${episode}/02-seedance-prompts.md`] },
    { key: "copyOnly", label: "Copy-only", paths: (episode: string) => [`outputs/${episode}/02-seedance-copy-only.md`] },
];

type ActionBody = {
    action?: "cancel-latest-job" | "export-copy-only" | "save-file" | "save-script" | "start-stage" | "validate";
    agent?: CodexAgentConfig;
    content?: string;
    episode?: string;
    executionMode?: WorkflowExecutionMode;
    fileKey?: string;
    projectSlug?: string;
    requireScriptOptimizerNotes?: boolean;
    rootPath?: string;
    skillPresetId?: string;
    stage?: "stage1" | "stage2" | "stage3";
};

type WorkflowExecutionMode = "cloud-worker" | "local-runner";
type WorkflowStage = "stage1" | "stage2" | "stage3";
type ValidationSnapshot = CommandResult & {
    latestFileUpdatedAt?: string;
    state: "failed" | "passed" | "stale";
    updatedAt: string;
};
type CodexAgentConfig = {
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
};
type CommandResult = {
    command: string;
    exitCode?: string;
    jobHealth?: string;
    jobId?: string;
    jobStatus?: string;
    launchInstruction?: string;
    launchStatus?: string;
    logIdleSeconds?: string;
    logPath?: string;
    logTail?: string;
    logUpdatedAt?: string;
    promptPath?: string;
    reusedRunningJob?: string;
    runnerAgent?: string;
    runnerCommand?: string;
    runnerPid?: string;
    stage?: string;
    statusPath?: string;
    stderr: string;
    stdout: string;
};

const stageLaunchConfig: Record<WorkflowStage, { action: string; instruction: (episode: string, projectSlug: string, skillPresetId?: string) => string }> = {
    stage1: {
        action: "start",
        instruction: (episode, projectSlug) =>
            `网页 Runner 模式：不要启用子代理，不要等待人工回复。后台 Runner 会按场次 / Beat 分批提交：先为每批写 outputs/${episode}/.scene-batches/stage1/ 碎片，再合并生成 outputs/${episode}/01A-director-analysis.md、01B-beat-board.md、01C-director-shot-script.md、01D-shot-edit-track.md。只读取 AGENTS.md、specs/agents/director.md、specs/skills/director-method-shot-skill/SKILL.md、specs/knowledge/director-methods/scene_type_playbook.md、specs/knowledge/director-methods/shot_script_method_rules.md、projects/${projectSlug}/script/${episode}.md 和当前集 outputs/${episode} 上游文件。ep05 示例只允许查标题结构和字段名，不要读取或复制旧剧情正文、旧人物动作、旧场次编号。01A 写人物、场景、道具、剧情段落和导演策略；01B 写 Beat Board、方法标签、用户决策点和确认状态；01C 写真分镜脚本，Shot 标题必须清楚；01D 写用户修改轨。禁止输出 ep05、ep06、5-1、6-1 等旧集 ID。不要输出到 projects/${projectSlug}/outputs/。不要生成最终提示词。不要做剧情合规审核。`,
    },
    stage2: {
        action: "design",
        instruction: (episode, projectSlug, skillPresetId) => buildStage2Instruction(episode, projectSlug, skillPresetId),
    },
    stage3: {
        action: "prompt",
        instruction: (episode, _projectSlug, skillPresetId) =>
            `按 Copy-only 生产角色要求执行，但不要 spawn_agent、不要 fork、不要 collab Wait，必须在当前 Codex exec 进程内直接完成。Copy-only 内部可完成分镜拆解，但不要把过程思路作为前台交付。${stage3SkillInstruction(skillPresetId)}后台 Runner 会按场次 / Beat / P 段并行提交：先为每批写 outputs/${episode}/.scene-batches/stage3/ 碎片，最后输出 outputs/${episode}/02-seedance-copy-only.md，并保留 outputs/${episode}/02-seedance-prompts.md 作为隐藏过程缓存。引用必须用 @图N，禁止 @图片N；不修改剧情，不压缩剧本台词，台词超载时拆分连续 P。`,
    },
};
const stageFileKeys: Record<WorkflowStage, string[]> = {
    stage1: ["script", "stage1A", "stage1B", "stage1C", "stage1D"],
    stage2: ["characters", "scenes", "props"],
    stage3: ["copyOnly"],
};

function stage3SkillInstruction(skillPresetId?: string) {
    const mxShellPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/Mx-Shell_Prompts_v1.5.md";
    const emotionPath = "/Users/huangchi/马也传媒/03_AI工作流/AI/眨眼之间工作区/ai/情绪导演_Skill_V2.1.md";
    if (skillPresetId === "seedance-mx-shell-storyboard-v1-5") return `当前 Copy-only Skill：清道夫包 v1.5。必须读取 ${mxShellPath}，按基础设定、氛围画质、同期声、一镜到底 / 多机位画面内容、按秒时间轴和物理化动作输出；禁止用 find /Users 全盘搜索 Skill 文件。`;
    if (skillPresetId === "seedance-original-format-emotion-director-v2-1") return `当前 Copy-only Skill：情绪导演 + Skill 5 轻量包 v2.1。必须读取 ${emotionPath}，并在 Skill 5 结构上叠加情绪曲线、生理反应、微动作、声音层次和环境反馈；禁止用 find /Users 全盘搜索 Skill 文件。`;
    if (skillPresetId === "seedance-mx-shell-emotion-director-v2-1") return `当前 Copy-only Skill：情绪导演 + 清道夫包 v2.1。必须读取 ${mxShellPath} 与 ${emotionPath}，同时输出清道夫结构、按秒时间轴、情绪物理化和声音状态；禁止用 find /Users 全盘搜索 Skill 文件。`;
    return "当前 Copy-only Skill：导演方法 + Skill 5 轻量包 v5.2。必须读取 original-prompt-format-lock、seedance-storyboard-skill 和 seedance-prompts-template，隐藏过程可保留参考图映射和结构记录，前台只交付一键复制 Seedance 2.0 提示词代码块。";
}

function json(data: unknown, status = 200) {
    return Response.json({ code: status >= 400 ? 1 : 0, data, msg: status >= 400 ? "操作失败" : "ok" }, { status });
}

function normalizeEpisode(value?: string) {
    const episode = (value || "ep05").trim();
    if (!/^ep[\w-]+$/i.test(episode)) throw new Error("集数只支持 epXX 形式");
    return episode;
}

function normalizeProjectSlug(value?: string) {
    const slug = (value || "demo-project").trim();
    if (!/^[\w-]+$/.test(slug)) throw new Error("项目目录只支持英文、数字、下划线和中划线");
    return slug;
}

function normalizeExecutionMode(value?: string): WorkflowExecutionMode {
    return value === "cloud-worker" ? "cloud-worker" : "local-runner";
}

function assertExecutionModeAvailable(action: ActionBody["action"], executionMode: WorkflowExecutionMode) {
    const cloudWorkerForced = process.env.ORIGINAL_WORKFLOW_EXECUTION_MODE === "cloud-worker" || process.env.ORIGINAL_WORKFLOW_FORCE_CLOUD_WORKER === "true";
    if (cloudWorkerForced && executionMode !== "cloud-worker") {
        throw new Error("当前部署已强制使用云端 Worker，不能回退本地 Codex CLI / local-runner。");
    }
    if (executionMode !== "cloud-worker") return;
    if (!action || action === "save-script" || action === "save-file") {
        throw new Error("云端 Worker 模式尚未接入阶段文件写入服务，不能写入本地 markdown。");
    }
    if (action === "start-stage") throw new Error("云端 Worker 阶段启动尚未接入：上线前需要后端 Worker 接管规范读取、分文件任务、日志、停止任务和人工审核后写入。");
    if (action === "validate") throw new Error("云端 Worker 质量门尚未接入：上线前需要把质量门服务化，不能回退本地 Python 脚本。");
    if (action === "export-copy-only") throw new Error("云端 Worker Copy-only 导出尚未接入：上线前需要由后端 Worker 审核后写入视频生产包。");
    if (action === "cancel-latest-job") throw new Error("云端 Worker 停止任务尚未接入：上线前需要支持队列任务停止、超时回收和日志回传。");
}

function normalizeRootPath(value?: string) {
    return path.resolve((value || defaultRootPath).trim());
}

function resolveInside(rootPath: string, relativePath: string) {
    const resolved = path.resolve(rootPath, relativePath);
    if (!resolved.startsWith(`${rootPath}${path.sep}`) && resolved !== rootPath) throw new Error("文件路径越界");
    return resolved;
}

async function readFirstExisting(rootPath: string, relativePaths: string[]) {
    for (const relativePath of relativePaths) {
        const absolutePath = resolveInside(rootPath, relativePath);
        try {
            const [content, stats] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
            return { content, exists: true, path: relativePath, size: stats.size, updatedAt: stats.mtime.toISOString() };
        } catch {
            // Try the next known location.
        }
    }
    return { content: "", exists: false, path: relativePaths[0], size: 0, updatedAt: "" };
}

async function listEpisodes(rootPath: string, projectSlug: string) {
    const names = new Set<string>();
    for (const relativePath of [`outputs`, `projects/${projectSlug}/script`, `script`]) {
        try {
            const entries = await readdir(resolveInside(rootPath, relativePath), { withFileTypes: true });
            entries.forEach((entry) => {
                const match = entry.name.match(/^(ep[\w-]+)(?:\.md)?$/i);
                if (match) names.add(match[1]);
            });
        } catch {
            // Optional folders are allowed to be absent in early MVP projects.
        }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

async function buildSnapshot(rootPath: string, episode: string, projectSlug: string) {
    const rootStats = await stat(rootPath).catch(() => undefined);
    const files = await readSnapshotFiles(rootPath, episode, projectSlug);
    const rootExists = Boolean(rootStats?.isDirectory());
    return {
        episode,
        episodes: rootExists ? await listEpisodes(rootPath, projectSlug) : [],
        files,
        latestJob: rootExists ? await readLatestJob(rootPath, episode) : undefined,
        projectSlug,
        rootExists,
        rootPath,
        validations: rootExists ? await readValidationSnapshots(rootPath, episode, files) : {},
    };
}

async function readSnapshotFiles(rootPath: string, episode: string, projectSlug: string) {
    return Promise.all(
        fileGroups.map(async (group) => {
            const file = await readFirstExisting(rootPath, group.paths(episode, projectSlug));
            return { key: group.key, label: group.label, ...normalizeSnapshotFile(group, file, episode) };
        }),
    );
}

function normalizeSnapshotFile(group: FileGroup, file: Awaited<ReturnType<typeof readFirstExisting>>, episode: string) {
    if (!file.exists || !["characters", "scenes", "props"].includes(group.key)) return file;
    if (assetContentMatchesEpisode(file.content, episode)) return file;
    return { ...file, content: "", exists: false, size: 0, updatedAt: "" };
}

function assetContentMatchesEpisode(content: string, episode: string) {
    const prefix = episodeAssetPrefix(episode);
    return [episode, `${prefix}-`, `${prefix} `, `${prefix}（`, `${prefix} 新增`, `所属集数**：${prefix}`, `所属集数：${prefix}`].some((marker) => marker && content.includes(marker));
}

async function readValidationSnapshots(rootPath: string, episode: string, files: SnapshotFile[]) {
    const result: Partial<Record<WorkflowStage, ValidationSnapshot>> = {};
    for (const stage of Object.keys(stageFileKeys) as WorkflowStage[]) {
        const validation = await readValidationSnapshot(rootPath, episode, stage, files);
        if (validation) result[stage] = validation;
    }
    return result;
}

async function readValidationSnapshot(rootPath: string, episode: string, stage: WorkflowStage, files: SnapshotFile[]) {
    const raw = await readFile(validationPath(rootPath, episode, stage), "utf8").catch(() => "");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CommandResult & { updatedAt?: string };
    const stageFiles = files.filter((file) => stageFileKeys[stage].includes(file.key));
    const latestFileUpdatedAt = latestUpdatedAt(stageFiles.filter((file) => file.exists).map((file) => file.updatedAt));
    const updatedAt = parsed.updatedAt || "";
    const missingStageFile = stageFiles.some((file) => !file.exists);
    const stale = Boolean(latestFileUpdatedAt && updatedAt && new Date(latestFileUpdatedAt).getTime() > new Date(updatedAt).getTime());
    return {
        ...parsed,
        latestFileUpdatedAt,
        state: missingStageFile || stale ? "stale" : parsed.exitCode === "0" ? "passed" : "failed",
        updatedAt,
    } satisfies ValidationSnapshot;
}

async function writeValidationSnapshot(rootPath: string, episode: string, stage: WorkflowStage, commandResult: CommandResult) {
    const target = validationPath(rootPath, episode, stage);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ ...commandResult, stage, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

function validationPath(rootPath: string, episode: string, stage: WorkflowStage) {
    return resolveInside(rootPath, `.workflow-cache/web-validations/${episode}-${stage}.json`);
}

function projectWorkflowPaths(projectSlug: string, relativePath: string) {
    const projectPath = `projects/${projectSlug}/${relativePath}`;
    return projectSlug === "demo-project" ? [relativePath] : [projectPath];
}

function latestUpdatedAt(values: string[]) {
    return values.filter(Boolean).sort().at(-1) || "";
}

async function assertStageValidationPassed(rootPath: string, episode: string, projectSlug: string, stage: WorkflowStage) {
    const files = await readSnapshotFiles(rootPath, episode, projectSlug);
    const validation = await readValidationSnapshot(rootPath, episode, stage, files);
    if (validation?.state === "passed") return;
    const label = stageLabel(stage);
    if (validation?.state === "failed") throw new Error(`${label} 质量门未通过，请先修正并重新校验。`);
    if (validation?.state === "stale") throw new Error(`${label} 文件在上次校验后有更新，请重新校验。`);
    throw new Error(`${label} 尚未通过质量门，请先校验。`);
}

function prerequisiteStage(stage: WorkflowStage) {
    if (stage === "stage3") return "stage2" as const;
    return undefined;
}

function stageLabel(stage: WorkflowStage) {
    if (stage === "stage2") return "服化道";
    if (stage === "stage3") return "Copy-only";
    return "剧本优化";
}

function pythonProjectArgs(stage: WorkflowStage, projectSlug: string) {
    return stage === "stage2" && projectSlug !== "demo-project" ? ["--project", `projects/${projectSlug}`] : [];
}

async function runPythonTool(rootPath: string, args: string[], extra?: Partial<CommandResult>): Promise<CommandResult> {
    const command = `${pythonBin} ${args.map((item) => (item.includes(" ") ? JSON.stringify(item) : item)).join(" ")}`;
    const options = { cwd: rootPath, maxBuffer: 1024 * 1024 * 8, timeout: 1000 * 60 * 5 };
    const result = await execFileAsync(pythonBin, args, options)
        .then((value) => ({ ...value, exitCode: 0 }))
        .catch((error: Error & { code?: number | string; stderr?: string; stdout?: string }) => ({
            exitCode: typeof error.code === "number" ? error.code : 1,
            stderr: `${error.stderr || ""}${error.message ? `\n${error.message}` : ""}`.trim(),
            stdout: error.stdout || "",
        }));
    return {
        command,
        exitCode: String(result.exitCode),
        ...extra,
        stderr: String(result.stderr || ""),
        stdout: String(result.stdout || ""),
    };
}

function shellQuote(value: string) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

async function startCodexStageJob(rootPath: string, episode: string, projectSlug: string, stage: WorkflowStage, instruction: string, agentConfig?: CodexAgentConfig, skillPresetId?: string) {
    const existing = await findRunningStageJob(rootPath, episode, stage);
    if (existing) return existing;
    const jobId = `web-${stage}-${episode}-${Date.now()}`;
    const relativeJobDir = `.workflow-cache/web-jobs/${jobId}`;
    const jobDir = resolveInside(rootPath, relativeJobDir);
    await mkdir(jobDir, { recursive: true });
    const promptPath = path.join(jobDir, "prompt.md");
    const logPath = path.join(jobDir, "run.log");
    const statusPath = path.join(jobDir, "status.json");
    const prompt = buildRunnerPrompt(rootPath, episode, projectSlug, stage, instruction);
    const agent = normalizeCodexAgentConfig(agentConfig);
    await prepareStageJobOutputDirs(rootPath, episode, stage);
    await writeFile(promptPath, prompt, "utf8");
    const partPrompts = await writeStagePartPrompts(jobDir, rootPath, episode, projectSlug, stage, skillPresetId);
    await writeFile(statusPath, JSON.stringify({ agent: publicAgentStatus(agent), episode, jobId, logPath, promptPath, stage, startedAt: new Date().toISOString(), status: "running" }, null, 2), "utf8");
    const modelArg = agent.model ? ` --model ${shellQuote(agent.model)}` : "";
    const codexCommand = (inputPath: string, append = false) =>
        `codex exec${modelArg} --cd ${shellQuote(rootPath)} --add-dir ${shellQuote(rootPath)} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check - < ${shellQuote(inputPath)} ${append ? ">>" : ">"} ${shellQuote(logPath)} 2>&1`;
    const runCommands = partPrompts.length ? buildPartRunnerCommands(stage, partPrompts, logPath, codexCommand) : [codexCommand(promptPath)];
    const script = [
        `set -o pipefail`,
        ...runCommands,
        `code=$?`,
        `node -e "const fs=require('fs'); const statusPath=process.argv[1]; const code=Number(process.argv[2]); const data=JSON.parse(fs.readFileSync(statusPath,'utf8')); data.status=code===0?'success':'failed'; data.exitCode=code; data.finishedAt=new Date().toISOString(); fs.writeFileSync(statusPath, JSON.stringify(data,null,2));" ${shellQuote(statusPath)} "$code"`,
    ].join("\n");
    const child = spawn("bash", ["-lc", script], { cwd: rootPath, detached: true, env: buildCodexRunnerEnv(agent), stdio: "ignore" });
    child.unref();
    await writeFile(statusPath, JSON.stringify({ agent: publicAgentStatus(agent), episode, jobId, logPath, promptPath, runnerPid: child.pid || 0, stage, startedAt: new Date().toISOString(), status: "running" }, null, 2), "utf8");
    await sleep(700);
    const status = await readJobStatus(statusPath, logPath);
    return {
        jobId,
        jobHealth: status.health,
        jobStatus: status.status,
        logPath,
        logIdleSeconds: status.logIdleSeconds,
        logTail: status.logTail,
        logUpdatedAt: status.logUpdatedAt,
        promptPath,
        runnerAgent: publicAgentLabel(agent),
        runnerCommand: partPrompts.length ? stagePartRunnerLabel(stage) : `codex exec${modelArg} --cd ${rootPath} --add-dir ${rootPath} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check - < ${promptPath}`,
        runnerPid: String(child.pid || ""),
        statusPath,
    };
}

async function prepareStageJobOutputDirs(rootPath: string, episode: string, stage: WorkflowStage) {
    if (stage === "stage1") {
        await mkdir(resolveInside(rootPath, `outputs/${episode}/.scene-batches/stage1`), { recursive: true });
    }
    if (stage === "stage3") {
        const stage3Dir = resolveInside(rootPath, `outputs/${episode}/.scene-batches/stage3`);
        await mkdir(stage3Dir, { recursive: true });
        const entries = await readdir(stage3Dir, { withFileTypes: true }).catch(() => []);
        await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => unlink(path.join(stage3Dir, entry.name)).catch(() => undefined)));
    }
}

function buildPartRunnerCommands(stage: WorkflowStage, partPrompts: Array<{ label: string; path: string }>, logPath: string, codexCommand: (inputPath: string, append?: boolean) => string) {
    if (stage === "stage3") {
        const mergePrompt = partPrompts.find((item) => item.label === "stage3-merge");
        const batchPrompts = partPrompts.filter((item) => item !== mergePrompt);
        const commands = buildParallelCodexCommands(batchPrompts, logPath, codexCommand);
        if (mergePrompt) {
            commands.push(`if [ "$code" -ne 0 ]; then false; else echo ${shellQuote(`\\n===== ${mergePrompt.label} =====`)} >> ${shellQuote(logPath)}; ${codexCommand(mergePrompt.path, true)}; fi`);
        } else {
            commands.push(`if [ "$code" -ne 0 ]; then false; else true; fi`);
        }
        return commands;
    }
    if (stage !== "stage2") return partPrompts.flatMap((item) => [`echo ${shellQuote(`\\n===== ${item.label} =====`)} >> ${shellQuote(logPath)}`, codexCommand(item.path, true)]);
    const commands = buildParallelCodexCommands(partPrompts, logPath, codexCommand);
    commands.push(`if [ "$code" -ne 0 ]; then false; else true; fi`);
    return commands;
}

function buildParallelCodexCommands(partPrompts: Array<{ label: string; path: string }>, logPath: string, codexCommand: (inputPath: string, append?: boolean) => string) {
    const commands = [`pids=()`];
    partPrompts.forEach((item) => {
        commands.push(`( echo ${shellQuote(`\\n===== ${item.label} =====`)} >> ${shellQuote(logPath)}; ${codexCommand(item.path, true)} ) &`);
        commands.push(`pids+=($!)`);
    });
    commands.push(`code=0`);
    commands.push(`for pid in "\${pids[@]}"; do wait "$pid" || code=1; done`);
    return commands;
}

function normalizeCodexAgentConfig(input?: CodexAgentConfig): Required<CodexAgentConfig> {
    const apiBaseUrl = (input?.apiBaseUrl || "").trim();
    const apiKey = (input?.apiKey || "").trim();
    const model = (input?.model || "").trim();
    if (apiBaseUrl && !/^https?:\/\/.+/i.test(apiBaseUrl)) throw new Error("Codex Agent 企业 API Base URL 必须以 http:// 或 https:// 开头");
    return { apiBaseUrl, apiKey, model };
}

function buildCodexRunnerEnv(agent: Required<CodexAgentConfig>) {
    const env = { ...process.env };
    env.PATH = `/usr/bin:${env.PATH || ""}`;
    if (agent.apiKey) env.OPENAI_API_KEY = agent.apiKey;
    if (agent.apiBaseUrl) env.OPENAI_BASE_URL = agent.apiBaseUrl;
    return env;
}

function publicAgentStatus(agent: Required<CodexAgentConfig>) {
    return {
        apiBaseUrl: agent.apiBaseUrl,
        apiKeyConfigured: Boolean(agent.apiKey),
        model: agent.model,
        mode: agent.apiBaseUrl || agent.apiKey || agent.model ? "enterprise-api" : "default-codex",
    };
}

function publicAgentLabel(agent: Required<CodexAgentConfig>) {
    if (!agent.apiBaseUrl && !agent.apiKey && !agent.model) return "当前 Codex 登录态";
    return [`企业 API`, agent.model || "默认模型", agent.apiBaseUrl || "默认 Base URL", agent.apiKey ? "Key 已配置" : "未填 Key"].join(" · ");
}

function stageOutputRule(episode: string, projectSlug: string, stage: WorkflowStage) {
    if (stage === "stage1") return `输出文件只允许写入工作流根目录 outputs/${episode}/ 下的导演方法参考文件；不要写到 projects/${projectSlug}/outputs/，不要读写 assets/。`;
    if (stage === "stage2") return `服化道输出只允许覆盖写入 projects/${projectSlug}/assets/character-prompts.md、projects/${projectSlug}/assets/scene-prompts.md 与 projects/${projectSlug}/assets/prop-prompts.md；不要读写根目录 assets/，不要写到 outputs/${episode}/ 或 projects/${projectSlug}/outputs/。`;
    return `Copy-only 输出文件必须写在工作流根目录 outputs/${episode}/ 下；读取资产时只允许使用 projects/${projectSlug}/assets/character-prompts.md、projects/${projectSlug}/assets/scene-prompts.md 与 projects/${projectSlug}/assets/prop-prompts.md，不要读写根目录 assets/。`;
}

function stagePartRunnerLabel(stage: WorkflowStage) {
    if (stage === "stage1") return "导演方法参考分批后台 Runner：批次碎片 → 01A/01B/01C/01D 汇总";
    if (stage === "stage2") return "服化道并行后台 Runner：角色 / 场景 / 道具三路资产";
    if (stage === "stage3") return "Copy-only 并行分批后台 Runner：分段提示词 → Copy-only";
    return "后台 Codex Runner";
}

function buildRunnerPrompt(rootPath: string, episode: string, projectSlug: string, stage: WorkflowStage, instruction: string) {
    return [
        `你正在执行 Seedance 视频工作流：${stageLabel(stage)}。`,
        "",
        `工作流根目录：${rootPath}`,
        `项目目录：${projectSlug}`,
        `集数：${episode}`,
        "",
        "请严格遵循本目录 AGENTS.md、specs/skills、templates 和 examples。只修改本阶段要求的文件，不要改网站项目文件。",
        "重要：这是网页后台 runner，不能使用 spawn_agent / fork / subagent / collab Wait。你必须在当前 Codex exec 进程内直接读取资料、生成内容、写入文件并结束。",
        stageOutputRule(episode, projectSlug, stage),
        "",
        instruction,
    ].join("\n");
}

async function writeStagePartPrompts(jobDir: string, rootPath: string, episode: string, projectSlug: string, stage: WorkflowStage, skillPresetId?: string) {
    if (stage === "stage1") return writeStage1PartPrompts(jobDir, rootPath, episode, projectSlug);
    if (stage === "stage2") return writeStage2PartPrompts(jobDir, rootPath, episode, projectSlug, skillPresetId);
    if (stage === "stage3") return writeStage3PartPrompts(jobDir, rootPath, episode, projectSlug, skillPresetId);
    return [];
}

async function writeStage1PartPrompts(jobDir: string, rootPath: string, episode: string, projectSlug: string) {
    const scriptFile = await readFirstExisting(rootPath, fileGroups.find((group) => group.key === "script")?.paths(episode, projectSlug) || [`projects/${projectSlug}/script/${episode}.md`]);
    const prompts = buildStage1PartPromptTexts(rootPath, episode, projectSlug, scriptFile.content);
    return writePartPromptFiles(jobDir, prompts);
}

async function writeStage3PartPrompts(jobDir: string, rootPath: string, episode: string, projectSlug: string, skillPresetId?: string) {
    const [shotScript, scriptFile] = await Promise.all([
        readFirstExisting(rootPath, [`outputs/${episode}/01C-director-shot-script.md`]),
        readFirstExisting(rootPath, fileGroups.find((group) => group.key === "script")?.paths(episode, projectSlug) || [`projects/${projectSlug}/script/${episode}.md`]),
    ]);
    const prompts = buildStage3PartPromptTexts(rootPath, episode, projectSlug, shotScript.content || scriptFile.content, skillPresetId);
    return writePartPromptFiles(jobDir, prompts);
}

async function writeStage2PartPrompts(jobDir: string, rootPath: string, episode: string, projectSlug: string, skillPresetId?: string) {
    const scriptFile = await readFirstExisting(rootPath, fileGroups.find((group) => group.key === "script")?.paths(episode, projectSlug) || [`projects/${projectSlug}/script/${episode}.md`]);
    const prompts = buildStage2PartPromptTexts(rootPath, episode, projectSlug, scriptFile.content, skillPresetId);
    return writePartPromptFiles(jobDir, prompts);
}

async function writePartPromptFiles(jobDir: string, prompts: Array<{ label: string; text: string }>) {
    const result = [];
    for (const [index, item] of prompts.entries()) {
        const promptPath = path.join(jobDir, `prompt-${index + 1}-${item.label}.md`);
        await writeFile(promptPath, item.text, "utf8");
        result.push({ label: item.label, path: promptPath });
    }
    return result;
}

async function readJobStatus(statusPath: string, logPath: string) {
    const [statusRaw, logRaw, logStats] = await Promise.all([readFile(statusPath, "utf8").catch(() => "{}"), readFile(logPath, "utf8").catch(() => ""), stat(logPath).catch(() => undefined)]);
    const parsed = JSON.parse(statusRaw) as { status?: string };
    const logIdleSeconds = logStats ? Math.max(0, Math.round((Date.now() - logStats.mtimeMs) / 1000)) : undefined;
    const status = parsed.status || "unknown";
    const health = status === "running" && logIdleSeconds !== undefined && logIdleSeconds > stalledLogIdleSeconds ? "stalled" : "active";
    return {
        health,
        logIdleSeconds: logIdleSeconds === undefined ? "" : String(logIdleSeconds),
        logTail: visibleLogTail(logRaw),
        logUpdatedAt: logStats?.mtime.toISOString() || "",
        status,
    };
}

function visibleLogTail(logRaw: string) {
    const ignored = ["WARN codex_core_plugins::manifest", "WARN codex_core_skills::loader", "failed to load skill", "ignoring interface.icon_", "prompt must be at most 128 characters"];
    const lines = logRaw
        .split("\n")
        .filter((line) => line.trim())
        .filter((line) => !ignored.some((pattern) => line.includes(pattern)));
    return lines.slice(-80).join("\n");
}

async function findRunningStageJob(rootPath: string, episode: string, stage: WorkflowStage) {
    const jobsDir = resolveInside(rootPath, ".workflow-cache/web-jobs");
    const entries = await readdir(jobsDir, { withFileTypes: true }).catch(() => []);
    const jobNames = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(`web-${stage}-${episode}-`))
        .map((entry) => entry.name)
        .sort()
        .reverse();
    for (const jobName of jobNames) {
        const jobDir = resolveInside(rootPath, `.workflow-cache/web-jobs/${jobName}`);
        const statusPath = path.join(jobDir, "status.json");
        const logPath = path.join(jobDir, "run.log");
        const statusRaw = await readFile(statusPath, "utf8").catch(() => "{}");
        const status = JSON.parse(statusRaw) as { agent?: ReturnType<typeof publicAgentStatus>; jobId?: string; runnerPid?: number; status?: string };
        if (status.status !== "running") continue;
        const log = await readJobStatus(statusPath, logPath);
        return {
            jobId: status.jobId || jobName,
            jobStatus: "running",
            jobHealth: log.health,
            logPath,
            logIdleSeconds: log.logIdleSeconds,
            logTail: log.logTail,
            logUpdatedAt: log.logUpdatedAt,
            promptPath: path.join(jobDir, "prompt.md"),
            reusedRunningJob: "true",
            runnerAgent: status.agent ? publicAgentLabel({ apiBaseUrl: status.agent.apiBaseUrl || "", apiKey: status.agent.apiKeyConfigured ? "configured" : "", model: status.agent.model || "" }) : "",
            runnerPid: status.runnerPid ? String(status.runnerPid) : "",
            statusPath,
        };
    }
    return undefined;
}

async function readLatestJob(rootPath: string, episode?: string) {
    const jobsDir = resolveInside(rootPath, ".workflow-cache/web-jobs");
    const entries = await readdir(jobsDir, { withFileTypes: true }).catch(() => []);
    const jobs = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith("web-stage"))
            .map(async (entry) => {
                const statusPath = resolveInside(rootPath, `.workflow-cache/web-jobs/${entry.name}/status.json`);
                const statusRaw = await readFile(statusPath, "utf8").catch(() => "{}");
                const status = JSON.parse(statusRaw) as { episode?: string; finishedAt?: string; startedAt?: string };
                const fallbackMs = await stat(resolveInside(rootPath, `.workflow-cache/web-jobs/${entry.name}`))
                    .then((info) => info.mtimeMs)
                    .catch(() => 0);
                const timeMs = Date.parse(status.finishedAt || status.startedAt || "") || fallbackMs;
                return { name: entry.name, status, timeMs };
            }),
    );
    jobs.sort((a, b) => b.timeMs - a.timeMs);
    let latest = "";
    for (const job of jobs) {
        if (!episode || job.status.episode === episode) {
            latest = job.name;
            break;
        }
    }
    if (!latest) return undefined;
    const jobDir = resolveInside(rootPath, `.workflow-cache/web-jobs/${latest}`);
    const statusPath = path.join(jobDir, "status.json");
    const logPath = path.join(jobDir, "run.log");
    const promptPath = path.join(jobDir, "prompt.md");
    const statusRaw = await readFile(statusPath, "utf8").catch(() => "{}");
    const status = JSON.parse(statusRaw) as { agent?: ReturnType<typeof publicAgentStatus>; episode?: string; exitCode?: number; jobId?: string; runnerPid?: number; stage?: string; status?: string };
    const log = await readJobStatus(statusPath, logPath);
    return {
        command: "后台 Codex Runner",
        exitCode: status.exitCode === undefined ? "" : String(status.exitCode),
        jobId: status.jobId || latest,
        jobHealth: log.health,
        jobStatus: status.status || log.status,
        logPath,
        logIdleSeconds: log.logIdleSeconds,
        logTail: log.logTail,
        logUpdatedAt: log.logUpdatedAt,
        promptPath,
        runnerAgent: status.agent ? publicAgentLabel({ apiBaseUrl: status.agent.apiBaseUrl || "", apiKey: status.agent.apiKeyConfigured ? "configured" : "", model: status.agent.model || "" }) : "",
        runnerPid: status.runnerPid ? String(status.runnerPid) : "",
        stage: status.stage || "",
        statusPath,
        stderr: "",
        stdout: "",
    };
}

export async function GET(request: NextRequest) {
    try {
        const rootPath = normalizeRootPath(request.nextUrl.searchParams.get("rootPath") || undefined);
        const episode = normalizeEpisode(request.nextUrl.searchParams.get("episode") || undefined);
        const projectSlug = normalizeProjectSlug(request.nextUrl.searchParams.get("projectSlug") || undefined);
        return json(await buildSnapshot(rootPath, episode, projectSlug));
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "读取失败" }, 400);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as ActionBody;
        const rootPath = normalizeRootPath(body.rootPath);
        const episode = normalizeEpisode(body.episode);
        const projectSlug = normalizeProjectSlug(body.projectSlug);
        const action = body.action;
        const executionMode = normalizeExecutionMode(body.executionMode);
        assertExecutionModeAvailable(action, executionMode);
        let commandResult: CommandResult | undefined;

        if (action === "save-script") {
            const content = body.content || "";
            if (body.requireScriptOptimizerNotes && !hasScriptOptimizerWhitePaperProductionNotes(content)) {
                throw new Error("优化剧本缺少白皮书 v1.1 要求的制作备注、隐喻处理、画面生成禁止项或母版文档禁止项，已拒绝写入。");
            }
            const target = resolveInside(rootPath, `projects/${projectSlug}/script/${episode}.md`);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, content, "utf8");
        } else if (action === "save-file") {
            const group = fileGroups.find((item) => item.key === body.fileKey);
            if (!group) throw new Error("未知文件类型");
            const target = resolveInside(rootPath, group.paths(episode, projectSlug)[0]);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, body.content || "", "utf8");
        } else if (action === "validate") {
            const stage = body.stage || "stage3";
            commandResult = await runPythonTool(rootPath, ["tools/workflow_validate.py", "--stage", stage, "--mode", "pre_review", "--episode", episode, ...pythonProjectArgs(stage, projectSlug)]);
            await writeValidationSnapshot(rootPath, episode, stage, commandResult);
        } else if (action === "cancel-latest-job") {
            commandResult = await cancelLatestJob(rootPath, episode);
        } else if (action === "start-stage") {
            const stage = (body.stage || "stage1") as WorkflowStage;
            const config = stageLaunchConfig[stage];
            if (!config) throw new Error("未知阶段");
            const prerequisite = prerequisiteStage(stage);
            if (prerequisite) await assertStageValidationPassed(rootPath, episode, projectSlug, prerequisite);
            const launchInstruction = config.instruction(episode, projectSlug, body.skillPresetId);
            const guardResult = await runPythonTool(rootPath, ["tools/workflow_guard.py", "--action", config.action, "--episode", episode], {
                launchInstruction,
                launchStatus: "guard_checked",
            });
            if (guardResult.exitCode === "0") {
                const job = await startCodexStageJob(rootPath, episode, projectSlug, stage, launchInstruction, body.agent, body.skillPresetId);
                commandResult = { ...guardResult, ...job, launchStatus: "runner_started" };
            } else {
                commandResult = guardResult;
            }
        } else if (action === "export-copy-only") {
            const files = await readSnapshotFiles(rootPath, episode, projectSlug);
            if (!files.some((file) => file.key === "copyOnly" && file.exists) && !files.some((file) => file.key === "stage3" && file.exists)) {
                throw new Error("缺少 Copy-only 或旧版过程缓存，请先启动 Copy-only。");
            }
            commandResult = await runPythonTool(rootPath, ["tools/export_copy_only.py", "--episode", episode]);
        } else {
            throw new Error("未知操作");
        }

        return json({ ...(await buildSnapshot(rootPath, episode, projectSlug)), commandResult });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "操作失败" }, 400);
    }
}

function hasScriptOptimizerWhitePaperProductionNotes(script: string) {
    return ["制作备注", "视觉方向", "连续性", "风险提示", "隐喻处理", "画面生成禁止项", "母版文档禁止项"].every((marker) => script.includes(marker));
}

async function cancelLatestJob(rootPath: string, episode?: string): Promise<CommandResult> {
    const latest = await readLatestJob(rootPath, episode);
    if (!latest?.statusPath) return { command: "取消后台 Runner", exitCode: "0", stderr: "", stdout: "没有可取消的后台任务。" };
    await cancelJob(latest.statusPath, "cancelled from web console");
    return { ...latest, command: "取消后台 Runner", jobStatus: "cancelled", stderr: "", stdout: "已取消后台任务。" };
}

async function cancelJob(statusPath: string, reason: string) {
    const raw = await readFile(statusPath, "utf8").catch(() => "{}");
    const data = JSON.parse(raw) as Record<string, unknown> & { runnerPid?: number | string };
    if (data.runnerPid) {
        const pid = Number(data.runnerPid);
        if (Number.isFinite(pid) && pid > 0) {
            await execFileAsync("bash", ["-lc", `kill -TERM -${pid} 2>/dev/null || true; pkill -TERM -P ${pid} 2>/dev/null || true; kill ${pid} 2>/dev/null || true`]).catch(() => undefined);
        }
    }
    data.status = "cancelled";
    data.finishedAt = new Date().toISOString();
    data.cancelReason = reason;
    await writeFile(statusPath, JSON.stringify(data, null, 2), "utf8");
    await sleep(500);
}
