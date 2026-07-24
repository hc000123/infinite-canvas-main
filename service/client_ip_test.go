package service

import "testing"

func TestNormalizeIPPrefix(t *testing.T) {
	cases := map[string]string{"203.0.113.8": "203.0.113.8/32", "10.20.0.0/16": "10.20.0.0/16", "2001:db8::1": "2001:db8::1/128", "2001:db8::/48": "2001:db8::/48"}
	for input, want := range cases {
		got, err := NormalizeIPPrefix(input)
		if err != nil || got != want {
			t.Fatalf("NormalizeIPPrefix(%q)=%q err=%v want=%q", input, got, err, want)
		}
	}
}

func TestIPMatchesPrefixes(t *testing.T) {
	if !IPMatchesPrefixes("10.20.5.8", []string{"10.20.0.0/16"}) || IPMatchesPrefixes("10.21.5.8", []string{"10.20.0.0/16"}) {
		t.Fatal("prefix match wrong")
	}
}
