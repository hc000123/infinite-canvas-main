package service

import (
	"errors"
	"fmt"
	"strings"
)

type invocationBusinessValidator struct {
	ID      string
	Version string
	Check   func(map[string]any) error
}

var invocationBusinessValidatorKeys = map[string]string{
	"source_text": "core.source_text@1", "production_script": "core.production_script@1",
	"content_profile": "core.content_profile@1", "asset_catalog": "core.asset_catalog@1",
	"asset_record": "core.asset_record@1", "asset_brief": "core.asset_brief@1",
	"asset_rendition": "core.asset_rendition@1", "storyboard_package": "core.storyboard_package@1",
	"video_prompt_package": "core.video_prompt_package@1", "delivery_report": "core.delivery_report@1",
}

var invocationBusinessValidators = map[string]invocationBusinessValidator{
	"core.source_text@1":          {ID: "core.source_text", Version: "1", Check: requireInvocationString("text")},
	"core.production_script@1":    {ID: "core.production_script", Version: "1", Check: requireInvocationString("productionScript")},
	"core.content_profile@1":      {ID: "core.content_profile", Version: "1", Check: requireInvocationArray("routingTags")},
	"core.asset_catalog@1":        {ID: "core.asset_catalog", Version: "1", Check: requireInvocationArray("items")},
	"core.asset_record@1":         {ID: "core.asset_record", Version: "1", Check: requireInvocationStrings("assetId", "kind", "name")},
	"core.asset_brief@1":          {ID: "core.asset_brief", Version: "1", Check: requireInvocationStrings("assetId", "brief", "format")},
	"core.asset_rendition@1":      {ID: "core.asset_rendition", Version: "1", Check: requireInvocationStrings("assetId", "renditionId", "mediaType", "mediaRef")},
	"core.storyboard_package@1":   {ID: "core.storyboard_package", Version: "1", Check: requireInvocationArray("shots")},
	"core.video_prompt_package@1": {ID: "core.video_prompt_package", Version: "1", Check: requireInvocationArray("items")},
	"core.delivery_report@1":      {ID: "core.delivery_report", Version: "1", Check: requireInvocationString("summary")},
}

var invocationSkillGateAliases = map[string]bool{
	"schema": true, "script": true, "art": true, "asset": true,
	"media": true, "storyboard": true, "delivery": true,
}

func validateInvocationSkillGateProfile(gates []string) error {
	registered := map[string]bool{}
	for key := range invocationBusinessValidators {
		registered[key] = true
	}
	for _, gate := range gates {
		if !invocationSkillGateAliases[gate] && !registered[gate] {
			return fmt.Errorf("Skill 包含未知质量门 validator %q", gate)
		}
	}
	return nil
}

func requireInvocationString(key string) func(map[string]any) error {
	return requireInvocationStrings(key)
}

func requireInvocationStrings(keys ...string) func(map[string]any) error {
	return func(payload map[string]any) error {
		for _, key := range keys {
			value, ok := payload[key].(string)
			if !ok || strings.TrimSpace(value) == "" {
				return fmt.Errorf("%s 不能为空", key)
			}
		}
		return nil
	}
}

func requireInvocationArray(key string) func(map[string]any) error {
	return func(payload map[string]any) error {
		if _, ok := payload[key].([]any); !ok {
			return fmt.Errorf("%s 必须是数组", key)
		}
		return nil
	}
}

func invocationBusinessValidatorFor(artifactType string) (invocationBusinessValidator, error) {
	key, ok := invocationBusinessValidatorKeys[artifactType]
	if !ok {
		return invocationBusinessValidator{}, errors.New("未知 Artifact 类型没有系统 business validator")
	}
	validator, ok := invocationBusinessValidators[key]
	if !ok {
		return invocationBusinessValidator{}, errors.New("未知 Artifact 类型没有系统 business validator")
	}
	return validator, nil
}
