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
	Port                string `env:"PORT" envDefault:"8080"`
	AdminUsername       string `env:"ADMIN_USERNAME" envDefault:"admin"`
	AdminPassword       string `env:"ADMIN_PASSWORD" envDefault:"infinite-canvas"`
	JWTSecret           string `env:"JWT_SECRET" envDefault:"infinite-canvas"`
	JWTExpireHours      int    `env:"JWT_EXPIRE_HOURS" envDefault:"168"`
	StorageDriver       string `env:"STORAGE_DRIVER" envDefault:"sqlite"`
	DatabaseDSN         string `env:"DATABASE_DSN" envDefault:"data/infinite-canvas.db"`
	PublicAssetDir      string `env:"PUBLIC_ASSET_DIR" envDefault:"data/public-assets"`
	LinuxDoAuthorizeURL string `env:"LINUX_DO_AUTHORIZE_URL" envDefault:"https://connect.linux.do/oauth2/authorize"`
	LinuxDoTokenURL     string `env:"LINUX_DO_TOKEN_URL" envDefault:"https://connect.linux.do/oauth2/token"`
	LinuxDoUserInfoURL  string `env:"LINUX_DO_USERINFO_URL" envDefault:"https://connect.linux.do/api/user"`
}

var Cfg Config

func Load() error {
	_ = godotenv.Load()
	if err := env.Parse(&Cfg); err != nil {
		return err
	}
	Cfg.PublicAssetDir = strings.TrimSpace(Cfg.PublicAssetDir)
	if Cfg.PublicAssetDir == "" {
		Cfg.PublicAssetDir = "data/public-assets"
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
