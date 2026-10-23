package service

import (
	"context"
	"strings"
	"testing"

	"github.com/ByHandi/ostra/control/internal/objects"
)

func TestGetBucketCORSEmpty(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	cfg, err := svc.GetBucketCORS(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketCORS: %v", err)
	}
	if len(cfg.Rules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(cfg.Rules))
	}
}

func TestSetAndGetBucketCORS(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	in := objects.CORSConfiguration{
		Rules: []objects.CORSRule{
			{
				ID:             "rule-1",
				AllowedOrigins: []string{" https://example.com ", "http://localhost:3000"},
				AllowedMethods: []string{"get", "put ", "HEAD"},
				AllowedHeaders: []string{" Authorization ", "*"},
				ExposeHeaders:  []string{"ETag"},
				MaxAgeSeconds:  3600,
			},
		},
	}

	applied, err := svc.SetBucketCORS(ctx, "id-assets", in)
	if err != nil {
		t.Fatalf("SetBucketCORS: %v", err)
	}
	if len(applied.Rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(applied.Rules))
	}
	rule := applied.Rules[0]
	if rule.AllowedOrigins[0] != "https://example.com" {
		t.Errorf("expected trimmed origin, got %q", rule.AllowedOrigins[0])
	}
	if rule.AllowedMethods[0] != "GET" || rule.AllowedMethods[1] != "PUT" || rule.AllowedMethods[2] != "HEAD" {
		t.Errorf("expected normalized methods [GET PUT HEAD], got %v", rule.AllowedMethods)
	}

	fetched, err := svc.GetBucketCORS(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketCORS: %v", err)
	}
	if len(fetched.Rules) != 1 {
		t.Fatalf("expected 1 fetched rule, got %d", len(fetched.Rules))
	}
	if fetched.Rules[0].ID != "rule-1" {
		t.Errorf("expected rule ID rule-1, got %q", fetched.Rules[0].ID)
	}
}

func TestDeleteBucketCORS(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	_, err := svc.SetBucketCORS(ctx, "id-assets", objects.CORSConfiguration{
		Rules: []objects.CORSRule{
			{
				AllowedOrigins: []string{"*"},
				AllowedMethods: []string{"GET"},
			},
		},
	})
	if err != nil {
		t.Fatalf("SetBucketCORS: %v", err)
	}

	if err := svc.DeleteBucketCORS(ctx, "id-assets"); err != nil {
		t.Fatalf("DeleteBucketCORS: %v", err)
	}

	fetched, err := svc.GetBucketCORS(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketCORS after delete: %v", err)
	}
	if len(fetched.Rules) != 0 {
		t.Fatalf("expected 0 rules after delete, got %d", len(fetched.Rules))
	}
}

func TestSetBucketCORSEmptyRulesClears(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	_, err := svc.SetBucketCORS(ctx, "id-assets", objects.CORSConfiguration{
		Rules: []objects.CORSRule{
			{AllowedOrigins: []string{"*"}, AllowedMethods: []string{"GET"}},
		},
	})
	if err != nil {
		t.Fatalf("SetBucketCORS: %v", err)
	}

	cleared, err := svc.SetBucketCORS(ctx, "id-assets", objects.CORSConfiguration{Rules: []objects.CORSRule{}})
	if err != nil {
		t.Fatalf("SetBucketCORS empty: %v", err)
	}
	if len(cleared.Rules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(cleared.Rules))
	}

	fetched, err := svc.GetBucketCORS(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketCORS: %v", err)
	}
	if len(fetched.Rules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(fetched.Rules))
	}
}

func TestSetBucketCORSValidation(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	cases := []struct {
		name string
		cfg  objects.CORSConfiguration
		msg  string
	}{
		{
			name: "missing origins",
			cfg: objects.CORSConfiguration{
				Rules: []objects.CORSRule{
					{AllowedOrigins: []string{}, AllowedMethods: []string{"GET"}},
				},
			},
			msg: "at least one allowed origin",
		},
		{
			name: "blank origins",
			cfg: objects.CORSConfiguration{
				Rules: []objects.CORSRule{
					{AllowedOrigins: []string{"  ", ""}, AllowedMethods: []string{"GET"}},
				},
			},
			msg: "at least one allowed origin",
		},
		{
			name: "missing methods",
			cfg: objects.CORSConfiguration{
				Rules: []objects.CORSRule{
					{AllowedOrigins: []string{"*"}, AllowedMethods: []string{}},
				},
			},
			msg: "at least one allowed method",
		},
		{
			name: "unsupported method",
			cfg: objects.CORSConfiguration{
				Rules: []objects.CORSRule{
					{AllowedOrigins: []string{"*"}, AllowedMethods: []string{"PATCH"}},
				},
			},
			msg: "unsupported HTTP method",
		},
		{
			name: "negative max age",
			cfg: objects.CORSConfiguration{
				Rules: []objects.CORSRule{
					{AllowedOrigins: []string{"*"}, AllowedMethods: []string{"GET"}, MaxAgeSeconds: -5},
				},
			},
			msg: "non-negative",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.SetBucketCORS(ctx, "id-assets", tc.cfg)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.msg)
			}
			if !strings.Contains(err.Error(), tc.msg) {
				t.Fatalf("expected error containing %q, got %q", tc.msg, err.Error())
			}
		})
	}
}

func TestBucketCORSNotFound(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	if _, err := svc.GetBucketCORS(ctx, "non-existent"); err == nil {
		t.Fatal("expected error for non-existent bucket, got nil")
	}
}

func TestBucketCORSAccessDeniedRetry(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	st.denyNext = 1 // simulate permission missing initially
	svc, _ := newObjectService(t, g, st)

	cfg, err := svc.GetBucketCORS(ctx, "id-assets")
	if err != nil {
		t.Fatalf("expected retry to succeed, got %v", err)
	}
	if len(cfg.Rules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(cfg.Rules))
	}
}
