package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
)

// ApplyHighestReasoning injects the strongest endpoint-specific reasoning
// payload only for channels explicitly marked with the reasoning capability.
func ApplyHighestReasoning(body []byte, contentType, path string, channel model.ModelChannel) ([]byte, error) {
	if !modelChannelSupportsCapability(channel, "reasoning") || (path != "/chat/completions" && path != "/responses") || !strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "application/json") {
		return body, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if path == "/responses" {
		delete(payload, "reasoning_effort")
		payload["reasoning"] = map[string]any{"effort": "high"}
	} else {
		delete(payload, "reasoning")
		payload["reasoning_effort"] = "high"
	}
	return json.Marshal(payload)
}
