// Command control is the Ostra control-plane: dashboard + API for buckets,
// access keys, and custom domains, plus the on-demand TLS responder for Caddy.
//
// Usage:
//
//	control                                  run the server
//	control createuser --email E --name N    create an admin account (prompts for password)
//	control setpassword --email E            reset an admin account's password
//	control version                          show the build version
//	control healthcheck                      check the local server's /healthz (for the Docker healthcheck)
//
// Add --password-stdin to read the password from stdin (for scripts).
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

	"github.com/ByHandi/ostra/control/internal/api"
	"github.com/ByHandi/ostra/control/internal/auth"
	"github.com/ByHandi/ostra/control/internal/config"
	"github.com/ByHandi/ostra/control/internal/dnscheck"
	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/service"
	"github.com/ByHandi/ostra/control/internal/store"
	"github.com/ByHandi/ostra/control/internal/ui"
)

// Set at build time via -ldflags "-X main.version=... -X main.commit=..." (see control/Dockerfile).
var (
	version = "dev"
	commit  = "unknown"
)

// exitUserExists distinguishes "user already exists" from other errors, so scripts can skip it.
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
		fmt.Printf("ostra %s (%s)\n", version, commit)
	case "healthcheck":
		err = healthcheck()
	default:
		err = fmt.Errorf("unknown command %q (choices: serve, createuser, setpassword, version, healthcheck)", cmd)
	}
	if err != nil {
		slog.Error("control stopped", "err", err)
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
		// Don't fail to start: Garage may just be coming up. The worker will retry.
		slog.Warn("Garage is not reachable yet", "url", cfg.GarageAdminURL, "err", err)
	}

	checker := dnscheck.NewChecker(dnscheck.NewResolver(cfg.DNSServer), cfg.EdgeHostname)
	svc := service.New(store.New(sqlDB), gc, checker, service.Options{
		DNSVerify:       cfg.DNSVerify,
		ReservedDomains: cfg.ReservedDomains,
		WebRootDomain:   cfg.WebRootDomain,
		NewObjectStore: func(accessKey, secretKey string) (service.ObjectStore, error) {
			return objects.New(cfg.S3Endpoint, cfg.S3Region, accessKey, secretKey)
		},
	})
	slog.Info("ostra", "version", version, "commit", commit)
	if !cfg.DNSVerify {
		slog.Warn("DNS_VERIFY=off: domains become active immediately without DNS verification (development only)")
	}
	if !cfg.CookieSecure {
		slog.Warn("COOKIE_SECURE=false: session cookies are sent without the Secure flag (development only)")
	}

	h := api.NewHandler(svc, authSvc, api.Options{
		Health:         sqlDB.PingContext,
		EdgeHostname:   cfg.EdgeHostname,
		TrustedProxies: cfg.TrustedProxies,
		CookieSecure:   cfg.CookieSecure,
		Version:        api.Version{Version: version, Commit: commit},
		DownloadSecret: cfg.JWTSecret,
		MaxUploadBytes: cfg.MaxUploadBytes,
		UI:             ui.Handler(),
	})
	servers := []*http.Server{
		{Addr: cfg.ListenAddr, Handler: h.Public(), ReadHeaderTimeout: 10 * time.Second},
		{Addr: cfg.InternalAddr, Handler: h.Internal(), ReadHeaderTimeout: 10 * time.Second},
	}

	g, ctx := errgroup.WithContext(ctx)
	for _, srv := range servers {
		g.Go(func() error {
			slog.Info("listening", "addr", srv.Addr)
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

// healthcheck is used by the Docker HEALTHCHECK: the scratch image has no curl/wget, so
// this binary calls /healthz itself. It deliberately does not load the full config,
// only the listen address.
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
		return fmt.Errorf("/healthz returned %s", resp.Status)
	}
	return nil
}

func createUser(args []string) error {
	fs := flag.NewFlagSet("createuser", flag.ExitOnError)
	email := fs.String("email", "", "login email (required)")
	name := fs.String("name", "", "display name (required)")
	fromStdin := fs.Bool("password-stdin", false, "read the password from stdin")
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
	fmt.Printf("user %s (%s) created\n", user.Email, user.Name)
	return nil
}

func setPassword(args []string) error {
	fs := flag.NewFlagSet("setpassword", flag.ExitOnError)
	email := fs.String("email", "", "user email (required)")
	fromStdin := fs.Bool("password-stdin", false, "read the password from stdin")
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
	fmt.Printf("password for %s changed, all old sessions ended\n", *email)
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
			return "", fmt.Errorf("failed to read password from stdin: %w", err)
		}
		return strings.TrimRight(line, "\r\n"), nil
	}

	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", errors.New("stdin is not a terminal: use --password-stdin")
	}
	fmt.Fprint(os.Stderr, "Password: ")
	first, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	fmt.Fprint(os.Stderr, "Repeat password: ")
	second, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	if string(first) != string(second) {
		return "", errors.New("passwords do not match")
	}
	return string(first), nil
}
