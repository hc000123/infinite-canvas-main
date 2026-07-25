package service

type skillSeedContract struct {
	RequiredInputs      []string
	ImagePolicy         SkillImagePolicy
	OutputSchemaVersion string
	OutputSchema        map[string]any
}

func workflowSkillSeedContract(stageKey string) skillSeedContract {
	contract := skillSeedContract{RequiredInputs: []string{"workflow", "script", "upstreamArtifact"}, OutputSchemaVersion: "1.0.0"}
	contract.ImagePolicy.AllowTextFallback = true
	switch stageKey {
	case WorkflowSkillStageScript:
		contract.RequiredInputs, contract.OutputSchema = []string{"workflow", "script"}, workflowScriptOutputSchema()
	case WorkflowSkillStageArt:
		contract.OutputSchema = workflowAssetOutputSchema(false)
	case WorkflowSkillStageAssets:
		contract.OutputSchema = workflowAssetOutputSchema(true)
	case WorkflowSkillStageStoryboard:
		contract.OutputSchema = workflowStoryboardOutputSchema()
	case WorkflowSkillStageVideo:
		contract.RequiredInputs = []string{"workflow", "script", "upstreamArtifact", "shotContext"}
		contract.ImagePolicy.Max = 9
		contract.ImagePolicy.AllowedTypes = []string{"image/png", "image/jpeg", "image/webp"}
		contract.OutputSchema = workflowVideoOutputSchema()
	case WorkflowSkillStageDelivery:
		contract.OutputSchema = workflowDeliveryOutputSchema()
	}
	return contract
}

func workflowScriptOutputSchema() map[string]any {
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"productionScript"}, "properties": map[string]any{"productionScript": map[string]any{"type": "string", "minLength": 1}}}
}

func workflowAssetOutputSchema(withPrompt bool) map[string]any {
	properties := map[string]any{
		"logicalAssetId": map[string]any{"type": "string", "pattern": `^(CHAR|SCENE|PROP|COSTUME)-\d{3}$`}, "kind": map[string]any{"type": "string", "enum": []string{"character", "scene", "prop", "costume"}},
		"name": map[string]any{"type": "string", "minLength": 1}, "scriptEvidence": map[string]any{"type": "string", "minLength": 1}, "description": map[string]any{"type": "string", "minLength": 1},
		"parentLogicalAssetId": map[string]any{"type": "string", "pattern": `^CHAR-\d{3}$`}, "variantType": map[string]any{"type": "string", "enum": []string{"costume", "hair", "makeup", "age", "injury", "other"}}, "variantName": map[string]any{"type": "string", "minLength": 1},
	}
	required := []string{"logicalAssetId", "kind", "name", "scriptEvidence", "description"}
	if withPrompt {
		properties["imagePrompt"], properties["status"] = map[string]any{"type": "string", "minLength": 1}, map[string]any{"const": "ready"}
		required = append(required, "imagePrompt", "status")
	}
	item := map[string]any{"type": "object", "additionalProperties": false, "required": required, "properties": properties, "allOf": []any{map[string]any{"if": map[string]any{"properties": map[string]any{"kind": map[string]any{"const": "costume"}}, "required": []string{"kind"}}, "then": map[string]any{"required": []string{"parentLogicalAssetId", "variantType", "variantName"}}}}}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"items"}, "properties": map[string]any{"items": map[string]any{"type": "array", "minItems": 1, "maxItems": 300, "items": item}}}
}

func workflowStoryboardOutputSchema() map[string]any {
	draft := map[string]any{"type": "object", "additionalProperties": false, "required": []string{"shotSize", "camera", "movement", "action", "performance", "dialogue", "durationSeconds", "continuityMode"}, "properties": map[string]any{
		"shotSize": map[string]any{"type": "string", "minLength": 1}, "camera": map[string]any{"type": "string", "minLength": 1}, "movement": map[string]any{"type": "string", "minLength": 1}, "action": map[string]any{"type": "string", "minLength": 1}, "performance": map[string]any{"type": "string", "minLength": 1}, "dialogue": map[string]any{"type": "string"}, "durationSeconds": map[string]any{"type": "number", "minimum": 4, "maximum": 15}, "continuityMode": map[string]any{"type": "string", "enum": []string{"continuous", "cut"}},
	}}
	shot := map[string]any{"type": "object", "additionalProperties": false, "required": []string{"shotId", "sceneKey", "sourceScript", "shotDraft"}, "properties": map[string]any{"shotId": map[string]any{"type": "string", "pattern": `^shot-\d{3,}$`}, "sceneKey": map[string]any{"type": "string", "pattern": `^scene-\d{3,}$`}, "sourceScript": map[string]any{"type": "string", "minLength": 1}, "shotDraft": draft}}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"shots"}, "properties": map[string]any{"shots": map[string]any{"type": "array", "minItems": 1, "maxItems": 2000, "items": shot}}}
}

func workflowVideoOutputSchema() map[string]any {
	evidence := map[string]any{"type": "object", "additionalProperties": false, "required": []string{"imageRef", "observations", "appliedTo"}, "properties": map[string]any{"imageRef": map[string]any{"type": "string", "pattern": `^@图[1-9]$`}, "observations": map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"type": "string", "minLength": 1}}, "appliedTo": map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"type": "string", "minLength": 1}}}}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"shotId", "prompt", "promptInputHash", "referenceEvidence"}, "properties": map[string]any{"shotId": map[string]any{"type": "string", "minLength": 1}, "prompt": map[string]any{"type": "string", "minLength": 20}, "promptInputHash": map[string]any{"type": "string", "minLength": 1}, "referenceEvidence": map[string]any{"type": "array", "maxItems": 9, "items": evidence}}}
}

func workflowDeliveryOutputSchema() map[string]any {
	row := func(required []string, properties map[string]any) map[string]any {
		return map[string]any{"type": "object", "additionalProperties": false, "required": required, "properties": properties}
	}
	text := map[string]any{"type": "string", "minLength": 1}
	return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"summary", "succeeded", "failed", "retrySuggestions", "exportManifest"}, "properties": map[string]any{
		"summary": text, "succeeded": map[string]any{"type": "array", "items": row([]string{"shotId", "output"}, map[string]any{"shotId": text, "output": text})}, "failed": map[string]any{"type": "array", "items": row([]string{"shotId", "reason"}, map[string]any{"shotId": text, "reason": text})}, "retrySuggestions": map[string]any{"type": "array", "items": row([]string{"shotId", "suggestion"}, map[string]any{"shotId": text, "suggestion": text})}, "exportManifest": map[string]any{"type": "array", "items": row([]string{"shotId", "file", "status"}, map[string]any{"shotId": text, "file": text, "status": map[string]any{"type": "string", "enum": []string{"ready", "failed"}}})},
	}}
}
