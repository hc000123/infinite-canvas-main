package localupscale

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
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
