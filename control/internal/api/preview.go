package api

import (
	"mime"
	"path"
	"strings"
)

const maxTextPreviewBytes = 1 << 20

func isPreviewable(key, contentType string) bool {
	media, _, _ := mime.ParseMediaType(contentType)
	if strings.HasPrefix(media, "image/") && media != "image/svg+xml" {
		return true
	}
	if strings.HasPrefix(media, "video/") || media == "application/pdf" {
		return true
	}
	if strings.HasPrefix(media, "text/") && media != "text/html" {
		return true
	}

	switch strings.ToLower(path.Ext(key)) {
	case ".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp", ".mp4", ".webm", ".pdf", ".csv", ".json", ".log", ".md", ".txt", ".xml", ".yaml", ".yml":
		return true
	default:
		return false
	}
}

func previewContentType(key, contentType string) string {
	media, _, _ := mime.ParseMediaType(contentType)
	if media != "" && media != "application/octet-stream" {
		return contentType
	}
	if inferred := mime.TypeByExtension(strings.ToLower(path.Ext(key))); inferred != "" {
		return inferred
	}
	return contentType
}

func isTextPreview(key, contentType string) bool {
	media, _, _ := mime.ParseMediaType(contentType)
	if strings.HasPrefix(media, "text/") && media != "text/html" {
		return true
	}
	switch strings.ToLower(path.Ext(key)) {
	case ".csv", ".json", ".log", ".md", ".txt", ".xml", ".yaml", ".yml":
		return true
	default:
		return false
	}
}
