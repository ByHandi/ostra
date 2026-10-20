package auth

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// LoginLimiter rate-limits login attempts per IP: a small burst, then one attempt
// per interval. Enough to slow down brute force against the admin dashboard.
type LoginLimiter struct {
	mu       sync.Mutex
	limiters map[string]*entry
	every    time.Duration
	burst    int
}

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func NewLoginLimiter(every time.Duration, burst int) *LoginLimiter {
	return &LoginLimiter{limiters: map[string]*entry{}, every: every, burst: burst}
}

func (l *LoginLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	if len(l.limiters) > 10_000 {
		l.prune(now)
	}

	e, ok := l.limiters[ip]
	if !ok {
		e = &entry{limiter: rate.NewLimiter(rate.Every(l.every), l.burst)}
		l.limiters[ip] = e
	}
	e.lastSeen = now
	return e.limiter.Allow()
}

// prune drops IPs that have not tried for a while; their limiters are certainly full again.
func (l *LoginLimiter) prune(now time.Time) {
	idle := l.every * time.Duration(l.burst)
	for ip, e := range l.limiters {
		if now.Sub(e.lastSeen) > idle {
			delete(l.limiters, ip)
		}
	}
}
