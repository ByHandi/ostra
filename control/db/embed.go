// Package db menyimpan migrasi SQL yang di-embed ke binary.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
