package service

import (
	"encoding/json"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestApplyHighestReasoningUsesEndpointSpecificPayload(t *testing.T) {
	channel := model.ModelChannel{Capabilities: []string{"text", "reasoning"}}
	tests := []struct {
		path string
		want any
	}{
		{path: "/chat/completions", want: "high"},
		{path: "/responses", want: map[string]any{"effort": "high"}},
	}
	for _, test := range tests {
		body, err := ApplyHighestReasoning([]byte(`{"model":"reasoning-model","reasoning_effort":"low"}`), "application/json", test.path, channel)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatal(err)
		}
		if test.path == "/chat/completions" && payload["reasoning_effort"] != test.want {
			t.Fatalf("chat reasoning_effort=%#v", payload["reasoning_effort"])
		}
		if test.path == "/responses" {
			got, _ := payload["reasoning"].(map[string]any)
			if got["effort"] != "high" {
				t.Fatalf("responses reasoning=%#v", payload["reasoning"])
			}
		}
	}
}

func TestApplyHighestReasoningLeavesUnsupportedModelRequestUntouched(t *testing.T) {
	body := []byte(`{"model":"plain-model"}`)
	got, err := ApplyHighestReasoning(body, "application/json", "/chat/completions", model.ModelChannel{Capabilities: []string{"text"}})
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(body) {
		t.Fatalf("body changed: %s", got)
	}
}
