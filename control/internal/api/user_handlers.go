package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/ByHandi/ostra/control/internal/auth"
)

type createdUserResponse struct {
	ID                int64  `json:"id"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	Role              string `json:"role"`
	CreatedAt         string `json:"createdAt"`
	TemporaryPassword string `json:"temporaryPassword"`
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.auth.ListUsers(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, users)
}

func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}

	fields := map[string][]string{}
	if strings.TrimSpace(in.Email) == "" {
		fields["email"] = []string{"email is required"}
	}
	if in.Role != "" {
		if err := auth.ValidateRole(in.Role); err != nil {
			fields["role"] = []string{err.Error()}
		}
	}
	if len(fields) > 0 {
		writeFail(w, http.StatusBadRequest, "validation", "please check the form fields", fields)
		return
	}

	user, tempPassword, err := h.auth.CreateUserWithTemporaryPassword(r.Context(), in.Email, in.Name, in.Role)
	if err != nil {
		writeError(w, r, err)
		return
	}

	writeData(w, http.StatusCreated, createdUserResponse{
		ID:                user.ID,
		Email:             user.Email,
		Name:              user.Name,
		Role:              user.Role,
		CreatedAt:         user.CreatedAt,
		TemporaryPassword: tempPassword,
	})
}

func (h *Handler) updateUserRole(w http.ResponseWriter, r *http.Request) {
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeFail(w, http.StatusBadRequest, "validation", "invalid user ID", nil)
		return
	}

	var in struct {
		Role string `json:"role"`
	}
	if !decode(w, r, &in) {
		return
	}

	if in.Role == "" {
		writeFail(w, http.StatusBadRequest, "validation", "role is required", map[string][]string{
			"role": {"role is required"},
		})
		return
	}

	actor := currentUser(r)
	updated, err := h.auth.UpdateUserRole(r.Context(), actor.ID, targetID, in.Role)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, updated)
}

func (h *Handler) deleteUser(w http.ResponseWriter, r *http.Request) {
	targetID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeFail(w, http.StatusBadRequest, "validation", "invalid user ID", nil)
		return
	}

	actor := currentUser(r)
	if err := h.auth.DeleteUser(r.Context(), actor.ID, targetID); err != nil {
		writeError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, nil)
}
