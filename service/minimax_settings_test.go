package service

import (
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestNormalizeModelProtocolKeepsMiniMax(t *testing.T) {
	if got := normalizeModelProtocol(string(model.ModelProtocolMiniMax)); got != "minimax" {
		t.Fatalf("protocol = %q, want minimax", got)
	}
	capabilities := normalizeModelChannelCapabilities(nil, string(model.ModelProtocolMiniMax))
	if !containsNormalizedString(capabilities, "video") {
		t.Fatalf("capabilities = %#v, want video", capabilities)
	}
}
