package service

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func TestPersistRuntimeImageUsesContentAddressedStableReference(t *testing.T) {
	original := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.PublicAssetDir = original })
	png := testRuntimePNG(t)
	first, err := persistRuntimeImage(png)
	if err != nil {
		t.Fatal(err)
	}
	second, err := persistRuntimeImage(png)
	if err != nil {
		t.Fatal(err)
	}
	if first != second || first.MIMEType != "image/png" || !strings.HasPrefix(first.MediaRef, "/api/uploaded-assets/runtime/image/sha256-") || !strings.HasSuffix(first.MediaRef, ".png") {
		t.Fatalf("first=%+v second=%+v", first, second)
	}
	entries, err := os.ReadDir(filepath.Join(config.Cfg.PublicAssetDir, "runtime", "image"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

func TestPersistRuntimeImageRejectsInvalidAndOversizedData(t *testing.T) {
	original := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() { config.Cfg.PublicAssetDir = original })
	for _, data := range [][]byte{nil, []byte("not an image"), make([]byte, maxRuntimeImageBytes+1)} {
		if _, err := persistRuntimeImage(data); err == nil {
			t.Fatalf("accepted invalid image bytes=%d", len(data))
		}
	}
	if entries, err := os.ReadDir(config.Cfg.PublicAssetDir); err == nil && len(entries) != 0 {
		t.Fatalf("invalid input created files: %v", entries)
	}
}

func testRuntimePNG(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return data
}
