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
	deviceName := strings.TrimSpace(strings.Join([]string{strings.Trim(strings.TrimSpace(c.GetHeader("Sec-CH-UA-Platform")), `"`), strings.TrimSpace(c.GetHeader("Sec-CH-UA"))}, " · "))
	deviceName = strings.Trim(deviceName, " ·")
	meta := service.RequestMeta{IPAddress: c.ClientIP(), UserAgent: c.Request.UserAgent(), DeviceName: deviceName, IPAllowed: true}
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
	user, failure := authUser(c)
	if failure != nil {
		failAuth(c, failure)
		return
	}
	if !model.IsAdminRole(user.Role) {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func SuperAdminAuth(c *gin.Context) {
	user, failure := authUser(c)
	if failure != nil {
		failAuth(c, failure)
		return
	}
	if !model.IsSuperAdminRole(user.Role) {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func UserAuth(c *gin.Context) {
	user, failure := authUser(c)
	if failure != nil {
		failAuth(c, failure)
		return
	}
	if user.Role == model.UserRoleGuest {
		handler.Fail(c.Writer, "未登录或权限不足")
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func OptionalAuth(c *gin.Context) {
	if strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")) == "" {
		c.Next()
		return
	}
	user, failure := authUser(c)
	if failure != nil {
		failAuth(c, failure)
		return
	}
	c.Request = c.Request.WithContext(service.WithUser(c.Request.Context(), user))
	c.Next()
}

func NotFoundJSON(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{"code": 1, "data": nil, "msg": "接口不存在"})
}

func authUser(c *gin.Context) (model.AuthUser, *service.AuthFailure) {
	token := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	if strings.TrimSpace(token) == "" {
		return model.AuthUser{}, &service.AuthFailure{Code: model.AuthCodeSessionInvalid, Msg: "请先登录"}
	}
	authenticated, failure := service.AuthenticateSession(token, c.ClientIP())
	if failure != nil {
		return model.AuthUser{}, failure
	}
	meta := service.RequestMetaFromContext(c.Request.Context())
	meta.SessionID = authenticated.Session.ID
	meta.IPAllowed = authenticated.IPAllowed
	c.Request = c.Request.WithContext(service.WithRequestMeta(c.Request.Context(), meta))
	return authenticated.User, nil
}

func failAuth(c *gin.Context, failure *service.AuthFailure) {
	data := map[string]string{}
	if failure.Reason != "" {
		data["reason"] = failure.Reason
	}
	handler.FailCode(c.Writer, failure.Code, data, failure.Msg)
	c.Abort()
}
