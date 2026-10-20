package service

import "fmt"

type Kind int

const (
	KindInvalid Kind = iota + 1
	KindNotFound
	KindConflict
)

// Error adalah kesalahan yang aman ditampilkan ke user. API memetakan Kind ke status HTTP,
// dan Field (kalau ada) ke error per-field di form.
type Error struct {
	Kind    Kind
	Field   string
	Message string
}

func (e *Error) Error() string { return e.Message }

func newErr(kind Kind, field, format string, args ...any) error {
	return &Error{Kind: kind, Field: field, Message: fmt.Sprintf(format, args...)}
}

func invalid(field, format string, args ...any) error {
	return newErr(KindInvalid, field, format, args...)
}

func notFound(format string, args ...any) error {
	return newErr(KindNotFound, "", format, args...)
}

func conflict(field, format string, args ...any) error {
	return newErr(KindConflict, field, format, args...)
}
