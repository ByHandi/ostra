/**
 * The access token lives in a module variable and nowhere else — not
 * localStorage, not sessionStorage, not a readable cookie. An XSS payload can
 * still call the API as the user, but it cannot read the token out and replay it
 * elsewhere, and nothing survives the tab closing.
 *
 * The trade-off: a reload starts with no token. `ensureSession()` in `./auth`
 * exchanges the httpOnly refresh cookie for a new one on boot.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
