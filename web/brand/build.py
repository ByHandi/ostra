#!/usr/bin/env python3
"""Builds the Ostra logo assets from one geometry definition.

Writes the SVG sources to web/brand/ and web/public/favicon.svg, then renders
the PNG app icons into web/public/ with headless Chrome. Re-run after changing
the mark:

    python3 web/brand/build.py

The in-app React version lives in src/components/logo.tsx — keep the two in
sync (same paths, same stops).
"""

import pathlib
import subprocess
import tempfile

BRAND = pathlib.Path(__file__).resolve().parent
PUBLIC = BRAND.parent / "public"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Isometric cube on a 100×100 grid; (50,50) is the near corner where the
# three faces meet — the "pearl" sits there.
DEFS = """
  <linearGradient id="top" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#A5F3FC"/><stop offset="1" stop-color="#22D3EE"/>
  </linearGradient>
  <linearGradient id="left" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0EA5E9"/><stop offset="1" stop-color="#2563EB"/>
  </linearGradient>
  <linearGradient id="right" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#8B5CF6"/>
  </linearGradient>
  <radialGradient id="pearl" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
    <stop offset="0.35" stop-color="#CFFAFE" stop-opacity="0.7"/>
    <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="aura" cx="0.5" cy="0.2" r="0.75">
    <stop offset="0" stop-color="#22D3EE" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
  </radialGradient>
"""

MARK = """
  <path d="M50 21 75 35.5 50 50 25 35.5Z" fill="url(#top)"/>
  <path d="M25 35.5 50 50V79L25 64.5Z" fill="url(#left)"/>
  <path d="M75 35.5V64.5L50 79V50Z" fill="url(#right)"/>
  <path d="M25 35.5 50 50 75 35.5M50 50V79" fill="none" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="0.8"/>
  <circle cx="50" cy="50" r="15" fill="url(#pearl)"/>
  <circle cx="50" cy="50" r="4.2" fill="#F0FDFF"/>
"""

NAVY = "#070B14"


def svg(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f"<defs>{DEFS}</defs>{body}</svg>\n"
    )


def mark(scale: float = 1.0) -> str:
    """The cube, scaled about the centre (maskable icons need a safe zone)."""
    if scale == 1.0:
        return MARK
    offset = 50 * (1 - scale)
    return f'<g transform="translate({offset} {offset}) scale({scale})">{MARK}</g>'


# Rounded tile (iOS-like corner ratio) — favicon and generic PWA icons.
ICON = svg(
    f'<rect width="100" height="100" rx="22.5" fill="{NAVY}"/>'
    '<rect width="100" height="100" rx="22.5" fill="url(#aura)"/>'
    + mark()
)
# Full-bleed square — iOS and Android mask it themselves; transparent corners
# would render black on iOS.
ICON_SQUARE = svg(
    f'<rect width="100" height="100" fill="{NAVY}"/>'
    '<rect width="100" height="100" fill="url(#aura)"/>'
    + mark(0.86)
)
# Maskable: content must fit the central 80% circle.
ICON_MASKABLE = svg(
    f'<rect width="100" height="100" fill="{NAVY}"/>'
    '<rect width="100" height="100" fill="url(#aura)"/>'
    + mark(0.7)
)
MARK_ONLY = svg(mark())


def render(source: str, out: pathlib.Path, size: int) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "icon.html"
        page.write_text(
            "<!doctype html><style>html,body{margin:0;background:transparent}"
            f"svg{{display:block;width:{size}px;height:{size}px}}</style>{source}"
        )
        subprocess.run(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--default-background-color=00000000",
                f"--window-size={size},{size}",
                f"--screenshot={out}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
    print(f"  {out.relative_to(BRAND.parent)} ({size}px)")


def main() -> None:
    (BRAND / "ostra-icon.svg").write_text(ICON)
    (BRAND / "ostra-icon-square.svg").write_text(ICON_SQUARE)
    (BRAND / "ostra-icon-maskable.svg").write_text(ICON_MASKABLE)
    (BRAND / "ostra-mark.svg").write_text(MARK_ONLY)
    (PUBLIC / "favicon.svg").write_text(ICON)
    print("SVG sources written. Rendering PNGs:")
    render(ICON, PUBLIC / "icon-192.png", 192)
    render(ICON, PUBLIC / "icon-512.png", 512)
    render(ICON_MASKABLE, PUBLIC / "icon-maskable-512.png", 512)
    render(ICON_SQUARE, PUBLIC / "apple-touch-icon.png", 180)


if __name__ == "__main__":
    main()
