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

func TestLoadWorkflowWorkerConfig(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "safe-admin-password")
	t.Setenv("JWT_SECRET", "safe-jwt-secret")
	t.Setenv("WORKFLOW_WORKER_ENABLED", "true")
	t.Setenv("WORKFLOW_WORKER_CONCURRENCY", "3")
	t.Setenv("WORKFLOW_WORKER_USER_CONCURRENCY", "1")
	t.Setenv("WORKFLOW_WORKER_POLL_MS", "750")
	t.Setenv("WORKFLOW_WORKER_LEASE_SECONDS", "45")

	if err := Load(); err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if !Cfg.WorkflowWorkerEnabled || Cfg.WorkflowWorkerConcurrency != 3 || Cfg.WorkflowWorkerUserConcurrency != 1 || Cfg.WorkflowWorkerPollMS != 750 || Cfg.WorkflowWorkerLeaseSeconds != 45 {
		t.Fatalf("worker config=%#v", Cfg)
	}
}

func TestLoadImageUpscaleConfig(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "safe-admin-password")
	t.Setenv("JWT_SECRET", "safe-jwt-secret")
	t.Setenv("IMAGE_UPSCALE_PROVIDER", " aliyun ")
	t.Setenv("IMAGE_UPSCALE_WORK_DIR", " data/custom-upscale ")
	t.Setenv("ALIBABA_CLOUD_ACCESS_KEY_ID", " test-key ")
	t.Setenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", " test-secret ")

	if err := Load(); err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if Cfg.ImageUpscaleProvider != "aliyun" || Cfg.ImageUpscaleWorkDir != "data/custom-upscale" || Cfg.AlibabaCloudAccessKeyID != "test-key" || Cfg.AlibabaCloudAccessKeySecret != "test-secret" {
		t.Fatalf("image upscale config=%#v", Cfg)
	}
}
