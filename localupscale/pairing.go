package localupscale

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sort"
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
		TokenHash: base64.RawURLEncoding.EncodeToString(hash[:]),
		CreatedAt: s.now().UTC().Format(time.RFC3339),
	}
	s.grants[id] = grant
	if err := s.persist(); err != nil {
		delete(s.grants, id)
		return "", err
	}
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
	encodedHash := base64.RawURLEncoding.EncodeToString(hash[:])
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
	encodedHash := base64.RawURLEncoding.EncodeToString(hash[:])
	for id, grant := range s.grants {
		if grant.Origin != origin || subtle.ConstantTimeCompare([]byte(grant.TokenHash), []byte(encodedHash)) != 1 {
			continue
		}
		delete(s.grants, id)
		if err := s.persist(); err != nil {
			s.grants[id] = grant
			return err
		}
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

func (s *PairingStore) persist() error {
	grants := make([]Grant, 0, len(s.grants))
	for _, grant := range s.grants {
		grants = append(grants, grant)
	}
	sort.Slice(grants, func(i, j int) bool { return grants[i].ID < grants[j].ID })
	data, err := json.Marshal(grants)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(s.path, data, 0o600); err != nil {
		return err
	}
	return os.Chmod(s.path, 0o600)
}

func randomText(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}
