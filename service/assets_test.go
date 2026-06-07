package service

import (
	"bytes"
	"mime/multipart"
	"net/textproto"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
)

func TestSaveAssetMediaRejectsSVGImageUpload(t *testing.T) {
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})

	header := &multipart.FileHeader{
		Filename: "unsafe.svg",
		Header:   textproto.MIMEHeader{"Content-Type": {"image/svg+xml"}},
	}
	_, err := SaveAssetMedia(nopMultipartFile{Reader: bytes.NewReader([]byte(`<svg onload="alert(1)"/>`))}, header)
	if err == nil || !strings.Contains(err.Error(), "仅支持上传") {
		t.Fatalf("SaveAssetMedia error = %v, want unsupported upload error", err)
	}
}

func TestSaveAssetMediaUsesDetectedExtension(t *testing.T) {
	oldPublicAssetDir := config.Cfg.PublicAssetDir
	config.Cfg.PublicAssetDir = t.TempDir()
	t.Cleanup(func() {
		config.Cfg.PublicAssetDir = oldPublicAssetDir
	})

	header := &multipart.FileHeader{
		Filename: "portrait.svg",
		Header:   textproto.MIMEHeader{"Content-Type": {"image/jpeg"}},
	}
	result, err := SaveAssetMedia(nopMultipartFile{Reader: bytes.NewReader([]byte{0xff, 0xd8, 0xff, 0xdb})}, header)
	if err != nil {
		t.Fatalf("SaveAssetMedia returned error: %v", err)
	}
	if ext := filepath.Ext(result.URL); ext != ".jpg" {
		t.Fatalf("uploaded URL extension = %q, want .jpg", ext)
	}
}

type nopMultipartFile struct {
	*bytes.Reader
}

func (file nopMultipartFile) Close() error {
	return nil
}
