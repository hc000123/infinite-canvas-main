package localupscale

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type PairingStore struct {
	mu     sync.Mutex
	path   string
	now    func() time.Time
	codes  map[string]pairingCode
	grants map[string]Grant
}

type Grant struct {
	ID        string `json:"id"`
	Origin    string `json:"origin"`
	TokenHash string `json:"tokenHash"`
	CreatedAt string `json:"createdAt"`
}

type pairingCode struct {
	expiresAt time.Time
	attempts  int
}

func NewPairingStore(path string, now func() time.Time) (*PairingStore, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("pairing store path is required")
	}
	if now == nil {
		return nil, errors.New("pairing store clock is required")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	// A filename-only path uses the caller's current directory; never chmod it
	// (or the filesystem root) as though it were the helper's private directory.
	if dir != "." && dir != string(filepath.Separator) {
		if err := os.Chmod(dir, 0o700); err != nil {
			return nil, err
		}
	}
	store := &PairingStore{
		path:   path,
		now:    now,
		codes:  make(map[string]pairingCode),
		grants: make(map[string]Grant),
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return nil, err
	}
	var grants []Grant
	if err := json.Unmarshal(data, &grants); err != nil {
		return nil, err
	}
	for _, grant := range grants {
		if err := validateGrant(grant); err != nil {
			return nil, err
		}
		if _, exists := store.grants[grant.ID]; exists {
			return nil, fmt.Errorf("duplicate grant ID: %s", grant.ID)
		}
		store.grants[grant.ID] = grant
	}
	return store, nil
}

func (s *PairingStore) IssueCode() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	code := fmt.Sprintf("%06d", value.Int64())
	clear(s.codes)
	s.codes[code] = pairingCode{expiresAt: s.now().Add(5 * time.Minute)}
	return code, nil
}

func (s *PairingStore) Pair(code, origin string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	pairing, ok := s.codes[code]
	if !ok {
		s.recordFailedAttempt()
		return "", errors.New("invalid pairing code")
	}
	if !s.now().Before(pairing.expiresAt) {
		delete(s.codes, code)
		return "", errors.New("expired pairing code")
	}
	token, err := randomText(32)
	if err != nil {
		return "", err
	}
	id, err := randomText(16)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(token))
	grant := Grant{
		ID:        id,
		Origin:    origin,
		TokenHash: hex.EncodeToString(hash[:]),
		CreatedAt: s.now().UTC().Format(time.RFC3339),
	}
	grants := cloneGrants(s.grants)
	grants[id] = grant
	if err := s.persist(grants); err != nil {
		return "", err
	}
	s.grants = grants
	delete(s.codes, code)
	return token, nil
}

func (s *PairingStore) recordFailedAttempt() {
	now := s.now()
	for code, pairing := range s.codes {
		if !now.Before(pairing.expiresAt) {
			delete(s.codes, code)
			continue
		}
		pairing.attempts++
		if pairing.attempts >= 5 {
			delete(s.codes, code)
			continue
		}
		s.codes[code] = pairing
	}
}

func (s *PairingStore) Authorize(token, origin string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := sha256.Sum256([]byte(token))
	encodedHash := hex.EncodeToString(hash[:])
	for _, grant := range s.grants {
		if grant.Origin == origin && subtle.ConstantTimeCompare([]byte(grant.TokenHash), []byte(encodedHash)) == 1 {
			return true
		}
	}
	return false
}

func (s *PairingStore) Revoke(token, origin string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := sha256.Sum256([]byte(token))
	encodedHash := hex.EncodeToString(hash[:])
	for id, grant := range s.grants {
		if grant.Origin != origin || subtle.ConstantTimeCompare([]byte(grant.TokenHash), []byte(encodedHash)) != 1 {
			continue
		}
		grants := cloneGrants(s.grants)
		delete(grants, id)
		if err := s.persist(grants); err != nil {
			return err
		}
		s.grants = grants
		return nil
	}
	return errors.New("grant not found")
}

func (s *PairingStore) Grants() []Grant {
	s.mu.Lock()
	defer s.mu.Unlock()

	grants := make([]Grant, 0, len(s.grants))
	for _, grant := range s.grants {
		grants = append(grants, grant)
	}
	sort.Slice(grants, func(i, j int) bool { return grants[i].ID < grants[j].ID })
	return grants
}

func (s *PairingStore) persist(grantMap map[string]Grant) error {
	grants := make([]Grant, 0, len(grantMap))
	for _, grant := range grantMap {
		grants = append(grants, grant)
	}
	sort.Slice(grants, func(i, j int) bool { return grants[i].ID < grants[j].ID })
	data, err := json.Marshal(grants)
	if err != nil {
		return err
	}
	return writeGrantsAtomically(s.path, data)
}

func randomText(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func validateGrant(grant Grant) error {
	if grant.ID == "" {
		return errors.New("grant ID is required")
	}
	if grant.Origin == "" {
		return errors.New("grant origin is required")
	}
	if _, err := time.Parse(time.RFC3339, grant.CreatedAt); err != nil {
		return fmt.Errorf("invalid grant creation time: %w", err)
	}
	hash, err := hex.DecodeString(grant.TokenHash)
	if err != nil || len(hash) != sha256.Size {
		return errors.New("invalid grant token hash")
	}
	return nil
}

func cloneGrants(grants map[string]Grant) map[string]Grant {
	clone := make(map[string]Grant, len(grants))
	for id, grant := range grants {
		clone[id] = grant
	}
	return clone
}

func writeGrantsAtomically(path string, data []byte) (err error) {
	dir := filepath.Dir(path)
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	file, err := os.CreateTemp(dir, ".grants-*.tmp")
	if err != nil {
		return err
	}
	tempPath := file.Name()
	defer func() {
		if file != nil {
			_ = file.Close()
		}
		if err != nil {
			_ = os.Remove(tempPath)
		}
	}()
	if err = file.Chmod(0o600); err != nil {
		return err
	}
	written, err := file.Write(data)
	if err != nil {
		return err
	}
	if written != len(data) {
		return io.ErrShortWrite
	}
	if err = file.Sync(); err != nil {
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	file = nil
	if err = os.Rename(tempPath, path); err != nil {
		return err
	}
	// Rename is the commit point. A directory sync failure cannot be rolled back
	// safely, so keep the visible file and in-memory candidate in agreement.
	_ = directory.Sync()
	return nil
}
