package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func TestAdminAndSuperAdminMiddlewareUseRoleHierarchy(t *testing.T) {
	setupMiddlewareTestDB(t)
	gin.SetMode(gin.TestMode)
	app := gin.New()
	app.GET("/admin-only", AdminAuth, func(c *gin.Context) { c.Status(http.StatusNoContent) })
	app.GET("/super-only", SuperAdminAuth, func(c *gin.Context) { c.Status(http.StatusNoContent) })

	admin := saveMiddlewareUser(t, "admin-1", model.UserRoleAdmin)
	superadmin := saveMiddlewareUser(t, "super-1", model.UserRoleSuperAdmin)
	user := saveMiddlewareUser(t, "user-1", model.UserRoleUser)

	assertMiddlewareStatus(t, app, "/admin-only", signedMiddlewareToken(t, admin), http.StatusNoContent)
	assertMiddlewareStatus(t, app, "/admin-only", signedMiddlewareToken(t, superadmin), http.StatusNoContent)
	assertMiddlewareStatus(t, app, "/super-only", signedMiddlewareToken(t, admin), http.StatusOK)
	assertMiddlewareStatus(t, app, "/super-only", signedMiddlewareToken(t, superadmin), http.StatusNoContent)
	assertMiddlewareStatus(t, app, "/admin-only", signedMiddlewareToken(t, user), http.StatusOK)
}

func setupMiddlewareTestDB(t *testing.T) {
	t.Helper()
	oldDriver := config.Cfg.StorageDriver
	oldDSN := config.Cfg.DatabaseDSN
	oldSecret := config.Cfg.JWTSecret
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = filepath.Join(t.TempDir(), "test.db")
	config.Cfg.JWTSecret = "middleware-test-secret"
	repository.ResetForTest()
	t.Cleanup(func() {
		config.Cfg.StorageDriver = oldDriver
		config.Cfg.DatabaseDSN = oldDSN
		config.Cfg.JWTSecret = oldSecret
		repository.ResetForTest()
	})
}

func saveMiddlewareUser(t *testing.T, id string, role model.UserRole) model.User {
	t.Helper()
	user, err := repository.SaveUser(model.User{ID: id, Username: id, Role: role, Status: model.UserStatusActive, AffCode: "aff-" + id, CreatedAt: "2026-07-24T00:00:00Z", UpdatedAt: "2026-07-24T00:00:00Z"})
	if err != nil {
		t.Fatalf("SaveUser(%s): %v", id, err)
	}
	return user
}

func signedMiddlewareToken(t *testing.T, user model.User) string {
	t.Helper()
	session, err := service.CreateLoginSession(context.Background(), user, "", true)
	if err != nil {
		t.Fatalf("CreateLoginSession: %v", err)
	}
	return session.Token
}

func assertMiddlewareStatus(t *testing.T, app http.Handler, path string, token string, want int) {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	app.ServeHTTP(recorder, request)
	if recorder.Code != want {
		t.Fatalf("%s status=%d body=%s want=%d", path, recorder.Code, recorder.Body.String(), want)
	}
}
