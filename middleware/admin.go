package middleware

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/handler"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
	"github.com/gin-gonic/gin"
)

func RequestMeta(c *gin.Context) {
	meta := service.RequestMeta{IPAddress: c.ClientIP(), UserAgent: c.Request.UserAgent(), IPAllowed: true}
	c.Request = c.Request.WithContext(service.WithRequestMeta(c.Request.Context(), meta))
	c.Next()
}

func AuditAIToolUse(c *gin.Context) {
	c.Next()
	if c.IsAborted() {
		return
	}
	if user, ok := service.UserFromContext(c.Request.Context()); ok {
		service.RecordServerActivity(c.Request.Context(), user.ID, model.ActivityActionAISubmitted, model.ActivityResultSuccess, "api", c.Request.URL.Path, "AI 工具", "使用 AI 工具", nil)
	}
}

func AdminAuth(c *gin.Context) {
	user, ok := authUser(c)
	if !ok || !model.IsAdminRole(user.Role) {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func SuperAdminAuth(c *gin.Context) {
	user, ok := authUser(c)
	if !ok || !model.IsSuperAdminRole(user.Role) {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func UserAuth(c *gin.Context) {
	user, ok := authUser(c)
	if !ok || user.Role == model.UserRoleGuest {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func OptionalAuth(c *gin.Context) {
	if user, ok := authUser(c); ok {
		c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	}
	c.Next()
}

func NotFoundJSON(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{"code": 1, "data": nil, "msg": "接口不存在"})
}

func authUser(c *gin.Context) (model.AuthUser, bool) {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if strings.TrimSpace(token) == "" {
		return model.AuthUser{}, false
	}
	user, ok := service.CurrentAuthUserForRequest(token, c.ClientIP())
	if ok {
		if claims, err := service.ParseToken(token); err == nil && claims.IPAddress != "" {
			meta := service.RequestMetaFromContext(c.Request.Context())
			meta.IPAllowed = claims.IPAllowed
			c.Request = c.Request.WithContext(service.WithRequestMeta(c.Request.Context(), meta))
		}
	}
	return user, ok
}
