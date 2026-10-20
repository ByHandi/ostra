// Package db holds the SQL migrations embedded into the binary.
package db

import "embed"

//go:embed migrations/*.sql
var Migrations embed.FS
