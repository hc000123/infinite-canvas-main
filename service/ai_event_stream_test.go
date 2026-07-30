package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAIEventStreamCollectorHandlesChunkBoundaries(t *testing.T) {
	chunks := []string{
		"event: response.output_text.delta\r\ndata: {\"delta\":\"优",
		"化\"}\r\n\r\nevent: response.output_text.delta\ndata: {\"delta\":\"稿\"}\n\n",
		"event: response.completed\ndata: {\"response\":{\"id\":\"response-1\",\"usage\":{\"input_tokens\":12,\"output_tokens\":3}}}\n\ndata: [DONE]",
	}
	collector := NewAIEventStreamCollector()
	rawBytes := 0
	for _, chunk := range chunks {
		rawBytes += len(chunk)
		if _, err := collector.Write([]byte(chunk)); err != nil {
			t.Fatal(err)
		}
	}
	archive := collector.ArchiveJSON()
	var payload map[string]any
	if err := json.Unmarshal([]byte(archive), &payload); err != nil {
		t.Fatalf("archive is not JSON: %v body=%s", err, archive)
	}
	if payload["outputText"] != "优化稿" {
		t.Fatalf("outputText=%#v", payload["outputText"])
	}
	usage, _ := payload["usage"].(map[string]any)
	if usage["input_tokens"] != float64(12) || usage["output_tokens"] != float64(3) {
		t.Fatalf("usage=%#v", usage)
	}
	stream, _ := payload["_streamSummary"].(map[string]any)
	if stream["rawBytes"] != float64(rawBytes) || stream["eventCount"] != float64(3) || stream["done"] != true {
		t.Fatalf("stream=%#v", stream)
	}
	if payload["final"] == nil || strings.Contains(archive, `"delta":`) {
		t.Fatalf("archive retained delta payloads or lost completion: %s", archive)
	}
}
