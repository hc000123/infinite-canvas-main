package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
)

const maxRuntimeImageBytes = 25 << 20

type RuntimeImage struct {
	MediaRef string
	MIMEType string
	Hash     string
}

func downloadRuntimeImage(ctx context.Context, rawURL string) ([]byte, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return nil, errors.New("生成图片 URL 无效")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = func(dialCtx context.Context, network, address string) (net.Conn, error) {
		host, port, splitErr := net.SplitHostPort(address)
		if splitErr != nil {
			return nil, splitErr
		}
		addresses, lookupErr := net.DefaultResolver.LookupIPAddr(dialCtx, host)
		if lookupErr != nil || len(addresses) == 0 {
			return nil, errors.New("生成图片域名解析失败")
		}
		for _, address := range addresses {
			if runtimePublicIP(address.IP) {
				return (&net.Dialer{}).DialContext(dialCtx, network, net.JoinHostPort(address.IP.String(), port))
			}
		}
		return nil, errors.New("生成图片 URL 不能访问内网地址")
	}
	client := &http.Client{
		Transport: transport, Timeout: 5 * time.Minute,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			if request.URL.Scheme != "http" && request.URL.Scheme != "https" {
				return errors.New("生成图片跳转地址无效")
			}
			return nil
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest || response.ContentLength > maxRuntimeImageBytes {
		return nil, errors.New("生成图片下载失败")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxRuntimeImageBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxRuntimeImageBytes || !strings.HasPrefix(http.DetectContentType(data), "image/") {
		return nil, errors.New("生成图片下载内容无效")
	}
	return data, nil
}

func runtimePublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsUnspecified() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast()
}

func persistRuntimeImage(data []byte) (RuntimeImage, error) {
	if len(data) == 0 || len(data) > maxRuntimeImageBytes {
		return RuntimeImage{}, errors.New("生成图片大小无效")
	}
	mimeType := http.DetectContentType(data)
	extensions := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
	ext, ok := extensions[mimeType]
	if !ok {
		return RuntimeImage{}, errors.New("生成结果不是支持的图片格式")
	}
	digest := sha256.Sum256(data)
	hash := "sha256-" + hex.EncodeToString(digest[:])
	dir := filepath.Join(config.Cfg.PublicAssetDir, "runtime", "image")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return RuntimeImage{}, err
	}
	filename := hash + ext
	path := filepath.Join(dir, filename)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err == nil {
		if _, err = file.Write(data); err == nil {
			err = file.Close()
		} else {
			_ = file.Close()
			_ = os.Remove(path)
		}
	} else if os.IsExist(err) {
		err = nil
	}
	if err != nil {
		return RuntimeImage{}, err
	}
	return RuntimeImage{MediaRef: "/api/uploaded-assets/runtime/image/" + filename, MIMEType: mimeType, Hash: "sha256:" + hex.EncodeToString(digest[:])}, nil
}
