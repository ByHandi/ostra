package api

import "testing"

func TestPreviewableTypes(t *testing.T) {
	for _, tt := range []struct {
		key, contentType string
	}{
		{"cat.bin", "image/png"},
		{"clip.bin", "video/webm"},
		{"guide.bin", "application/pdf"},
		{"notes.bin", "text/plain; charset=utf-8"},
		{"cat.webp", ""},
		{"notes.yaml", ""},
	} {
		if !isPreviewable(tt.key, tt.contentType) {
			t.Errorf("isPreviewable(%q, %q) = false", tt.key, tt.contentType)
		}
	}
	for _, tt := range []struct {
		key, contentType string
	}{
		{"script.svg", "image/svg+xml"},
		{"archive.zip", "application/zip"},
		{"script.html", "text/html"},
	} {
		if isPreviewable(tt.key, tt.contentType) {
			t.Errorf("isPreviewable(%q, %q) = true", tt.key, tt.contentType)
		}
	}
}

func TestPreviewContentType(t *testing.T) {
	if got := previewContentType("cat.png", "application/octet-stream"); got != "image/png" {
		t.Fatalf("inferred content type = %q, want image/png", got)
	}
	if got := previewContentType("notes.txt", "text/plain; charset=utf-8"); got != "text/plain; charset=utf-8" {
		t.Fatalf("stored content type = %q", got)
	}
}

func TestTextPreviewTypes(t *testing.T) {
	if !isTextPreview("notes.bin", "text/plain") || !isTextPreview("notes.json", "") {
		t.Fatal("expected text previews")
	}
	if isTextPreview("movie.webm", "video/webm") {
		t.Fatal("video must not be a text preview")
	}
}
