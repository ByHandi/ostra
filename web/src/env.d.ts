/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the API. Vite inlines `VITE_*` into the bundle at build time, so
   * this is public — never put a secret behind a `VITE_` prefix.
   */
  readonly VITE_API_URL?: string;
}
