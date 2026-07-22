package service

import (
	"testing"
	"time"
)

func TestImageHTTPClientAllowsSlowGeneration(t *testing.T) {
	if AIImageRequestTimeout < 10*time.Minute {
		t.Fatalf("AIImageRequestTimeout = %s, want at least 10m", AIImageRequestTimeout)
	}
	if aiImageHTTPClient.Timeout != AIImageRequestTimeout {
		t.Fatalf("image client timeout = %s, want %s", aiImageHTTPClient.Timeout, AIImageRequestTimeout)
	}
}
