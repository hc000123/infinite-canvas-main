package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	loginSessionIdleTimeout     = 7 * 24 * time.Hour
	loginSessionAbsoluteTimeout = 30 * 24 * time.Hour
	loginSessionTouchInterval   = 5 * time.Minute
)

type AuthFailure struct {
	Code   int
	Reason string
	Msg    string
}

type AuthenticatedSession struct {
	User      model.AuthUser
	Session   model.LoginSession
	IPAllowed bool
}

func CreateLoginSession(ctx context.Context, user model.User, boundIP string, ipAllowed bool) (model.AuthSession, error) {
	stamp := time.Now()
	meta := RequestMetaFromContext(ctx)
	deviceName := strings.TrimSpace(meta.DeviceName)
	if deviceName == "" {
		deviceName = truncateBytes(meta.UserAgent, 180)
	}
	item := model.LoginSession{
		ID:                newID("session"),
		UserID:            user.ID,
		Status:            model.LoginSessionActive,
		IPAddress:         strings.TrimSpace(meta.IPAddress),
		UserAgent:         truncateBytes(meta.UserAgent, 512),
		DeviceName:        truncateBytes(deviceName, 180),
		CreatedAt:         stamp.Format(time.RFC3339),
		LastActiveAt:      stamp.Format(time.RFC3339),
		AbsoluteExpiresAt: stamp.Add(loginSessionAbsoluteTimeout).Format(time.RFC3339),
		UpdatedAt:         stamp.Format(time.RFC3339),
	}
	saved, previous, err := repository.ReplaceLoginSession(item, "账号已在其他设备登录")
	if err != nil {
		return model.AuthSession{}, err
	}
	if previous != nil {
		auditMeta := meta
		auditMeta.SessionID = saved.ID
		RecordServerActivity(WithRequestMeta(ctx, auditMeta), user.ID, model.ActivityActionSessionReplaced, model.ActivityResultSuccess, "login_session", previous.ID, user.Username, "新登录已替换旧设备", nil)
	}
	token, err := newTokenWithIPPolicy(user, saved, boundIP, ipAllowed)
	if err != nil {
		_, _, _ = repository.RevokeCurrentLoginSession(user.ID, saved.ID, model.LoginSessionAccountChanged, "", "登录凭证签发失败", now())
		return model.AuthSession{}, err
	}
	return model.AuthSession{Token: token, User: model.PublicUser(user)}, nil
}

func AuthenticateSession(tokenText, ipAddress string) (AuthenticatedSession, *AuthFailure) {
	claims, err := ParseSessionToken(tokenText)
	if err != nil || strings.TrimSpace(claims.SessionID) == "" {
		return AuthenticatedSession{}, invalidSessionFailure()
	}
	user, ok, err := repository.GetUserByID(claims.UserID)
	if err != nil || !ok || user.Status == model.UserStatusBan {
		return AuthenticatedSession{}, invalidSessionFailure()
	}
	session, ok, err := repository.GetLoginSession(claims.SessionID)
	if err != nil || !ok || session.UserID != user.ID {
		return AuthenticatedSession{}, invalidSessionFailure()
	}
	if session.Status != model.LoginSessionActive || user.ActiveSessionID != session.ID {
		return AuthenticatedSession{}, failureForSession(session)
	}
	stamp := time.Now()
	absolute, absoluteErr := time.Parse(time.RFC3339, session.AbsoluteExpiresAt)
	lastActive, activeErr := time.Parse(time.RFC3339, session.LastActiveAt)
	if absoluteErr != nil || activeErr != nil {
		return AuthenticatedSession{}, invalidSessionFailure()
	}
	if !stamp.Before(absolute) {
		expireLoginSession(user, session, model.LoginSessionAbsoluteExpired, model.ActivityActionSessionAbsoluteExpired, "登录状态已达到最长有效期")
		return AuthenticatedSession{}, &AuthFailure{Code: model.AuthCodeSessionExpired, Msg: "为保障账号安全，请重新登录"}
	}
	if stamp.Sub(lastActive) >= loginSessionIdleTimeout {
		expireLoginSession(user, session, model.LoginSessionIdleExpired, model.ActivityActionSessionIdleExpired, "登录状态因长时间未使用失效")
		return AuthenticatedSession{}, &AuthFailure{Code: model.AuthCodeSessionIdleExpired, Msg: "登录状态已过期，请重新登录"}
	}
	if claims.IPAddress != "" && strings.TrimSpace(ipAddress) != "" && claims.IPAddress != strings.TrimSpace(ipAddress) {
		return AuthenticatedSession{}, invalidSessionFailure()
	}
	if stamp.Sub(lastActive) >= loginSessionTouchInterval {
		if err := repository.TouchLoginSession(session.ID, stamp.Format(time.RFC3339), stamp.Format(time.RFC3339)); err != nil {
			log.Printf("touch login session %s: %v", session.ID, err)
		} else {
			session.LastActiveAt = stamp.Format(time.RFC3339)
		}
	}
	return AuthenticatedSession{User: model.PublicUser(user), Session: session, IPAllowed: claims.IPAllowed}, nil
}

func LogoutCurrentSession(ctx context.Context) error {
	user, ok := UserFromContext(ctx)
	meta := RequestMetaFromContext(ctx)
	if !ok || user.ID == "" || meta.SessionID == "" {
		return safeMessageError{message: "登录状态无效"}
	}
	item, changed, err := repository.RevokeCurrentLoginSession(user.ID, meta.SessionID, model.LoginSessionLoggedOut, "", "用户主动退出", now())
	if err != nil {
		return err
	}
	if changed {
		RecordServerActivity(ctx, user.ID, model.ActivityActionLogout, model.ActivityResultSuccess, "login_session", item.ID, user.Username, "退出登录", nil)
	}
	return nil
}

func GetCurrentLoginSession(actor model.AuthUser, targetID string) (model.LoginSessionView, error) {
	target, ok, err := repository.GetUserByID(strings.TrimSpace(targetID))
	if err != nil {
		return model.LoginSessionView{}, err
	}
	if !ok || !canViewLoginSession(actor, target) {
		return model.LoginSessionView{}, safeMessageError{message: "账号不存在或无权查看"}
	}
	item, ok, err := repository.GetActiveLoginSessionForUser(target.ID)
	if err != nil || !ok {
		return model.LoginSessionView{}, err
	}
	return LoginSessionView(item), nil
}

func ForceLogout(ctx context.Context, actor model.AuthUser, targetID, reason string) (model.LoginSessionView, error) {
	reason = strings.TrimSpace(reason)
	if length := len([]rune(reason)); length < 2 || length > 200 {
		return model.LoginSessionView{}, safeMessageError{message: "下线原因需为 2–200 个字符"}
	}
	target, ok, err := repository.GetUserByID(strings.TrimSpace(targetID))
	if err != nil {
		return model.LoginSessionView{}, err
	}
	if !ok || !canForceLogout(actor, target) {
		return model.LoginSessionView{}, safeMessageError{message: "账号不存在或无权强制下线"}
	}
	item, ok, err := repository.GetActiveLoginSessionForUser(target.ID)
	if err != nil || !ok {
		return model.LoginSessionView{}, err
	}
	view := LoginSessionView(item)
	if !view.Online {
		return view, nil
	}
	revoked, changed, err := repository.RevokeCurrentLoginSession(target.ID, item.ID, model.LoginSessionAdminRevoked, actor.ID, reason, now())
	if err != nil {
		return model.LoginSessionView{}, err
	}
	if changed {
		RecordServerActivity(ctx, target.ID, model.ActivityActionSessionForceLogout, model.ActivityResultSuccess, "login_session", item.ID, target.Username, "管理员强制账号下线", map[string]any{"actorId": actor.ID, "reason": reason})
	}
	return LoginSessionView(revoked), nil
}

func RevokeSessionForAccountChange(ctx context.Context, userID, reason string) error {
	target, ok, err := repository.GetUserByID(strings.TrimSpace(userID))
	if err != nil || !ok || target.ActiveSessionID == "" {
		return err
	}
	item, changed, err := repository.RevokeCurrentLoginSession(target.ID, target.ActiveSessionID, model.LoginSessionAccountChanged, "", reason, now())
	if err != nil {
		return err
	}
	if changed {
		RecordServerActivity(ctx, target.ID, model.ActivityActionSessionAccountChanged, model.ActivityResultSuccess, "login_session", item.ID, target.Username, reason, nil)
	}
	return nil
}

func canViewLoginSession(actor model.AuthUser, target model.User) bool {
	if actor.Role == model.UserRoleAdmin {
		return target.Role == model.UserRoleUser
	}
	return actor.Role == model.UserRoleSuperAdmin && (target.Role == model.UserRoleUser || model.IsAdminRole(target.Role))
}

func canForceLogout(actor model.AuthUser, target model.User) bool {
	if actor.Role == model.UserRoleAdmin {
		return target.Role == model.UserRoleUser
	}
	return actor.Role == model.UserRoleSuperAdmin && (target.Role == model.UserRoleUser || target.Role == model.UserRoleAdmin)
}

func LoginSessionView(item model.LoginSession) model.LoginSessionView {
	view := model.LoginSessionView{Status: item.Status, IPAddress: item.IPAddress, DeviceName: item.DeviceName, CreatedAt: item.CreatedAt, LastActiveAt: item.LastActiveAt, AbsoluteExpiresAt: item.AbsoluteExpiresAt}
	if item.Status != model.LoginSessionActive {
		return view
	}
	stamp := time.Now()
	absolute, absoluteErr := time.Parse(time.RFC3339, item.AbsoluteExpiresAt)
	lastActive, activeErr := time.Parse(time.RFC3339, item.LastActiveAt)
	view.Online = absoluteErr == nil && activeErr == nil && stamp.Before(absolute) && stamp.Sub(lastActive) < loginSessionIdleTimeout
	return view
}

func HydrateLoginSessionViews(users []model.User) error {
	ids := make([]string, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.ID)
	}
	sessions, err := repository.ListActiveLoginSessionsForUsers(ids)
	if err != nil {
		return err
	}
	for i := range users {
		if item, ok := sessions[users[i].ID]; ok && item.ID == users[i].ActiveSessionID {
			users[i].Session = LoginSessionView(item)
		}
	}
	return nil
}

func failureForSession(item model.LoginSession) *AuthFailure {
	switch item.Status {
	case model.LoginSessionReplaced:
		return &AuthFailure{Code: model.AuthCodeSessionReplaced, Msg: "账号已在其他设备登录，请重新登录"}
	case model.LoginSessionAdminRevoked:
		return &AuthFailure{Code: model.AuthCodeSessionRevoked, Reason: item.RevokeReason, Msg: "账号已被管理员下线"}
	case model.LoginSessionIdleExpired:
		return &AuthFailure{Code: model.AuthCodeSessionIdleExpired, Msg: "登录状态已过期，请重新登录"}
	case model.LoginSessionAbsoluteExpired:
		return &AuthFailure{Code: model.AuthCodeSessionExpired, Msg: "为保障账号安全，请重新登录"}
	default:
		return invalidSessionFailure()
	}
}

func invalidSessionFailure() *AuthFailure {
	return &AuthFailure{Code: model.AuthCodeSessionInvalid, Msg: "登录状态无效，请重新登录"}
}

func expireLoginSession(user model.User, item model.LoginSession, status model.LoginSessionStatus, action model.ActivityAction, summary string) {
	_, changed, err := repository.RevokeCurrentLoginSession(user.ID, item.ID, status, "", summary, now())
	if err != nil {
		log.Printf("expire login session %s: %v", item.ID, err)
		return
	}
	if changed {
		ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: item.IPAddress, UserAgent: item.UserAgent, SessionID: item.ID, IPAllowed: true})
		RecordServerActivity(ctx, user.ID, action, model.ActivityResultSuccess, "login_session", item.ID, user.Username, summary, nil)
	}
}
