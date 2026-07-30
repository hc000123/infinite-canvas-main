package service

import (
	"bytes"
	"encoding/json"
	"strings"
)

const maxAIEventStreamPendingBytes = 1 << 20

type AIEventStreamCollector struct {
	pending    []byte
	output     strings.Builder
	eventTypes map[string]int
	usage      any
	final      any
	last       any
	rawBytes   int
	eventCount int
	done       bool
}

func NewAIEventStreamCollector() *AIEventStreamCollector {
	return &AIEventStreamCollector{eventTypes: map[string]int{}}
}

func (collector *AIEventStreamCollector) Write(chunk []byte) (int, error) {
	collector.rawBytes += len(chunk)
	collector.pending = append(collector.pending, chunk...)
	collector.pending = bytes.ReplaceAll(collector.pending, []byte("\r\n"), []byte("\n"))
	for {
		index := bytes.Index(collector.pending, []byte("\n\n"))
		if index < 0 {
			break
		}
		collector.consume(collector.pending[:index])
		collector.pending = collector.pending[index+2:]
	}
	if len(collector.pending) > maxAIEventStreamPendingBytes {
		collector.pending = append([]byte(nil), collector.pending[len(collector.pending)-maxAIEventStreamPendingBytes:]...)
	}
	return len(chunk), nil
}

func (collector *AIEventStreamCollector) ArchiveJSON() string {
	if len(bytes.TrimSpace(collector.pending)) > 0 {
		collector.consume(collector.pending)
	}
	collector.pending = nil
	stream := map[string]any{"rawBytes": collector.rawBytes, "eventCount": collector.eventCount, "done": collector.done}
	if len(collector.eventTypes) > 0 {
		stream["eventTypes"] = collector.eventTypes
	}
	summary := map[string]any{"_streamSummary": stream}
	if collector.output.Len() > 0 {
		summary["outputText"] = collector.output.String()
	}
	if collector.usage != nil {
		summary["usage"] = collector.usage
	}
	if collector.final != nil {
		summary["final"] = collector.final
	} else if collector.last != nil {
		summary["lastEvent"] = collector.last
	}
	return marshalSanitized(summary)
}

func (collector *AIEventStreamCollector) consume(block []byte) {
	eventName := ""
	dataLines := []string{}
	for _, line := range strings.Split(string(block), "\n") {
		switch {
		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	data := strings.TrimSpace(strings.Join(dataLines, "\n"))
	if data == "" {
		return
	}
	if data == "[DONE]" {
		collector.done = true
		return
	}
	var payload any
	if json.Unmarshal([]byte(data), &payload) != nil {
		return
	}
	collector.eventCount++
	collector.last = sanitizeAIValue(payload, "")
	record, _ := payload.(map[string]any)
	if eventName == "" {
		eventName = aiTaskStringValue(record, "type")
	}
	if eventName == "" {
		eventName = "message"
	}
	collector.eventTypes[eventName]++
	appendAIStreamText(&collector.output, record)
	if value, ok := record["usage"]; ok && value != nil {
		collector.usage = sanitizeAIValue(value, "usage")
	}
	if response, ok := record["response"].(map[string]any); ok {
		if value, exists := response["usage"]; exists && value != nil {
			collector.usage = sanitizeAIValue(value, "usage")
		}
	}
	lowerName := strings.ToLower(eventName)
	if strings.HasSuffix(lowerName, ".completed") || lowerName == "completed" {
		collector.final = collector.last
	}
}
