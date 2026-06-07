package config

import (
	"strings"
	"testing"
)

func TestLoadRejectsExampleJWTSecret(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "safe-admin-password")
	t.Setenv("JWT_SECRET", "change-me-jwt-secret")

	err := Load()
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("Load error = %v, want JWT_SECRET placeholder error", err)
	}
}

func TestLoadRejectsExampleAdminPassword(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "change-me-admin-password")
	t.Setenv("JWT_SECRET", "safe-jwt-secret")

	err := Load()
	if err == nil || !strings.Contains(err.Error(), "ADMIN_PASSWORD") {
		t.Fatalf("Load error = %v, want ADMIN_PASSWORD placeholder error", err)
	}
}

func TestLoadRejectsDefaultAdminCredentialsInProduction(t *testing.T) {
	t.Setenv("GIN_MODE", "release")
	t.Setenv("ADMIN_USERNAME", "admin")
	t.Setenv("ADMIN_PASSWORD", "infinite-canvas")
	t.Setenv("JWT_SECRET", "safe-jwt-secret")

	err := Load()
	if err == nil || !strings.Contains(err.Error(), "ADMIN_USERNAME") {
		t.Fatalf("Load error = %v, want default admin credential error", err)
	}
}
