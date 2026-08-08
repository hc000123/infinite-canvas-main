package localupscale

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestPairingCodeIsSingleUseAndGrantIsOriginBound(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.Pair(code, "https://canvas.example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil {
		t.Fatal("code reused")
	}
	if !store.Authorize(token, "https://canvas.example.com") {
		t.Fatal("valid origin rejected")
	}
	if store.Authorize(token, "https://evil.example.com") {
		t.Fatal("cross-origin token accepted")
	}
}

func TestPairingCodeIsSixDigits(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile(`^[0-9]{6}$`)
	for range 20 {
		code, err := store.IssueCode()
		if err != nil {
			t.Fatal(err)
		}
		if !pattern.MatchString(code) {
			t.Fatalf("pairing code %q is not six digits", code)
		}
	}
}

func TestPairingIssueCodeReplacesCurrentChallenge(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	oldCode, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	newCode := oldCode
	for newCode == oldCode {
		newCode, err = store.IssueCode()
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.Pair(oldCode, "https://canvas.example.com"); err == nil {
		t.Fatal("superseded pairing code accepted")
	}
	if _, err := store.Pair(newCode, "https://canvas.example.com"); err != nil {
		t.Fatal(err)
	}
}

func TestPairingCodeExpiresAfterFiveMinutes(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(6 * time.Minute)
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil {
		t.Fatal("expired pairing code accepted")
	}
}

func TestPairingCodeIsInvalidatedAfterFiveConcurrentFailures(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	number, err := strconv.Atoi(code)
	if err != nil {
		t.Fatal(err)
	}
	wrongCode := fmt.Sprintf("%06d", (number+1)%1_000_000)

	var wait sync.WaitGroup
	errors := make(chan error, 5)
	for range 5 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.Pair(wrongCode, "https://canvas.example.com")
			errors <- err
		}()
	}
	wait.Wait()
	close(errors)
	for err := range errors {
		if err == nil {
			t.Fatal("wrong pairing code accepted")
		}
	}
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil {
		t.Fatal("pairing code accepted after five failed attempts")
	}
}

func TestPairingNewChallengeHasFreshFailureBudget(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	number, err := strconv.Atoi(code)
	if err != nil {
		t.Fatal(err)
	}
	wrongCode := fmt.Sprintf("%06d", (number+1)%1_000_000)
	for range 5 {
		if _, err := store.Pair(wrongCode, "https://canvas.example.com"); err == nil {
			t.Fatal("wrong pairing code accepted")
		}
	}
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil {
		t.Fatal("failed challenge remains valid")
	}
	newCode, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Pair(newCode, "https://canvas.example.com"); err != nil {
		t.Fatal(err)
	}
}

func TestPairingCodeHasOnlyOneConcurrentSuccess(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}

	results := make(chan error, 8)
	var wait sync.WaitGroup
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.Pair(code, "https://canvas.example.com")
			results <- err
		}()
	}
	wait.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("got %d successful pairings, want 1", successes)
	}
}

func TestPairingGrantPersistsPrivatelyWithoutPlaintextCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "grants.json")
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	store, err := NewPairingStore(path, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.Pair(code, "https://canvas.example.com")
	if err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("grant file permissions = %o, want 600", info.Mode().Perm())
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte(strconv.Quote(token))) {
		t.Fatal("grant file contains plaintext token")
	}
	if bytes.Contains(data, []byte(strconv.Quote(code))) {
		t.Fatal("grant file contains pairing code")
	}

	reloaded, err := NewPairingStore(path, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	if !reloaded.Authorize(token, "https://canvas.example.com") {
		t.Fatal("persisted grant was not reloaded")
	}
}

func TestPairingPersistenceAtomicallyReplacesCompleteGrantFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "grants.json")
	store, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	pair := func(origin string) {
		t.Helper()
		code, err := store.IssueCode()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.Pair(code, origin); err != nil {
			t.Fatal(err)
		}
	}

	pair("https://one.example.com")
	previous, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	for index, origin := range []string{"https://two.example.com", "https://three.example.com"} {
		pair(origin)
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var grants []Grant
		if err := json.Unmarshal(data, &grants); err != nil {
			t.Fatal(err)
		}
		if len(grants) != index+2 {
			t.Fatalf("got %d persisted grants, want %d", len(grants), index+2)
		}
		reloaded, err := NewPairingStore(path, time.Now)
		if err != nil {
			t.Fatal(err)
		}
		if len(reloaded.Grants()) != index+2 {
			t.Fatal("complete grant file did not reload")
		}
		current, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if os.SameFile(previous, current) {
			t.Fatal("grant file was overwritten in place")
		}
		if current.Mode().Perm() != 0o600 {
			t.Fatalf("grant file permissions = %o, want 600", current.Mode().Perm())
		}
		previous = current
	}
	temps, err := filepath.Glob(filepath.Join(dir, ".grants-*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(temps) != 0 {
		t.Fatalf("temporary grant files remain: %v", temps)
	}
}

func TestPairingAtomicWriterCleansTempAfterRenameFailure(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "grants.json")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := writeGrantsAtomically(target, []byte("[]")); err == nil {
		t.Fatal("rename over directory unexpectedly succeeded")
	}
	temps, err := filepath.Glob(filepath.Join(dir, ".grants-*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(temps) != 0 {
		t.Fatalf("temporary grant files remain: %v", temps)
	}
}

func TestPairingFailureDoesNotConsumeChallenge(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "grants.json")
	store, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Pair(code, "https://canvas.example.com"); err == nil {
		t.Fatal("pairing replaced storage directory")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Pair(code, "https://canvas.example.com"); err != nil {
		t.Fatal("failed persistence consumed pairing challenge")
	}
}

func TestPairingRevokeFailurePreservesAuthorization(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "grants.json")
	backup := filepath.Join(dir, "grants.backup.json")
	store, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.Pair(code, "https://canvas.example.com")
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := store.Revoke(token, "https://canvas.example.com"); err == nil {
		t.Fatal("revocation replaced storage directory")
	}
	if !store.Authorize(token, "https://canvas.example.com") {
		t.Fatal("failed revocation changed in-memory authorization")
	}
	after, err := os.ReadFile(backup)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(after, original) {
		t.Fatal("failed revocation changed persisted authorization")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(backup, path); err != nil {
		t.Fatal(err)
	}
	reloaded, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if !reloaded.Authorize(token, "https://canvas.example.com") {
		t.Fatal("failed revocation corrupted persisted authorization")
	}
}

func TestPairingStoreRestrictsExistingGrantFilePermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "grants.json")
	if err := os.WriteFile(path, []byte("[]"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewPairingStore(path, time.Now); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("grant file permissions = %o, want 600", info.Mode().Perm())
	}
}

func TestPairingStoreCreatesStorageDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "deeper", "grants.json")
	if _, err := NewPairingStore(path, time.Now); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		t.Fatal("pairing storage parent is not a directory")
	}
}

func TestPairingStoreRestrictsStorageDirectoryPermissions(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "helper-config")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := NewPairingStore(filepath.Join(dir, "grants.json"), time.Now); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o700 {
		t.Fatalf("pairing storage directory permissions = %o, want 700", info.Mode().Perm())
	}
}

func TestPairingStoreRejectsInvalidConstructorArguments(t *testing.T) {
	if _, err := NewPairingStore(" \t ", time.Now); err == nil {
		t.Fatal("blank path accepted")
	}
	if _, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), nil); err == nil {
		t.Fatal("nil clock accepted")
	}
}

func TestPairingStoreRejectsInvalidPersistedGrants(t *testing.T) {
	valid := Grant{
		ID:        "grant-1",
		Origin:    "https://canvas.example.com",
		TokenHash: strings.Repeat("ab", sha256.Size),
		CreatedAt: "2026-08-08T12:00:00Z",
	}
	tests := map[string][]Grant{
		"missing id":         {{Origin: valid.Origin, TokenHash: valid.TokenHash, CreatedAt: valid.CreatedAt}},
		"missing origin":     {{ID: valid.ID, TokenHash: valid.TokenHash, CreatedAt: valid.CreatedAt}},
		"invalid created at": {{ID: valid.ID, Origin: valid.Origin, TokenHash: valid.TokenHash, CreatedAt: "not-a-time"}},
		"invalid token hash": {{ID: valid.ID, Origin: valid.Origin, TokenHash: "not-hex", CreatedAt: valid.CreatedAt}},
		"short token hash":   {{ID: valid.ID, Origin: valid.Origin, TokenHash: strings.Repeat("ab", sha256.Size-1), CreatedAt: valid.CreatedAt}},
		"duplicate id":       {valid, valid},
	}
	for name, grants := range tests {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "grants.json")
			data, err := json.Marshal(grants)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, data, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := NewPairingStore(path, time.Now); err == nil {
				t.Fatal("invalid grants accepted")
			}
		})
	}

	path := filepath.Join(t.TempDir(), "grants.json")
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewPairingStore(path, time.Now); err == nil {
		t.Fatal("malformed grant file accepted")
	}
}

func TestPairingGrantStoresSHA256HexHash(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	code, err := store.IssueCode()
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.Pair(code, "https://canvas.example.com")
	if err != nil {
		t.Fatal(err)
	}
	grants := store.Grants()
	if len(grants) != 1 {
		t.Fatalf("got %d grants, want 1", len(grants))
	}
	hash, err := hex.DecodeString(grants[0].TokenHash)
	if err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte(token))
	if !bytes.Equal(hash, want[:]) {
		t.Fatal("stored token hash is not SHA-256")
	}
}

func TestPairingRevokeRemovesOnlyExactOriginTokenPair(t *testing.T) {
	path := filepath.Join(t.TempDir(), "grants.json")
	store, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	pair := func(origin string) string {
		t.Helper()
		code, err := store.IssueCode()
		if err != nil {
			t.Fatal(err)
		}
		token, err := store.Pair(code, origin)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	token := pair("https://canvas.example.com")
	otherToken := pair("https://other.example.com")

	if err := store.Revoke(token, "https://evil.example.com"); err == nil {
		t.Fatal("wrong origin revoked a grant")
	}
	if !store.Authorize(token, "https://canvas.example.com") {
		t.Fatal("wrong-origin revoke changed the valid grant")
	}
	if err := store.Revoke(token, "https://canvas.example.com"); err != nil {
		t.Fatal(err)
	}
	if store.Authorize(token, "https://canvas.example.com") {
		t.Fatal("revoked grant remains authorized")
	}
	if !store.Authorize(otherToken, "https://other.example.com") {
		t.Fatal("unrelated grant was revoked")
	}

	reloaded, err := NewPairingStore(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Authorize(token, "https://canvas.example.com") {
		t.Fatal("revocation was not persisted")
	}
	if !reloaded.Authorize(otherToken, "https://other.example.com") {
		t.Fatal("unrelated persisted grant was removed")
	}
}

func TestPairingGrantsReturnsStableSnapshot(t *testing.T) {
	store, err := NewPairingStore(filepath.Join(t.TempDir(), "grants.json"), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	for _, origin := range []string{"https://one.example.com", "https://two.example.com"} {
		code, err := store.IssueCode()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.Pair(code, origin); err != nil {
			t.Fatal(err)
		}
	}

	grants := store.Grants()
	if len(grants) != 2 {
		t.Fatalf("got %d grants, want 2", len(grants))
	}
	if grants[0].ID > grants[1].ID {
		t.Fatal("grants are not sorted by ID")
	}
	originalOrigin := grants[0].Origin
	grants[0].Origin = "https://mutated.example.com"
	if fresh := store.Grants(); fresh[0].Origin != originalOrigin {
		t.Fatal("returned grants mutate store state")
	}
}
