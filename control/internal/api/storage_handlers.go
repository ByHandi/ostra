package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ByHandi/ostra/control/internal/dnscheck"
	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/service"
	"github.com/ByHandi/ostra/control/internal/store"
)

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	o, err := h.svc.Overview(r.Context())
	respond(w, r, http.StatusOK, o, err)
}

// ── Buckets ────────────────────────────────────────────────────────────────

func (h *Handler) listBuckets(w http.ResponseWriter, r *http.Request) {
	buckets, err := h.svc.ListBuckets(r.Context())
	respond(w, r, http.StatusOK, buckets, err)
}

func (h *Handler) createBucket(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &in) {
		return
	}
	b, err := h.svc.CreateBucket(r.Context(), in.Name)
	respond(w, r, http.StatusCreated, b, err)
}

// bucketDetailResponse adds custom domain details (status, DNS) to the bucket detail.
type bucketDetailResponse struct {
	service.BucketDetail
	DomainRecords []domainResponse `json:"domainRecords"`
}

func (h *Handler) getBucket(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	b, err := h.svc.GetBucket(r.Context(), id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	rows, err := h.svc.BucketDomains(r.Context(), id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	out := bucketDetailResponse{BucketDetail: b, DomainRecords: make([]domainResponse, 0, len(rows))}
	for _, d := range rows {
		out.DomainRecords = append(out.DomainRecords, h.toDomain(d))
	}
	writeData(w, http.StatusOK, out)
}

func (h *Handler) updateBucketQuotas(w http.ResponseWriter, r *http.Request) {
	var in struct {
		MaxSize    *int64 `json:"maxSize"`
		MaxObjects *int64 `json:"maxObjects"`
	}
	if !decode(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	b, err := h.svc.UpdateBucketQuotas(r.Context(), id, in.MaxSize, in.MaxObjects)
	if err != nil {
		writeError(w, r, err)
		return
	}
	rows, err := h.svc.BucketDomains(r.Context(), id)
	if err != nil {
		writeError(w, r, err)
		return
	}
	out := bucketDetailResponse{BucketDetail: b, DomainRecords: make([]domainResponse, 0, len(rows))}
	for _, d := range rows {
		out.DomainRecords = append(out.DomainRecords, h.toDomain(d))
	}
	writeData(w, http.StatusOK, out)
}

func (h *Handler) getBucketCORS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cfg, err := h.svc.GetBucketCORS(r.Context(), id)
	respond(w, r, http.StatusOK, cfg, err)
}

func (h *Handler) setBucketCORS(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Rules []objects.CORSRule `json:"rules"`
	}
	if !decode(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	cfg, err := h.svc.SetBucketCORS(r.Context(), id, objects.CORSConfiguration{Rules: in.Rules})
	respond(w, r, http.StatusOK, cfg, err)
}

func (h *Handler) deleteBucketCORS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	err := h.svc.DeleteBucketCORS(r.Context(), id)
	respond(w, r, http.StatusOK, objects.CORSConfiguration{Rules: []objects.CORSRule{}}, err)
}

func (h *Handler) deleteBucket(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteBucket(r.Context(), chi.URLParam(r, "id"))
	respond(w, r, http.StatusOK, nil, err)
}

// ── Access keys ────────────────────────────────────────────────────────────

func (h *Handler) listKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := h.svc.ListKeys(r.Context())
	respond(w, r, http.StatusOK, keys, err)
}

func (h *Handler) createKey(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &in) {
		return
	}
	k, err := h.svc.CreateKey(r.Context(), in.Name)
	respond(w, r, http.StatusCreated, k, err)
}

func (h *Handler) getKey(w http.ResponseWriter, r *http.Request) {
	k, err := h.svc.GetKey(r.Context(), chi.URLParam(r, "id"))
	respond(w, r, http.StatusOK, k, err)
}

func (h *Handler) deleteKey(w http.ResponseWriter, r *http.Request) {
	err := h.svc.DeleteKey(r.Context(), chi.URLParam(r, "id"))
	respond(w, r, http.StatusOK, nil, err)
}

func (h *Handler) setKeyPermissions(w http.ResponseWriter, r *http.Request) {
	var in garage.Permissions
	if !decode(w, r, &in) {
		return
	}
	k, err := h.svc.SetKeyPermissions(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "bucketId"), in)
	respond(w, r, http.StatusOK, k, err)
}

// ── Domains ────────────────────────────────────────────────────────────────

func (h *Handler) listDomains(w http.ResponseWriter, r *http.Request) {
	rows, err := h.svc.ListDomains(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	out := make([]domainResponse, 0, len(rows))
	for _, d := range rows {
		out = append(out, h.toDomain(d))
	}
	writeData(w, http.StatusOK, out)
}

func (h *Handler) createDomain(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Domain string `json:"domain"`
		Bucket string `json:"bucket"`
	}
	if !decode(w, r, &in) {
		return
	}
	d, err := h.svc.CreateDomain(r.Context(), in.Domain, in.Bucket)
	h.respondDomain(w, r, http.StatusCreated, d, err)
}

func (h *Handler) getDomain(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	d, err := h.svc.GetDomain(r.Context(), id)
	h.respondDomain(w, r, http.StatusOK, d, err)
}

func (h *Handler) verifyDomain(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	d, err := h.svc.VerifyDomain(r.Context(), id)
	h.respondDomain(w, r, http.StatusOK, d, err)
}

func (h *Handler) deleteDomain(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	err := h.svc.DeleteDomain(r.Context(), id)
	respond(w, r, http.StatusOK, nil, err)
}

type dnsRecord struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

type domainResponse struct {
	ID            int64       `json:"id"`
	Domain        string      `json:"domain"`
	BucketID      string      `json:"bucketId"`
	BucketName    string      `json:"bucketName"`
	Status        string      `json:"status"`
	LastError     string      `json:"lastError"`
	LastCheckedAt *string     `json:"lastCheckedAt"`
	ActivatedAt   *string     `json:"activatedAt"`
	CreatedAt     string      `json:"createdAt"`
	DNSRecords    []dnsRecord `json:"dnsRecords"`
}

func (h *Handler) toDomain(d store.Domain) domainResponse {
	return domainResponse{
		ID:            d.ID,
		Domain:        d.Domain,
		BucketID:      d.BucketID,
		BucketName:    d.BucketName,
		Status:        d.Status,
		LastError:     d.LastError,
		LastCheckedAt: nullable(d.LastCheckedAt.String, d.LastCheckedAt.Valid),
		ActivatedAt:   nullable(d.ActivatedAt.String, d.ActivatedAt.Valid),
		CreatedAt:     d.CreatedAt,
		DNSRecords: []dnsRecord{
			{Type: "CNAME", Name: d.Domain, Value: h.opts.EdgeHostname},
			{Type: "TXT", Name: dnscheck.TXTPrefix + d.Domain, Value: dnscheck.TXTValue(d.VerifyToken)},
		},
	}
}

func (h *Handler) respondDomain(w http.ResponseWriter, r *http.Request, status int, d store.Domain, err error) {
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeData(w, status, h.toDomain(d))
}

func respond(w http.ResponseWriter, r *http.Request, status int, data any, err error) {
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeData(w, status, data)
}

func nullable(s string, valid bool) *string {
	if !valid {
		return nil
	}
	return &s
}

func parseID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		writeFail(w, http.StatusNotFound, "not_found", "domain not found", nil)
		return 0, false
	}
	return id, true
}
