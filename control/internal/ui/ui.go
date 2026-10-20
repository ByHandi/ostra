// Package ui serves the dashboard (the web/ build output) embedded into the binary.
//
// `npm run build` in web/ writes its output to dist/web. dist/.gitkeep (committed) keeps
// go:embed compiling even when the dashboard has not been built; in that case the
// handler shows an instructions page instead of failing.
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

// csp only allows assets from our own origin. style 'unsafe-inline' is required
// because Radix/shadcn components set inline styles to position popovers.
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
					// File names under assets/ contain a content hash from Vite.
					h.Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				http.ServeFileFS(w, r, files, name)
				return
			}
			// Missing assets must 404, not serve index.html (which would be executed as JS).
			if strings.HasPrefix(name, "assets/") || path.Ext(name) != "" {
				http.NotFound(w, r)
				return
			}
		}

		if index == nil {
			h.Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("Dashboard has not been built yet. Run `npm run build` in the web/ folder.\n"))
			return
		}
		// SPA routes: always index.html, uncached so a new deploy takes effect immediately.
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		w.Write(index)
	})
}
