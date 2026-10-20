package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"

	"github.com/handi7/storage-edge/control/db"
)

// Open opens the SQLite database at path and runs the embedded migrations.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite has only one writer; a single connection avoids SQLITE_BUSY.
	sqlDB.SetMaxOpenConns(1)

	migrations, err := fs.Sub(db.Migrations, "migrations")
	if err != nil {
		sqlDB.Close()
		return nil, err
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, sqlDB, migrations)
	if err != nil {
		sqlDB.Close()
		return nil, err
	}
	if _, err := provider.Up(ctx); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("migrate database: %w", err)
	}
	return sqlDB, nil
}
