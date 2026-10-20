// Package ui melayani dashboard (hasil build web/) yang di-embed ke binary.
//
// Hasil `npm run build` di web/ ditulis ke dist/web. dist/.gitkeep (di-commit) menjaga
// go:embed tetap bisa di-compile walau dashboard belum di-build; dalam kondisi itu
// handler menampilkan halaman petunjuk alih-alih gagal.
package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// csp mengizinkan hanya aset dari origin sendiri. style 'unsafe-inline' diperlukan
// karena komponen Radix/shadcn memasang style inline untuk posisi popover.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
	"frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"

func Handler() http.Handler {
	files, err := fs.Sub(dist, "dist/web")
	if err != nil {
		panic(err)
	}
	index, _ := fs.ReadFile(files, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")

		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name != "" && name != "index.html" {
			if info, err := fs.Stat(files, name); err == nil && !info.IsDir() {
				if strings.HasPrefix(name, "assets/") {
					// Nama file di assets/ mengandung hash konten dari Vite.
					h.Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				http.ServeFileFS(w, r, files, name)
				return
			}
			// Aset yang hilang harus 404, bukan index.html (yang akan dieksekusi sebagai JS).
			if strings.HasPrefix(name, "assets/") || path.Ext(name) != "" {
				http.NotFound(w, r)
				return
			}
		}

		if index == nil {
			h.Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("Dashboard belum di-build. Jalankan `npm run build` di folder web/.\n"))
			return
		}
		// Rute SPA: selalu index.html, tanpa cache supaya deploy baru langsung terpakai.
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		w.Write(index)
	})
}
