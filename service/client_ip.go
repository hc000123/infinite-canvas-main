package service

import (
	"errors"
	"net/netip"
	"strings"
)

func NormalizeIPPrefix(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || strings.Contains(value, "%") {
		return "", errors.New("IP 或网段格式无效")
	}
	if addr, err := netip.ParseAddr(value); err == nil {
		addr = addr.Unmap()
		bits := 128
		if addr.Is4() {
			bits = 32
		}
		return netip.PrefixFrom(addr, bits).String(), nil
	}
	prefix, err := netip.ParsePrefix(value)
	if err != nil {
		return "", errors.New("IP 或网段格式无效")
	}
	addr := prefix.Addr().Unmap()
	bits := prefix.Bits()
	if addr.Is4() && bits > 32 {
		bits -= 96
	}
	return netip.PrefixFrom(addr, bits).Masked().String(), nil
}

func IPMatchesPrefixes(ip string, prefixes []string) bool {
	addr, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil {
		return false
	}
	addr = addr.Unmap()
	for _, value := range prefixes {
		normalized, err := NormalizeIPPrefix(value)
		if err != nil {
			continue
		}
		prefix, _ := netip.ParsePrefix(normalized)
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}
