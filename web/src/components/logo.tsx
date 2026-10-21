import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Ostra brand mark — an isometric cube in the Aurora colours with a "pearl" of
 * light where the three faces meet. Same geometry as `brand/build.py`, which
 * renders the favicon and PWA icons; change both together.
 */
function LogoMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  // Gradient ids must be unique per instance; useId's punctuation breaks url(#…).
  const id = useId().replace(/[^\w-]/g, "");

  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A5F3FC" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={`${id}-left`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0EA5E9" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <radialGradient id={`${id}-pearl`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#CFFAFE" stopOpacity="0.7" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-aura`} cx="0.5" cy="0.2" r="0.75">
          <stop offset="0" stopColor="#22D3EE" stopOpacity="0.22" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
      </defs>

      {tile && (
        <>
          <rect width="100" height="100" rx="22.5" fill="#070B14" />
          <rect width="100" height="100" rx="22.5" fill={`url(#${id}-aura)`} />
        </>
      )}

      <path d="M50 21 75 35.5 50 50 25 35.5Z" fill={`url(#${id}-top)`} />
      <path d="M25 35.5 50 50V79L25 64.5Z" fill={`url(#${id}-left)`} />
      <path d="M75 35.5V64.5L50 79V50Z" fill={`url(#${id}-right)`} />
      <path
        d="M25 35.5 50 50 75 35.5M50 50V79"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.3"
        strokeWidth="0.8"
      />
      <circle cx="50" cy="50" r="15" fill={`url(#${id}-pearl)`} />
      <circle cx="50" cy="50" r="4.2" fill="#F0FDFF" />
    </svg>
  );
}

/** App-icon tile plus the "Ostra" wordmark. */
function Logo({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <LogoMark tile className="size-8 drop-shadow-[0_0_10px_var(--glow)]" />
      <span className="flex min-w-0 flex-col leading-none whitespace-nowrap">
        <span className="text-base font-semibold tracking-tight">Ostra</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
}

export { Logo, LogoMark };
