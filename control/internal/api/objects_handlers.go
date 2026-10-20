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
	"time"

	"github.com/go-chi/chi/v5"
)

// downloadLinkTTL is how long a download link stays valid; long enough to start the
// download, short enough that a leaked link is useless soon after.
const downloadLinkTTL = 5 * time.Minute

func (h *Handler) listObjects(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	page, err := h.svc.ListObjects(r.Context(), chi.URLParam(r, "id"), q.Get("prefix"), q.Get("cursor"), limit)
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
	bucketID := chi.URLParam(r, "id")
	body, _, err := h.svc.OpenObject(r.Context(), bucketID, in.Key)
	if err != nil {
		writeError(w, r, err)
		return
	}
	body.Close()

	token, exp := h.downloads.issue(bucketID, in.Key)
	writeData(w, http.StatusOK, downloadLink{URL: "/api/downloads/" + token, ExpiresAt: exp})
}

// download streams the file a download link points to. It is deliberately outside the
// authenticated group: the signed token is the authorization.
func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	bucketID, key, ok := h.downloads.verify(chi.URLParam(r, "token"))
	if !ok {
		http.Error(w, "This download link is invalid or has expired. Start the download again from the dashboard.", http.StatusGone)
		return
	}
	body, obj, err := h.svc.OpenObject(r.Context(), bucketID, key)
	if err != nil {
		http.Error(w, "File not found.", http.StatusNotFound)
		return
	}
	defer body.Close()

	hd := w.Header()
	hd.Set("Content-Type", "application/octet-stream")
	if obj.ContentType != "" {
		hd.Set("Content-Type", obj.ContentType)
	}
	hd.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": path.Base(key)}))
	hd.Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	// The file is user content: never let the browser sniff or run it on this origin.
	hd.Set("X-Content-Type-Options", "nosniff")
	hd.Set("Content-Security-Policy", "sandbox")
	hd.Set("Cache-Control", "private, no-store")
	if _, err := io.Copy(w, body); err != nil {
		slog.Warn("download interrupted", "bucket", bucketID, "key", key, "err", err)
	}
}

func (h *Handler) tooLargeMessage() string {
	return fmt.Sprintf("file is larger than the %d MB upload limit", h.opts.MaxUploadBytes>>20)
}
