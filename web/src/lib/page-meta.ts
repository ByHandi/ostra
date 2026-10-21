export const APP_NAME = "Ostra";

/**
 * A route's `head`: "<title> · Ostra" plus an optional description. Rendered by
 * `<HeadContent />` in the root route, where the deepest match wins — so a page
 * without one falls back to the root's plain "Ostra".
 */
export function pageMeta(title?: string, description?: string) {
  return {
    meta: [
      { title: title ? `${title} · ${APP_NAME}` : APP_NAME },
      ...(description ? [{ name: "description", content: description }] : []),
    ],
  };
}
