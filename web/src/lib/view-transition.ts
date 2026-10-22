/**
 * The router (`defaultViewTransition`) calls `document.startViewTransition()`
 * and drops the `ViewTransition` it returns. When the browser skips a
 * transition — the first load (including the guard's redirect to /login), a
 * hidden tab, a viewport resize mid-transition, a newer navigation taking
 * over — `ready` rejects, nothing handles it, and the console shows an
 * uncaught `InvalidStateError` / `AbortError`. A skipped transition still
 * applies the DOM update, so the rejection is noise: mark it handled.
 *
 * Only `ready` is caught. If the update itself throws, `updateCallbackDone`
 * and `finished` still reject and the real error still surfaces.
 */
export function ignoreSkippedViewTransitions() {
  if (typeof document.startViewTransition !== "function") return;

  const start = document.startViewTransition.bind(document);

  document.startViewTransition = (callbackOptions) => {
    const transition = start(callbackOptions);
    transition.ready.catch(() => {});
    return transition;
  };
}
