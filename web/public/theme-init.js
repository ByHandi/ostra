// Applies the persisted theme before the first paint. Without this the
// page paints with the `:root` (light) tokens until ThemeProvider's
// effect runs, which shows as a white flash on reload in dark mode.
// Keep the storage key and class names in sync with
// src/components/theme-provider.tsx.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var resolved =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch {
    // localStorage can throw in hardened privacy modes — fall through
    // and let ThemeProvider sort it out on mount.
  }
})();
