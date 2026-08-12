package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/gin-gonic/gin"
)

func TestAIUsageRoutesRequireCorrectRoles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := New()
	for _, path := range []string{
		"/api/me/ai-usage-summary",
		"/api/me/ai-usage-records",
		"/api/admin/ai-usage-records",
		"/api/admin/ai-usage-export",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		if !strings.Contains(response.Body.String(), `"code":1001`) {
			t.Fatalf("%s body = %s", path, response.Body.String())
		}
	}
}

func TestVolcengineVideoReviewRouteExists(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/volcengine/assets/video-review", nil)
	app.ServeHTTP(recorder, request)

	if recorder.Code == http.StatusNotFound {
		t.Fatalf("video review route returned 404: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"code":1001`) {
		t.Fatalf("video review route did not reach auth middleware: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestXinglianDirectUploadRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, path := range []string{"/api/v1/xinglian/uploads/sign", "/api/v1/xinglian/uploads/complete"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
		app.ServeHTTP(recorder, request)
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("Xinglian upload route missing: %s", path)
		}
		if !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("Xinglian upload route did not reach auth: path=%s body=%s", path, recorder.Body.String())
		}
	}
}

func TestImageUpscaleRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, item := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/image-upscale/capabilities"},
		{http.MethodPost, "/api/v1/image-upscale/jobs"},
		{http.MethodGet, "/api/v1/image-upscale/jobs/job-1"},
		{http.MethodPost, "/api/v1/image-upscale/jobs/job-1/retry"},
	} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(item.method, item.path, nil))
		if recorder.Code == http.StatusNotFound || !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("image upscale route missing auth: %s %s body=%s", item.method, item.path, recorder.Body.String())
		}
	}
}

func TestProjectCacheSelectionRouteRequiresAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/project-cache/projects/p1/package/selection", strings.NewReader(`{"fileIds":["f1"]}`))
	app.ServeHTTP(recorder, request)
	if recorder.Code == http.StatusNotFound {
		t.Fatalf("project cache selection route missing: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"code":1001`) {
		t.Fatalf("project cache selection route did not reach auth: body=%s", recorder.Body.String())
	}
}

func TestUserJimengLoginRoutesRequireAuthAndAdminRoutesAreRemoved(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, path := range []string{"/api/v1/jimeng-login/start", "/api/v1/jimeng-login/check"} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("user jimeng login route missing: %s", path)
		}
		if !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("user jimeng login route did not reach auth: path=%s body=%s", path, recorder.Body.String())
		}
	}
	for _, path := range []string{"/api/admin/settings/jimeng-login/start", "/api/admin/settings/jimeng-login/check"} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, path, nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("admin jimeng login route still exists: path=%s status=%d body=%s", path, recorder.Code, recorder.Body.String())
		}
	}
}

func TestUploadedAssetsUseNoSniffHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})
	if err := os.WriteFile(filepath.Join(config.Cfg.PublicAssetDir, "asset.txt"), []byte("asset"), 0644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app := New()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/uploaded-assets/asset.txt", nil)
	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if header := recorder.Header().Get("X-Content-Type-Options"); header != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", header)
	}
}

func TestWorkflowRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	paths := []string{
		"/api/v1/workflow-runs",
		"/api/v1/workflow-runs/run-1",
		"/api/v1/workflow-runs/run-1/events",
		"/api/v1/workflow-worker/health",
	}
	for _, path := range paths {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("workflow route missing: %s", path)
		}
		if !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("workflow route did not reach auth: path=%s body=%s", path, recorder.Body.String())
		}
	}
}

func TestWorkflowAssetSlotRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, item := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/workflow-stage-runs/stage-1/asset-slots"},
		{http.MethodPut, "/api/v1/workflow-stage-runs/stage-1/asset-slots"},
	} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(item.method, item.path, strings.NewReader(`{}`)))
		if recorder.Code == http.StatusNotFound || !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("workflow asset-slot route missing auth: %s %s body=%s", item.method, item.path, recorder.Body.String())
		}
	}
}

func TestWorkflowRegistryRoutesRequireAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/workflows?projectId=project-1"},
		{http.MethodPost, "/api/v1/workflows"},
		{http.MethodGet, "/api/v1/workflows/workflow-1?projectId=project-1"},
		{http.MethodPost, "/api/v1/workflows/workflow-1/copy"},
		{http.MethodPost, "/api/v1/workflows/workflow-1/versions"},
		{http.MethodGet, "/api/v1/workflow-versions/version-1"},
		{http.MethodPatch, "/api/v1/workflow-versions/version-1"},
		{http.MethodPost, "/api/v1/workflow-versions/version-1/validate"},
		{http.MethodPost, "/api/v1/workflow-versions/version-1/preview"},
		{http.MethodPost, "/api/v1/workflow-versions/version-1/publish"},
		{http.MethodPut, "/api/v1/workflows/workflow-1/recommended-version"},
		{http.MethodPost, "/api/v1/workflow-executions/preflight"},
		{http.MethodGet, "/api/v1/workflow-executions/execution-1"},
		{http.MethodPost, "/api/v1/workflow-executions/execution-1/confirm"},
		{http.MethodPost, "/api/v1/workflow-executions/execution-1/continue"},
		{http.MethodPost, "/api/v1/workflow-executions/execution-1/cancel"},
	}
	for _, route := range routes {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(route.method, route.path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("workflow registry route missing: %s %s", route.method, route.path)
		}
		if !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("workflow registry route did not reach auth: %s %s body=%s", route.method, route.path, recorder.Body.String())
		}
	}
}

func TestProjectSkillManagementRoutesAreRemoved(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	routes := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/skills"},
		{http.MethodGet, "/api/v1/skill-stage-templates"},
		{http.MethodPost, "/api/v1/skills/import-folder"},
		{http.MethodPost, "/api/v1/skills"},
		{http.MethodPatch, "/api/v1/skills/skill-1"},
		{http.MethodDelete, "/api/v1/skills/skill-1"},
		{http.MethodPost, "/api/v1/skills/skill-1/copy"},
		{http.MethodPost, "/api/v1/skills/skill-1/versions"},
		{http.MethodPost, "/api/v1/skills/skill-1/import-version"},
		{http.MethodGet, "/api/v1/skill-versions/version-1"},
		{http.MethodPatch, "/api/v1/skill-versions/version-1"},
		{http.MethodDelete, "/api/v1/skill-versions/version-1"},
		{http.MethodGet, "/api/v1/skill-versions/version-1/source-files"},
		{http.MethodGet, "/api/v1/skill-versions/version-1/source-file"},
		{http.MethodPost, "/api/v1/skill-versions/version-1/validate"},
		{http.MethodPost, "/api/v1/skill-versions/version-1/evaluations"},
		{http.MethodPost, "/api/v1/skill-versions/version-1/trials"},
		{http.MethodPost, "/api/v1/skill-versions/version-1/publish"},
		{http.MethodPost, "/api/v1/skill-versions/version-1/archive"},
		{http.MethodGet, "/api/v1/skill-trials/trial-1"},
		{http.MethodPut, "/api/v1/skills/skill-1/recommended-version"},
	}
	for _, route := range routes {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(route.method, route.path, nil))
		if recorder.Code != http.StatusNotFound {
			t.Fatalf("project Skill management route still exists: %s %s status=%d body=%s", route.method, route.path, recorder.Code, recorder.Body.String())
		}
	}
}

func TestAdminSkillVersionDeleteAndArchiveRoutesRequireAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, route := range []struct{ method, path string }{
		{http.MethodDelete, "/api/v1/admin/skill-versions/version-1"},
		{http.MethodPost, "/api/v1/admin/skill-versions/version-1/archive"},
	} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(route.method, route.path, nil))
		if recorder.Code == http.StatusNotFound || !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("admin Skill route did not reach auth: %s %s status=%d body=%s", route.method, route.path, recorder.Code, recorder.Body.String())
		}
	}
}

func TestSuperAdminRoutesRequireSuperAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, item := range []struct{ method, path string }{
		{http.MethodGet, "/api/admin/admins"},
		{http.MethodPost, "/api/admin/admins/user-1/role"},
	} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(item.method, item.path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("superadmin administrator route is missing: %s %s", item.method, item.path)
		}
		if !strings.Contains(recorder.Body.String(), `"code":1001`) {
			t.Fatalf("administrator route did not reach superadmin auth: %s", recorder.Body.String())
		}
	}
}

func TestAdminUserDetailRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, path := range []string{"/api/admin/users/user-1", "/api/admin/users/user-1/ai-tasks", "/api/admin/users/user-1/credit-logs"} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("admin user detail route missing: %s", path)
		}
	}
}

func TestLoginApprovalRoutesExist(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := New()
	for _, item := range []struct{ method, path string }{{http.MethodGet, "/api/auth/login-approval/status"}, {http.MethodPost, "/api/auth/login-approval/exchange"}, {http.MethodGet, "/api/admin/login-approvals"}, {http.MethodGet, "/api/admin/users/user-1/allowed-ips"}} {
		recorder := httptest.NewRecorder()
		app.ServeHTTP(recorder, httptest.NewRequest(item.method, item.path, nil))
		if recorder.Code == http.StatusNotFound {
			t.Fatalf("login approval route missing: %s", item.path)
		}
	}
}
