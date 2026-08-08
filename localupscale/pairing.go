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

const maxPairingCodeAttempts = 32

type PairingStore struct {
	mu           sync.Mutex
	path         string
	now          func() time.Time
	generateCode func() (string, error)
	fileOps      pairingFileOps
	codes        map[string]pairingCode
	grants       map[string]Grant
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

type pairingFileOps interface {
	CreateTemp(dir, pattern string) (pairingTempFile, error)
	OpenDirectory(path string) (pairingDirectory, error)
	Rename(oldPath, newPath string) error
	Remove(path string) error
}

type pairingTempFile interface {
	Name() string
	Chmod(os.FileMode) error
	Write([]byte) (int, error)
	Sync() error
	Close() error
}

type pairingDirectory interface {
	Sync() error
	Close() error
}

type osPairingFileOps struct{}

func (osPairingFileOps) CreateTemp(dir, pattern string) (pairingTempFile, error) {
	return os.CreateTemp(dir, pattern)
}

func (osPairingFileOps) OpenDirectory(path string) (pairingDirectory, error) {
	return os.Open(path)
}

func (osPairingFileOps) Rename(oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
}

func (osPairingFileOps) Remove(path string) error {
	return os.Remove(path)
}

type pairingPersistenceError struct {
	err       error
	committed bool
}

func (e *pairingPersistenceError) Error() string { return e.err.Error() }
func (e *pairingPersistenceError) Unwrap() error { return e.err }

func NewPairingStore(path string, now func() time.Time) (*PairingStore, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("pairing store path is required")
	}
	if now == nil {
		return nil, errors.New("pairing store clock is required")
	}
	path, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	path, err = canonicalPairingStoragePath(path)
	if err != nil {
		return nil, err
	}
	dir := filepath.Dir(path)
	if err := preparePairingDirectory(dir); err != nil {
		return nil, err
	}
	store := &PairingStore{
		path:         path,
		now:          now,
		generateCode: randomPairingCode,
		fileOps:      osPairingFileOps{},
		codes:        make(map[string]pairingCode),
		grants:       make(map[string]Grant),
	}
	fileInfo, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if fileInfo.Mode()&os.ModeSymlink != 0 || !fileInfo.Mode().IsRegular() {
		return nil, errors.New("pairing grant path is not a regular file")
	}
	data, err := os.ReadFile(path)
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

	current := ""
	for code := range s.codes {
		current = code
	}
	for range maxPairingCodeAttempts {
		code, err := s.generateCode()
		if err != nil {
			return "", err
		}
		if code == current {
			continue
		}
		clear(s.codes)
		s.codes[code] = pairingCode{expiresAt: s.now().Add(5 * time.Minute)}
		return code, nil
	}
	return "", errors.New("pairing code collision limit reached")
}

func (s *PairingStore) Pair(code, origin string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateOrigin(origin); err != nil {
		return "", err
	}
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
		if persistenceCommitted(err) {
			// Rename already made this grant visible. Return its token with the
			// durability error while keeping memory aligned with the file.
			s.grants = grants
			delete(s.codes, code)
			return token, err
		}
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
			if persistenceCommitted(err) {
				// The visible file no longer contains the grant even though the
				// directory sync failed, so commit the same revocation in memory.
				s.grants = grants
			}
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
	return writeGrantsWithOps(s.fileOps, s.path, data)
}

func randomText(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func randomPairingCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func validateGrant(grant Grant) error {
	if grant.ID == "" {
		return errors.New("grant ID is required")
	}
	if err := validateOrigin(grant.Origin); err != nil {
		return err
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

func validateOrigin(origin string) error {
	if strings.TrimSpace(origin) == "" {
		return errors.New("pairing origin is required")
	}
	return nil
}

func preparePairingDirectory(dir string) error {
	root := filepath.Clean(filepath.VolumeName(dir) + string(filepath.Separator))
	missing, err := checkPairingDirectoryComponents(root, dir, true)
	if err != nil {
		return err
	}
	if !missing {
		return validatePrivatePairingDirectory(dir)
	}
	if _, _, err := nearestExistingPairingAncestor(dir, os.Lstat); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if _, err := checkPairingDirectoryComponents(root, dir, false); err != nil {
		return err
	}
	return validatePrivatePairingDirectory(dir)
}

func nearestExistingPairingAncestor(path string, lstat func(string) (os.FileInfo, error)) (string, os.FileInfo, error) {
	current := filepath.Clean(path)
	for {
		info, err := lstat(current)
		if err == nil {
			return current, info, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", nil, err
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", nil, fmt.Errorf("no existing pairing store ancestor above %s", path)
		}
		current = parent
	}
}

func pathWithin(base, target string) bool {
	relative, err := filepath.Rel(base, target)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func checkPairingDirectoryComponents(start, dir string, allowMissing bool) (bool, error) {
	relative, err := filepath.Rel(start, dir)
	if err != nil {
		return false, err
	}
	components := []string{"."}
	if relative != "." {
		components = append(components, strings.Split(relative, string(filepath.Separator))...)
	}
	current := start
	for _, component := range components {
		if component != "." {
			current = filepath.Join(current, component)
		}
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) && allowMissing {
			return true, nil
		}
		if err != nil {
			return false, err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return false, fmt.Errorf("pairing store path contains symlink: %s", current)
		}
		if !info.IsDir() {
			return false, fmt.Errorf("pairing store path is not a directory: %s", current)
		}
		if info.Mode().Perm()&0o022 != 0 && !(info.Mode()&os.ModeSticky != 0 && info.Mode().Perm()&0o002 != 0) {
			return false, fmt.Errorf("pairing store directory is group/other writable: %s (%o)", current, info.Mode().Perm())
		}
	}
	return false, nil
}

func validatePrivatePairingDirectory(dir string) error {
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("pairing store directory is group/other writable: %o", info.Mode().Perm())
	}
	return nil
}

func canonicalPairingStoragePath(path string) (string, error) {
	lexicalTempRoot, err := filepath.Abs(filepath.Clean(os.TempDir()))
	if err != nil {
		return "", err
	}
	canonicalTempRoot, err := filepath.EvalSymlinks(lexicalTempRoot)
	if err != nil {
		return "", err
	}
	if !pathWithin(lexicalTempRoot, path) {
		return path, nil
	}
	relative, err := filepath.Rel(lexicalTempRoot, path)
	if err != nil {
		return "", err
	}
	// Only normalize the system-provided temp root alias (not arbitrary storage
	// symlinks) so macOS /var temp paths can still receive a full component walk.
	return filepath.Join(canonicalTempRoot, relative), nil
}

func cloneGrants(grants map[string]Grant) map[string]Grant {
	clone := make(map[string]Grant, len(grants))
	for id, grant := range grants {
		clone[id] = grant
	}
	return clone
}

func writeGrantsAtomically(path string, data []byte) error {
	return writeGrantsWithOps(osPairingFileOps{}, path, data)
}

func writeGrantsWithOps(ops pairingFileOps, path string, data []byte) (result error) {
	dir := filepath.Dir(path)
	directory, err := ops.OpenDirectory(dir)
	if err != nil {
		return newPairingPersistenceError(err, false)
	}
	committed := false
	defer func() {
		if directory != nil {
			result = joinPairingPersistenceError(result, directory.Close(), committed)
		}
	}()
	file, err := ops.CreateTemp(dir, ".grants-*.tmp")
	if err != nil {
		return newPairingPersistenceError(err, false)
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if file != nil {
			result = joinPairingPersistenceError(result, file.Close(), committed)
		}
		if removeTemp {
			removeErr := ops.Remove(tempPath)
			if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
				result = joinPairingPersistenceError(result, removeErr, committed)
			}
		}
	}()
	if err := file.Chmod(0o600); err != nil {
		return newPairingPersistenceError(err, false)
	}
	written, err := file.Write(data)
	if err != nil {
		return newPairingPersistenceError(err, false)
	}
	if written != len(data) {
		return newPairingPersistenceError(io.ErrShortWrite, false)
	}
	if err := file.Sync(); err != nil {
		return newPairingPersistenceError(err, false)
	}
	if err := file.Close(); err != nil {
		return newPairingPersistenceError(err, false)
	}
	file = nil
	if err := ops.Rename(tempPath, path); err != nil {
		return newPairingPersistenceError(err, false)
	}
	removeTemp = false
	committed = true
	if err := directory.Sync(); err != nil {
		return newPairingPersistenceError(err, true)
	}
	if err := directory.Close(); err != nil {
		directory = nil
		return newPairingPersistenceError(err, true)
	}
	directory = nil
	return nil
}

func newPairingPersistenceError(err error, committed bool) error {
	if err == nil {
		return nil
	}
	return &pairingPersistenceError{err: err, committed: committed}
}

func joinPairingPersistenceError(current, next error, committed bool) error {
	if next == nil {
		return current
	}
	wrapped := newPairingPersistenceError(next, committed)
	if current == nil {
		return wrapped
	}
	return errors.Join(current, wrapped)
}

func persistenceCommitted(err error) bool {
	var persistenceErr *pairingPersistenceError
	return errors.As(err, &persistenceErr) && persistenceErr.committed
}
