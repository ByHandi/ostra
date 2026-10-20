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

// Open membuka database SQLite di path dan menjalankan migrasi yang di-embed.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite hanya punya satu writer; satu koneksi menghindari SQLITE_BUSY.
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
		return nil, fmt.Errorf("migrasi database: %w", err)
	}
	return sqlDB, nil
}
