package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/ByHandi/ostra/control/internal/auth"
	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/service"
)

// envelope is the shape of every /api response, matching what
// web/src/lib/api/client.ts (and go-service-boilerplate) expects.
type envelope struct {
	Success    bool       `json:"success"`
	StatusCode int        `json:"statusCode"`
	Message    string     `json:"message"`
	Data       any        `json:"data"`
	Meta       any        `json:"meta"`
	Error      *errorBody `json:"error"`
}

type errorBody struct {
	Type    string              `json:"type"`
	Message string              `json:"message"`
	Errors  map[string][]string `json:"errors"`
}

func writeJSON(w http.ResponseWriter, status int, v envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeData(w http.ResponseWriter, status int, data any) {
	writeJSON(w, status, envelope{
		Success:    true,
		StatusCode: status,
		Message:    http.StatusText(status),
		Data:       data,
	})
}

func writeFail(w http.ResponseWriter, status int, typ, message string, fields map[string][]string) {
	writeJSON(w, status, envelope{
		StatusCode: status,
		Message:    message,
		Error:      &errorBody{Type: typ, Message: message, Errors: fields},
	})
}

// writeError maps an error to an HTTP status. Unknown errors become a 500 without leaking details.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var se *service.Error
	if errors.As(err, &se) {
		status, typ := http.StatusBadRequest, "validation"
		switch se.Kind {
		case service.KindNotFound:
			status, typ = http.StatusNotFound, "not_found"
		case service.KindConflict:
			status, typ = http.StatusConflict, "conflict"
		}
		writeFail(w, status, typ, se.Message, fieldErrors(se.Field, se.Message))
		return
	}

	var fe *auth.FieldError
	if errors.As(err, &fe) {
		writeFail(w, http.StatusBadRequest, "validation", fe.Message, fieldErrors(fe.Field, fe.Message))
		return
	}

	var ge *garage.Error
	if errors.As(err, &ge) && ge.Status < http.StatusInternalServerError {
		status := http.StatusBadRequest
		if ge.Status == http.StatusNotFound || ge.Status == http.StatusConflict {
			status = ge.Status
		}
		writeFail(w, status, ge.Code, ge.Message, nil)
		return
	}

	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	if ge != nil {
		writeFail(w, http.StatusBadGateway, "storage_error", "storage is having problems, try again later", nil)
		return
	}
	writeFail(w, http.StatusInternalServerError, "internal", "an internal error occurred", nil)
}

func fieldErrors(field, message string) map[string][]string {
	if field == "" {
		return nil
	}
	return map[string][]string{field: {message}}
}
