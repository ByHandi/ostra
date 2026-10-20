package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/handi7/storage-edge/control/internal/auth"
)

// refreshCookie is only sent to /api/auth/*, so it is not included in other API requests.
const (
	refreshCookie     = "se_refresh"
	refreshCookiePath = "/api/auth"
)

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	if !h.limiter.Allow(h.clientIP(r)) {
		writeFail(w, http.StatusTooManyRequests, "rate_limited", "too many login attempts, try again shortly", nil)
		return
	}

	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	fields := map[string][]string{}
	if strings.TrimSpace(in.Email) == "" {
		fields["email"] = []string{"email is required"}
	}
	if in.Password == "" {
		fields["password"] = []string{"password is required"}
	}
	if len(fields) > 0 {
		writeFail(w, http.StatusBadRequest, "validation", "please check the form fields", fields)
		return
	}

	sess, err := h.auth.Login(r.Context(), in.Email, in.Password, h.client(r))
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeFail(w, http.StatusUnauthorized, "invalid_credentials", err.Error(), nil)
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	h.writeSession(w, sess)
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var token string
	if c, err := r.Cookie(refreshCookie); err == nil {
		token = c.Value
	}

	sess, err := h.auth.Refresh(r.Context(), token, h.client(r))
	if errors.Is(err, auth.ErrSessionExpired) {
		h.clearCookie(w)
		writeFail(w, http.StatusUnauthorized, "session_expired", err.Error(), nil)
		return
	}
	if err != nil {
		writeError(w, r, err)
		return
	}
	h.writeSession(w, sess)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(refreshCookie); err == nil {
		if err := h.auth.Logout(r.Context(), c.Value); err != nil {
			writeError(w, r, err)
			return
		}
	}
	h.clearCookie(w)
	writeData(w, http.StatusOK, nil)
}

type meResponse struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	writeData(w, http.StatusOK, meResponse{ID: u.ID, Name: u.Name, Email: u.Email})
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decode(w, r, &in) {
		return
	}
	sess, err := h.auth.ChangePassword(r.Context(), currentUser(r).ID, in.CurrentPassword, in.NewPassword, h.client(r))
	if err != nil {
		writeError(w, r, err)
		return
	}
	h.writeSession(w, sess)
}

func (h *Handler) writeSession(w http.ResponseWriter, sess auth.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookie,
		Value:    sess.RefreshToken,
		Path:     refreshCookiePath,
		MaxAge:   int(sess.RefreshTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.opts.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
	writeData(w, http.StatusOK, tokenResponse{
		AccessToken: sess.AccessToken,
		ExpiresIn:   int(sess.ExpiresIn.Seconds()),
	})
}

func (h *Handler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookie,
		Value:    "",
		Path:     refreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.opts.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (h *Handler) client(r *http.Request) auth.Client {
	return auth.Client{UserAgent: r.UserAgent(), IP: h.clientIP(r)}
}
