# Single-Session Login Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every account exactly one server-controlled login session, with new-login replacement, 7-day idle expiry, 30-day absolute expiry, administrator force logout, visible session details, and clear client-side expiry handling.

**Architecture:** Keep JWT as the bearer credential but add a `sessionId` claim and a server-side `login_sessions` table. `users.active_session_id` is the authoritative single-session pointer; every protected request validates both records before loading the user, while the frontend handles stable session error codes in one shared request layer.

**Tech Stack:** Go 1.25, Gin, GORM, JWT v5, SQLite/MySQL/PostgreSQL, Next.js App Router, React, TypeScript, Ant Design, TanStack Query, Zustand.

---

## Scope and execution notes

- The design source is `docs/superpowers/specs/2026-07-30-single-session-login-management-design.md`.
- Preserve all unrelated dirty-worktree changes. Stage and commit only files listed by the active task.
- Project rules say not to run tests, builds, or syntax checks by default. Each task names the exact focused verification command and expected result, but execution must skip those commands unless the user explicitly requests testing or full acceptance.
- Do not use subagents unless the user explicitly requests delegation. Inline execution is the default for this repository.
- Do not add compatibility for JWTs without `sessionId`; after deployment, existing users log in again once.

## File map

**Create**

- `model/login_session.go`: session statuses, persistence model, admin-facing DTO, and auth failure codes.
- `repository/login_session.go`: transactional session creation/replacement, lookup, activity touch, and revocation.
- `repository/login_session_test.go`: persistence and transaction behavior.
- `service/login_session.go`: session lifecycle, expiry decisions, role matrix, and device label normalization.
- `service/login_session_test.go`: service rules and failure reasons.
- `handler/login_session.go`: logout, session detail, and force-logout HTTP handlers.
- `web/src/services/auth-session-events.ts`: one global browser event for session invalidation.
- `web/src/services/auth-session-events.test.mts`: deduplicated invalidation behavior.
- `web/src/app/(admin)/admin/users/[id]/admin-user-session-view.ts`: pure presentation helpers for current login state.
- `web/src/app/(admin)/admin/users/[id]/admin-user-session-view.test.mts`: user session view rules.
- `web/src/app/(admin)/admin/admins/admin-session-view.ts`: privileged-account force-logout visibility rules.
- `web/src/app/(admin)/admin/admins/admin-session-view.test.mts`: superadmin protection rules.

**Modify**

- `model/user.go`: add the internal `ActiveSessionID` pointer and a safe admin-facing session summary.
- `model/user_activity.go`: add session lifecycle audit actions.
- `repository/db.go`: auto-migrate `LoginSession`.
- `repository/user.go`: expose transaction-safe user/session pointer updates as needed.
- `config/config.go`: remove the obsolete fixed JWT-hour setting; session constants become authoritative.
- `service/auth.go`: issue 30-day JWTs containing `sessionId`; validate server sessions.
- `service/login_approval.go`: route every successful login through the new session creator.
- `service/admin_user.go`: return user session data and revoke sessions on security changes.
- `service/admin_account.go`: revoke sessions on password reset, role change, disable, and deletion.
- `service/request_meta.go`: carry the validated session ID and auth failure metadata.
- `middleware/admin.go`: use unified session validation and return stable failure codes.
- `handler/response.go`: support a nonzero integer code plus optional safe failure data.
- `handler/auth.go`: create sessions during registration and expose server-side logout.
- `handler/admin_user.go`: expose normal-user session detail and force logout.
- `handler/admin_account.go`: expose administrator session detail and force logout.
- `router/router.go`: register logout and session-management routes.
- `web/src/services/api/request.ts`: throw structured API errors and emit session-invalid events.
- `web/src/services/api/auth.ts`: add logout and session error types.
- `web/src/services/api/admin.ts`: add session DTO and admin session endpoints.
- `web/src/stores/use-user-store.ts`: add asynchronous logout and global invalidation handling.
- `web/src/app/(user)/login/page.tsx`: show a safe logout/expiry reason from the URL.
- `web/src/app/(user)/user-layout-client.tsx`: subscribe once to session-invalid events.
- `web/src/components/layout/user-status-actions.tsx`: replace client-only logout with server logout.
- `web/src/app/(admin)/admin/layout.tsx`: replace client-only logout with server logout.
- `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`: query and revoke current session.
- `web/src/app/(admin)/admin/users/[id]/page.tsx`: render the current-login card and force-logout modal.
- `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`: label session audit actions.
- `web/src/app/(admin)/admin/users/page.tsx`: show online state and last activity.
- `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`: load sessions and force administrators offline.
- `web/src/app/(admin)/admin/admins/page.tsx`: render login state and force-logout action.
- `docs/backend-database.md`, `docs/api-response.md`, `docs/pending-test.md`, `docs/todo.md`, `CHANGELOG.md`: document the shipped behavior according to repository rules.

### Task 1: Add the persistent login-session model

**Files:**

- Create: `model/login_session.go`
- Create: `repository/login_session.go`
- Create: `repository/login_session_test.go`
- Modify: `model/user.go`
- Modify: `repository/db.go`

- [ ] **Step 1: Write the repository tests first**

Cover replacement and current-pointer behavior:

```go
func TestReplaceLoginSessionLeavesOnlyNewestPointer(t *testing.T) {
    setupRepositoryTestDB(t)
    user := model.User{ID: "user-session", Username: "session-user", Role: model.UserRoleUser, Status: model.UserStatusActive, AffCode: "aff-session"}
    if _, err := SaveUser(user); err != nil {
        t.Fatal(err)
    }

    first := sessionFixture("session-1", user.ID)
    if _, _, err := ReplaceLoginSession(first, "首次登录"); err != nil {
        t.Fatal(err)
    }
    second := sessionFixture("session-2", user.ID)
    if _, previous, err := ReplaceLoginSession(second, "在其他设备登录"); err != nil || previous == nil || previous.ID != first.ID {
        t.Fatal(err)
    }

    savedUser, ok, err := GetUserByID(user.ID)
    if err != nil || !ok || savedUser.ActiveSessionID != second.ID {
        t.Fatalf("user=%#v ok=%v err=%v", savedUser, ok, err)
    }
    replaced, ok, err := GetLoginSession(first.ID)
    if err != nil || !ok || replaced.Status != model.LoginSessionReplaced || replaced.RevokeReason != "在其他设备登录" {
        t.Fatalf("replaced=%#v ok=%v err=%v", replaced, ok, err)
    }
}

func sessionFixture(id, userID string) model.LoginSession {
    return model.LoginSession{
        ID: id, UserID: userID, Status: model.LoginSessionActive,
        IPAddress: "203.0.113.8", UserAgent: "test",
        CreatedAt: "2026-07-30T00:00:00Z",
        LastActiveAt: "2026-07-30T00:00:00Z",
        AbsoluteExpiresAt: "2026-08-29T00:00:00Z",
        UpdatedAt: "2026-07-30T00:00:00Z",
    }
}
```

- [ ] **Step 2: Add the model and integer auth codes**

Create focused types:

```go
package model

type LoginSessionStatus string

const (
    LoginSessionActive          LoginSessionStatus = "active"
    LoginSessionReplaced        LoginSessionStatus = "replaced"
    LoginSessionLoggedOut       LoginSessionStatus = "logged_out"
    LoginSessionAdminRevoked    LoginSessionStatus = "admin_revoked"
    LoginSessionIdleExpired     LoginSessionStatus = "idle_expired"
    LoginSessionAbsoluteExpired LoginSessionStatus = "absolute_expired"
    LoginSessionAccountChanged  LoginSessionStatus = "account_changed"
)

const (
    AuthCodeSessionInvalid     = 1001
    AuthCodeSessionReplaced    = 1002
    AuthCodeSessionRevoked     = 1003
    AuthCodeSessionIdleExpired = 1004
    AuthCodeSessionExpired     = 1005
)

type LoginSession struct {
    ID                string             `json:"id" gorm:"primaryKey"`
    UserID            string             `json:"userId" gorm:"index"`
    Status            LoginSessionStatus `json:"status" gorm:"index"`
    IPAddress         string             `json:"ipAddress"`
    UserAgent         string             `json:"userAgent"`
    DeviceName        string             `json:"deviceName"`
    CreatedAt         string             `json:"createdAt"`
    LastActiveAt      string             `json:"lastActiveAt" gorm:"index"`
    AbsoluteExpiresAt string             `json:"absoluteExpiresAt" gorm:"index"`
    RevokedAt         string             `json:"revokedAt"`
    RevokedBy         string             `json:"revokedBy"`
    RevokeReason      string             `json:"revokeReason"`
    UpdatedAt         string             `json:"updatedAt"`
}

type LoginSessionView struct {
    Online            bool               `json:"online"`
    Status            LoginSessionStatus `json:"status"`
    IPAddress         string             `json:"ipAddress"`
    DeviceName        string             `json:"deviceName"`
    CreatedAt         string             `json:"createdAt"`
    LastActiveAt      string             `json:"lastActiveAt"`
    AbsoluteExpiresAt string             `json:"absoluteExpiresAt"`
}
```

Add this internal field to `model.User`:

```go
ActiveSessionID string `json:"-" gorm:"index"`
```

Add this admin-facing projection to `model.User`:

```go
Session LoginSessionView `json:"session" gorm:"-"`
```

Then add `&model.LoginSession{}` immediately after `&model.User{}` in `repository/db.go`. The internal session ID must not appear in user JSON responses.

- [ ] **Step 3: Implement the repository transaction boundary**

`repository/login_session.go` must provide these exact operations:

```go
func ReplaceLoginSession(item model.LoginSession, replacedReason string) (model.LoginSession, *model.LoginSession, error)
func GetLoginSession(id string) (model.LoginSession, bool, error)
func GetActiveLoginSessionForUser(userID string) (model.LoginSession, bool, error)
func ListLoginSessionsForUsers(userIDs []string) (map[string]model.LoginSession, error)
func TouchLoginSession(id, lastActiveAt, updatedAt string) error
func RevokeCurrentLoginSession(userID, sessionID string, status model.LoginSessionStatus, actorID, reason, at string) (model.LoginSession, bool, error)
```

`ReplaceLoginSession` and `RevokeCurrentLoginSession` must use one GORM transaction. Replacement first loads and updates the currently pointed session, then inserts the new row, then changes `users.active_session_id`; it returns the prior session when one existed so the service can audit replacement without a second query. Revocation must clear the pointer only with:

```go
Where("id = ? AND active_session_id = ?", userID, sessionID).
Update("active_session_id", "")
```

This comparison prevents an older concurrent operation from clearing a newly created session.

- [ ] **Step 4: Focused verification command (only when explicitly requested)**

Run:

```bash
go test ./repository -run 'TestReplaceLoginSession|TestRevokeCurrentLoginSession' -count=1
```

Expected: both repository session tests pass.

- [ ] **Step 5: Commit only this task**

```bash
git add model/login_session.go model/user.go repository/login_session.go repository/login_session_test.go repository/db.go
git commit -m "feat: persist single login sessions"
```

### Task 2: Create and validate server-controlled sessions

**Files:**

- Create: `service/login_session.go`
- Create: `service/login_session_test.go`
- Modify: `config/config.go`
- Modify: `service/auth.go`
- Modify: `service/login_approval.go`
- Modify: `service/request_meta.go`

- [ ] **Step 1: Write failing service tests**

Add tests for new-login replacement, idle expiry, absolute expiry, and activity throttling:

```go
func TestSecondLoginInvalidatesFirstSession(t *testing.T) {
    setupAuthTestDB(t)
    user := savePasswordUserFixture(t, "single-device", model.UserRoleUser)
    ctx := WithRequestMeta(context.Background(), RequestMeta{IPAddress: "203.0.113.8", UserAgent: "Chrome"})
    first, err := LoginWithRequest(ctx, user.Username, "password123")
    if err != nil {
        t.Fatal(err)
    }
    second, err := LoginWithRequest(ctx, user.Username, "password123")
    if err != nil {
        t.Fatal(err)
    }
    if _, failure := AuthenticateSession(first.Session.Token, "203.0.113.8"); failure == nil || failure.Code != model.AuthCodeSessionReplaced {
        t.Fatalf("first failure=%#v", failure)
    }
    if authenticated, failure := AuthenticateSession(second.Session.Token, "203.0.113.8"); failure != nil || authenticated.User.ID != user.ID {
        t.Fatalf("authenticated=%#v failure=%#v", authenticated, failure)
    }
}
```

Use repository updates to set `LastActiveAt` to more than 7 days ago and `AbsoluteExpiresAt` to the past, then assert codes `1004` and `1005`.

- [ ] **Step 2: Add session claims and lifecycle types**

Extend `TokenClaims`:

```go
SessionID string `json:"sessionId"`
```

Add:

```go
type AuthFailure struct {
    Code   int
    Reason string
    Msg    string
}

type AuthenticatedSession struct {
    User    model.AuthUser
    Session model.LoginSession
}
```

- [ ] **Step 3: Implement session creation**

`CreateLoginSession(ctx, user)` must:

- use `RequestMeta` for IP and User-Agent;
- create UUID-backed `session-*` ID;
- set `CreatedAt` and `LastActiveAt` to `now()`;
- set `AbsoluteExpiresAt` to current time plus 30 days;
- normalize `DeviceName` using a small mature User-Agent parser dependency rather than handwritten browser parsing;
- call `repository.ReplaceLoginSession`;
- write `security.session_replaced` only when a previous current session existed;
- sign a JWT containing `sessionId`, with `exp` equal to the session absolute expiry.

Use `github.com/mssola/user_agent` for the browser/OS summary. Remove `JWTExpireHours` from `config.Config`; define the fixed 7-day idle and 30-day absolute durations in `service/login_session.go`, because allowing a separate JWT duration would contradict the agreed session rules.

Keep token signing in `service/auth.go`, but change its signature to:

```go
func newTokenWithIPPolicy(user model.User, session model.LoginSession, ipAddress string, ipAllowed bool) (string, error)
```

- [ ] **Step 4: Implement unified validation**

Implement:

```go
func AuthenticateSession(tokenText, ipAddress string) (AuthenticatedSession, *AuthFailure)
```

Validation order must be JWT → user → current pointer → session ownership/status → idle expiry → absolute expiry → existing IP binding. Map stored status to stable codes, and set `RequestMeta.SessionID` in middleware after success.

When `last_active_at` is at least 5 minutes old, call `TouchLoginSession`; a touch failure is logged but does not fail the business request.

- [ ] **Step 5: Route every successful login through the creator**

Replace `newSession`, `newSessionWithIP`, and `newSessionWithIPPolicy` callers in registration, password login, login-approval exchange, and third-party callback. There must be one function that persists the session before returning a token.

Change registration to accept request context:

```go
func Register(ctx context.Context, username, password string) (model.AuthSession, error)
```

and pass `r.Context()` from `handler.Register`, so the new session receives the real IP and User-Agent.

- [ ] **Step 6: Focused verification command (only when explicitly requested)**

Run:

```bash
go test ./service -run 'TestSecondLogin|TestLoginSessionIdle|TestLoginSessionAbsolute|TestLoginSessionTouch' -count=1
```

Expected: the newest token authenticates; replaced and expired tokens return their exact codes.

- [ ] **Step 7: Commit only this task**

```bash
git add go.mod go.sum config/config.go service/login_session.go service/login_session_test.go service/auth.go service/login_approval.go service/request_meta.go
git commit -m "feat: enforce server-controlled login sessions"
```

### Task 3: Return structured auth failures and support real logout

**Files:**

- Create: `handler/login_session.go`
- Modify: `handler/response.go`
- Modify: `handler/auth.go`
- Modify: `middleware/admin.go`
- Modify: `router/router.go`
- Modify: `router/router_test.go`

- [ ] **Step 1: Add route tests**

Test that logout invalidates its token and that a replaced token returns code `1002`:

```go
func TestLogoutRevokesCurrentSession(t *testing.T) {
    engine := New()
    token := loginRouterFixture(t, engine, "logout-user")
    response := performJSON(t, engine, "POST", "/api/auth/logout", nil, token)
    assertResponseCode(t, response, 0)
    me := performJSON(t, engine, "GET", "/api/auth/me", nil, token)
    assertResponseCode(t, me, model.AuthCodeSessionInvalid)
}
```

- [ ] **Step 2: Add a structured failure response**

Keep the existing envelope and add:

```go
func FailCode(w http.ResponseWriter, code int, data any, msg string) {
    writeJSON(w, response{Code: code, Data: data, Msg: msg})
}
```

Do not change the HTTP-200 convention.

- [ ] **Step 3: Make middleware use `AuthenticateSession`**

Replace `authUser` with a helper returning `(model.AuthUser, *service.AuthFailure)`. On failure:

```go
handler.FailCode(c.Writer, failure.Code, map[string]string{"reason": failure.Reason}, failure.Msg)
c.Abort()
```

Only `AUTH_SESSION_REVOKED` may expose a sanitized reason. All other reasons should be empty in response data.

`OptionalAuth` remains optional only when no bearer token was sent. If a bearer token is present but its session is invalid, it must return the same structured auth failure instead of silently continuing as a guest; this makes `/api/auth/me` reliably tell the browser why its saved login ended.

- [ ] **Step 4: Add server logout**

`POST /api/auth/logout` uses authenticated current session, calls `RevokeCurrentLoginSession` with `logged_out`, records `account.logout`, and returns `true`. Register it with `middleware.UserAuth`; remove client-authored logout audit reporting after the frontend migration.

- [ ] **Step 5: Focused verification command (only when explicitly requested)**

Run:

```bash
go test ./router -run 'TestLogoutRevokesCurrentSession|TestReplacedSessionResponse' -count=1
```

Expected: response codes are `0` for logout and `1002` for the replaced session.

- [ ] **Step 6: Commit only this task**

```bash
git add handler/login_session.go handler/response.go handler/auth.go middleware/admin.go router/router.go router/router_test.go
git commit -m "feat: expose session-aware authentication"
```

### Task 4: Add forced logout, permissions, and account-change revocation

**Files:**

- Modify: `model/user_activity.go`
- Modify: `service/login_session.go`
- Modify: `service/login_session_test.go`
- Modify: `service/admin_user.go`
- Modify: `service/admin_account.go`
- Modify: `service/admin_account_test.go`
- Modify: `handler/admin_user.go`
- Modify: `handler/admin_account.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write the permission matrix tests**

```go
func TestForceLogoutRoleMatrix(t *testing.T) {
    setupAuthTestDB(t)
    ordinary := saveCreditUser(t, "force-user", model.UserRoleUser, 0)
    admin := saveCreditUser(t, "force-admin", model.UserRoleAdmin, 0)
    super := saveCreditUser(t, "force-super", model.UserRoleSuperAdmin, 0)

    if _, err := ForceLogout(model.PublicUser(admin), ordinary.ID, "安全检查"); err != nil {
        t.Fatalf("admin -> user: %v", err)
    }
    if _, err := ForceLogout(model.PublicUser(admin), admin.ID, "越权"); err == nil {
        t.Fatal("admin forced administrator offline")
    }
    if _, err := ForceLogout(model.PublicUser(super), admin.ID, "权限调整"); err != nil {
        t.Fatalf("super -> admin: %v", err)
    }
    if _, err := ForceLogout(model.PublicUser(super), super.ID, "越权"); err == nil {
        t.Fatal("superadmin forced superadmin offline")
    }
}
```

Also assert blank, one-character, and over-200-character reasons fail.

- [ ] **Step 2: Add lifecycle audit actions**

Add constants:

```go
ActivityActionSessionReplaced        = "security.session_replaced"
ActivityActionSessionForceLogout     = "security.session_force_logout"
ActivityActionSessionIdleExpired     = "security.session_idle_expired"
ActivityActionSessionAbsoluteExpired = "security.session_absolute_expired"
ActivityActionSessionAccountChanged  = "security.session_account_changed"
```

- [ ] **Step 3: Implement service-level session administration**

Add:

```go
func GetCurrentLoginSession(actor model.AuthUser, targetID string) (model.LoginSessionView, error)
func ForceLogout(ctx context.Context, actor model.AuthUser, targetID, reason string) (model.LoginSessionView, error)
func RevokeSessionForAccountChange(ctx context.Context, userID, reason string) error
```

The role matrix belongs in `ForceLogout`. `GetCurrentLoginSession` uses the same matrix but allows superadmins to view other superadmins while still returning no force-logout permission; the frontend derives button visibility from target role.

- [ ] **Step 4: Revoke on security changes**

Call `RevokeSessionForAccountChange` before the security mutation, so a revocation failure prevents the password, role, status, or deletion operation from continuing. Apply it for:

- password reset;
- status changing to `ban`;
- role changing between `user`, `admin`, and `superadmin`;
- deletion.

Nickname, email, avatar, credits, and IP whitelist edits must not revoke the session.

- [ ] **Step 5: Add handlers and routes**

Use `{ "reason": "..." }` bodies:

```text
GET  /api/admin/users/:id/session
POST /api/admin/users/:id/force-logout
GET  /api/admin/admins/:id/session
POST /api/admin/admins/:id/force-logout
```

The first pair uses `AdminAuth`; the second pair uses `SuperAdminAuth`.

- [ ] **Step 6: Focused verification command (only when explicitly requested)**

Run:

```bash
go test ./service ./router -run 'TestForceLogout|Test.*Account.*RevokesSession|Test.*SessionPermission' -count=1
```

Expected: the role matrix, reason validation, account-change revocation, and routes pass.

- [ ] **Step 7: Commit only this task**

```bash
git add model/user_activity.go service/login_session.go service/login_session_test.go service/admin_user.go service/admin_account.go service/admin_account_test.go handler/admin_user.go handler/admin_account.go router/router.go
git commit -m "feat: let administrators revoke login sessions"
```

### Task 5: Centralize browser session invalidation and logout

**Files:**

- Create: `web/src/services/auth-session-events.ts`
- Create: `web/src/services/auth-session-events.test.mts`
- Modify: `web/src/services/api/request.ts`
- Modify: `web/src/services/api/auth.ts`
- Modify: `web/src/stores/use-user-store.ts`
- Modify: `web/src/app/(user)/user-layout-client.tsx`
- Modify: `web/src/app/(user)/login/page.tsx`
- Modify: `web/src/components/layout/user-status-actions.tsx`
- Modify: `web/src/app/(admin)/admin/layout.tsx`

- [ ] **Step 1: Write the event-deduplication test**

Test one notification for concurrent `1002` failures and reset after a successful login:

```ts
test("deduplicates concurrent session invalidation events", () => {
    let count = 0;
    const unsubscribe = subscribeAuthSessionInvalid(() => count++);
    emitAuthSessionInvalid({ code: 1002, message: "账号已在其他设备登录" });
    emitAuthSessionInvalid({ code: 1002, message: "账号已在其他设备登录" });
    assert.equal(count, 1);
    resetAuthSessionInvalid();
    emitAuthSessionInvalid({ code: 1004, message: "登录状态已过期" });
    assert.equal(count, 2);
    unsubscribe();
});
```

- [ ] **Step 2: Throw structured API errors**

Replace plain `Error` creation with:

```ts
export class ApiError extends Error {
    constructor(
        message: string,
        readonly code: number,
        readonly data: unknown,
    ) {
        super(message);
    }
}
```

For codes `1001`–`1005`, `apiRequest` emits one global session-invalid event before throwing.

- [ ] **Step 3: Add one global subscriber**

`UserLayoutClient` subscribes once. On invalidation it:

1. calls `clearSession()` without deleting localforage data;
2. builds `/login?reason=<safe enum>&message=<encoded safe message>&redirect=<current path>`;
3. calls `router.replace`.

Do not scatter string checks such as `errorMessage.includes("未登录")` into new code. Existing page-specific checks can remain until separately cleaned, because the global event handles new stable codes.

- [ ] **Step 4: Replace client-only logout**

Add:

```ts
export function logout(token: string) {
    return apiPost<boolean>("/api/auth/logout", undefined, token);
}
```

Change store action to:

```ts
logout: async () => {
    const token = get().token;
    try {
        if (token) await requestLogout(token);
    } finally {
        clearActiveUserStorageScope();
        set({ token: "", user: null, isReady: true });
    }
}
```

Update user and admin menus to call this asynchronous action. Remove the browser-authored `account.logout` activity report because the server now owns that audit event.

- [ ] **Step 5: Show safe login-page reasons**

Map only known `reason` values to Chinese copy. Do not render arbitrary query-string HTML. For `revoked`, show the server-sanitized plain-text reason through Ant Design message text.

- [ ] **Step 6: Focused verification command (only when explicitly requested)**

Run:

```bash
cd web && node --test src/services/auth-session-events.test.mts
```

Expected: deduplication and reset tests pass.

- [ ] **Step 7: Commit only this task**

```bash
git add web/src/services/auth-session-events.ts web/src/services/auth-session-events.test.mts web/src/services/api/request.ts web/src/services/api/auth.ts web/src/stores/use-user-store.ts 'web/src/app/(user)/user-layout-client.tsx' 'web/src/app/(user)/login/page.tsx' web/src/components/layout/user-status-actions.tsx 'web/src/app/(admin)/admin/layout.tsx'
git commit -m "feat: handle login session invalidation globally"
```

### Task 6: Show and revoke ordinary-user sessions in the admin UI

**Files:**

- Create: `web/src/app/(admin)/admin/users/[id]/admin-user-session-view.ts`
- Create: `web/src/app/(admin)/admin/users/[id]/admin-user-session-view.test.mts`
- Modify: `web/src/services/api/admin.ts`
- Modify: `service/auth.go`
- Modify: `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/page.tsx`
- Modify: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`
- Modify: `web/src/app/(admin)/admin/users/page.tsx`

- [ ] **Step 1: Define frontend session types and pure display tests**

```ts
export type AdminLoginSession = {
    online: boolean;
    status: "active" | "replaced" | "logged_out" | "admin_revoked" | "idle_expired" | "absolute_expired" | "account_changed" | "";
    ipAddress: string;
    deviceName: string;
    createdAt: string;
    lastActiveAt: string;
    absoluteExpiresAt: string;
};
```

Test `adminSessionStatus(session)` returns `{ label: "在线", color: "success" }` only for `online && status === "active"` and otherwise returns “离线”.

- [ ] **Step 2: Add API calls**

```ts
export function fetchAdminUserSession(token: string, userId: string) {
    return apiGet<AdminLoginSession>(`/api/admin/users/${encodeURIComponent(userId)}/session`, undefined, token);
}

export function forceLogoutAdminUser(token: string, userId: string, reason: string) {
    return apiPost<AdminLoginSession>(`/api/admin/users/${encodeURIComponent(userId)}/force-logout`, { reason }, token);
}
```

- [ ] **Step 3: Extend the detail hook**

Query the session with key `["admin", "user", userId, "session", token]`. The force-logout mutation invalidates both this key and the user activity key.

- [ ] **Step 4: Add the current-login card**

Render status, login time, last activity, 30-day expiry, IP, and device. Add a danger button only when online. The modal uses an Ant Design `Form.Item` with:

```ts
rules={[
    { required: true, whitespace: true, message: "请输入下线原因" },
    { min: 2, max: 200, message: "请输入 2–200 个字符" },
]}
```

- [ ] **Step 5: Add list state and audit labels**

Hydrate `model.User.Session` in `service.ListUsers` with one call to `repository.ListLoginSessionsForUsers`; evaluate expiry through the shared session-view helper. This avoids one request or database query per row. Add labels for all new session actions in `admin-user-activity-view.ts`.

- [ ] **Step 6: Focused verification command (only when explicitly requested)**

Run:

```bash
cd web && node --test 'src/app/(admin)/admin/users/[id]/admin-user-session-view.test.mts'
```

Expected: online/offline labels and force-action visibility pass.

- [ ] **Step 7: Commit only this task**

```bash
git add service/auth.go web/src/services/api/admin.ts 'web/src/app/(admin)/admin/users/[id]/admin-user-session-view.ts' 'web/src/app/(admin)/admin/users/[id]/admin-user-session-view.test.mts' 'web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts' 'web/src/app/(admin)/admin/users/[id]/page.tsx' 'web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts' 'web/src/app/(admin)/admin/users/page.tsx'
git commit -m "feat: manage user login sessions in admin"
```

### Task 7: Show and revoke administrator sessions

**Files:**

- Create: `web/src/app/(admin)/admin/admins/admin-session-view.ts`
- Create: `web/src/app/(admin)/admin/admins/admin-session-view.test.mts`
- Modify: `service/admin_account.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/admins/use-admin-accounts.ts`
- Modify: `web/src/app/(admin)/admin/admins/page.tsx`

- [ ] **Step 1: Write the role-visibility tests**

```ts
test("only online administrators can be forced offline", () => {
    assert.equal(adminForceLogoutVisible({ role: "admin", online: true }), true);
    assert.equal(adminForceLogoutVisible({ role: "admin", online: false }), false);
    assert.equal(adminForceLogoutVisible({ role: "superadmin", online: true }), false);
});
```

- [ ] **Step 2: Add administrator-session API calls**

```ts
export function fetchAdminAccountSession(token: string, id: string) {
    return apiGet<AdminLoginSession>(`/api/admin/admins/${encodeURIComponent(id)}/session`, undefined, token);
}

export function forceLogoutAdminAccount(token: string, id: string, reason: string) {
    return apiPost<AdminLoginSession>(`/api/admin/admins/${encodeURIComponent(id)}/force-logout`, { reason }, token);
}
```

- [ ] **Step 3: Return session summaries with the admin list**

Avoid one query per table row. `service.ListAdminAccounts` should hydrate session summaries through `repository.ListLoginSessionsForUsers`, and `AdminAccount` frontend type should expose `session`.

- [ ] **Step 4: Add status and force-logout UI**

Add “登录状态” and “最后活跃” columns. Add a danger logout action only for online `admin` rows. Reuse the same 2–200-character modal rules from ordinary-user detail; do not display the action for any `superadmin`.

- [ ] **Step 5: Focused verification command (only when explicitly requested)**

Run:

```bash
cd web && node --test 'src/app/(admin)/admin/admins/admin-session-view.test.mts'
```

Expected: admins are actionable only when online; superadmins are always protected.

- [ ] **Step 6: Commit only this task**

```bash
git add service/admin_account.go web/src/services/api/admin.ts 'web/src/app/(admin)/admin/admins/admin-session-view.ts' 'web/src/app/(admin)/admin/admins/admin-session-view.test.mts' 'web/src/app/(admin)/admin/admins/use-admin-accounts.ts' 'web/src/app/(admin)/admin/admins/page.tsx'
git commit -m "feat: manage administrator login sessions"
```

### Task 8: Update project documentation and acceptance records

**Files:**

- Modify: `docs/backend-database.md`
- Modify: `docs/api-response.md`
- Modify: `docs/pending-test.md`
- Modify if applicable: `docs/todo.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the database**

Add `users.active_session_id` and the complete `login_sessions` field/status table. State that the table stores no JWT or reusable credential.

- [ ] **Step 2: Document API response codes and routes**

Add integer codes `1001`–`1005`, safe response examples, logout, session detail, and force-logout endpoints with role boundaries.

- [ ] **Step 3: Update version-facing records**

Move an existing matching todo to `docs/pending-test.md` if present. Otherwise leave `docs/todo.md` unchanged. Add one concise pending-test section covering:

- all roles single-device;
- new login replaces old login;
- 7-day idle and 30-day absolute expiry;
- admin/superadmin force-logout matrix;
- reason audit and local-data preservation.

Add only a version-level summary to `CHANGELOG.md` under `Unreleased`.

- [ ] **Step 4: Review the implementation diff**

Read only files changed by these tasks and check:

- no legacy JWT compatibility branch;
- no JWT or secrets stored in `login_sessions`;
- no force-logout path for superadmins;
- no logout path deletes localforage business data;
- no per-row session query in admin tables;
- no unrelated file changes.

- [ ] **Step 5: Optional complete verification (requires explicit user request)**

Run:

```bash
go test ./...
cd web && npm test
```

Expected: all Go and frontend tests pass. Do not run builds or compilation as part of release unless separately requested.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/backend-database.md docs/api-response.md docs/pending-test.md docs/todo.md CHANGELOG.md
git commit -m "docs: record single-session login controls"
```

## Final acceptance checklist

- [ ] Login in browser B makes browser A fail on its next protected request with code `1002`.
- [ ] The same rule applies to `user`, `admin`, and `superadmin`.
- [ ] Idle and absolute expiry use codes `1004` and `1005`.
- [ ] Logout revokes the server session even if the old JWT has time remaining.
- [ ] Admin can force only `user` offline.
- [ ] Superadmin can force `user` and `admin` offline, never `superadmin`.
- [ ] Force logout requires a 2–200-character reason and writes actor, target, session, IP, time, and reason to audit.
- [ ] Admin pages display login time, last activity, expiry, IP, device, and online state without showing credentials.
- [ ] Re-login to the same account restores its locally scoped canvas, project, and asset data.
- [ ] No unrelated dirty-worktree changes are staged or committed.
