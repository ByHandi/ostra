package api

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/service"
)

// downloadLinkTTL is how long a download link stays valid; long enough to start the
// download, short enough that a leaked link is useless soon after.
const (
	downloadLinkTTL = 5 * time.Minute
	shareLinkHour   = time.Hour
	shareLinkDay    = 24 * time.Hour
	shareLinkWeek   = 7 * 24 * time.Hour
)

func (h *Handler) listObjects(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	page, err := h.svc.ListObjects(r.Context(), chi.URLParam(r, "id"), service.ListObjectsOptions{
		Prefix: q.Get("prefix"),
		Cursor: q.Get("cursor"),
		Limit:  limit,
		Search: q.Get("search"),
		SortBy: q.Get("sortBy"),
		Order:  q.Get("order"),
	})
	respond(w, r, http.StatusOK, page, err)
}

// uploadObject stores the raw request body as the file named by ?key=.
func (h *Handler) uploadObject(w http.ResponseWriter, r *http.Request) {
	if h.opts.MaxUploadBytes > 0 && r.ContentLength > h.opts.MaxUploadBytes {
		writeFail(w, http.StatusRequestEntityTooLarge, "too_large", h.tooLargeMessage(), nil)
		return
	}
	body := io.Reader(r.Body)
	if h.opts.MaxUploadBytes > 0 {
		body = http.MaxBytesReader(w, r.Body, h.opts.MaxUploadBytes)
	}

	obj, err := h.svc.PutObject(r.Context(), chi.URLParam(r, "id"), r.URL.Query().Get("key"),
		body, r.ContentLength, r.Header.Get("Content-Type"))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeFail(w, http.StatusRequestEntityTooLarge, "too_large", h.tooLargeMessage(), nil)
		return
	}
	respond(w, r, http.StatusCreated, obj, err)
}

// deleteObjects deletes one file (?key=) or a whole folder (?prefix=).
func (h *Handler) deleteObjects(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	bucketID := chi.URLParam(r, "id")
	key, prefix := q.Get("key"), q.Get("prefix")

	switch {
	case key != "" && prefix == "":
		err := h.svc.DeleteObject(r.Context(), bucketID, key)
		respond(w, r, http.StatusOK, map[string]int{"deleted": 1}, err)
	case prefix != "" && key == "":
		n, err := h.svc.DeleteFolder(r.Context(), bucketID, prefix)
		respond(w, r, http.StatusOK, map[string]int{"deleted": n}, err)
	default:
		writeFail(w, http.StatusBadRequest, "validation", "pass either key or prefix", nil)
	}
}

type copyMoveObjectRequest struct {
	Src  string `json:"src"`
	Dest string `json:"dest"`
}

func (h *Handler) copyObject(w http.ResponseWriter, r *http.Request) {
	var in copyMoveObjectRequest
	if !decode(w, r, &in) {
		return
	}
	bucketID := chi.URLParam(r, "id")
	if strings.HasSuffix(in.Src, "/") || strings.HasSuffix(in.Dest, "/") {
		n, err := h.svc.CopyFolder(r.Context(), bucketID, in.Src, in.Dest)
		respond(w, r, http.StatusOK, map[string]int{"copied": n}, err)
		return
	}
	err := h.svc.CopyObject(r.Context(), bucketID, in.Src, in.Dest)
	respond(w, r, http.StatusOK, map[string]int{"copied": 1}, err)
}

func (h *Handler) moveObject(w http.ResponseWriter, r *http.Request) {
	var in copyMoveObjectRequest
	if !decode(w, r, &in) {
		return
	}
	bucketID := chi.URLParam(r, "id")
	if strings.HasSuffix(in.Src, "/") || strings.HasSuffix(in.Dest, "/") {
		n, err := h.svc.MoveFolder(r.Context(), bucketID, in.Src, in.Dest)
		respond(w, r, http.StatusOK, map[string]int{"moved": n}, err)
		return
	}
	err := h.svc.MoveObject(r.Context(), bucketID, in.Src, in.Dest)
	respond(w, r, http.StatusOK, map[string]int{"moved": 1}, err)
}

type updateMetadataRequest struct {
	ContentType        string `json:"contentType"`
	CacheControl       string `json:"cacheControl"`
	ContentDisposition string `json:"contentDisposition"`
}

func (h *Handler) getObjectMetadata(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	meta, err := h.svc.GetObjectMetadata(r.Context(), chi.URLParam(r, "id"), key)
	respond(w, r, http.StatusOK, meta, err)
}

func (h *Handler) updateObjectMetadata(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	var in updateMetadataRequest
	if !decode(w, r, &in) {
		return
	}
	meta, err := h.svc.UpdateObjectMetadata(r.Context(), chi.URLParam(r, "id"), key, objects.Metadata{
		ContentType:        in.ContentType,
		CacheControl:       in.CacheControl,
		ContentDisposition: in.ContentDisposition,
	})
	respond(w, r, http.StatusOK, meta, err)
}

type downloadLink struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// createDownloadLink checks that the file exists, then returns a short-lived link to it.
func (h *Handler) createDownloadLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key string `json:"key"`
	}
	if !decode(w, r, &in) {
		return
	}
	h.createObjectLink(w, r, in.Key, downloadLinkTTL)
}

// createShareLink returns a link that can be shared with anyone until its selected expiry.
func (h *Handler) createShareLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key       string `json:"key"`
		ExpiresIn string `json:"expiresIn"`
	}
	if !decode(w, r, &in) {
		return
	}
	ttl, ok := shareLinkTTL(in.ExpiresIn)
	if !ok {
		writeFail(w, http.StatusBadRequest, "validation", "expiresIn must be one of 1h, 1d, or 7d", map[string][]string{
			"expiresIn": {"choose 1 hour, 1 day, or 7 days"},
		})
		return
	}
	h.createObjectLink(w, r, in.Key, ttl)
}

func (h *Handler) createObjectLink(w http.ResponseWriter, r *http.Request, key string, ttl time.Duration) {
	bucketID := chi.URLParam(r, "id")
	body, _, err := h.svc.OpenObject(r.Context(), bucketID, key)
	if err != nil {
		writeError(w, r, err)
		return
	}
	body.Close()

	token, exp := h.downloads.issueWithTTL(bucketID, key, ttl)
	writeData(w, http.StatusOK, downloadLink{URL: "/api/downloads/" + token, ExpiresAt: exp})
}

// createPreviewLink checks a previewable file and returns a short-lived inline link.
func (h *Handler) createPreviewLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Key string `json:"key"`
	}
	if !decode(w, r, &in) {
		return
	}
	bucketID := chi.URLParam(r, "id")
	body, obj, err := h.svc.OpenObject(r.Context(), bucketID, in.Key)
	if err != nil {
		writeError(w, r, err)
		return
	}
	body.Close()
	if !isPreviewable(in.Key, obj.ContentType) {
		writeFail(w, http.StatusBadRequest, "validation", "file type cannot be previewed", map[string][]string{
			"key": {"choose an image, video, PDF, or text file"},
		})
		return
	}
	if isTextPreview(in.Key, obj.ContentType) && obj.Size > maxTextPreviewBytes {
		writeFail(w, http.StatusBadRequest, "validation", "text file is too large to preview", map[string][]string{
			"key": {"choose a text file smaller than 1 MB"},
		})
		return
	}

	token, exp := h.downloads.issuePreview(bucketID, in.Key)
	writeData(w, http.StatusOK, downloadLink{URL: "/api/downloads/" + token, ExpiresAt: exp})
}

func shareLinkTTL(expiresIn string) (time.Duration, bool) {
	switch expiresIn {
	case "1h":
		return shareLinkHour, true
	case "1d":
		return shareLinkDay, true
	case "7d":
		return shareLinkWeek, true
	default:
		return 0, false
	}
}

// download streams the file a download link points to. It is deliberately outside the
// authenticated group: the signed token is the authorization.
func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.downloads.verify(chi.URLParam(r, "token"))
	if !ok {
		http.Error(w, "This download link is invalid or has expired. Start the download again from the dashboard.", http.StatusGone)
		return
	}
	body, obj, err := h.svc.OpenObject(r.Context(), claims.Bucket, claims.Key)
	if err != nil {
		http.Error(w, "File not found.", http.StatusNotFound)
		return
	}
	defer body.Close()

	hd := w.Header()
	contentType := obj.ContentType
	if claims.Preview {
		contentType = previewContentType(claims.Key, contentType)
	}
	hd.Set("Content-Type", "application/octet-stream")
	if contentType != "" {
		hd.Set("Content-Type", contentType)
	}
	disposition := "attachment"
	if claims.Preview && isPreviewable(claims.Key, obj.ContentType) {
		disposition = "inline"
	}
	hd.Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": path.Base(claims.Key)}))
	hd.Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	// The file is user content: never let the browser sniff or run it on this origin.
	hd.Set("X-Content-Type-Options", "nosniff")
	hd.Set("Content-Security-Policy", "sandbox")
	hd.Set("Cache-Control", "private, no-store")
	if _, err := io.Copy(w, body); err != nil {
		slog.Warn("download interrupted", "bucket", claims.Bucket, "key", claims.Key, "err", err)
	}
}

func (h *Handler) tooLargeMessage() string {
	return fmt.Sprintf("file is larger than the %d MB upload limit", h.opts.MaxUploadBytes>>20)
}
