import type { WorkflowNodeSpec, WorkflowPackage, WorkflowSkillBindingMode } from "@/services/api/workflow-registry";
import type { SkillOption } from "@/services/api/admin-skills";

export function createWorkflowNode(pkg: WorkflowPackage, executorType: "skill" | "agent"): WorkflowNodeSpec {
    const prefix = executorType === "skill" ? "skill" : "agent";
    let index = 1;
    const used = new Set(pkg.nodes.map((node) => node.nodeKey));
    while (used.has(`${prefix}_${index}`)) index += 1;
    const base: Omit<WorkflowNodeSpec, "skillBinding" | "agentRef"> = {
        nodeKey: `${prefix}_${index}`,
        name: executorType === "skill" ? "新 Skill 节点" : "新 Agent 节点",
        executorType,
        inputBindings: [],
        outputArtifactType: "production_script",
        dependsOn: [],
        confirmationPolicy: { requireBeforeRun: false, requireReview: true },
        retryPolicy: { maxAttempts: 2 },
    };
    return executorType === "skill"
        ? { ...base, skillBinding: emptySkillBinding("fixed") }
        : { ...base, agentRef: { agentId: "", agentVersionId: "", agentVersionConstraint: "" } };
}

export function addWorkflowNode(pkg: WorkflowPackage, node: WorkflowNodeSpec): WorkflowPackage {
    return { ...structuredClone(pkg), nodes: [...pkg.nodes.map(cloneNode), cloneNode(node)], contentHash: "" };
}

export function removeWorkflowNode(pkg: WorkflowPackage, nodeKey: string): WorkflowPackage {
    return {
        ...structuredClone(pkg),
        contentHash: "",
        nodes: pkg.nodes.filter((node) => node.nodeKey !== nodeKey).map((node) => ({
            ...cloneNode(node),
            dependsOn: node.dependsOn.filter((dependency) => dependency !== nodeKey),
            inputBindings: node.inputBindings.filter((binding) => binding.source !== "node_output" || binding.fromNodeKey !== nodeKey),
        })),
    };
}

export function replaceWorkflowNode(pkg: WorkflowPackage, nodeKey: string, next: WorkflowNodeSpec): WorkflowPackage {
    const renamed = next.nodeKey !== nodeKey;
    return {
        ...structuredClone(pkg),
        contentHash: "",
        nodes: pkg.nodes.map((node) => {
            if (node.nodeKey === nodeKey) return cloneNode(next);
            if (!renamed) return cloneNode(node);
            return {
                ...cloneNode(node),
                dependsOn: node.dependsOn.map((dependency) => dependency === nodeKey ? next.nodeKey : dependency),
                inputBindings: node.inputBindings.map((binding) => binding.fromNodeKey === nodeKey ? { ...binding, fromNodeKey: next.nodeKey } : { ...binding }),
            };
        }),
    };
}

export function setWorkflowSkillBindingMode(node: WorkflowNodeSpec, mode: WorkflowSkillBindingMode): WorkflowNodeSpec {
    if (node.executorType !== "skill") return cloneNode(node);
    const current = node.skillBinding || emptySkillBinding(mode);
    return {
        ...cloneNode(node),
        skillBinding: mode === "fixed"
            ? { ...current, mode, capability: "", expectedOutputArtifactType: "", projectTags: [], candidateSkillIds: [] }
            : { ...current, mode, skillVersionId: "", skillVersionConstraint: "", capability: current.capability, expectedOutputArtifactType: node.outputArtifactType },
    };
}

export function topologicalWorkflowLanes(pkg: WorkflowPackage): WorkflowNodeSpec[][] {
    const remaining = pkg.nodes.map(cloneNode);
    const completed = new Set<string>();
    const lanes: WorkflowNodeSpec[][] = [];
    while (remaining.length) {
        const lane = remaining.filter((node) => node.dependsOn.every((dependency) => completed.has(dependency)));
        if (!lane.length) {
            lanes.push(remaining);
            break;
        }
        lanes.push(lane);
        for (const node of lane) completed.add(node.nodeKey);
        const keys = new Set(lane.map((node) => node.nodeKey));
        for (let index = remaining.length - 1; index >= 0; index -= 1) if (keys.has(remaining[index]!.nodeKey)) remaining.splice(index, 1);
    }
    return lanes;
}

export function workflowRouteIssueLabel(code: string) {
    const labels: Record<string, string> = {
        manual_selection_required: "运行前必须选择一个兼容的 Skill 版本",
        manual_selection_incompatible: "所选 Skill 版本与节点契约不兼容",
        input_binding_unavailable: "节点缺少必需的输入 Artifact",
        output_contract_unavailable: "节点输出契约无法解析",
        route_error: "Skill 路由解析失败",
        execution_target_unavailable: "当前没有可用的模型执行通道",
        agent_unavailable: "Agent 版本不可用",
        agent_skill_unavailable: "Agent 内部 Skill 版本不可用",
    };
    return `${labels[code] || "工作流节点被阻断"}（${code}）`;
}

export function workflowSourceInputNames(pkg: WorkflowPackage) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const node of pkg.nodes) {
        for (const binding of node.inputBindings) {
            if (binding.source !== "workflow_input" || binding.artifactType !== "source_text") continue;
            const name = binding.workflowInputName || binding.bindingName;
            if (!name || seen.has(name)) continue;
            seen.add(name);
            names.push(name);
        }
    }
    return names.length ? names : ["source"];
}

export function nextWorkflowPatchVersion(version: string) {
    const parts = version.split(".").map(Number);
    return parts.length === 3 && parts.every(Number.isInteger) ? `${parts[0]}.${parts[1]}.${parts[2] + 1}` : "1.0.0";
}

export function workflowPackageFromSkillOption(option: SkillOption): WorkflowPackage {
    const node = applySkillOptionToWorkflowNode(createWorkflowNode({ inputArtifactTypes: [], nodes: [], contentHash: "" }, "skill"), option);
    node.nodeKey = "script";
    node.name = option.skillName;
    return { inputArtifactTypes: [...new Set(option.manifest.inputArtifactTypes)], nodes: [node], contentHash: "" };
}

export function applySkillOptionToWorkflowNode(node: WorkflowNodeSpec, option: SkillOption): WorkflowNodeSpec {
    return {
        ...cloneNode(node),
        executorType: "skill",
        agentRef: undefined,
        skillBinding: {
            mode: "fixed",
            skillId: option.skillId,
            skillVersionId: option.skillVersionId,
            skillVersionConstraint: "",
            capability: option.manifest.capabilities[0] || "",
            expectedOutputArtifactType: "",
            projectTags: [],
            candidateSkillIds: [],
        },
        inputBindings: option.inputBindings.map((input) => ({ bindingName: input.bindingName, artifactType: input.artifactType, source: "workflow_input", workflowInputName: input.bindingName, required: input.required })),
        outputArtifactType: option.outputBindings[0]?.artifactType || option.manifest.outputArtifactTypes[0] || node.outputArtifactType,
    };
}

function emptySkillBinding(mode: WorkflowSkillBindingMode) {
    return { mode, skillId: "", skillVersionId: "", skillVersionConstraint: "", capability: "", expectedOutputArtifactType: "", projectTags: [], candidateSkillIds: [] };
}

function cloneNode(node: WorkflowNodeSpec): WorkflowNodeSpec {
    return structuredClone(node);
}
