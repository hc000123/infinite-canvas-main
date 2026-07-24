# IP Login Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require administrator approval when an IP-restricted ordinary user logs in outside their allowlist, while keeping admin and superadmin accounts exempt and making outside-IP tool use searchable.

**Architecture:** Store normalized IP prefixes and login approval requests in dedicated tables. Password or OAuth identity verification runs first; an outside-IP ordinary user receives a short-lived opaque approval credential instead of a JWT. Approved-once sessions bind their JWT to the approved IP, allowlisted sessions re-check current rules on authenticated requests, and privileged roles bypass this entire branch.

**Tech Stack:** Go 1.25 `net/netip`, `crypto/rand`, SHA-256 token hashes, Gin trusted proxies and middleware, GORM transactions, JWT v5, Next.js/React, Ant Design, TanStack Query.

**Prerequisites:** Complete the superadmin, user-usage-detail, and user-activity-audit plans first. Activity request metadata and risk event storage are reused here.

---

## File map

- Modify `config/config.go`: configurable trusted proxy list.
- Modify `model/user.go`: `IPApprovalEnabled` and auth response union.
- Create `model/login_approval.go`: allowlist and approval models/statuses.
- Create `repository/login_approval.go`: prefix rules, atomic decisions, exchange state.
- Modify `repository/db.go`: migrate new tables.
- Create `service/client_ip.go`: normalized IP/prefix helpers.
- Create `service/login_approval.go`: login decision and approval state machine.
- Modify `service/auth.go`: request-aware login, JWT session/IP claims, admin/superadmin bypass.
- Modify `service/context.go`: session metadata in request context.
- Modify `middleware/admin.go`: per-request restricted-session validation.
- Modify `handler/auth.go`: pending login/status/exchange handlers.
- Create `handler/login_approval.go`: admin allowlist and approval handlers.
- Modify `router/router.go`: trusted proxies and routes.
- Add backend tests in new `service/login_approval_test.go`, `repository/login_approval_test.go`, `middleware/admin_test.go`, and existing auth/router tests.
- Modify `web/src/services/api/auth.ts`: pending login union, status and exchange APIs.
- Modify `web/src/stores/use-user-store.ts`: pending result handling without persisting approval credentials.
- Modify `web/src/app/(user)/login/page.tsx`: waiting/approved/rejected/expired flow.
- Modify `web/src/services/api/admin.ts`: allowlist and approval APIs.
- Modify `web/src/app/(admin)/admin/layout.tsx`: approval menu/badge.
- Create `web/src/app/(admin)/admin/login-approvals/`: queue page and page-private hook.
- Modify `web/src/app/(admin)/admin/users/[id]/`: per-user allowlist settings.
- Modify `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`: outside-IP plus AI-use filter.
- Modify docs and pending tests.

### Task 1: Add normalized allowlist and approval persistence

**Files:**
- Modify: `model/user.go`
- Create: `model/login_approval.go`
- Create: `repository/login_approval.go`
- Create: `repository/login_approval_test.go`
- Modify: `repository/db.go`

- [ ] **Step 1: Write failing repository state tests**

Create tests for duplicate prefixes, pending-to-approved atomic transition, duplicate decision rejection, and single exchange:

```go
func TestDecideLoginApprovalIsAtomic(t *testing.T) {
	setupRepositoryTestDB(t)
	item := model.LoginApproval{ID: "approval-1", UserID: "user-1", RequestedIP: "203.0.113.8", TokenHash: "hash", Status: model.LoginApprovalPending, ExpiresAt: "2099-01-01T00:00:00Z", CreatedAt: "2026-07-24T10:00:00Z"}
	if _, err := SaveLoginApproval(item); err != nil {
		t.Fatalf("save: %v", err)
	}
	updated, ok, err := DecideLoginApproval(item.ID, model.LoginApprovalPending, model.LoginApprovalApproved, model.LoginApprovalScopeOnce, "super-1", "2026-07-24T10:01:00Z")
	if err != nil || !ok || updated.Status != model.LoginApprovalApproved {
		t.Fatalf("first decision updated=%#v ok=%v err=%v", updated, ok, err)
	}
	if _, ok, err := DecideLoginApproval(item.ID, model.LoginApprovalPending, model.LoginApprovalRejected, "", "super-1", "2026-07-24T10:02:00Z"); err != nil || ok {
		t.Fatalf("duplicate decision ok=%v err=%v", ok, err)
	}
}
```

- [ ] **Step 2: Run and verify RED**

```bash
go test ./repository -run 'Test.*LoginApproval|Test.*AllowedIP' -count=1
```

Expected: FAIL because persistence does not exist.

- [ ] **Step 3: Define models and statuses**

Add to `model.User`:

```go
IPApprovalEnabled bool `json:"ipApprovalEnabled"`
```

Create `model/login_approval.go` with `UserAllowedIP`, `LoginApproval`, query/list types, and constants:

```go
const (
	LoginApprovalPending  LoginApprovalStatus = "pending"
	LoginApprovalApproved LoginApprovalStatus = "approved"
	LoginApprovalRejected LoginApprovalStatus = "rejected"
	LoginApprovalExpired  LoginApprovalStatus = "expired"
	LoginApprovalConsumed LoginApprovalStatus = "consumed"

	LoginApprovalScopeOnce      LoginApprovalScope = "once"
	LoginApprovalScopeWhitelist LoginApprovalScope = "whitelist"
)
```

Use the exact fields from the approved spec: IDs, user ID, requested IP, user agent/device summary, token hash, status/scope, decision actor/time, expiry, session ID/issued/expiry, consumed time, and created time. Add composite unique index `user_id + cidr` to `UserAllowedIP`.

- [ ] **Step 4: Implement repositories and migrations**

Implement:

- `ListUserAllowedIPs`, `SaveUserAllowedIP`, `DeleteUserAllowedIP`;
- `SaveLoginApproval`, `GetLoginApproval`, `ListLoginApprovals`;
- `DecideLoginApproval` with `WHERE id=? AND status=?`;
- `ConsumeLoginApproval` with `WHERE id=? AND status=approved`;
- `ExpireLoginApproval` with `WHERE status=pending AND expires_at<=?`.

Add both models to AutoMigrate.

- [ ] **Step 5: Run and verify GREEN**

```bash
go test ./repository -run 'Test.*LoginApproval|Test.*AllowedIP' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add model/user.go model/login_approval.go repository/login_approval.go repository/login_approval_test.go repository/db.go
git commit -m "feat: add IP login approval persistence"
```

### Task 2: Resolve trusted client IPs and validate prefixes

**Files:**
- Modify: `config/config.go`
- Create: `service/client_ip.go`
- Create: `service/client_ip_test.go`
- Modify: `router/router.go`
- Modify: `middleware/admin.go`

- [ ] **Step 1: Write failing normalization and proxy tests**

```go
func TestNormalizeIPPrefix(t *testing.T) {
	cases := map[string]string{
		"203.0.113.8":    "203.0.113.8/32",
		"10.20.0.0/16":   "10.20.0.0/16",
		"2001:db8::1":     "2001:db8::1/128",
		"2001:db8::/48":   "2001:db8::/48",
	}
	for input, want := range cases {
		got, err := NormalizeIPPrefix(input)
		if err != nil || got != want {
			t.Fatalf("NormalizeIPPrefix(%q)=%q err=%v want=%q", input, got, err, want)
		}
	}
}

func TestIPMatchesPrefixes(t *testing.T) {
	if !IPMatchesPrefixes("10.20.5.8", []string{"10.20.0.0/16"}) || IPMatchesPrefixes("10.21.5.8", []string{"10.20.0.0/16"}) {
		t.Fatal("prefix match returned wrong result")
	}
}
```

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestNormalizeIPPrefix|TestIPMatchesPrefixes' -count=1
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement standard-library normalization**

Use `netip.ParseAddr` for single addresses and `netip.ParsePrefix(...).Masked()` for CIDR. Convert IPv4-mapped IPv6 addresses with `addr.Unmap()`. Single addresses become `/32` or `/128`. Reject empty, invalid, non-canonical, or zone-scoped values.

- [ ] **Step 4: Configure trusted proxies**

Add to `Config`:

```go
TrustedProxies []string `env:"TRUSTED_PROXIES" envSeparator:","`
```

Trim entries during `Load`. In `router.New`, call `router.SetTrustedProxies(config.Cfg.TrustedProxies)` and fail closed to no trusted proxies if the list is empty. Keep `middleware.RequestMeta` using `c.ClientIP()` so only Gin's trusted-proxy decision reaches services.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
go test ./config ./service ./router -run 'TestNormalizeIPPrefix|TestIPMatchesPrefixes|Test.*TrustedProx' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit IP resolution**

```bash
git add config/config.go service/client_ip.go service/client_ip_test.go router/router.go middleware/admin.go
git commit -m "feat: normalize trusted client IPs"
```

### Task 3: Implement login decision, approval credential, and exchange

**Files:**
- Modify: `model/user.go`
- Modify: `service/auth.go`
- Create: `service/login_approval.go`
- Create: `service/login_approval_test.go`
- Modify: `handler/auth.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write failing login-flow tests**

Cover privileged bypass, allowlisted ordinary login, outside-IP pending, rejected/expired exchange, one-time approval, and duplicate exchange:

```go
func TestLoginOutsideAllowedIPRequiresApproval(t *testing.T) {
	setupAITaskTestDB(t)
	user := savePasswordUserFixture(t, "restricted-user", model.UserRoleUser)
	user.IPApprovalEnabled = true
	_, _ = repository.SaveUser(user)
	result, err := LoginWithRequest(contextWithIP("203.0.113.8"), "restricted-user", "password123")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if result.Status != "pending" || result.Approval.ID == "" || result.Approval.Token == "" || result.Session.Token != "" {
		t.Fatalf("login result = %#v", result)
	}
}

func TestPrivilegedLoginBypassesIPApproval(t *testing.T) {
	for _, role := range []model.UserRole{model.UserRoleAdmin, model.UserRoleSuperAdmin} {
		user := savePasswordUserFixture(t, "privileged-"+string(role), role)
		user.IPApprovalEnabled = true
		_, _ = repository.SaveUser(user)
		result, err := LoginWithRequest(contextWithIP("203.0.113.9"), user.Username, "password123")
		if err != nil || result.Session.Token == "" || result.Status != "authenticated" {
			t.Fatalf("role %s result=%#v err=%v", role, result, err)
		}
	}
}
```

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestLoginOutsideAllowedIPRequiresApproval|TestPrivilegedLoginBypassesIPApproval|Test.*ApprovalExchange' -count=1
```

Expected: FAIL because the decision service does not exist.

- [ ] **Step 3: Define the login response union**

Add response types:

```go
type LoginApprovalClient struct {
	ID        string `json:"id"`
	Token     string `json:"token,omitempty"`
	Status    string `json:"status"`
	ExpiresAt string `json:"expiresAt"`
	IPAddress string `json:"ipAddress"`
}

type LoginResult struct {
	Status   string              `json:"status"`
	Session  AuthSession         `json:"session,omitempty"`
	Approval LoginApprovalClient `json:"approval,omitempty"`
}
```

- [ ] **Step 4: Implement secure pending credentials and decision logic**

`LoginWithRequest(ctx, username, password)` keeps the existing password/status checks, then:

1. privileged role: create session;
2. ordinary user with restriction disabled: create session;
3. ordinary user with matching prefix: create session;
4. otherwise generate 32 random bytes with `crypto/rand`, return base64url token, persist only SHA-256 hash, and create a 10-minute pending approval.

Never update `LastLoginAt` before an authenticated session exists. Record the pending security event through the activity service.

- [ ] **Step 5: Implement status and exchange services**

`GetLoginApprovalStatus(ctx, id, rawToken)` compares the SHA-256 hash with constant-time equality, expires stale pending requests, and returns only public status/IP/time fields.

`ExchangeLoginApproval(ctx, id, rawToken)` verifies hash, `status=approved`, user still active and ordinary, and current IP equals `requested_ip`. In one transaction consume the approval and set fixed session ID/issued/expiry fields, then issue the JWT using those stored values. A consumed request returns “申请已使用”.

- [ ] **Step 6: Add handlers and public routes**

Change password login handler to pass `r.Context()` and return `LoginResult`. Add request structs containing only `token` for:

- `POST /api/auth/login-approvals/:id/status`;
- `POST /api/auth/login-approvals/:id/exchange`.

These routes are public but protected by the opaque credential; never put it in query parameters or logs.

Refactor `LoginWithLinuxDo` to call the same `completeVerifiedLogin(ctx, user)` decision helper after OAuth identity verification. When Linux.do requires approval, set the raw approval credential in a 10-minute `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/auth/login-approvals`, redirect with only the approval ID and status, and let status/exchange accept either the body credential or this cookie. Clear the cookie after exchange, rejection, or expiry. Add tests asserting the redirect URL never contains the credential.

- [ ] **Step 7: Run and verify GREEN**

```bash
go test ./service ./handler ./router -run 'TestLogin|Test.*ApprovalExchange|Test.*LoginApprovalRoute' -count=1
```

Expected: PASS.

- [ ] **Step 8: Commit login approval state machine**

```bash
git add model/user.go service/auth.go service/login_approval.go service/login_approval_test.go handler/auth.go router/router.go
git commit -m "feat: require approval for outside-IP logins"
```

### Task 4: Bind restricted sessions to current IP rules

**Files:**
- Modify: `service/auth.go`
- Modify: `service/context.go`
- Modify: `middleware/admin.go`
- Create: `middleware/admin_test.go`

- [ ] **Step 1: Write failing middleware tests**

Test these cases:

- ordinary unrestricted JWT works;
- allowlisted restricted JWT works only while request IP matches a current prefix;
- approved-once JWT works only from its exact approved IP;
- removing a prefix invalidates the next request;
- disabling the user invalidates the next request;
- admin and superadmin ignore all IP rules.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./middleware ./service -run 'TestRestrictedSession|TestPrivilegedSessionBypassesIP' -count=1
```

Expected: FAIL because claims and request validation are absent.

- [ ] **Step 3: Extend JWT claims**

Add `SessionID`, `ApprovedIP`, `LoginApprovalID`, and `ApprovalScope` to `TokenClaims`. Generate a session ID for every login. For approved-once exchanges, persist the exact normalized IP and `once` scope. For allowlisted login, keep scope `whitelist` and no exact approved IP.

- [ ] **Step 4: Validate every authenticated ordinary-user request**

Replace `CurrentAuthUser(tokenText)` usage inside middleware with `CurrentAuthSession(tokenText, requestIP)`, returning both `AuthUser` and `RequestMeta`.

Validation order:

1. parse JWT;
2. reload user, reject missing/banned;
3. privileged role returns immediately with `IPAllowed=true`;
4. ordinary restriction disabled returns immediately;
5. `scope=once`: require exact current IP equals claim approved IP;
6. otherwise reload allowed prefixes and require current IP match.

Attach returned session metadata to request context before handler execution. Use the generic auth error message and record a rejected security event without exposing rule details to unauthenticated clients.

- [ ] **Step 5: Run and verify GREEN**

```bash
go test ./middleware ./service -run 'TestRestrictedSession|TestPrivilegedSessionBypassesIP' -count=1
```

Expected: PASS.

- [ ] **Step 6: Commit session enforcement**

```bash
git add service/auth.go service/context.go middleware/admin.go middleware/admin_test.go
git commit -m "feat: enforce IP rules on authenticated sessions"
```

### Task 5: Add admin allowlist and approval APIs

**Files:**
- Create: `service/admin_login_approval.go`
- Create: `service/admin_login_approval_test.go`
- Create: `handler/login_approval.go`
- Modify: `router/router.go`

- [ ] **Step 1: Write failing admin service tests**

Cover adding normalized prefix, rejecting privileged targets, enabling restriction only for ordinary users, approving once, approve-and-allow transaction, rejecting, duplicate decisions, and actor capture.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./service -run 'TestAdmin.*AllowedIP|TestAdmin.*LoginApproval' -count=1
```

Expected: FAIL because admin services do not exist.

- [ ] **Step 3: Implement user allowlist services**

Implement list/add/delete/toggle functions. Require `model.IsAdminRole(actor.Role)`, load target, require `target.Role==user`, normalize prefixes, and save `CreatedBy=actor.ID`. Enabling with zero prefixes is allowed because outside logins enter approval; UI must warn, not block.

- [ ] **Step 4: Implement approval decisions**

`ApproveLoginOnce`, `ApproveLoginAndAllow`, and `RejectLoginApproval` load current actor and pending request. Approve-and-allow inserts the exact requested IP as `/32` or `/128` and approves within one transaction. Decisions record security activities with actor and target IDs; do not expose approval credential hashes.

- [ ] **Step 5: Add handlers and routes under AdminAuth**

Register:

- user allowed IP list/add/delete;
- user IP approval toggle;
- login approval list;
- approve-once, approve-and-allow, reject.

Use the exact API paths from the approved spec.

- [ ] **Step 6: Run and verify GREEN**

```bash
go test ./service ./handler ./router -run 'TestAdmin.*AllowedIP|TestAdmin.*LoginApproval|Test.*LoginApprovalRoutes' -count=1
```

Expected: PASS.

- [ ] **Step 7: Commit admin approval APIs**

```bash
git add service/admin_login_approval.go service/admin_login_approval_test.go handler/login_approval.go router/router.go
git commit -m "feat: add admin IP approval controls"
```

### Task 6: Add login waiting and admin approval interfaces

**Files:**
- Modify: `web/src/services/api/auth.ts`
- Modify: `web/src/stores/use-user-store.ts`
- Modify: `web/src/app/(user)/login/page.tsx`
- Create: `web/src/app/(user)/login/login-approval-state.ts`
- Create: `web/src/app/(user)/login/login-approval-state.test.mts`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/layout.tsx`
- Create: `web/src/app/(admin)/admin/login-approvals/login-approval-view.ts`
- Create: `web/src/app/(admin)/admin/login-approvals/login-approval-view.test.mts`
- Create: `web/src/app/(admin)/admin/login-approvals/use-login-approvals.ts`
- Create: `web/src/app/(admin)/admin/login-approvals/page.tsx`
- Modify: `web/src/app/(admin)/admin/users/[id]/page.tsx`
- Modify: `web/src/app/(admin)/admin/users/[id]/use-admin-user-detail.ts`

- [ ] **Step 1: Write failing pure state/view tests**

Test that pending results enter waiting without persisting the credential, approved results exchange once, rejected/expired states stop polling, and current/last-superadmin protections remain unrelated to IP controls. Test Chinese labels and button availability for approval rows.

- [ ] **Step 2: Run and verify RED**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/login/login-approval-state.test.mts' 'src/app/(admin)/admin/login-approvals/login-approval-view.test.mts'
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement auth response union and waiting page**

`requestLogin` returns `LoginResult`. Keep the approval token only in component state, never Zustand persistence, localStorage, URL, or query cache. Poll status every 3 seconds while pending and before expiry. On approved, call exchange once, set session, activate user storage scope, and preserve the existing redirect. On reject/expire, stop polling and show a retry button.

- [ ] **Step 4: Implement approval queue**

Add a menu item “登录审批” for both admin and superadmin. Query pending count at a low fixed interval for the badge. The page shows username/ID, IP, device, requested time, historical appearances, and actions: reject, approve once, approve and allow. Disable buttons during mutation and invalidate approval/user-detail queries after success.

- [ ] **Step 5: Implement per-user security settings**

In user detail, add the restriction switch and allowed-prefix table. Support add with label, delete, and one-click add from observed login IP. Do not render or enable this card for admin/superadmin targets; ordinary user detail endpoints only expose ordinary users.

- [ ] **Step 6: Run tests and typecheck**

```bash
cd web && node --experimental-strip-types --test 'src/app/(user)/login/login-approval-state.test.mts' 'src/app/(admin)/admin/login-approvals/login-approval-view.test.mts' && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit interfaces**

```bash
git add web/src/services/api/auth.ts web/src/services/api/admin.ts web/src/stores/use-user-store.ts web/src/app/'(user)'/login web/src/app/'(admin)'/admin/layout.tsx web/src/app/'(admin)'/admin/login-approvals web/src/app/'(admin)'/admin/users/'[id]'
git commit -m "feat: add IP login approval interfaces"
```

### Task 7: Add outside-IP tool-use risk filtering and documentation

**Files:**
- Modify: `repository/user_activity.go`
- Modify: `service/user_activity.go`
- Modify: `handler/user_activity.go`
- Modify: `router/router.go`
- Modify: `web/src/services/api/admin.ts`
- Modify: `web/src/app/(admin)/admin/login-approvals/page.tsx`
- Modify: `web/src/app/(admin)/admin/login-approvals/use-login-approvals.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/admin-user-activity-view.ts`
- Modify: `web/src/app/(admin)/admin/users/[id]/page.tsx`
- Modify: `docs/backend-database.md`
- Modify: `docs/pending-test.md`
- Modify only if needed: `docs/todo.md`

- [ ] **Step 1: Write failing risk-query test**

Create activities for outside-IP login only, outside-IP AI use, allowlisted AI use, and another user. Query `ExactUserID + OutsideIPWithAIUse=true` and assert only the outside-IP AI event is returned. Query the global risk aggregation and assert it groups by `user_id + ip_address`, includes the current username, AI event count, first time, and last time.

- [ ] **Step 2: Run and verify RED**

```bash
go test ./repository ./service -run 'Test.*OutsideIP.*AI' -count=1
```

Expected: FAIL because the combined risk filter does not exist.

- [ ] **Step 3: Implement risk filtering**

Add `OutsideIPWithAIUse bool` to query models and parse `outsideIPWithAIUse=true`. Apply:

```go
if q.OutsideIPWithAIUse {
	tx = tx.Where("ip_address <> '' AND ip_allowed = ? AND category = ?", false, model.ActivityCategoryAI)
}
```

Keep the saved historical `ip_allowed` value; do not recalculate after whitelist edits.

Add repository aggregation `ListOutsideIPAIUsers(q)` over `user_activity_logs` where `ip_allowed=false AND category=ai`, grouped by `user_id, ip_address`, with `COUNT(*)`, `MIN(created_at)`, and `MAX(created_at)`. Batch-hydrate current usernames in service and expose `GET /api/admin/ip-risk-users` under `AdminAuth`, with user/IP/time filters and pagination.

- [ ] **Step 4: Add the admin filter control**

Add a prominent checkbox/filter `非白名单 IP 且使用过 AI` to the activity tab and retain the existing general outside-IP filter. Add a “风险账号” tab to the login approvals page listing username, user ID, IP, AI operation count, first occurrence, and last occurrence; clicking a row opens that user's activity tab with the combined filter enabled.

- [ ] **Step 5: Update database and pending-test docs**

Document `ip_approval_enabled`, `user_allowed_ips`, and `login_approvals`; explain privileged role bypass, exact-IP once sessions, trusted proxies, and the 10-minute approval credential. Add manual tests for every decision state, token transfer to another IP, prefix removal, administrator bypass, and risk filtering.

- [ ] **Step 6: Run fresh full verification**

```bash
go test ./... -count=1
cd web && npm test && npm run typecheck
cd .. && git diff --check
```

Expected: all commands exit 0 with no failures.

- [ ] **Step 7: Commit the final security checkpoint**

```bash
git add repository/user_activity.go service/user_activity.go handler/user_activity.go router/router.go web/src/services/api/admin.ts web/src/app/'(admin)'/admin/login-approvals web/src/app/'(admin)'/admin/users/'[id]' docs/backend-database.md docs/pending-test.md docs/todo.md
git commit -m "feat: add outside-IP usage risk filtering"
```
