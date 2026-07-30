package service

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func ListAdminAccounts(actor model.AuthUser, q model.AdminAccountQuery) (model.UserList, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.UserList{}, safeMessageError{message: "需要超级管理员权限"}
	}
	users, total, err := repository.ListAdminAccounts(q)
	if err != nil {
		return model.UserList{}, err
	}
	for i := range users {
		users[i].Password = ""
		normalizeUserDefaults(&users[i])
	}
	return model.UserList{Items: users, Total: int(total)}, nil
}

func CreateAdminAccount(actor model.AuthUser, input model.AdminAccountUpdate, password string) (model.User, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "需要超级管理员权限"}
	}
	if !model.IsAdminRole(input.Role) {
		return model.User{}, safeMessageError{message: "管理员角色无效"}
	}
	if strings.TrimSpace(password) == "" {
		return model.User{}, safeMessageError{message: "密码不能为空"}
	}
	user := model.User{Username: input.Username, DisplayName: input.DisplayName, Email: input.Email, Role: input.Role, Status: input.Status}
	return saveUser(user, password)
}

func UpdateAdminAccount(actor model.AuthUser, id string, input model.AdminAccountUpdate) (model.User, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "需要超级管理员权限"}
	}
	if !model.IsAdminRole(input.Role) {
		return model.User{}, safeMessageError{message: "管理员角色无效"}
	}
	saved, ok, err := repository.GetUserByID(id)
	if err != nil {
		return model.User{}, err
	}
	if !ok || !model.IsAdminRole(saved.Role) {
		return model.User{}, safeMessageError{message: "管理员不存在"}
	}
	username := strings.TrimSpace(input.Username)
	if username == "" || strings.ContainsAny(username, " \t\r\n") {
		return model.User{}, safeMessageError{message: "用户名不能为空且不能包含空格"}
	}
	if existing, found, err := repository.GetUserByUsername(username); err != nil {
		return model.User{}, err
	} else if found && existing.ID != id {
		return model.User{}, safeMessageError{message: "用户名已存在"}
	}
	if input.Status == "" {
		input.Status = model.UserStatusActive
	}
	target := saved
	target.Username = username
	target.DisplayName = strings.TrimSpace(input.DisplayName)
	target.Email = strings.TrimSpace(input.Email)
	target.Role = input.Role
	target.Status = input.Status
	target.UpdatedAt = now()
	removesActiveSuper := input.Role != model.UserRoleSuperAdmin || input.Status != model.UserStatusActive
	target, err = repository.UpdatePrivilegedUser(actor.ID, target, removesActiveSuper)
	target.Password = ""
	return target, err
}

func ChangeAdminAccountRole(ctx context.Context, actor model.AuthUser, id string, role model.UserRole) (model.User, error) {
	if !model.IsSuperAdminRole(actor.Role) {
		return model.User{}, safeMessageError{message: "需要超级管理员权限"}
	}
	if role != model.UserRoleAdmin && role != model.UserRoleUser {
		return model.User{}, safeMessageError{message: "目标角色无效"}
	}
	account, ok, err := repository.GetUserByID(actor.ID)
	if err != nil {
		return model.User{}, err
	}
	if !ok || account.Role != model.UserRoleSuperAdmin || account.Status != model.UserStatusActive {
		return model.User{}, safeMessageError{message: "超级管理员不存在或权限已变化"}
	}
	target, ok, err := repository.GetUserByID(strings.TrimSpace(id))
	if err != nil {
		return model.User{}, err
	}
	if !ok {
		return model.User{}, safeMessageError{message: "账号不存在"}
	}
	if target.ID == account.ID {
		return model.User{}, safeMessageError{message: "不能修改自己的管理员角色"}
	}
	if target.Role == role {
		return model.User{}, safeMessageError{message: "账号已经是目标角色"}
	}
	if !((target.Role == model.UserRoleUser && role == model.UserRoleAdmin) || (target.Role == model.UserRoleAdmin && role == model.UserRoleUser)) {
		return model.User{}, safeMessageError{message: "不支持该角色转换"}
	}
	stamp := now()
	requestMeta := RequestMetaFromContext(ctx)
	if requestMeta.IPAddress == "" {
		requestMeta.IPAllowed = true
	}
	metadata, _ := json.Marshal(map[string]string{"actorId": account.ID, "fromRole": string(target.Role), "toRole": string(role)})
	summary := "普通用户已提升为管理员"
	if role == model.UserRoleUser {
		summary = "管理员已降为普通用户"
	}
	updated, err := repository.ChangeUserRole(model.AdminRoleChangeInput{
		ActorID: account.ID, TargetID: target.ID, FromRole: target.Role, ToRole: role, UpdatedAt: stamp,
		Activity: model.UserActivityLog{
			ID: newID("activity"), UserID: target.ID, Category: model.ActivityCategorySecurity, Action: model.ActivityActionAdminRoleChanged,
			Result: model.ActivityResultSuccess, TargetType: "user", TargetID: target.ID, TargetName: target.Username, Summary: summary,
			IPAddress: requestMeta.IPAddress, IPAllowed: requestMeta.IPAllowed, SessionID: requestMeta.SessionID, LoginApprovalID: requestMeta.LoginApprovalID,
			UserAgent: truncateBytes(requestMeta.UserAgent, 512), Metadata: string(metadata), CreatedAt: stamp,
		},
	})
	updated.Password = ""
	return updated, err
}

func ResetAdminAccountPassword(actor model.AuthUser, id string, password string) error {
	if !model.IsSuperAdminRole(actor.Role) {
		return safeMessageError{message: "需要超级管理员权限"}
	}
	if strings.TrimSpace(password) == "" {
		return safeMessageError{message: "密码不能为空"}
	}
	target, ok, err := repository.GetUserByID(id)
	if err != nil {
		return err
	}
	if !ok || !model.IsAdminRole(target.Role) {
		return safeMessageError{message: "管理员不存在"}
	}
	target.Password, err = hashPassword(password)
	if err != nil {
		return err
	}
	target.UpdatedAt = now()
	_, err = repository.UpdatePrivilegedUser(actor.ID, target, false)
	return err
}

func DeleteAdminAccount(actor model.AuthUser, id string) error {
	if !model.IsSuperAdminRole(actor.Role) {
		return safeMessageError{message: "需要超级管理员权限"}
	}
	return repository.DeletePrivilegedUser(actor.ID, id)
}
