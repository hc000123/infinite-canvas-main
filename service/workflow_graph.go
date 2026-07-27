package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
)

func NormalizeWorkflowPackage(value WorkflowPackage) (WorkflowPackage, error) {
	if len(value.Nodes) == 0 || len(value.Nodes) > 64 {
		return value, errors.New("Workflow 必须包含 1 到 64 个节点")
	}
	value.InputArtifactTypes = normalizedStringSet(value.InputArtifactTypes, true)
	seen := map[string]bool{}
	for index := range value.Nodes {
		node, err := normalizeWorkflowNode(value.Nodes[index])
		if err != nil {
			return value, err
		}
		if seen[node.NodeKey] {
			return value, errors.New("Workflow 节点 key 不能重复")
		}
		seen[node.NodeKey] = true
		value.Nodes[index] = node
	}
	byKey := make(map[string]WorkflowNodeSpec, len(value.Nodes))
	for _, node := range value.Nodes {
		byKey[node.NodeKey] = node
	}
	for index := range value.Nodes {
		node := &value.Nodes[index]
		dependencies := append([]string(nil), node.DependsOn...)
		for _, binding := range node.InputBindings {
			if binding.Source == WorkflowNodeSource {
				for _, sourceKey := range workflowBindingSourceKeys(binding) {
					dependencies = append(dependencies, sourceKey)
					parent, ok := byKey[sourceKey]
					if !ok {
						return value, errors.New("Workflow 节点依赖不存在")
					}
					if parent.OutputArtifactType != binding.ArtifactType {
						return value, errors.New("Workflow 上游输出与输入 Artifact 类型不一致")
					}
				}
			}
		}
		node.DependsOn = normalizedStringSet(dependencies, true)
		for _, dependency := range node.DependsOn {
			if dependency == node.NodeKey {
				return value, errors.New("Workflow 节点不能依赖自身")
			}
			if _, ok := byKey[dependency]; !ok {
				return value, errors.New("Workflow 节点依赖不存在")
			}
		}
	}
	if workflowGraphHasCycle(value.Nodes) {
		return value, errors.New("Workflow 节点图存在循环依赖")
	}
	value.ContentHash = ""
	canonical, err := marshalInvocationCanonical(value)
	if err != nil {
		return value, err
	}
	hash := sha256.Sum256(canonical)
	value.ContentHash = "sha256:" + hex.EncodeToString(hash[:])
	return value, nil
}

func normalizeWorkflowNode(node WorkflowNodeSpec) (WorkflowNodeSpec, error) {
	node.NodeKey = strings.ToLower(strings.TrimSpace(node.NodeKey))
	node.Name = strings.TrimSpace(node.Name)
	node.ExecutorType = strings.ToLower(strings.TrimSpace(node.ExecutorType))
	node.OutputArtifactType = strings.ToLower(strings.TrimSpace(node.OutputArtifactType))
	if !skillManifestTokenPattern.MatchString(node.NodeKey) || node.Name == "" || !skillManifestTokenPattern.MatchString(node.OutputArtifactType) {
		return node, errors.New("Workflow 节点名称、key 或输出 Artifact 类型无效")
	}
	node.DependsOn = normalizedStringSet(node.DependsOn, true)
	bindings := map[string]bool{}
	for index := range node.InputBindings {
		binding := &node.InputBindings[index]
		binding.BindingName = strings.ToLower(strings.TrimSpace(binding.BindingName))
		binding.ArtifactType = strings.ToLower(strings.TrimSpace(binding.ArtifactType))
		binding.Source = strings.ToLower(strings.TrimSpace(binding.Source))
		binding.WorkflowInputName = strings.ToLower(strings.TrimSpace(binding.WorkflowInputName))
		binding.FromNodeKey = strings.ToLower(strings.TrimSpace(binding.FromNodeKey))
		binding.FromNodeKeys = normalizedStringSet(binding.FromNodeKeys, true)
		binding.FromOutputBinding = strings.ToLower(strings.TrimSpace(binding.FromOutputBinding))
		if !skillManifestTokenPattern.MatchString(binding.BindingName) || !skillManifestTokenPattern.MatchString(binding.ArtifactType) || bindings[binding.BindingName] {
			return node, errors.New("Workflow 输入 binding 无效或重复")
		}
		bindings[binding.BindingName] = true
		switch binding.Source {
		case WorkflowInputSource:
			if !skillManifestTokenPattern.MatchString(binding.WorkflowInputName) || binding.FromNodeKey != "" || len(binding.FromNodeKeys) > 0 {
				return node, errors.New("Workflow 根输入 binding 无效")
			}
		case WorkflowNodeSource:
			if binding.WorkflowInputName != "" || (binding.FromNodeKey == "") == (len(binding.FromNodeKeys) == 0) {
				return node, errors.New("Workflow 节点输入来源必须在 fromNodeKey 与 fromNodeKeys 中二选一")
			}
			if binding.FromNodeKey != "" && !skillManifestTokenPattern.MatchString(binding.FromNodeKey) {
				return node, errors.New("Workflow 节点输入 binding 无效")
			}
			for _, sourceKey := range binding.FromNodeKeys {
				if !skillManifestTokenPattern.MatchString(sourceKey) {
					return node, errors.New("Workflow 节点输入 binding 无效")
				}
			}
			if binding.FromOutputBinding == "" {
				binding.FromOutputBinding = "output"
			}
		default:
			return node, errors.New("Workflow 输入来源无效")
		}
	}
	switch node.ExecutorType {
	case WorkflowExecutorSkill:
		if node.SkillBinding == nil || node.AgentRef != nil {
			return node, errors.New("Skill 节点必须且只能声明 Skill binding")
		}
		if err := normalizeWorkflowSkillBinding(node.SkillBinding, node.OutputArtifactType); err != nil {
			return node, err
		}
	case WorkflowExecutorAgent:
		if node.AgentRef == nil || node.SkillBinding != nil {
			return node, errors.New("Agent 节点必须且只能声明 Agent 引用")
		}
		node.AgentRef.AgentID = strings.TrimSpace(node.AgentRef.AgentID)
		node.AgentRef.AgentVersionID = strings.TrimSpace(node.AgentRef.AgentVersionID)
		node.AgentRef.AgentVersionConstraint = strings.Join(strings.Fields(node.AgentRef.AgentVersionConstraint), " ")
		if node.AgentRef.AgentID == "" && node.AgentRef.AgentVersionID == "" {
			return node, errors.New("Agent 节点缺少 Agent 引用")
		}
	default:
		return node, errors.New("Workflow 节点 executorType 无效")
	}
	if node.RetryPolicy.MaxAttempts < 0 || node.RetryPolicy.MaxAttempts > 5 {
		return node, errors.New("Workflow 节点重试次数无效")
	}
	if node.RetryPolicy.MaxAttempts == 0 {
		node.RetryPolicy.MaxAttempts = 1
	}
	return node, normalizeWorkflowCondition(node.Condition)
}

func workflowBindingSourceKeys(binding WorkflowNodeInputBinding) []string {
	if len(binding.FromNodeKeys) > 0 {
		return binding.FromNodeKeys
	}
	if binding.FromNodeKey != "" {
		return []string{binding.FromNodeKey}
	}
	return nil
}

func normalizeWorkflowSkillBinding(binding *WorkflowSkillBinding, outputType string) error {
	binding.Mode = strings.ToLower(strings.TrimSpace(binding.Mode))
	binding.SkillID = strings.TrimSpace(binding.SkillID)
	binding.SkillVersionID = strings.TrimSpace(binding.SkillVersionID)
	binding.SkillVersionConstraint = strings.Join(strings.Fields(binding.SkillVersionConstraint), " ")
	binding.Capability = strings.ToLower(strings.TrimSpace(binding.Capability))
	binding.ExpectedOutputArtifactType = strings.ToLower(strings.TrimSpace(binding.ExpectedOutputArtifactType))
	binding.ProjectTags = normalizedStringSet(binding.ProjectTags, true)
	binding.CandidateSkillIDs = normalizedStringSet(binding.CandidateSkillIDs, false)
	switch binding.Mode {
	case WorkflowSkillBindingFixed:
		if binding.SkillID == "" && binding.SkillVersionID == "" {
			return errors.New("固定 Skill binding 缺少 Skill 引用")
		}
	case WorkflowSkillBindingTagRoute, WorkflowSkillBindingManualBeforeRun:
		if !skillManifestTokenPattern.MatchString(binding.Capability) {
			return errors.New("路由 Skill binding 缺少 capability")
		}
		if binding.ExpectedOutputArtifactType == "" {
			binding.ExpectedOutputArtifactType = outputType
		}
		if binding.ExpectedOutputArtifactType != outputType {
			return errors.New("路由 Skill binding 输出类型与节点不一致")
		}
	default:
		return errors.New("Skill binding mode 无效")
	}
	return nil
}

func normalizeWorkflowCondition(condition *WorkflowCondition) error {
	if condition == nil {
		return nil
	}
	condition.Source = strings.ToLower(strings.TrimSpace(condition.Source))
	condition.Key = strings.TrimSpace(condition.Key)
	condition.Operator = strings.ToLower(strings.TrimSpace(condition.Operator))
	if condition.Source != WorkflowInputSource && condition.Source != WorkflowNodeSource {
		return errors.New("Workflow 条件来源无效")
	}
	if condition.Key == "" {
		return errors.New("Workflow 条件 key 不能为空")
	}
	if !map[string]bool{"equals": true, "not_equals": true, "contains": true, "exists": true}[condition.Operator] {
		return errors.New("Workflow 条件 operator 无效")
	}
	return nil
}

func workflowGraphHasCycle(nodes []WorkflowNodeSpec) bool {
	indegree := make(map[string]int, len(nodes))
	children := make(map[string][]string, len(nodes))
	for _, node := range nodes {
		indegree[node.NodeKey] = len(node.DependsOn)
		for _, parent := range node.DependsOn {
			children[parent] = append(children[parent], node.NodeKey)
		}
	}
	queue := make([]string, 0, len(nodes))
	for key, degree := range indegree {
		if degree == 0 {
			queue = append(queue, key)
		}
	}
	sort.Strings(queue)
	visited := 0
	for len(queue) > 0 {
		key := queue[0]
		queue = queue[1:]
		visited++
		for _, child := range children[key] {
			indegree[child]--
			if indegree[child] == 0 {
				queue = append(queue, child)
				sort.Strings(queue)
			}
		}
	}
	return visited != len(nodes)
}
