package config

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"os"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	Port                          string   `env:"PORT" envDefault:"8080"`
	AdminUsername                 string   `env:"ADMIN_USERNAME" envDefault:"admin"`
	AdminPassword                 string   `env:"ADMIN_PASSWORD" envDefault:"infinite-canvas"`
	JWTSecret                     string   `env:"JWT_SECRET" envDefault:"infinite-canvas"`
	TrustedProxies                []string `env:"TRUSTED_PROXIES" envSeparator:","`
	StorageDriver                 string   `env:"STORAGE_DRIVER" envDefault:"sqlite"`
	DatabaseDSN                   string   `env:"DATABASE_DSN" envDefault:"data/infinite-canvas.db"`
	PublicAssetDir                string   `env:"PUBLIC_ASSET_DIR" envDefault:"data/public-assets"`
	ProjectCacheDir               string   `env:"PROJECT_CACHE_DIR" envDefault:"data/project-cache"`
	WorkflowWorkerEnabled         bool     `env:"WORKFLOW_WORKER_ENABLED" envDefault:"true"`
	WorkflowWorkerConcurrency     int      `env:"WORKFLOW_WORKER_CONCURRENCY" envDefault:"2"`
	WorkflowWorkerUserConcurrency int      `env:"WORKFLOW_WORKER_USER_CONCURRENCY" envDefault:"1"`
	WorkflowWorkerPollMS          int      `env:"WORKFLOW_WORKER_POLL_MS" envDefault:"2000"`
	WorkflowWorkerLeaseSeconds    int      `env:"WORKFLOW_WORKER_LEASE_SECONDS" envDefault:"60"`
	WorkflowLocalMediaDir         string   `env:"WORKFLOW_LOCAL_MEDIA_DIR" envDefault:"data/workflow-media"`
	ImageUpscaleProvider          string   `env:"IMAGE_UPSCALE_PROVIDER" envDefault:"aliyun"`
	ImageUpscaleWorkDir           string   `env:"IMAGE_UPSCALE_WORK_DIR" envDefault:"data/image-upscale"`
	VideoUpscaleWorkDir           string   `env:"VIDEO_UPSCALE_WORK_DIR" envDefault:"data/video-upscale"`
	AlibabaCloudAccessKeyID       string   `env:"ALIBABA_CLOUD_ACCESS_KEY_ID"`
	AlibabaCloudAccessKeySecret   string   `env:"ALIBABA_CLOUD_ACCESS_KEY_SECRET"`
	AlibabaCloudSecurityToken     string   `env:"ALIBABA_CLOUD_SECURITY_TOKEN"`
	LinuxDoAuthorizeURL           string   `env:"LINUX_DO_AUTHORIZE_URL" envDefault:"https://connect.linux.do/oauth2/authorize"`
	LinuxDoTokenURL               string   `env:"LINUX_DO_TOKEN_URL" envDefault:"https://connect.linux.do/oauth2/token"`
	LinuxDoUserInfoURL            string   `env:"LINUX_DO_USERINFO_URL" envDefault:"https://connect.linux.do/api/user"`
}

var Cfg Config

func Load() error {
	_ = godotenv.Load()
	if err := env.Parse(&Cfg); err != nil {
		return err
	}
	Cfg.PublicAssetDir = strings.TrimSpace(Cfg.PublicAssetDir)
	Cfg.ProjectCacheDir = strings.TrimSpace(Cfg.ProjectCacheDir)
	for i := range Cfg.TrustedProxies {
		Cfg.TrustedProxies[i] = strings.TrimSpace(Cfg.TrustedProxies[i])
	}
	if Cfg.PublicAssetDir == "" {
		Cfg.PublicAssetDir = "data/public-assets"
	}
	if Cfg.ProjectCacheDir == "" {
		Cfg.ProjectCacheDir = "data/project-cache"
	}
	if strings.TrimSpace(Cfg.AdminPassword) == "change-me-admin-password" {
		return errors.New("ADMIN_PASSWORD is still an example placeholder")
	}
	if isProductionMode() && strings.TrimSpace(Cfg.AdminUsername) == "admin" && strings.TrimSpace(Cfg.AdminPassword) == "infinite-canvas" {
		return errors.New("ADMIN_USERNAME and ADMIN_PASSWORD must be changed before production deployment")
	}
	if strings.TrimSpace(Cfg.JWTSecret) == "change-me-jwt-secret" {
		return errors.New("JWT_SECRET is still an example placeholder")
	}
	if strings.TrimSpace(Cfg.JWTSecret) == "" || Cfg.JWTSecret == "infinite-canvas" {
		secret, err := randomSecret()
		if err != nil {
			return err
		}
		Cfg.JWTSecret = secret
	}
	Cfg.WorkflowLocalMediaDir = strings.TrimSpace(Cfg.WorkflowLocalMediaDir)
	if Cfg.WorkflowLocalMediaDir == "" {
		Cfg.WorkflowLocalMediaDir = "data/workflow-media"
	}
	Cfg.ImageUpscaleProvider = strings.ToLower(strings.TrimSpace(Cfg.ImageUpscaleProvider))
	Cfg.ImageUpscaleWorkDir = strings.TrimSpace(Cfg.ImageUpscaleWorkDir)
	Cfg.VideoUpscaleWorkDir = strings.TrimSpace(Cfg.VideoUpscaleWorkDir)
	Cfg.AlibabaCloudAccessKeyID = strings.TrimSpace(Cfg.AlibabaCloudAccessKeyID)
	Cfg.AlibabaCloudAccessKeySecret = strings.TrimSpace(Cfg.AlibabaCloudAccessKeySecret)
	Cfg.AlibabaCloudSecurityToken = strings.TrimSpace(Cfg.AlibabaCloudSecurityToken)
	if Cfg.ImageUpscaleProvider == "" {
		Cfg.ImageUpscaleProvider = "aliyun"
	}
	if Cfg.ImageUpscaleWorkDir == "" {
		Cfg.ImageUpscaleWorkDir = "data/image-upscale"
	}
	if Cfg.VideoUpscaleWorkDir == "" {
		Cfg.VideoUpscaleWorkDir = "data/video-upscale"
	}
	return nil
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func isProductionMode() bool {
	for _, key := range []string{"GIN_MODE", "APP_ENV", "GO_ENV", "NODE_ENV"} {
		value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
		if value == "release" || value == "production" {
			return true
		}
	}
	return false
}
