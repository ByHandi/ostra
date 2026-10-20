// Command control adalah control-plane storage-edge: dashboard + API untuk bucket,
// access key, dan custom domain, serta penjawab on-demand TLS untuk Caddy.
//
// Pemakaian:
//
//	control                                  jalankan server
//	control createuser --email E --name N    buat akun admin (password ditanya)
//	control setpassword --email E            reset password akun admin
//	control version                          tampilkan versi build
//	control healthcheck                      cek /healthz server lokal (untuk healthcheck Docker)
//
// Tambahkan --password-stdin untuk membaca password dari stdin (untuk script).
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"
	"golang.org/x/term"

	"github.com/handi7/storage-edge/control/internal/api"
	"github.com/handi7/storage-edge/control/internal/auth"
	"github.com/handi7/storage-edge/control/internal/config"
	"github.com/handi7/storage-edge/control/internal/dnscheck"
	"github.com/handi7/storage-edge/control/internal/garage"
	"github.com/handi7/storage-edge/control/internal/service"
	"github.com/handi7/storage-edge/control/internal/store"
	"github.com/handi7/storage-edge/control/internal/ui"
)

// Diisi saat build lewat -ldflags "-X main.version=... -X main.commit=..." (lihat control/Dockerfile).
var (
	version = "dev"
	commit  = "unknown"
)

// exitUserExists membedakan "user sudah ada" dari error lain, supaya script bisa melewatinya.
const exitUserExists = 3

func main() {
	cmd := ""
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	var err error
	switch cmd {
	case "", "serve":
		err = serve()
	case "createuser":
		err = createUser(os.Args[2:])
		if errors.Is(err, auth.ErrUserExists) {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(exitUserExists)
		}
	case "setpassword":
		err = setPassword(os.Args[2:])
	case "version", "--version":
		fmt.Printf("storage-edge %s (%s)\n", version, commit)
	case "healthcheck":
		err = healthcheck()
	default:
		err = fmt.Errorf("perintah tidak dikenal %q (pilihan: serve, createuser, setpassword, version, healthcheck)", cmd)
	}
	if err != nil {
		slog.Error("control berhenti", "err", err)
		os.Exit(1)
	}
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	sqlDB, err := store.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	authSvc, err := auth.NewService(sqlDB, auth.Options{
		JWTSecret:  cfg.JWTSecret,
		AccessTTL:  cfg.AccessTTL,
		RefreshTTL: cfg.RefreshTTL,
	})
	if err != nil {
		return err
	}

	gc := garage.NewClient(cfg.GarageAdminURL, cfg.GarageAdminToken)
	if _, err := gc.Health(ctx); err != nil {
		// Jangan gagal start: Garage mungkin baru naik. Worker akan mencoba lagi.
		slog.Warn("Garage belum bisa dihubungi", "url", cfg.GarageAdminURL, "err", err)
	}

	checker := dnscheck.NewChecker(dnscheck.NewResolver(cfg.DNSServer), cfg.EdgeHostname)
	svc := service.New(store.New(sqlDB), gc, checker, service.Options{
		DNSVerify:       cfg.DNSVerify,
		ReservedDomains: cfg.ReservedDomains,
		WebRootDomain:   cfg.WebRootDomain,
	})
	slog.Info("storage-edge", "version", version, "commit", commit)
	if !cfg.DNSVerify {
		slog.Warn("DNS_VERIFY=off: domain langsung aktif tanpa verifikasi DNS (hanya untuk development)")
	}
	if !cfg.CookieSecure {
		slog.Warn("COOKIE_SECURE=false: cookie sesi dikirim tanpa flag Secure (hanya untuk development)")
	}

	h := api.NewHandler(svc, authSvc, api.Options{
		Health:         sqlDB.PingContext,
		EdgeHostname:   cfg.EdgeHostname,
		TrustedProxies: cfg.TrustedProxies,
		CookieSecure:   cfg.CookieSecure,
		Version:        api.Version{Version: version, Commit: commit},
		UI:             ui.Handler(),
	})
	servers := []*http.Server{
		{Addr: cfg.ListenAddr, Handler: h.Public(), ReadHeaderTimeout: 10 * time.Second},
		{Addr: cfg.InternalAddr, Handler: h.Internal(), ReadHeaderTimeout: 10 * time.Second},
	}

	g, ctx := errgroup.WithContext(ctx)
	for _, srv := range servers {
		g.Go(func() error {
			slog.Info("mendengarkan", "addr", srv.Addr)
			if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		})
	}
	g.Go(func() error {
		svc.Run(ctx, cfg.VerifyInterval, cfg.ReconcileInterval)
		return nil
	})
	g.Go(func() error {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		for _, srv := range servers {
			srv.Shutdown(shutdownCtx)
		}
		return nil
	})
	return g.Wait()
}

// healthcheck dipakai HEALTHCHECK Docker: image scratch tidak punya curl/wget, jadi
// binary ini sendiri yang memanggil /healthz. Sengaja tidak memuat config lengkap,
// cukup alamat listen.
func healthcheck() error {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + addr + "/healthz")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("/healthz membalas %s", resp.Status)
	}
	return nil
}

func createUser(args []string) error {
	fs := flag.NewFlagSet("createuser", flag.ExitOnError)
	email := fs.String("email", "", "email untuk login (wajib)")
	name := fs.String("name", "", "nama tampilan (wajib)")
	fromStdin := fs.Bool("password-stdin", false, "baca password dari stdin")
	fs.Parse(args)

	authSvc, closeDB, err := openAuth()
	if err != nil {
		return err
	}
	defer closeDB()

	password, err := readPassword(*fromStdin)
	if err != nil {
		return err
	}
	user, err := authSvc.CreateUser(context.Background(), *email, *name, password)
	if err != nil {
		return err
	}
	fmt.Printf("user %s (%s) dibuat\n", user.Email, user.Name)
	return nil
}

func setPassword(args []string) error {
	fs := flag.NewFlagSet("setpassword", flag.ExitOnError)
	email := fs.String("email", "", "email user (wajib)")
	fromStdin := fs.Bool("password-stdin", false, "baca password dari stdin")
	fs.Parse(args)

	authSvc, closeDB, err := openAuth()
	if err != nil {
		return err
	}
	defer closeDB()

	password, err := readPassword(*fromStdin)
	if err != nil {
		return err
	}
	if err := authSvc.SetPassword(context.Background(), *email, password); err != nil {
		return err
	}
	fmt.Printf("password %s diganti, semua sesi lama diakhiri\n", *email)
	return nil
}

func openAuth() (*auth.Service, func(), error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, err
	}
	sqlDB, err := store.Open(context.Background(), cfg.DBPath)
	if err != nil {
		return nil, nil, err
	}
	authSvc, err := auth.NewService(sqlDB, auth.Options{
		JWTSecret:  cfg.JWTSecret,
		AccessTTL:  cfg.AccessTTL,
		RefreshTTL: cfg.RefreshTTL,
	})
	if err != nil {
		sqlDB.Close()
		return nil, nil, err
	}
	return authSvc, func() { sqlDB.Close() }, nil
}

func readPassword(fromStdin bool) (string, error) {
	if fromStdin {
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && line == "" {
			return "", fmt.Errorf("gagal membaca password dari stdin: %w", err)
		}
		return strings.TrimRight(line, "\r\n"), nil
	}

	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", errors.New("stdin bukan terminal: pakai --password-stdin")
	}
	fmt.Fprint(os.Stderr, "Password: ")
	first, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	fmt.Fprint(os.Stderr, "Ulangi password: ")
	second, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	if string(first) != string(second) {
		return "", errors.New("password tidak sama")
	}
	return string(first), nil
}
