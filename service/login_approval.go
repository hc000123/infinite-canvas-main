package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func LoginWithRequest(ctx context.Context, username, password string) (model.LoginResult, error) {
	username = strings.TrimSpace(username)
	user, ok, err := repository.GetUserByUsername(username)
	if err != nil {
		return model.LoginResult{}, err
	}
	if !ok || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		RecordServerActivity(ctx, func() string {
			if ok {
				return user.ID
			}
			return ""
		}(), model.ActivityActionLoginFailed, model.ActivityResultFailed, "account", "", username, "登录失败", map[string]any{"username": truncateRunes(username, 120)})
		return model.LoginResult{}, safeMessageError{message: "用户名或密码错误"}
	}
	if user.Status == model.UserStatusBan {
		return model.LoginResult{}, safeMessageError{message: "账号已被禁用"}
	}
	meta := RequestMetaFromContext(ctx)
	if user.Role == model.UserRoleUser && user.IPApprovalEnabled {
		allowed, err := ListAllowedIPPrefixes(user.ID)
		if err != nil {
			return model.LoginResult{}, err
		}
		if !IPMatchesPrefixes(meta.IPAddress, allowed) {
			return createPendingLoginApproval(ctx, user)
		}
	}
	return authenticatedLogin(ctx, user, true)
}

func createPendingLoginApproval(ctx context.Context, user model.User) (model.LoginResult, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return model.LoginResult{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(secret)
	meta := RequestMetaFromContext(ctx)
	expires := time.Now().Add(10 * time.Minute).Format(time.RFC3339)
	item, err := repository.SaveLoginApproval(model.LoginApproval{ID: newID("approval"), UserID: user.ID, RequestedIP: meta.IPAddress, UserAgent: truncateBytes(meta.UserAgent, 512), TokenHash: hashApprovalToken(token), Status: model.LoginApprovalPending, ExpiresAt: expires, CreatedAt: now()})
	if err != nil {
		return model.LoginResult{}, err
	}
	RecordServerActivity(ctx, user.ID, model.ActivityActionApprovalCreated, model.ActivityResultSuccess, "login_approval", item.ID, user.Username, "白名单外登录等待审批", nil)
	return model.LoginResult{Status: "pending", Approval: model.LoginApprovalClient{ID: item.ID, Token: token, Status: string(item.Status), ExpiresAt: item.ExpiresAt, IPAddress: item.RequestedIP}}, nil
}

func authenticatedLogin(ctx context.Context, user model.User, ipAllowed bool) (model.LoginResult, error) {
	normalizeUserDefaults(&user)
	user.LastLoginAt = now()
	user.UpdatedAt = now()
	saved, err := repository.SaveUser(user)
	if err != nil {
		return model.LoginResult{}, err
	}
	boundIP := ""
	if saved.Role == model.UserRoleUser && saved.IPApprovalEnabled {
		boundIP = RequestMetaFromContext(ctx).IPAddress
	}
	session, err := newSessionWithIPPolicy(saved, boundIP, ipAllowed)
	if err != nil {
		return model.LoginResult{}, err
	}
	meta := RequestMetaFromContext(ctx)
	meta.IPAllowed = ipAllowed
	ctx = WithRequestMeta(ctx, meta)
	RecordServerActivity(ctx, user.ID, model.ActivityActionLoginSucceeded, model.ActivityResultSuccess, "account", user.ID, user.Username, "登录成功", nil)
	return model.LoginResult{Status: "authenticated", Session: session}, nil
}

func LoginApprovalStatus(id, token string) (model.LoginApprovalClient, error) {
	item, ok, err := repository.GetLoginApproval(strings.TrimSpace(id))
	if errors.Is(err, gorm.ErrRecordNotFound) || !ok || item.TokenHash != hashApprovalToken(token) {
		return model.LoginApprovalClient{}, safeMessageError{message: "审批请求不存在"}
	}
	if err != nil {
		return model.LoginApprovalClient{}, err
	}
	status := item.Status
	if status == model.LoginApprovalPending && item.ExpiresAt <= now() {
		status = model.LoginApprovalExpired
	}
	return model.LoginApprovalClient{ID: item.ID, Status: string(status), ExpiresAt: item.ExpiresAt, IPAddress: item.RequestedIP}, nil
}

func ExchangeLoginApproval(ctx context.Context, id, token string) (model.LoginResult, error) {
	item, ok, err := repository.GetLoginApproval(strings.TrimSpace(id))
	if err != nil || !ok || item.TokenHash != hashApprovalToken(token) {
		return model.LoginResult{}, safeMessageError{message: "审批凭证无效"}
	}
	if item.Status != model.LoginApprovalApproved || item.ExpiresAt <= now() {
		return model.LoginResult{}, safeMessageError{message: "审批尚未通过或已过期"}
	}
	if ip := RequestMetaFromContext(ctx).IPAddress; ip == "" || ip != item.RequestedIP {
		return model.LoginResult{}, safeMessageError{message: "登录 IP 已变化，请重新申请"}
	}
	consumed, err := repository.ConsumeLoginApproval(item.ID, item.TokenHash, now())
	if err != nil || !consumed {
		return model.LoginResult{}, safeMessageError{message: "审批凭证已使用"}
	}
	user, ok, err := repository.GetUserByID(item.UserID)
	if err != nil || !ok {
		return model.LoginResult{}, safeMessageError{message: "用户不存在"}
	}
	return authenticatedLogin(ctx, user, item.Scope == model.LoginApprovalScopeWhitelist)
}

func DecideUserLoginApproval(actor model.AuthUser, id string, approve bool, scope model.LoginApprovalScope) (model.LoginApproval, error) {
	if !model.IsAdminRole(actor.Role) {
		return model.LoginApproval{}, safeMessageError{message: "权限不足"}
	}
	status := model.LoginApprovalRejected
	if approve {
		status = model.LoginApprovalApproved
		if scope != model.LoginApprovalScopeWhitelist {
			scope = model.LoginApprovalScopeOnce
		}
	} else {
		scope = ""
	}
	item, ok, err := repository.DecideLoginApproval(id, status, scope, actor.ID, now())
	if err != nil || !ok {
		return item, safeMessageError{message: "审批请求已处理"}
	}
	if approve && scope == model.LoginApprovalScopeWhitelist {
		normalized, err := NormalizeIPPrefix(item.RequestedIP)
		if err != nil {
			return item, err
		}
		_, err = repository.SaveUserAllowedIP(model.UserAllowedIP{ID: newID("allowedip"), UserID: item.UserID, CIDR: normalized, CreatedBy: actor.ID, CreatedAt: now()})
		if err != nil {
			return item, err
		}
	}
	return item, nil
}

func ListAllowedIPPrefixes(userID string) ([]string, error) {
	items, err := repository.ListUserAllowedIPs(userID)
	result := make([]string, len(items))
	for i := range items {
		result[i] = items[i].CIDR
	}
	return result, err
}

func ListAdminLoginApprovals(actor model.AuthUser, q model.LoginApprovalQuery) (model.LoginApprovalList, error) {
	if !model.IsAdminRole(actor.Role) {
		return model.LoginApprovalList{}, safeMessageError{message: "权限不足"}
	}
	items, total, err := repository.ListLoginApprovals(q)
	if err != nil {
		return model.LoginApprovalList{}, err
	}
	ids := make([]string, len(items))
	for i := range items {
		ids[i] = items[i].UserID
	}
	users, err := repository.ListUserSummariesByIDs(ids)
	if err != nil {
		return model.LoginApprovalList{}, err
	}
	for i := range items {
		items[i].User = users[items[i].UserID]
	}
	return model.LoginApprovalList{Items: items, Total: int(total)}, nil
}

func ListAdminUserAllowedIPs(actor model.AuthUser, userID string) ([]model.UserAllowedIP, error) {
	if !model.IsAdminRole(actor.Role) {
		return nil, safeMessageError{message: "权限不足"}
	}
	return repository.ListUserAllowedIPs(userID)
}
func AddAdminUserAllowedIP(actor model.AuthUser, userID, value string) (model.UserAllowedIP, error) {
	if !model.IsAdminRole(actor.Role) {
		return model.UserAllowedIP{}, safeMessageError{message: "权限不足"}
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok || user.Role != model.UserRoleUser {
		return model.UserAllowedIP{}, safeMessageError{message: "用户不存在"}
	}
	cidr, err := NormalizeIPPrefix(value)
	if err != nil {
		return model.UserAllowedIP{}, err
	}
	return repository.SaveUserAllowedIP(model.UserAllowedIP{ID: newID("allowedip"), UserID: userID, CIDR: cidr, CreatedBy: actor.ID, CreatedAt: now()})
}
func DeleteAdminUserAllowedIP(actor model.AuthUser, userID, id string) error {
	if !model.IsAdminRole(actor.Role) {
		return safeMessageError{message: "权限不足"}
	}
	return repository.DeleteUserAllowedIP(userID, id)
}
func SetAdminUserIPApproval(actor model.AuthUser, userID string, enabled bool) (model.User, error) {
	if !model.IsAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "权限不足"}
	}
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok || user.Role != model.UserRoleUser {
		return model.User{}, safeMessageError{message: "用户不存在"}
	}
	user.IPApprovalEnabled = enabled
	user.UpdatedAt = now()
	user, err = repository.SaveUser(user)
	user.Password = ""
	return user, err
}
func hashApprovalToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
